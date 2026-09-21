# tasks

The website for my cross-session task tracker. This repo holds only the static site code
(HTML/CSS/JS) and is public because GitHub Pages' free tier requires that. The actual task
data — titles, notes, screenshots — lives in a separate **private** repo,
[sandstormveg/tasks-data](https://github.com/sandstormveg/tasks-data), so it isn't publicly
readable.

## Layout

- `index.html` / `style.css` / `app.js` — the static site, served via GitHub Pages
- No task data lives here — see `tasks-data` for `data/tasks.json`, `data/history.json`,
  and `images/`

## Website

Live at the repo's GitHub Pages URL. It reads/writes `sandstormveg/tasks-data` directly via
the GitHub API, so any change (by Claude or by hand) shows up within a minute or two, no
build step.

To view or edit tasks from the website, open Settings (⚙) and paste a **fine-grained
personal access token** scoped to `sandstormveg/tasks-data` with **Contents: Read and
write**. The token is stored only in your browser's localStorage and used solely to call
GitHub's API directly from the page — it's never sent anywhere else, and it has no access
to this (public) repo since it's scoped to the private data repo only.

## Claude skill

The `tasks` skill (installed locally in `~/.claude/skills/tasks`) teaches Claude to clone
or pull `sandstormveg/tasks-data`, read/edit the JSON files, and push — so "what are my
tasks" or "mark X done" works the same way from any session.
