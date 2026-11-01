# Research — rules for Claude

This folder is the user's private research library (written by the Research app). Use it to answer
questions about what they've saved, read and thought, and to add things when they ask.

## Reading

Use the tool rather than opening files one by one:

```sh
node tools/research.mjs stats
node tools/research.mjs list --status read --tag s-risk       # also --fav, --kind paper, --status inbox|to-read|reading|dropped
node tools/research.mjs search moral circle #ethics           # words and #tags, accents and case ignored
node tools/research.mjs show <id or words>                    # one source in full
node tools/research.mjs tags
```

Add `--json` for structured output.

## Answering questions about their research

- Cite sources by title and id, e.g. *Risks of astronomical future suffering* (`s-20261101-0930-k7q2`).
- Keep **what their notes say** separate from **your own reading or inference** — label the second.
- Quote only what's in `quotes` or their notes, word for word. Don't invent page numbers.
- `why`, `expect` and `surprised` are their thinking at the time; treat them as such, not as facts.
- Don't fetch the linked pages unless they ask; links can change or disappear.

## Changing things

- **Add** a source when asked: `node tools/research.mjs add <link> --title "…" --tags a,b`
  (it lands in the Inbox; the tool refuses duplicates). Add `--why "…"` only when they told you why
  in the same request, and then in their exact words — never one you wrote.
- **Change** status, ⭐ or tags when asked: `node tools/research.mjs set <id> --status read --fav true --tags +a,-b`.
- **Never** write or edit their words — `why` (beyond quoting them as above), `expect`, `surprised`,
  notes or quotes. Suggest them in chat instead; they'll add what they want in the app.
- Suggestions for tags or connections between sources go in chat, not into the files (for now).
- Commit with a plain message, e.g. `research: add "<title>"`, and push. Touch only this folder.
