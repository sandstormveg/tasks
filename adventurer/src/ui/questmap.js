// The quest map: open check-in quests pinned on OpenStreetMap, as GeoGuild's
// expedition map does (Leaflet, vendored in vendor/leaflet). Only the quests'
// own target places are shown; your position is never asked for or drawn. The
// map loads only when you open it, and the tile server sees which area you view.

import { sheet, html } from "./dom.js";

let leaflet;
function loadLeaflet() {
  if (!document.querySelector("link[data-leaflet]")) {
    const l = Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL("../../vendor/leaflet/leaflet.css", import.meta.url).href });
    l.dataset.leaflet = "";
    document.head.appendChild(l);
  }
  return (leaflet ||= import("../../vendor/leaflet/leaflet.js"));
}

const pinned = (q) => q.proof?.type === "gps" && Number.isFinite(q.proof.target?.lat) && Number.isFinite(q.proof.target?.lng);
export const mappable = (quests) => quests.filter(pinned);

/** Resolves the id of the quest you tapped "Open" on, or undefined. focus: a quest id to centre on. */
export function questMap(quests, { focus } = {}) {
  const list = mappable(quests);
  return sheet({
    title: "Quest map",
    wide: true,
    body: html`<div class="quest-map" role="region" aria-label="Map of quest locations"></div>
      <p class="muted small">${list.length} quest location${list.length === 1 ? "" : "s"}. Map data © OpenStreetMap contributors. Your own position isn't shown or saved.</p>`,
    setup: async (d, close) => {
      const L = await loadLeaflet();
      const box = d.querySelector(".quest-map");
      const map = L.map(box, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      const pts = [];
      for (const q of list) {
        const { lat, lng, place } = q.proof.target;
        const icon = L.divIcon({ className: `map-pin ${q.status}`, html: q.status === "accepted" ? "⚔" : "!", iconSize: [28, 28], iconAnchor: [14, 28] });
        const pop = document.createElement("div");
        pop.className = "map-pop";
        pop.innerHTML = String(html`<b>${q.title}</b><div class="muted small">${place || ""}${q.status === "accepted" ? " · accepted" : ""}</div><button class="btn small" data-open>Open</button>`);
        pop.querySelector("[data-open]").addEventListener("click", () => close(q.id));
        L.marker([lat, lng], { icon, title: q.title }).addTo(map).bindPopup(pop);
        pts.push([lat, lng]);
      }
      const f = list.find((q) => q.id === focus);
      if (f) map.setView([f.proof.target.lat, f.proof.target.lng], 15);
      else if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
      else map.setView([20, 0], 2);
      setTimeout(() => map.invalidateSize(), 60); // the dialog finishes its layout after setup
      d.addEventListener("close", () => map.remove());
    },
  });
}
