// Salle d'attente — petit serveur
// 1) télécharge le fichier horaire des urgences du MSSS (données ouvertes)
// 2) garde le résultat en mémoire 10 minutes
// 3) le transmet au site (public/index.html) en JSON sur /api/urgences
//
// 4) y ajoute les tendances par jour et par heure (prévisions « meilleur moment »)
//
// Aucune dépendance externe : il faut seulement Node.js 18 ou plus récent.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CACHE_MINUTES = 10;

const { build, download, snapshots, computeStats } = require("./lib");

// Tendances calculées par la collecte automatique (GitHub Actions), lues directement sur GitHub.
const STATS_URL = process.env.STATS_URL ||
  "https://raw.githubusercontent.com/benhsaink/salle-attente/main/data/stats.json";
const STATS_MINUTES = 60;

// ---------- Cache ----------
let cache = null, cacheTime = 0, pending = null;
async function getData() {
  if (cache && Date.now() - cacheTime < CACHE_MINUTES * 60e3) return cache;
  if (!pending) {
    pending = download()
      .then(({ records, source }) => {
        // Les 7 jours du fichier donnent déjà des tendances, en attendant l'historique complet.
        let live = null;
        try { live = computeStats(snapshots(records)); } catch (e) { console.warn("Tendances 7 jours :", e.message); }
        cache = { source, fetchedAt: new Date().toISOString(), all: build(records, true), live };
        cacheTime = Date.now();
        return cache;
      })
      .finally(() => (pending = null));
  }
  try { return await pending; }
  catch (err) { if (cache) return cache; throw err; } // en cas de panne, on sert la dernière version
}

// ---------- Tendances (historique) ----------
let saved = null, savedTime = 0;
async function getSavedStats() {
  if (Date.now() - savedTime < STATS_MINUTES * 60e3) return saved;
  savedTime = Date.now();
  try {
    const res = await fetch(STATS_URL, { headers: { "User-Agent": "SalleAttente/1.0" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    saved = await res.json();
  } catch (err) {
    // Pas encore de collecte sur GitHub : on essaie la copie déployée avec le site.
    try { saved = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "stats.json"), "utf8")); }
    catch (e) { if (!saved) console.warn("Historique indisponible (" + err.message + "), tendances sur 7 jours seulement"); }
  }
  return saved;
}

// Lisse chaque heure avec ses voisines (poids 1-2-1) pour éviter qu'une seule mauvaise
// soirée fausse la moyenne. Résultat : 168 cases [taux en %, personnes en attente] ou null.
function forecastFor(cells) {
  if (!cells) return null;
  const out = [];
  for (let i = 0; i < 168; i++) {
    let sr = 0, wr = 0, sp = 0, wp = 0;
    for (const [off, w] of [[-1, 1], [0, 2], [1, 1]]) {
      const c = cells[(i + off + 168) % 168];
      if (!c) continue;
      const weight = w * c[2];
      if (c[0] !== null) { sr += (c[0] / 10) * weight; wr += weight; }
      if (c[1] !== null) { sp += (c[1] / 10) * weight; wp += weight; }
    }
    out.push(wr || wp ? [wr ? Math.round(sr / wr) : null, wp ? Math.round((sp / wp) * 10) / 10 : null] : null);
  }
  return out.some(Boolean) ? out : null;
}

async function withTrends(d, hospitals) {
  const savedStats = await getSavedStats();
  const stats = savedStats && (!d.live || savedStats.days >= d.live.days) ? savedStats : d.live;
  if (!stats) return { trend: null, hospitals };
  return {
    trend: { days: stats.days, from: stats.from, to: stats.to },
    hospitals: hospitals.map((h) => ({ ...h, forecast: forecastFor(stats.hospitals[h.name]) })),
  };
}

// ---------- Serveur web ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/urgences") {
    try {
      const d = await getData();
      const everywhere = url.searchParams.get("tout") === "1";
      const list = everywhere ? d.all : d.all.filter((h) => h.region !== "autre");
      const { trend, hospitals } = await withTrends(d, list);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" });
      res.end(JSON.stringify({ source: d.source, fetchedAt: d.fetchedAt, trend, hospitals }));
    } catch (err) {
      console.error(err);
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Les données du ministère sont indisponibles pour le moment." }));
    }
    return;
  }
  // Fichiers du site
  const file = path.join(__dirname, "public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
  if (!file.startsWith(path.join(__dirname, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Page introuvable"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  });
}).listen(PORT, () => console.log("Salle d'attente : http://localhost:" + PORT));
