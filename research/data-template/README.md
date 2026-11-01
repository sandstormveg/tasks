# Journal data

This private repository is the synced home of a [Living Journal](https://github.com/sandstormveg/Journal_system).
The app writes here; you can also read every file with nothing but a text editor.

**Keep this repository private.** The app refuses to sync to a public one.

## Layout

| Path | What it is | Who writes it |
| --- | --- | --- |
| `entries/YYYY/MM/<id>.md` | What you wrote, said, photographed or imported | You |
| `days/YYYY/YYYY-MM-DD.md` | Optional day rating, best/hardest moments, feelings | You |
| `events/YYYY/MM/<id>.md` | Calendar events you imported — context, not recollection | You (via import) |
| `media/YYYY/MM/<id>.*` | Photos (`.jpg`, with `.thumb.jpg`), audio, documents. `.enc` = sealed | You |
| `meta/claims/<id>.md` | Your meta-record: revisable, evidence-linked hypotheses | You (incl. accepted proposals) |
| `meta/proposals/<id>.md` | Suggestions awaiting your decision | AI (in the app, or a steward) |
| `meta/questions/<id>.md` | Questions worth sitting with | You, documents, accepted proposals |
| `interpretations/YYYY/<id>.md` | AI readings of documents, accepted connections — always labelled | AI, accepted by you |
| `imports/<id>.md` | Verification reports from imports (e.g. Notion) | The app |
| `config/*.yaml` | Preferences, chapters, sealing parameters (no secrets) | The app |
| `tools/journal.mjs` | Command-line tool for steward sessions | — |

Each record is Markdown with YAML frontmatter. Fields beginning with `_` never appear here;
unknown fields you add by hand are preserved by the app.

## Privacy levels

- **normal** — synced, searchable; an AI reads it only when you ask for AI help.
- **no-ai** — synced, searchable, never sent to any AI. A steward must read entries only through
  `node tools/journal.mjs context`, which excludes these.
- **sealed** — the text is encrypted (AES-256-GCM, key from your passphrase via PBKDF2) before it
  ever reaches this repository. The frontmatter shows only the id, date and kind.

## The meta-record

Claims are hypotheses, not facts. Each keeps its evidence (verbatim quotes from entries), its
alternatives, what it predicts, what would change it, and its full history. AI never writes claims:
it writes proposals, and only your decision in the app turns one into a claim.

See `CLAUDE.md` for the rules a Claude Code steward session follows here.
