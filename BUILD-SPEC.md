# Writer's Codex — Build Spec v1

*Decision-complete spec to build the coded app. Hand this to Claude Code. The working HTML prototype at `C:\Projects\story-workbench\` is the **reference implementation** — build to match its behaviour, then add editing + mobile. Written 2026-07-07.*

---

## 0. What it is
A **local-first, offline, installable writing & worldbuilding organizer** — external memory for authors, so a whole story world stays visible instead of held in one head. **Genre-neutral.** It ships **empty**; a Science-Fiction example world (the "Cosmos" data) is a **bundled sample template** so new users learn by exploring. Fantasy, romance, thriller, etc. are worlds users build themselves — the SF set is just the example.

## 1. Locked decisions
- **Name:** Writer's Codex. **Repo:** `writers-codex`. **Subdomain:** `codex.divergentfutures.co` *(confirm)*.
- **Stack:** **Svelte + Vite + TypeScript**, compiled to static files. Svelte chosen because the app is edit-heavy; it compiles to tiny fast JS (no runtime bloat), keeping the prototype's "small and fast" feel.
- **Local-first — NO accounts, NO backend, NO cloud, ever.** All data lives in the browser (IndexedDB), with file **export/import** for backup, portability, and bring-your-own storage (a user can put their export in their own Dropbox/GitHub). Nothing leaves the device unless the user exports it.
- **Distribution:** installable **PWA** (offline) via Cloudflare Pages; optional Tauri desktop `.exe` and Capacitor app-store builds later, from the same codebase. (See `DISTRIBUTION-AND-HOSTING-PLAYBOOK.md`.)
- **License:** MIT (code). Sample-world content credited to "Divergent Futures / Humans in Space."

## 2. The reference implementation
- **Feature set + UX:** `story-workbench/index.html` is the source of truth. Every read-view is already designed and working there — port them.
- **Data model:** `story-workbench/SCHEMA.md` + `project.json`. Reuse this schema as the app's data schema, unchanged.

## 3. Data model (from SCHEMA.md — reuse verbatim)
- A **project** = one user's world/series: `schemaVersion, series, books[], threads[], characters[], worlds[], tracks[], timeline[], chapters[], notes[], research[], themes[], pantheon[], reading[], religions[]`, an embedded **reference** library (collections + entries), plus **manuscript prose** and **worldbuilding docs**.
- **Multiple projects** per user (a project switcher). IDs are permanent handles; references are by id and validated (port the validation from `build.py`).

## 4. Views to port (behaviour matches the prototype)
Dashboard · Timeline (per-species **tracks** that braid) · Characters · Books (saga + side stories) · Matrix (per-book scores + trajectory) · Web (relationship graph, hover-to-enlarge) · Lessons · Themes · Faiths · Pantheon · Threads · Worlds (+ embedded full worldbuilding) · Outline · **Write** (cockpit) · Notes · Research · Reading · Reference.

## 5. NEW — in-app editing (the biggest addition; not in the prototype)
- **Full CRUD** for every entity: add / edit / delete / reorder characters, worlds, threads, tracks, timeline beats, chapters, books, notes, research, themes, etc. — via forms + inline editing, **saved to the local store immediately** (no rebuild step).
- **Prose editing** in the Write cockpit (markdown, autosave, word counts).
- **Photos**: keep the existing thumbnail flow; store images locally; bake/attach per entity.
- Scoring (P/R/C), lessons, arcs, links, relationships all editable in-app.

## 6. NEW — local-first persistence
- **Store:** IndexedDB for structured data + prose + images.
- **Export/Import:** one project bundle the user owns (JSON, or a `.zip` with prose + images). This is backup + portability + "sync via your own storage." Also a full-library export (all projects).
- No server; fully offline.

## 7. NEW — mobile + capture
- **Responsive layout** — genuinely usable on a phone.
- **Capture mode:** quick-add a note / character / idea / prose fragment in 1–2 taps, dropped into an inbox to organize later. This is the "capture your best character while you're out in the real world" flow — the core reason it must be mobile.

## 8. NEW — ships empty + the sample world
- **First run:** an empty project, plus a one-tap **"Load the Science-Fiction example world"** (the Cosmos data as an explorable sample) so users see a fully-populated world.
- **New project onboarding:** start blank, or from the SF template.
- The **Reference library** (tropes / tech / craft / etc.) ships as an optional, genre-agnostic pack (the SF set is one bundled pack); users can ignore it or build their own.

## 9. PWA essentials
`manifest.json` (name "Writer's Codex", icons, theme), a **service worker** caching the app shell + working offline, HTTPS, installable ("Add to Home Screen").

## 10. Build order (for Claude Code)
0. Scaffold **Svelte + Vite + TS**; import the prototype's UI as the visual/behaviour reference; port the data schema + validation.
1. **Data layer** — IndexedDB store, the schema, project switcher, export/import.
2. **Read views** — port the prototype's views over the data layer.
3. **Editing** — CRUD forms for every entity + Write-cockpit prose editing + autosave.
4. **Mobile responsive + Capture mode.**
5. **Ships-empty + SF sample-world loader + onboarding.**
6. **PWA** — manifest + service worker; deploy to Cloudflare Pages at `codex.divergentfutures.co`.
7. *(Later)* Tauri desktop `.exe`; Capacitor App Store + Play builds.

## 11. Non-goals (explicitly out of v1)
No accounts, no cloud, no server, no real-time collaboration. No AI generation baked in (keep it a clean tool; optional AI-assist can come later). No genre lock — SF is a sample, not the product.

## 12. Small open items for TJ
- Confirm subdomain (`codex.` vs `writers-codex.`).
- App icon / logo.
- How much of the Cosmos SF data ships as the sample — the full world, or a trimmed demo (recommend a trimmed but complete-feeling slice so it's not overwhelming and doesn't ship your unpublished prose).
- Where the personal Cosmos build diverges: your private rig (dictate-to-Claude → `.md` + rebuild) stays as-is on `story-workbench`; Writer's Codex is the clean public app. Your actual Cosmos manuscript does **not** ship in the public app.
