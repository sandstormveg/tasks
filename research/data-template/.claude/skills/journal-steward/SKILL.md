---
name: journal-steward
description: Run a steward pass on this Living Journal data repository — read recent entries through the privacy gate, propose at most five evidence-linked meta-record updates or questions, validate, commit. Use when asked to "run the journal steward", "look for patterns in my journal", or "propose meta-record updates".
---

# Journal steward

Follow `CLAUDE.md` at the repository root exactly; it is the authority. In short:

1. `node tools/journal.mjs status` and `node tools/journal.mjs calibration`.
2. Read entries **only** via `node tools/journal.mjs context --since 30d` (widen if sparse). Never open
   `entries/`, `days/` or `media/` files directly — No-AI and sealed entries must stay unread.
3. Draft 0–5 proposals as JSON (format in `CLAUDE.md`), each with exact quotes, an alternative
   explanation, `expects`, `would_change_if`, and an honest `predicted_acceptance`.
4. `node tools/journal.mjs propose <file.json>`, then `node tools/journal.mjs validate` (0 errors).
5. Commit only `meta/proposals/`, push, and summarise what you proposed, what you held back, and why.

Proposing nothing is a good outcome when nothing is well supported.
