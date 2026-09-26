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
- Private counterparts of all of the above live in `tasks-data`

## Website

Live at the repo's GitHub Pages URL. Public tasks load immediately, no token needed.
Private tasks (and any editing, of either kind) need a **fine-grained personal access
token** with **Contents: Read and write** on both `sandstormveg/tasks` and
`sandstormveg/tasks-data` — paste it into Settings (⚙). It's stored only in your browser's
localStorage and used solely to call GitHub's API directly from the page.

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
