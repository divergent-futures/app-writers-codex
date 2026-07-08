# Writer's Codex — Code Handoff (START HERE)

*You are Claude Code. You're building **Writer's Codex**, a local-first, offline, installable writing & worldbuilding app. A complete, working HTML **prototype** already exists — you are re-building it as a proper Svelte PWA with in-app editing. Read this file, then `BUILD-SPEC.md` in this folder, then start.*

---

## Read these first (exact paths)
1. **`C:\Projects\writers-codex\BUILD-SPEC.md`** — the full, decision-complete spec. This is your source of truth for *what* to build.
2. **`C:\Projects\story-workbench\index.html`** — the **reference implementation**. Open it in a browser: every view, panel, filter, and behaviour is here and working. Build the coded app to *match this behaviour*, then add editing + mobile.
3. **`C:\Projects\story-workbench\SCHEMA.md`** — the complete data model (just updated + verified). Reuse this schema verbatim.
4. **Sample data** (the demo world you'll ship as an optional template): `C:\Projects\story-workbench\project.json`, `reference.json`, `worldbuilding\*.md`, `manuscript\*.md`.
5. **`C:\Projects\DISTRIBUTION-AND-HOSTING-PLAYBOOK.md`** — the PWA / hosting standards this app must meet (Cloudflare Pages, HTTPS, offline, installable).

## Locked decisions (do not re-litigate)
- **Name:** Writer's Codex. **Repo/folder:** `writers-codex` (build here). **Subdomain:** `codex.divergentfutures.co`.
- **Stack:** Svelte + Vite + TypeScript → static build.
- **Local-first, NO accounts, NO backend, NO cloud, ever.** Data in IndexedDB; export/import a project file the user owns.
- **Ships EMPTY**, with a one-tap "Load the Science-Fiction example world" (the sample data above). Genre-neutral — SF is a demo, not the product.
- **Distribution:** installable PWA first; Tauri desktop `.exe` and Capacitor app-store builds are later, from the same code.

## Where to build
This folder: **`C:\Projects\writers-codex\`** is the new repo. Scaffold the Svelte project here.

## Start at
**`BUILD-SPEC.md` §10, step 0** (scaffold Svelte+Vite+TS, import the prototype as the design reference, port the schema). Then §10 steps 1→7 in order. Each step is independently useful — build and verify one at a time.

## Guardrails (important)
- **Do NOT touch `C:\Projects\story-workbench\`** — that's TJ's private personal rig (his own Cosmos data + his dictate-to-Claude workflow). Read it as reference only.
- **Do NOT ship TJ's manuscript or personal data** in the public app. The SF *sample* world may ship (trimmed); his unpublished prose does not.
- Keep it **zero-dependency-minded** — Svelte compiles small; don't pull in heavy libraries without reason.
- **Ask TJ only these 4 open items** (everything else is decided): (1) confirm subdomain `codex.` vs `writers-codex.`; (2) app icon/logo; (3) how much of the SF data ships as the demo; (4) MIT license confirmation.

## First check-in
After step 0–1 (scaffold + data layer: IndexedDB store, schema, project switcher, export/import), stop and show TJ a running skeleton before building all the views. Small, verifiable increments.
