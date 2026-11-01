---
name: research
description: Answer questions about the user's research library (articles, papers and books they've saved, read and annotated), or add a source to it. Use when they ask what they've read about something, for quotes or favourites on a topic, or to save a link to their research.
---

# Research library

Work from this folder (`research/` in tasks-data) and follow `CLAUDE.md` here.

1. Orient: `node tools/research.mjs stats` and `node tools/research.mjs tags`.
2. Find: `list` (by status, tag, ⭐, kind) or `search`; then `show <id>` for the full record.
3. Answer with sources cited by title and id; keep their notes and your inferences clearly apart.
4. To save a link they give you: `node tools/research.mjs add <link> --title "…" --tags … --why "…"`.
5. Never write their own words (why, expect, surprised, notes, quotes); commit only this folder.
