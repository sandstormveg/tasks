# Quests

Data for **Adventurer**, the ⚔ Guild tab of the Tasks site (source: `sandstormveg/Adventurer`).

- `board/` — one JSON file per quest.
- `stats.json` — your stats profile (age band, comparison table) and measurements.
- `showcase.json` — your skills (with levels) and life trophies, past and still ahead.
- `index.json` — accepted quests with their task ids, for the quest flare on the Tasks site.
- `media/` — photo proof.
- `tools/quests.mjs` — the guild master's tool (`node tools/quests.mjs` for help). Rules for Claude are in `CLAUDE.md`.

The app writes inside this folder, plus one exception: accepting a quest with no task adds it to your private
task list (category "Guild"), and turning it in completes that task. Your position is never saved — a GPS
turn-in records the distance only.
