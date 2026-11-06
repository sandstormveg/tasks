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
10. **Skills and trophies are Silica's.** `skill add` and `trophy add` write `showcase.json`; add only what
    Silica has told you is true (a skill they have, a thing they did, a goal they named), never a guess.
    Tag quests with the skills they train: `--skill rust=1`.
11. **Tasks become quests here, not in the task list.** When a task deserves a quest, `add --task <id>`;
    the app syncs accepted quests back to tasks itself. Don't edit `data/tasks.json` for quests.

## Quest shape

`board/<id>.json` — `id, title, brief, detail, why, status (requested|posted|accepted|done|declined|expired),
origin (task|inferred|request|guild|local|self), giver, author, taskIds, difficulty (trivial|easy|normal|hard|epic),
attributes {str, vit, agi, int, wis, cha, wil: 0..1}, skills {skill-id: 0..1}, proof {type: gps|reps|photo|journal|honor, …}, posted,
expires`. Proof for reps: `{exercise: pushup|squat|situp|dip|pullup, count}`; for gps: `{target: {lat, lng, place, radius}}`.

XP: difficulty base (10/25/50/100/250) × proof rate (verified 1.0, photo/journal 0.9, honor 0.6).
`stats.json` holds Silica's stats profile and measurements, and `index.json` is rebuilt by the app: both
read-only for you. `showcase.json`: `{skills: [{id, name, kind active|passive|unique, status known|learning|aspiring,
startLevel 0-10, category}], achievements: [{id, title, detail, status earned|goal, date, tier bronze|silver|gold|mythic, icon}]}`.
A skill levels up from the XP of turned-in quests that train it.

**Explore quests** are gps quests with an `encounter` that opens at check-in: `{type: chest|scholar, name, text,
loot: [...up to 5]}`. Loot kinds: `{kind: "dex", qid: "Q5194", label, why}` (a lead to chart in the Infodex and mint as a
Dex card), `{kind: "babel", label, why}` (a Babel run), `{kind: "task", taskId, why}`, `{kind: "note", label, why}`. Fill
them from what Silica is into: their tasks, research, and the journal only through its gate (themes, never quotes).
Keep the place public and the coordinates in this private repo.

## Expeditions (quests with several objectives)

An expedition is a quest with `objectives`. Each objective has a **type** (exploration, social, research, creation,
reflection, learning, physical, discovery), its own **XP**, and can be **optional** (bonus XP). An objective can link to a
real record, and then it completes only when that record exists. The app checks on every sync:

| link | completes when | shorthand |
|---|---|---|
| `tasks` | that task is ticked off in Tasks | `@tasks:ref=<task-id>` |
| `research` | a source/board/piece id exists, or N sources with a tag/kind/status are filed **after it's accepted** | `@research:ref=s-…` · `@research:tag=ai-safety,count=2` |
| `quests` | that quest is turned in | `@quests:ref=<quest-id>` |
| `journal` | Silica links a journal day (only the date is kept) | `@journal` |
| `gps` | Silica checks in there | `@gps:lat=…,lng=…,place=…,radius=80` |
| `reps` | camera-counted reps | `@reps:exercise=pushup,count=20` |
| none | Silica ticks it | (no `@`) |

```sh
node tools/quests.mjs add --title "Map the persona debate" --difficulty hard --attr int=1,wis=0.5 --author "<you>" \
  --objective "research: File two papers on model personas @research:tag=personas,count=2 +30xp" \
  --objective "reflection: Write what changed your mind @journal +20xp" \
  --objective "creation: Finish the note @tasks:ref=<task-id> +40xp" \
  --objective "social: Talk it over with someone +15xp optional"
node tools/quests.mjs objective <id> "discovery: …"     # add more while it's still posted
```

- XP: the mandatory objectives' XP is the quest's reward; optional ones are bonus. `difficulty` is just its rank label here.
- **A record pays once.** A task, source or journal day credited to one objective can't complete another, here or in
  another quest. Don't build two expeditions on the same record.
- `progress` is written by the app only; the tool refuses to set it (like `evidence`).
- **Find expeditions in what's already happening**: a cluster of sources on one tag (`research.mjs stats`, `list --tag`), a
  board full of red strings, a piece of writing with its task, a run of related tasks. Say what you noticed in `--why`.
  Journal themes only through its gate, never quotes, and a journal objective only ever asks for a date.
