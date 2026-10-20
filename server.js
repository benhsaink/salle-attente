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

const { MSSS_CSV, build, download, snapshots, computeStats, parseCSV, num } = require("./lib");

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

// ---------- Historique récent d'une urgence (fiche) ----------
// Les fichiers mensuels data/historique/AAAA-MM.csv sont lus sur GitHub (copie locale en secours).
const HIST_URL = process.env.HIST_URL ||
  "https://raw.githubusercontent.com/benhsaink/salle-attente/main/data/historique/";
const HIST_MINUTES = 20;
const months = new Map(); // "AAAA-MM" -> { rows, time }

async function getMonth(ym) {
  const m = months.get(ym);
  if (m && Date.now() - m.time < HIST_MINUTES * 60e3) return m.rows;
  let rows = null;
  try {
    const res = await fetch(HIST_URL + ym + ".csv", { headers: { "User-Agent": "SalleAttente/1.0" }, signal: AbortSignal.timeout(20e3) });
    if (res.status === 404) rows = [];
    else if (!res.ok) throw new Error("HTTP " + res.status);
    else rows = parseCSV(await res.text());
  } catch (err) {
    try { rows = parseCSV(fs.readFileSync(path.join(__dirname, "data", "historique", ym + ".csv"), "utf8")); }
    catch (e) { rows = m ? m.rows : []; }
  }
  months.set(ym, { rows, time: Date.now() });
  return rows;
}

// Mois actuel et précédent, à l'heure du Québec.
function recentMonths() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  return [ym(prev), ym(now)];
}

async function recentHistory(name, hours) {
  const all = (await Promise.all(recentMonths().map(getMonth))).flat();
  const rows = all.filter((r) => r.installation === name && r.horodatage).sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  return rows.slice(-hours).map((r) => {
    const civ = num(r.civieres), occ = num(r.occupees);
    return { t: r.horodatage, rate: civ && occ !== null ? Math.round((occ / civ) * 100) : null, pec: num(r.en_attente_medecin), present: num(r.presents) };
  });
}

// ---------- Cliniques (data/cliniques/cliniques.json, mis à jour chaque matin sur GitHub) ----------
const CLINIC_URL = process.env.CLINIC_URL ||
  "https://raw.githubusercontent.com/benhsaink/salle-attente/main/data/cliniques/cliniques.json";
let clinics = null, clinicsTime = 0;
async function getClinics() {
  if (clinics && Date.now() - clinicsTime < 30 * 60e3) return clinics;
  clinicsTime = Date.now();
  let d = null;
  try {
    const res = await fetch(CLINIC_URL, { headers: { "User-Agent": "SalleAttente/1.0" }, signal: AbortSignal.timeout(20e3) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    d = await res.json();
  } catch (err) {
    try { d = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "cliniques", "cliniques.json"), "utf8")); }
    catch (e) { if (!clinics) throw err; return clinics; }
  }
  // On garde seulement ce que la page affiche, et l'horaire à partir d'aujourd'hui.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  clinics = {
    generatedAt: d.generatedAt, source: d.source,
    cliniques: d.cliniques.map((c) => ({
      nofiche: c.nofiche, nom: c.nom, nomOfficiel: c.nomOfficiel, region: c.region, url: c.url, lu: c.lu, miseAJour: c.miseAJour,
      adresse: c.adresse, ville: c.ville, codePostal: c.codePostal, lat: c.lat, lon: c.lon,
      telephone: c.telephone, telephoneSansRdv: c.telephoneSansRdv, site: c.site, reservation: c.reservation,
      acces: c.acces, accesNote: c.accesNote, frais: c.frais,
      jours: (c.jours || []).filter((j) => j.date >= today),
    })),
  };
  return clinics;
}

// ---------- Relais des fiches du Répertoire des ressources ----------
const fiches = new Map(); // numéro -> { html, time }
async function getFiche(n) {
  const f = fiches.get(n);
  if (f && Date.now() - f.time < 24 * 3600e3) return f.html;
  const res = await fetch("https://sante.gouv.qc.ca/repertoire-ressources/ressource/?nofiche=" + n,
    { headers: { "User-Agent": "SalleAttente/1.0 (donnees publiques)" }, signal: AbortSignal.timeout(30e3) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  if (fiches.size > 200) fiches.clear();
  fiches.set(n, { html, time: Date.now() });
  return html;
}

// ---------- Relais du fichier du ministère ----------
// Le ministère bloque les serveurs de GitHub, mais pas Render. La collecte automatique
// (collect.js sur GitHub Actions) lit donc le fichier brut ici : /api/source.csv
let raw = null, rawTime = 0, rawPending = null;
async function getRaw() {
  if (raw && Date.now() - rawTime < CACHE_MINUTES * 60e3) return raw;
  if (!rawPending) {
    rawPending = fetch(MSSS_CSV, { headers: { "User-Agent": "SalleAttente/1.0 (donnees ouvertes)" }, signal: AbortSignal.timeout(60e3) })
      .then(async (res) => {
        if (!res.ok) throw new Error("MSSS HTTP " + res.status);
        raw = Buffer.from(await res.arrayBuffer());
        rawTime = Date.now();
        return raw;
      })
      .finally(() => (rawPending = null));
  }
  try { return await rawPending; }
  catch (err) { if (raw) return raw; throw err; }
}

// ---------- Serveur web ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/source.csv") {
    try {
      const body = await getRaw();
      res.writeHead(200, { "Content-Type": "text/csv", "Cache-Control": "public, max-age=300" });
      res.end(body);
    } catch (err) {
      console.error("Relais :", err.message);
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Fichier du ministère indisponible");
    }
    return;
  }
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
  // Relais d'une fiche du Répertoire des ressources (Santé Québec), pour la mise à jour des cliniques
  // sur GitHub. Seulement des numéros de fiche ; résultat gardé 1 jour.
  if (url.pathname === "/api/repertoire") {
    const n = url.searchParams.get("nofiche") || "";
    if (!/^\d{1,9}$/.test(n)) { res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Numéro de fiche invalide"); }
    try {
      const html = await getFiche(n);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=86400" });
      res.end(html);
    } catch (err) {
      console.error("Répertoire :", err.message);
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Fiche indisponible");
    }
    return;
  }
  if (url.pathname === "/api/cliniques") {
    try {
      const d = await getClinics();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=900" });
      res.end(JSON.stringify(d));
    } catch (err) {
      console.error("Cliniques :", err.message);
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Liste des cliniques indisponible pour le moment." }));
    }
    return;
  }
  if (url.pathname === "/api/historique") {
    const name = (url.searchParams.get("nom") || "").trim();
    const json = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=600" });
      res.end(JSON.stringify(body));
    };
    if (!name || name.length > 200) return json(400, { error: "Nom d'urgence manquant" });
    try { json(200, { name, points: await recentHistory(name, 24) }); }
    catch (err) { console.error("Historique :", err.message); json(502, { error: "Historique indisponible" }); }
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
