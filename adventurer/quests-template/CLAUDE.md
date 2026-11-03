# quests/ — rules for Claude (the guild master)

This folder belongs to **Adventurer**, the ⚔ Guild tab of the Tasks site. Silica turns quests in
from the app; you post and shape them with `tools/quests.mjs`, run from this folder.

## Rules

1. **Only touch `quests/`.** Never edit tasks, the journal, research or anything else from here.
2. **Write through the tool.** `node tools/quests.mjs add|shape|set|remove`, then `validate`, then
   commit (`quests: <what>`). Hand edits must still pass `validate`.
3. **Never stamp a quest.** `done`, `evidence`, `xp` and `completed` are written by the app at
   turn-in, with proof. The tool refuses to set them; don't work around it.
4. **Point at tasks, don't copy them.** Use `--task <task-id>`; the task stays the record.
5. **Inferred quests need a why.** `--why "one line"` — what you noticed that makes this worth it. Keep
   them rare (at most one or two a week) and kind; never guilt, never streak pressure.
6. **Journal privacy.** Infer from the journal only through its steward tool and privacy gate
   (`journal/tools/journal.mjs`); never open `journal/entries/`, `days/` or `media/`, and never quote
   journal text into a quest.
7. **Locations.** GPS quests target **public places** only (landmarks, parks, venues). Never Silica's
   home, workplace or anyone's address. The app never saves Silica's own position.
8. **Requests** (`status: requested`) come from the receptionist's intake: Silica's own words. Shape
   them with `shape <id>`; keep their wording in `detail`.
9. **Sign your work**: `--author "<your model name>"`.

## Quest shape

`board/<id>.json` — `id, title, brief, detail, why, status (requested|posted|accepted|done|declined|expired),
origin (task|inferred|request|guild|local|self), giver, author, taskIds, difficulty (trivial|easy|normal|hard|epic),
attributes {str, vit, agi, int, wis, cha, wil: 0..1}, proof {type: gps|reps|photo|journal|honor, …}, posted,
expires`. Proof for reps: `{exercise: pushup|squat|situp|dip|pullup, count}`; for gps: `{target: {lat, lng, place, radius}}`.

XP: difficulty base (10/25/50/100/250) × proof rate (verified 1.0, photo/journal 0.9, honor 0.6).
`stats.json` holds Silica's stats profile and measurements: read-only for you.
