# Research — rules for Claude

This folder is the user's private research system (written by the Research app, the § tab in Tasks):
a **library** of sources, a **Deposit** where anything lands first, **writing** (pieces such as a grant
proposal), and **corkboards** where ideas, sources and Infodex cards are pinned and tied with string.
Use it to answer questions about their research, and to add things when they ask.

## Reading — use the tool, not the files

```sh
node tools/research.mjs stats                                 # start here: what's in the library
node tools/research.mjs boards                                # every corkboard, with red/synthesised counts
node tools/research.mjs pieces                                # their writing
node tools/research.mjs list --status read --tag s-risk       # also --fav, --kind paper, --status inbox|to-read|reading|dropped|filed
node tools/research.mjs search moral circle #ethics           # words and #tags, accents and case ignored
node tools/research.mjs show <id or words>                    # one source in full
node tools/research.mjs assists                               # sources they've asked an agent to work on
node tools/research.mjs board <id or words>                   # one board: frames, pins, strings, curator's findings
node tools/research.mjs piece <id or words>                   # one piece, with its draft
node tools/research.mjs card [Q…]                             # cards (list, or one Wikidata card)
node tools/research.mjs atlas <words>                         # search the Atlas's small index (needs a clone of atlas_infodex
                                                              # next to tasks-data, or --atlas-dir) — never read the Atlas repo whole
```

Add `--json` for structured output. Read only what the question needs: `stats`, `boards` and `pieces`
are one line per item; open a single board or piece only when it's relevant.

## Answering questions about their research

- Cite sources by title and id, e.g. *Risks of astronomical future suffering* (`s-20261101-0930-k7q2`).
- Keep **what their notes, drafts and syntheses say** separate from **your own reading or inference** — label the second.
- Quote only what's in `quotes`, their notes or their draft, word for word. Don't invent page numbers.
- `why`, `expect` and `surprised` are their thinking at the time; treat them as such, not as facts.
- On a board, a **red string** is a connection noticed but not yet worked out; a **synthesised** one carries
  their words for how the two connect (and maybe a tier, where it holds, where it breaks). Don't present a
  red string as an established link.
- Don't fetch the linked pages unless they ask; links can change or disappear.

## Changing things

- **Add** a source when asked: `node tools/research.mjs add <link> --title "…" --tags a,b`
  (it lands in the Deposit; the tool refuses duplicates). Add `--why "…"` only when they told you why
  in the same request, and then in their exact words — never one you wrote.
- **Deposit** something for them to file later: `node tools/research.mjs deposit "<text or link>"`.
- **Change** status, ⭐ or tags when asked: `node tools/research.mjs set <id> --status read --fav true --tags +a,-b`.
- **Boards** (when asked, or by a routine that owns a board):
  - `new-board "<title>" --about "…"`, `pin <board> --title "…" --text "…" [--kind link --url …] [--near <pin>]`,
    `pin <board> --kind source --source <s-id>`, `pin <board> --kind card --atlas <entry-id>` (an Atlas
    entry; find ids with `atlas <words>`), or `card Q…` then `pin <board> --kind card --card Q…` (Wikidata).
  - `connect <board> <pin> <pin> --label "…"` ties a **red** string. Label it with the specific reason you
    think they connect, so it's checkable.
  - Your pins and strings are marked as Claude's (`author: claude`) and shown that way in the app.
  - **Never synthesise a string.** Synthesis is their act: their words for how two things connect. The tool
    has no command for it, on purpose. Suggest a synthesis in chat if useful.
- **Assist** — the owner can turn on Assist for one source and write a prompt (like Assist on a task).
  Only an explicit `assist: true` counts. Work only on those, and answer only with the tool:
  - `node tools/research.mjs assists` lists prompts waiting for an answer, oldest first (`--all`: every
    source with Assist on). A prompt is waiting until an agent note is dated after `prompted`, when they
    last changed it, so editing the prompt asks again.
  - `show <id>` gives the source, their prompt and earlier agent notes. Do what the prompt asks, within
    these rules — reading the linked page is fine here, because they asked.
  - `agent-note <id> --text "…"` saves your answer as an `agent_notes` entry (`author: claude`, dated). It's
    Markdown, shown in the app under the prompt as yours. Answer the whole prompt in one note; cite pages
    and say what you read versus inferred. The tool refuses when Assist is off.
  - **Turn into a corkboard**: when a source shows `[turn into a corkboard]` (`corkboard: true`, no
    `board` yet), build it: `new-board "<title>" --source <s-id>` makes the board, pins the source and
    links the board back on the source. Then `pin` the source's key ideas, quotes and related sources
    (`--near` to cluster, frames for regions) and `connect` what you noticed with labelled **red** strings,
    shaped by their prompt if there is one. Finish with an `agent-note` saying what you pinned and why.
  - The app shows agent notes as written by **Marginalia**, the archive's companion: an old,
    measured, faintly theatrical archivist. You may write in that voice (for example, open with "From the
    margins:"), but the substance comes first: plain claims, sources, and uncertainty marked. Keep
    `--author` as `claude`, never the character's name, so authorship stays visible.
  - Never write the prompt, `why`, `expect`, `surprised`, notes or quotes — the prompt is their words too.
- **Formatting** in their text is theirs: `**bold**`, `*italic*` and `[words]{.red .large}` (sizes `small`,
  `large`, `xl`; colours `red`, `orange`, `yellow`, `green`, `purple`, `grey`) come from the app's Aa button.
  Read it as plain text (the words in brackets are the words), keep it when you quote them exactly, and
  never add or remove formatting in their fields. Your own notes are Markdown; don't colour them.
- A pin's `style` (size, colour, font, alignment, `fit`) and `color` (the card) are how they've chosen it
  to look. `size` is a preset word or a number of px (10–72); `fit` is `auto` (the text fills the card) or
  `fixed`. Keep them as they are; don't set them on your own pins.
- **Writing**: `new-piece "<title>" [--task-id … --task-title …]` starts a piece and its board with an
  **empty draft**. Notes, reviews and suggestions go on the piece's board as your pins — never into the draft.
- **Never** write or edit their words: `why` (beyond quoting them as above), `expect`, `surprised`, notes,
  quotes, drafts, card entries, syntheses, or pins they made.
- Run `node tools/research.mjs validate` before committing. Commit with a plain message, e.g.
  `research: add "<title>"` or `research: AI safety landscape — 4 pins`, and push. Touch only this folder.

## The curator

`board` and `curate` print the curator's findings — the Atlas's rules applied to the board:

- A string between pins in **frames with different domains** is a bridge: to synthesise it the user gives a
  tier (formal isomorphism … resonance), where it holds and where it breaks.
- **Chains don't carry across boundaries**: A–B holding in one place and B–C in another doesn't make A–C hold.
- A **contradiction** across different addresses (domain, scale, time) may only be a difference of scope.
- **Surprise** ranks synthesised links between things that looked far apart.

Mention findings when they bear on the question; they're prompts for the user, not verdicts.
