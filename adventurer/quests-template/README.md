# Quests

Data for **Adventurer**, the ⚔ Guild tab of the Tasks site (source: `sandstormveg/Adventurer`).

- `board/` — one JSON file per quest.
- `stats.json` — your stats profile (age band, comparison table) and measurements.
- `media/` — photo proof.
- `tools/quests.mjs` — the guild master's tool (`node tools/quests.mjs` for help). Rules for Claude are in `CLAUDE.md`.

The app writes only inside this folder. Your position is never saved — a GPS turn-in records the distance only.
