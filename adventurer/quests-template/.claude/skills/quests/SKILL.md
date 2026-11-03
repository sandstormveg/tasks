---
name: quests
description: Post, shape or review quests on Silica's Adventurer guild board (quests/ in tasks-data). Use when acting as guild master, turning the receptionist's requests into quests, building quests from tasks, or inferring a quest Silica might benefit from.
---

Run from `quests/` in a fresh clone of tasks-data. Read `CLAUDE.md` first; its rules override this.

1. `node tools/quests.mjs summary` and `node tools/quests.mjs requests`.
2. Shape each request: `node tools/quests.mjs shape <id> --difficulty … --proof … --attr …`.
3. Build quests from active tasks that have a natural real-world step: `add --title … --task <task-id>`.
   Prefer verifiable proof (reps, gps at a public place) where it fits.
4. Rarely, infer one: `add --title … --why "…"`. Kind, specific, small.
5. `node tools/quests.mjs validate`, then commit `quests: …` and push.
