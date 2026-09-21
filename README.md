# tasks

My cross-session task tracker. This repo is the single source of truth — Claude reads and
writes it via the `tasks` skill (in any Claude Code session, once the skill is installed
and `gh` is authenticated), and the companion website lets me tick things off by hand.

## Layout

- `data/tasks.json` — active tasks, grouped by category
- `data/history.json` — completed tasks (what powers the level-up tree), with optional
  notes and screenshots
- `images/` — screenshots attached to completed tasks
- `index.html` / `style.css` / `app.js` — the static site, served via GitHub Pages

## Website

Live at the repo's GitHub Pages URL. It reads the JSON files directly, so any change
pushed here (by Claude or by hand) shows up within a minute or two, no build step.

To tick boxes or add tasks from the website itself, open Settings (⚙) and paste a
**fine-grained personal access token** scoped to this repo with **Contents: Read and
write**. The token is stored only in your browser's localStorage and used solely to call
GitHub's API directly from the page — it's never sent anywhere else.

## Claude skill

The `tasks` skill (installed locally in `~/.claude/skills/tasks`) teaches Claude to clone
or pull this repo, read/edit the JSON files, and push — so "what are my tasks" or "mark X
done" works the same way from any session.
