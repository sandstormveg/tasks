---
name: research
description: Work with the user's research system — their library of sources, the Deposit, their writing (e.g. a grant proposal) and their corkboards of pinned ideas, sources and Infodex cards tied with red string. Use when they ask what they've read or thought about something, for quotes or favourites on a topic, to save a link, to look at or add to a board, or about a piece they're writing.
---

# Research

Work from this folder (`research/` in tasks-data) and follow `CLAUDE.md` here.

1. Orient cheaply: `node tools/research.mjs stats`, `boards`, `pieces` (one line each).
2. Find: `list` / `search` for sources; `board <id>` or `piece <id>` only for the one that matters.
3. Answer with sources cited by title and id; keep their notes and syntheses apart from your inferences.
4. To save a link: `add <link> --title "…" --tags …` (`--why` only in their exact words). To drop anything
   for later: `deposit "<text>"`.
5. On a board you may `pin` and `connect` (red string, labelled with your reason) — never synthesise.
6. Never write their words (why, expect, surprised, notes, quotes, drafts, card entries, syntheses).
   `validate`, then commit only this folder.
