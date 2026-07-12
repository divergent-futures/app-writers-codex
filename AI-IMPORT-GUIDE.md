# Bringing your own story into Writer's Codex, with your own AI

Writer's Codex ships empty — it's designed so your story lives entirely on your own device, not
in this repo. This guide is a self-serve way to get your existing notes, outline, or story bible
into the app quickly, using whatever AI assistant you already work with (Claude, ChatGPT, or
anything else that can follow a format).

The short version: you describe your story to your AI using the prompt below, it hands you back a
plain markdown file, you run one command, and you import the result with the app's own **Import…**
button. No manuscript prose, no photos, no account required — just the structural stuff (characters,
worlds, timeline, books) that Writer's Codex is built to organize.

## Step 1 — Give your AI this prompt

Copy everything in the box below into a fresh conversation with your AI assistant, then describe
your story underneath it — characters, worlds, books, whatever you've got, in your own words, at
whatever length you like. The more detail you give it, the more it'll be able to fill in.

```
I'm using an open-source writing tool called Writer's Codex. I need you to convert my story notes
into its "block-markdown" import format. Follow this spec exactly — it's parsed by a script, not
read by a human, so formatting precision matters more than prose style.

FORMAT RULES

- Each entity is its own block, starting with a line "## TYPE" in capitals (e.g. "## CHARACTER"),
  and ending at the next "## " line or a line containing only "---".
- Inside a block, fields look like "**Field Name:** value" — one per line.
- For a long field (a paragraph), write "**Field Name:** |" then the text indented by 2+ spaces on
  the following line(s).
- For a list field, write "**Field Name:**" with nothing after the colon, then each item as an
  indented "- " bullet on the following lines.
- Some list items are themselves structured: "- **Sub A:** value — **Sub B:** value — **Sub C:** value"
  (fields separated by " — ", an em dash with spaces on both sides).
- Refer to other entities BY THEIR EXACT NAME OR TITLE, spelled identically every time you mention
  them — never invent an id. A character, world, thread, book, or timeline label used in one block
  must be spelled character-for-character the same everywhere else it's referenced.

BLOCK TYPES AND THEIR FIELDS

## SERIES
**Title:** | **Logline:** | **Author:** | **Note:**

## BOOK
**Title:** | **Order:** (number) | **Status:** (planned/drafting/revised/done, or your own words)
**Type:** (optional: book/season/episode/arc/game/part/movement)
**Word target:** (optional number) | **Branch:** (optional: yes/no)
**Worlds:** (optional list of world names this book takes place in)

## THREAD
**Name:** | **Color:** (a hex code or color word) | **Source:** (where this thread originates)

## TRACK
**Name:** | **Color:** | **Kind:** (spine/species/world) | **World:** (optional world name)

## CHARACTER
**Name:** | **Role:** | **One-line:** (a one-sentence description) | **Source:**
**Aliases:** (optional list)
**Relationships:** (optional list) — each item: **To:** name — **Type:** — **Note:**
**Links:** (optional list, connects this character to a world or thread) — each item:
  **To:** name — **Kind:** world|thread — **Type:** — **Note:**
**Arcs:** (optional list, one per book this character appears in) — each item:
  **Book:** title — **Status:** open|closed — **Want:** — **Need:** — **Wound:** —
  **Scores:** proactivity N, relatability N, capability N — **Circle:** (comma list from:
  you, need, go, search, find, take, return, change) — **Rationale:**
**Lessons:** (optional list) — each item:
  **Book:** title — **Trigger:** — **Lesson:** — **Becomes:** — **Status:** learned|partial|resisted

## WORLD
**Name:** | **Note:** | **Source:**
**Type:** (free text: galaxy/system/world/region/realm/species/whatever fits)
**Parent:** (optional — the name of a containing world, for nested settings)

## TIMELINE
**Label:** (a short name for this beat/event) | **Order:** (number) | **Era:** (optional)
**Book:** (which book this belongs to) | **Threads:** (optional list of thread names)
**Characters:** (optional list of character names involved)
**Summary:** | (long text)
**Track:** (which track this beat lives on) | **Also tracks:** (optional list)

## CHAPTER
**Title:** | **Book:** | **Order:** (number) | **POV:** (character name, optional)
**Thread:** (optional) | **Status:** | **Word count:** (number, 0 if unwritten)
**Summary:** | (long text)
**Characters:** (optional list of names in this chapter)
**Scenes:** (optional list) — each item: **Title:** — **Summary:** — **Characters:** (comma list)

## NOTE
**Date:** (YYYY-MM-DD) | **Text:** | (long text) | **Tags:** (optional list)

## RESEARCH
**Title:** | **Question:** | **Status:** open|grounded|locked
**Books:** (optional list) | **Threads:** (optional list)
**Findings:** (optional list) | **Forks:** (optional list, open follow-up questions)
**Sources:** (optional list) — each item: **Title:** — **URL:** — **Note:**

## THEME
**Name:** | **Statement:** | (long text)
**Books:** (optional list) | **Characters:** (optional list) | **Beats:** (optional list of timeline labels)

## PANTHEON
(a character's internal cast — subconscious archetypes, inner voices, etc. — optional, skip if
this doesn't apply to your story)
**Name:** | **Age:** | **Category:** personal-stage|ancestral-collective|external
**Order:** (number) | **Role:** | **Voice:** | **Function:** | **Tie:**

## READING
(a reading list / research bibliography for the story's genre — optional)
**Title:** | **Author:** | **Status:** read|reading|toread | **Gives:**
**Tags:** (optional list) | **Correlation:** | **Takeaways:** (optional list)

## RELIGION
**Name:** | **World:** (which world this belongs to) | **Scope:** | **Status:** emerging|established|dominant|corrupted|dead
**Truth:** accurate|partial|distorted|corrupted (how true its teachings actually are, in-universe)
**Creed:** | (long text) | **Mythologizes:** | (long text) | **Afterlife:** | (long text)
**Beats:** (optional list of timeline labels) | **Tenets:** (optional list)
**Figures:** (optional list) — each item: **To:** character name — **Role:**
**Relationships:** (optional list) — each item: **To:** other religion name — **Type:**
**Source:** (optional)

Only include block types that apply to my story — an empty story doesn't need every type filled
in. Ask me clarifying questions if something's ambiguous, rather than inventing details. When
you're done, give me the complete markdown in one code block I can save directly to a .md file.
```

## Step 2 — Save the result

Save what your AI gives you as a `.md` file anywhere on your computer — for example
`my-story/story.md`. If your AI produced several separate blocks or you want to keep things
organized in multiple files (e.g. `characters.md`, `worlds.md`, `timeline.md`), that's fine too —
put them all in one folder.

## Step 3 — Convert it

From the `writers-codex` project folder, run:

```
node scripts/import-story.mjs path/to/my-story/story.md
```

(or point it at a folder — it reads every `.md` file inside):

```
node scripts/import-story.mjs path/to/my-story/
```

It writes a `story.codex.json` file next to your input and prints a count of everything it found.
If it warns about a name it couldn't resolve (`could not find character named "..."`), that means
something was referenced before it was spelled consistently elsewhere — fix the spelling in your
markdown and rerun.

## Step 4 — Import it

Open Writer's Codex, click **Import…** in the toolbar, and select the `.codex.json` file the
script wrote. Your story loads as a new project, ready to keep building on inside the app.

## What this doesn't do

This format is for structure — characters, worlds, timeline, relationships — not manuscript prose.
Chapter bodies, photos, and long-form writing stay something you add inside the app itself after
import. There's no limit on how many times you repeat this process as your story grows; each run
produces a fresh, standalone file you can re-import (as a new project) whenever you want an updated
snapshot.
