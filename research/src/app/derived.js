// Indexes derived from the store (search, related entries, tag counts).
// Rebuilt lazily when the store's version changes — never persisted, so they
// can't drift from the records.

import { buildIndex, buildTfIdf, related, relatedToText } from "../core/search.js";
import { entryText } from "../core/model.js";
import { tagCounts } from "../core/stats.js";

export class Derived {
  constructor(store) {
    this.store = store;
    this.v = -1;
  }

  refresh() {
    if (this.v === this.store.version) return;
    this.v = this.store.version;
    const entries = this.store.all("entry");
    const days = new Map(this.store.all("day").map((d) => [d.id, d]));
    this._entries = entries;
    this._index = buildIndex(entries.filter((e) => !e.sealed).map((e) => {
      const d = days.get(e.day);
      return {
        id: e.id,
        tags: e.tags || [],
        sortKey: e.created,
        fields: {
          title: e.title || "",
          body: e.body || "",
          caption: (e.media || []).map((m) => m.caption).filter(Boolean).join(" \n "),
          text: [e.document?.title, e.document?.author, e.document?.text, (e.conversation?.turns || []).map((t) => t.text).join("\n")].filter(Boolean).join("\n"),
          best: d?.best || "",
          hardest: d?.hardest || "",
        },
        entry: e,
      };
    }));
    this._tfidf = null;
    this._tags = null;
  }

  index() { this.refresh(); return this._index; }

  tfidf() {
    this.refresh();
    if (!this._tfidf) this._tfidf = buildTfIdf(this._entries.filter((e) => !e.sealed).map((e) => ({ id: e.id, text: entryText(e) })));
    return this._tfidf;
  }

  related(id, k = 5) { return related(this.tfidf(), id, { k }); }

  relatedToText(text, k = 5) { return relatedToText(this.tfidf(), text, { k }); }

  tags() {
    this.refresh();
    if (!this._tags) this._tags = tagCounts(this._entries);
    return this._tags;
  }
}
