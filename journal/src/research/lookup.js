// Paper details from a DOI: Crossref for most journals, DataCite for arXiv
// (10.48550/…). Both answer browsers directly. Only the DOI is sent — a public
// identifier — and nothing is stored if the lookup fails.

import { fromCrossref, fromDataCite } from "../core/sources.js";

export async function lookupDoi(doi, { fetchImpl = (...a) => fetch(...a), timeout = 8000 } = {}) {
  if (!doi) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const order = /^10\.48550\//i.test(doi) ? ["datacite", "crossref"] : ["crossref", "datacite"];
  try {
    for (const which of order) {
      try {
        const url = which === "crossref"
          ? `https://api.crossref.org/works/${encodeURIComponent(doi)}`
          : `https://api.datacite.org/dois/${encodeURIComponent(doi)}`;
        const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        if (!res.ok) continue;
        const j = await res.json();
        const meta = which === "crossref" ? fromCrossref(j.message) : fromDataCite(j.data?.attributes);
        if (meta.title) return meta;
      } catch { /* try the other, or give up quietly */ }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
