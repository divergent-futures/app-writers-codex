# Writer's Codex

**A local-first, offline, installable writing & worldbuilding organizer** — external memory for
authors, so a whole story world stays visible instead of held in one head. Genre-neutral: it ships
empty, with a one-tap public-domain Sherlock Holmes example world to explore.

> ▶ **Use it:** _codex.divergentfutures.co_ (coming soon)

- **Local-first.** No accounts, no backend, no cloud — ever. Everything lives in your browser
  (IndexedDB). Export/import a project file you own for backup and portability.
- **Offline & installable.** A PWA you can add to your home screen and use with no signal (PWA
  packaging lands in a later build step).
- **Everything editable.** Characters, worlds, threads, the timeline spine, books, chapters,
  themes, faiths, and more — with prose drafting in the Write cockpit (editing lands next).

## Bring your own story

Writer's Codex ships empty on purpose — your story lives on your device, never in this repo. If
you already have notes, an outline, or a story bible, **[AI-IMPORT-GUIDE.md](AI-IMPORT-GUIDE.md)**
walks through converting them with your own AI assistant (Claude, ChatGPT, or similar) into a file
the app's own Import button accepts — no manuscript prose or account required, just the structural
stuff: characters, worlds, timeline, books.

## Or clone & run

```bash
npm install
npm run dev        # local dev server
npm run build      # static production build → dist/
npm run check      # type-check
```

`npm run build:sherlock` regenerates the bundled Sherlock Holmes example world from
`sherlock-demo/` (build-time only). `npm run build:sample` is a local-only convenience for the
maintainer's own private dev data and does nothing in a fresh checkout — see
[AI-IMPORT-GUIDE.md](AI-IMPORT-GUIDE.md) to bring in your own story instead.

## Status

Early build. Scaffold + local-first data layer (schema, validation, IndexedDB store, project
switcher, export/import, SF example loader) are in place. Read-views, in-app editing, mobile
capture, and PWA packaging are in progress — see `BUILD-SPEC.md`.

## Tech

Svelte 5 + Vite + TypeScript, compiled to static files. One runtime dependency (`idb`, a tiny
IndexedDB wrapper). No framework runtime bloat; no server.

## License

Code: **AGPL-3.0-or-later** (see `LICENSE`). Sample-world content credited to
_Divergent Futures / Humans in Space_.
