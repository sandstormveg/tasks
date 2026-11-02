# tasks

My cross-session task tracker's website and public task data. Each task is either:

- **🌐 Public** — stored right here in `data/tasks.json` / `data/history.json`. Readable
  by anyone with no auth at all, which is what lets it work embedded anywhere (e.g. a
  Notion page) with zero setup.
- **🔒 Private** — stored in a separate private repo,
  [sandstormveg/tasks-data](https://github.com/sandstormveg/tasks-data), for anything
  sensitive. Always needs a GitHub token to view or edit, from anywhere.

New tasks default to public; toggle to private per-task when adding one, either on the
website or by telling Claude.

## Layout

- `index.html` / `style.css` / `app.js` — the static site, served via GitHub Pages
- `data/tasks.json` — active public tasks, grouped by category
- `data/history.json` — completed public tasks (what powers the level-up tree)
- `images/` — screenshots attached to completed public tasks
- `journal/` — the Journal tab (a generated copy of the Living Journal app; see below)
- `research/` — the Research tab (a generated copy of the Research app, from the same repo; see below)
- Private counterparts of all of the above live in `tasks-data`

## Website

Live at the repo's GitHub Pages URL. Public tasks load immediately, no token needed.
Private tasks (and any editing, of either kind) need a **fine-grained personal access
token** with **Contents: Read and write** on both `sandstormveg/tasks` and
`sandstormveg/tasks-data` — paste it into Settings (⚙). It's stored only in your browser's
localStorage and used solely to call GitHub's API directly from the page.

## Journal

The **Journal** tab opens [the Living Journal](https://github.com/sandstormveg/Journal_system),
installed in `journal/` so it's part of this same home-screen app and uses the same token. Journal
files sync into a `journal/` folder of `tasks-data` (it never touches anything else there, and
refuses a public repo). `journal/` is generated — don't edit it here; update it from the journal
repo with `node tools/install-into.mjs ../tasks/journal --host tasks`.

Anything that can read `tasks-data` (including Claude sessions using the tasks skill) can read
journal files that aren't sealed. Leave `tasks-data/journal/` alone unless you're asked to work on
the journal; its own `journal/CLAUDE.md` has the rules for that.

## Research

The **§ Research** tab opens Research (from the same
[Journal_system](https://github.com/sandstormveg/Journal_system) repo, see its `docs/RESEARCH.md`),
installed in `research/`:

- **Deposit** — share anything to **Tasks** from any app on Android (the manifest's `share_target` opens
  `research/` with it), use the bookmark button in Research → Settings on a computer, or tap Add: a link,
  a DOI, an arXiv link, or just a thought. Each item suggests the board or piece it belongs with.
- **Reading** — To read → Reading → Read (or Dropped), with ⭐, tags, why you saved it, what you
  expected, what surprised you, notes and quotes.
- **Writing** — pieces (a grant proposal, an essay), each with its own corkboard.
- **Boards** — corkboards: pin notes, sources and Infodex cards, tie red string between what connects,
  synthesise it in your words; zoom into a card to open its page; the curator checks connections
  against the Atlas's rules.

Everything syncs into a `research/` folder of `tasks-data`, one Markdown file per item, and nothing
else there is touched. `research/` is generated — update it with
`node tools/install-into.mjs ../tasks/research --host tasks --app research`.

Claude can read it: `tasks-data/research/CLAUDE.md` has the rules and `node tools/research.mjs`
(run inside `tasks-data/research/`) lists, searches and shows sources, boards and writing. It may add
sources, change status, ⭐ and tags, and pin to boards with red string (marked as its own) — but never
writes your words or synthesises a connection.

`.nojekyll` makes Pages serve files as-is (the journal and Research ship a `.claude/` folder they copy
into the data repo).

## Design guide

- **Theme**: Cyberpunk Terminal is the current site-wide theme (Kel's pick from 3
  mockup options). Don't reintroduce the old default look without asking first.
- **Task card layout**: the icon/action row (check, nest ↳, assist ✦, visibility 🌐/🔒,
  delete 🗑, chevron) always sits on its own line, with the title + meta text on a
  full-width line below it — never inline side-by-side. The tasks column is narrow
  enough that inlining them squeezes the title into an unreadable word-by-word wrap.
- **Flex-item inputs need an explicit width**: any `<input>` placed inside a flex
  container (like the category combobox next to the visibility toggle) must get
  `width: 100%` from its own rule or a parent's. Without it the input renders at its
  intrinsic browser width and can visually overlap neighboring controls instead of
  being constrained by its flex box.
- **`autocomplete="off"` on one-off inputs**: any input that isn't meant to surface
  the browser's own remembered form values (e.g. the new-task title field) should be
  marked `autocomplete="off"`, same as the category field already is — otherwise old
  submitted values can pop up as a stray suggestion dropdown over an empty field.

## Claude skill

The `tasks` skill (installed locally in `~/.claude/skills/tasks`) teaches Claude to clone
or pull both repos, read/edit the right one based on public/private, and push — so "what
are my tasks" or "mark X done" works the same way from any session.
