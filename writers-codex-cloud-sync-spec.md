# Writer's Codex — Phase 2 Build Spec: Cloud Sync
## D1 + R2 + a Worker API, additive to the local-first app

*Written 2026-07-10 by Claude Code, from `COWORK-HANDOFF.md`. This is the design + build order Phase 2 is built against. Local-first stays the foundation; sync is a layer on top that never blocks the app when offline or logged out.*

---

## 0. The one-paragraph shape

The Svelte PWA keeps writing to **IndexedDB first, always** — nothing about the offline experience changes. A new **sync engine** watches every local write (via an outbox), and when the user is signed in and online, pushes those changes to a **Cloudflare Worker API** backed by **D1** (structured data + markdown) and **R2** (image bytes). It also pulls remote changes and merges them with **last-write-wins per record**. Sign-in is **Cloudflare Access** (one-time PIN email — no passwords, no new vendor). If the user never signs in, the app is exactly what it is today.

```
 ┌────────────┐  writes   ┌──────────────┐  push/pull   ┌────────────────┐
 │  Svelte UI │ ────────► │  IndexedDB   │ ◄──────────► │  Worker  /api/*│
 │ (untouched)│           │  + outbox    │   (sync.ts)  │  Hono router   │
 └────────────┘           └──────────────┘              └───────┬────────┘
                                                     ┌──────────┴──────────┐
                                                   D1 (data)          R2 (images)
```

---

## 1. Non-negotiables (carried from the handoff)

1. **Offline-first stays.** IndexedDB is the source of truth for the running app. Sync is additive. Pull the network cable and everything still works.
2. **`/src/lib/sample/` is never referenced in production code.** Untouched here.
3. **Never write to `C:\Projects\story-workbench\`.** Untouched here.
4. **Everything on Cloudflare.** Only new runtime dep is **Hono** (MIT — a tiny Worker router). No other vendors.
5. **AGPL-3.0 stays.** Hono is MIT (compatible). No GPL-incompatible deps.
6. **Do not touch** view components, editors, render engine, `edit.ts`, `export.ts`. The integration seam is **`db.ts`** — every mutation already funnels through it, so change-tracking lives there and the untouched components get sync for free.

---

## 2. Data model — D1

One SQLite database, tables mirror the IndexedDB stores, every row scoped by `user_id` and carrying `updated_at` (ms epoch) for last-write-wins plus a soft-delete flag (so a delete on one device propagates as a tombstone rather than silently resurrecting on the next pull).

```sql
projects       (user_id, id, name, data TEXT, updated_at, deleted)              PK(user_id,id)
prose          (user_id, project_id, chapter_id, markdown, updated_at, deleted) PK(user_id,project_id,chapter_id)
worldbuilding  (user_id, project_id, entity_id, markdown, updated_at, deleted)  PK(user_id,project_id,entity_id)
images         (user_id, project_id, entity_id, r2_key, caption, updated_at, deleted) PK(user_id,project_id,entity_id)
```

`projects.data` is the whole `ProjectData` JSON blob (~160 KB) — same granularity as the IndexedDB `projects` store, so push/pull is 1:1 with what the app already reads and writes. No per-entity SQL normalisation: TJ is a single user at small scale, and a blob keeps the schema trivial and the sync logic obvious. Prose and worldbuilding are separate rows because they're heavy and edited independently (matching the existing store split).

## 3. Image storage — R2

Image bytes live in R2 at key `**{userId}/{projectId}/{entityId}**` (entityId already looks like `character:john`). The D1 `images` row is metadata only (`r2_key`, `caption`, `updated_at`, `deleted`). Locally, `images.ts` keeps storing a downscaled webp **data URI** in IndexedDB exactly as today — the sync layer converts data-URI ⇄ bytes at the boundary, so `images.ts`'s storage format and every consumer stay unchanged.

## 4. Auth — Cloudflare Access

- An **Access application** (Zero Trust) fronts the deployment; policy allows TJ's email; login is **one-time PIN** to that email. Session duration set long (e.g. 1 month) so it's "sign in once per device."
- Access sets a domain cookie (`CF_Authorization`) and injects `Cf-Access-Jwt-Assertion` on requests. The Worker **validates that JWT** against the team's public certs and derives a stable `userId` (SHA-256 of the verified email). No password ever touches the app.
- **Dev bypass:** in `wrangler dev` there's no Access, so the Worker honours `env.DEV_USER` as the identity. Production has no `DEV_USER`, so real JWT validation is enforced. This lets the whole sync path be tested locally without Access.
- **Public-demo decision (for TJ at the Step 4 checkpoint):** either (A) Access fronts the **whole hostname** — dead simple, but the URL then requires TJ's login to view at all (the open-source "demo" lives on GitHub, cloneable by anyone); or (B) Access fronts only `/api/*` — the public app stays viewable and sync is an opt-in login. Default recommendation: **(A)** for simplicity; revisit if a public hosted demo matters.

## 5. Worker API surface (Hono, all under `/api`)

```
GET  /api/health                      → { ok: true }                (public, no auth)
GET  /api/auth/me                     → { userId, email }           (proves login)
POST /api/sync/pull  { since }        → { changes:{projects,prose,worldbuilding,images[]}, now }
POST /api/sync/push  { changes }      → { applied, now }            (LWW per record)
PUT  /api/images/:projectId/:entityId (raw webp body)  → { r2_key } (also upserts D1 row)
GET  /api/images/:projectId/:entityId → image bytes    (streamed from R2)
```

Everything except `/api/health` requires a valid identity. `pull` returns every row with `updated_at > since` for this user (tombstones included). `push` applies each incoming row only if its `updated_at ≥` the stored one (LWW), returning the server clock so the client can advance its cursor.

## 6. Client sync engine

- **Outbox:** `db.ts` gains an `outbox` object store (DB_VERSION 1→2). Every mutating function (`putProject`, `deleteProject`, `putProse`, `deleteProse`, `putWorldbuilding`, `deleteWorldbuilding`, `putImage`, `deleteImage`) records `{store, key, updatedAt}` after its write. Because the untouched editors/Write/Capture all call these, they enqueue automatically.
- **`sync.ts`:** `push()` drains the outbox to `/api/sync/push` (+ uploads image bytes to R2); `pull(since)` fetches remote changes and applies them to IndexedDB under LWW, then bumps the stored cursor. Triggers: debounced after writes, on `online`, on window focus, and a slow interval. All wrapped so failure (offline / 401) is a no-op that leaves local data intact.
- **`auth.ts`:** checks `/api/auth/me`; exposes `signIn()` (full-page nav to an Access-protected path so the browser completes the PIN flow) and `signedIn` state.
- **UI:** a single **new** `SyncStatus.svelte` mounted in the shell (Off / Syncing / Synced / Offline + a Sign-in button). No existing view/editor is touched.

## 7. Migration of existing data

First successful sign-in: the client treats every local project as dirty (full outbox seed) and pushes it up, then pulls. TJ's laptop data lands in D1; his phone, on first sign-in, pulls it down. No manual export/import needed. Conflict during initial seed is impossible (server empty).

## 8. Build order (11 steps, each independently verifiable)

1. **Worker + Hono skeleton** — `worker/index.ts`, `wrangler.jsonc` (`main`, `run_worker_first:["/api/*"]`, bindings), `/api/health`. Verify SPA still serves + health responds (`wrangler dev`, local).
2. **D1 schema + migrations** — `migrations/0001_init.sql`; apply `--local`; verify tables.
3. **R2 wiring** — binding + local bucket; prove put/get locally.
4. **Cloudflare Access** — *TJ dashboard walkthrough (stop here).* Worker JWT-validation code written regardless.
5. **Worker auth middleware** — validate JWT / dev-bypass; `/api/auth/me`; protect `/api/*`.
6. **Sync API: projects** — pull/push + LWW; curl test.
7. **Sync API: prose + worldbuilding** — same pattern.
8. **Images API** — R2 put/get + D1 metadata.
9. **Client sync engine** — outbox (DB v2) + `sync.ts` + `auth.ts` + `SyncStatus.svelte`.
10. **Client image sync** — upload local → R2, hydrate R2 → local data-URI.
11. **E2E test + deploy** — two-profile sync + offline check; then the TJ-account batch (login, remote create, migrate, deploy).

## 9. Explicitly deferred to a later UI phase (needs touching components, which this phase must not)

- **Dictation** (mic button in the Write cockpit) — requires editing `Write.svelte`.
- **AI image generation UI** — requires editing the editors. (The Worker could hold a `/api/generate-image` endpoint later; no value shipping it without its UI.)

Both were on the wants-list but sit behind the "do not touch view components/editors" constraint, so they're a focused follow-up once this backbone is verified.

## 10. What stays TJ's account actions

`wrangler login` (one browser OAuth) unblocks all remote wrangler work — after it, Claude runs `d1 create`, `r2 bucket create`, remote migrations, and `wrangler deploy` and reports what was made. **Cloudflare Access** setup (Step 4) is separate Zero-Trust dashboard clicks, walked through when reached.
