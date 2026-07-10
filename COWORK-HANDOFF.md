# Writer's Codex — Cowork Handoff
## Cloud Sync + Mobile Phase

*Written 2026-07-09. Hand this to Cowork as the starting brief. Claude Code built and deployed the v1 app; this doc covers what exists, what's missing, and what to build next.*

---

## What exists (fully built + live)

**Writer's Codex** is a writing and worldbuilding organiser — a Svelte 5 + Vite + TypeScript PWA. It's live at:

> **https://writers-codex.space-divergentfutures.workers.dev**

GitHub repo: `space-divergentfutures/writers-codex` (public, AGPL-3.0)
Local path: `C:\Projects\writers-codex\`

### What's already working
- All 19 read-views (dashboard, timeline, characters, worlds, write cockpit, matrix, web graph, etc.)
- Full CRUD editing for every entity type including deep character arcs, relationships, lessons
- Prose editor with autosave (Write cockpit)
- Photo/image insert per entity (already stores as data-URIs in IndexedDB)
- Capture FAB — quick-add notes/characters/ideas in 1–2 taps
- Export/import project bundles (JSON)
- Mobile-responsive layout
- Installable PWA (manifest + service worker, works offline)
- Deployed on Cloudflare Workers Static Assets; every push to `main` auto-rebuilds

### What's NOT working (the problem to solve)
**Data is per-device.** IndexedDB lives in the browser. TJ's data on his laptop is invisible to his phone and vice versa. He can't write from his phone and pick it up on his desktop. This is the entire reason for this phase.

---

## What TJ wants from this phase

1. **Write from his phone when away from his desk** — full app, not a stripped-down version
2. **Dictate into the Write cockpit** — speech-to-text mic button in the prose editor
3. **Insert photos taken on his phone** — already partly works (camera picker on mobile), but photos need to sync to other devices
4. **Generate images** — AI image generation attached to entities (characters, worlds, etc.)
5. **Access his project from any device** — data syncs automatically

---

## Architecture recommendation (decide and build this)

TJ is already on Cloudflare. Keep everything there.

### Cloud sync: Cloudflare D1 + R2
- **D1** (Cloudflare's edge SQLite) — store project data, worldbuilding, prose. Replaces IndexedDB as the canonical store; IndexedDB becomes a local cache for offline use.
- **R2** (Cloudflare object storage) — store images/photos. Currently stored as data-URIs in IndexedDB (fine for small local use, wrong for cross-device).
- **Cloudflare Workers** — thin API layer (a Worker with routes) wrapping D1 + R2. Keep it minimal — CRUD endpoints only.

### Auth: email magic-link (no passwords)
TJ doesn't want account complexity. Use Cloudflare Access (already available at no cost on the free tier) or a tiny auth Worker that sends a magic-link email via Resend or Mailchannels (Cloudflare-native, free tier covers it). TJ logs in once per device; his token is stored in localStorage.

### Image generation: Claude API via a Worker
- Add a `/api/generate-image` Worker endpoint
- TJ provides a prompt; the Worker calls the Claude API (or Stable Diffusion via Replicate)
- Returns a URL stored in R2
- API key lives in a Cloudflare Worker secret — never in the browser

### Dictation: Web Speech API (no backend needed)
Add a mic button to the Write cockpit. `SpeechRecognition` in Chrome/Safari on mobile works offline for short clips. No API cost, no backend. Wire it to insert text at cursor position.

### Offline behaviour
Keep the service worker. When offline, reads from IndexedDB cache; queues writes; syncs when connection returns. This is a progressive enhancement — the app still works without signal.

---

## Key files to know about

```
writers-codex/
  src/
    lib/
      schema.ts          — all TypeScript interfaces (ProjectData, Character, World, etc.)
      db.ts              — current IndexedDB layer (idb wrapper) — this needs a cloud twin
      export.ts          — project bundle export/import
      stores/
        app.svelte.ts    — main Svelte 5 runes store (projects, active project, save/load)
      render/
        engine.js        — the view render engine (data → HTML strings, ts-nocheck)
        hydrate.ts       — merges prose/worldbuilding from DB into project before rendering
      images.ts          — image store + downscale + camera picker
      edit.ts            — declarative edit config for all entity types
    components/
      Codex.svelte       — main shell (nav, project switcher, search, detail drawer)
      CharacterEditor.svelte  — deep character editor
      EntityEditor.svelte     — generic editor for all other entity types
      Capture.svelte          — floating FAB + quick-add sheet
      views/
        Write.svelte     — prose cockpit with autosave (pending-buffer pattern)
        Matrix.svelte    — per-book arc scoring grid
        (+ 17 other view components)
  scripts/
    build-sample.mjs     — local-only script; reads story-workbench to generate sample data
  wrangler.jsonc         — Cloudflare Workers config (static assets, SPA routing)
  .node-version          — 22 (wrangler 4 requires Node >=22)
  public/
    _headers             — cache headers (no-cache for HTML/SW, immutable for assets)
```

---

## Hard constraints (do not break these)

1. **`/src/lib/sample/` is git-ignored** — TJ's private Cosmos story content. Never commit it. Never reference it in production code paths. It's dev-only.
2. **Manuscript prose never ships** in the public build or any cloud store without TJ explicitly exporting it.
3. **No new vendors** if avoidable — everything on Cloudflare (D1, R2, Workers, Access). TJ already has one account there.
4. **The app must still work offline** — cloud sync is additive, not a replacement for local-first behaviour.
5. **AGPL-3.0 code licence** stays. No dependency that is GPL-incompatible.
6. **Read `C:\Projects\story-workbench\` only** — never write to it. It's TJ's source-of-truth manuscript folder.

---

## Tech stack summary

| Layer | Current | After this phase |
|-------|---------|-----------------|
| Frontend | Svelte 5 + Vite + TS | same |
| Local storage | IndexedDB (idb) | IndexedDB as offline cache |
| Cloud storage | none | Cloudflare D1 (data) + R2 (images) |
| API | none | Cloudflare Worker (thin CRUD + image gen) |
| Auth | none | Magic-link (Cloudflare Access or auth Worker) |
| Image gen | none | Claude API or Replicate via Worker |
| Dictation | none | Web Speech API (browser-native, no backend) |
| Deploy | CF Workers Static Assets | same |
| CI | Cloudflare Workers Builds on push to `main` | same |

---

## What Cowork should design first

Before Claude Code builds anything, Cowork should produce:

1. **DB schema for D1** — how the current `ProjectData` object maps to SQL tables (or stays as JSON blobs in a single projects table — simpler and likely fine at TJ's scale)
2. **Sync strategy** — optimistic local-first write → queue → background push. Conflict resolution: last-write-wins per project (TJ is a single user, no collaboration needed)
3. **Auth flow** — exactly how magic-link login works device to device
4. **API surface** — the minimum Worker routes needed (list projects, get project, put project, get/put image, generate image)
5. **Migration plan** — how TJ's existing IndexedDB data on his laptop gets into D1 on first login

Hand the design output to Claude Code as a new build spec.

---

## Notes on TJ

- ADHD + autism: **the system tracks state, not TJ.** Don't present menus of options — make the call and state it.
- Ask TJ only about: vision, content, brand, money, his accounts.
- He has one Cloudflare account (`space-divergentfutures`). The Workers project is already set up.
- His email: space.divergentfutures@gmail.com
