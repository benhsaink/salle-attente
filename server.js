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

const { MSSS_CSV, build, download, snapshots, computeStats, parseCSV, num, cleanService, NOT_SERVICE } = require("./lib");

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

// ---------- Cliniques (data/cliniques/*.json, mis à jour chaque matin sur GitHub) ----------
const RAW = process.env.RAW_URL || "https://raw.githubusercontent.com/benhsaink/salle-attente/main/";
function clinicSource(file, extra) {
  let cache = null, time = 0;
  return async function get() {
    if (cache && Date.now() - time < 30 * 60e3) return cache;
    time = Date.now();
    let d = null;
    try {
      const res = await fetch(RAW + "data/cliniques/" + file, { headers: { "User-Agent": "SalleAttente/1.0" }, signal: AbortSignal.timeout(20e3) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      d = await res.json();
    } catch (err) {
      try { d = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "cliniques", file), "utf8")); }
      catch (e) { if (!cache) throw err; return cache; }
    }
    // On garde seulement ce que la page affiche, et l'horaire à partir d'aujourd'hui.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    cache = {
      generatedAt: d.generatedAt, source: d.source,
      cliniques: d.cliniques.map((c) => ({
        nofiche: c.nofiche, nom: c.nom, nomOfficiel: c.nomOfficiel, region: c.region, url: c.url, lu: c.lu, miseAJour: c.miseAJour,
        adresse: c.adresse, ville: c.ville, codePostal: c.codePostal, lat: c.lat, lon: c.lon,
        telephone: c.telephone, telephoneSansRdv: c.telephoneSansRdv, site: c.site, reservation: c.reservation,
        acces: c.acces, accesNote: c.accesNote, frais: c.frais, enfants: !!c.enfants, nonParticipant: !!c.nonParticipant,
        jours: (c.jours || []).filter((j) => j.date >= today),
        ...extra(c),
      })).filter(Boolean),
    };
    return cache;
  };
}
const getClinics = clinicSource("cliniques.json", () => ({}));
// Cliniques privées : seulement celles dont la fiche officielle donne adresse, position, téléphone, horaire et services.
const getPrivate = clinicSource("privees.json", (c) => ({
  services: [...new Set((c.services || []).map(cleanService).filter((x) => x && !NOT_SERVICE.test(x)))],
}));
// Certaines cliniques ajoutent une note après le nom du service (« Cardiologie Consultation RAMQ, frais… »).
// On ramène chaque service au nom le plus long déjà connu au début de la ligne, et on écarte les mentions de frais.
function tidyServices(cliniques) {
  const known = [...new Set(cliniques.flatMap((c) => c.services))];
  const base = (x) => known.filter((k) => k !== x && x.startsWith(k + " ")).sort((a, b) => b.length - a.length)[0] || x;
  return cliniques.map((c) => ({
    ...c,
    services: [...new Set(c.services.map(base).filter((x) => !/frais|RAMQ|\$/i.test(x) && !NOT_SERVICE.test(x)))],
  }));
}
async function getPrivateComplete() {
  const d = await getPrivate();
  const complete = d.cliniques.filter((c) => c.adresse && c.lat && c.telephone && c.services.length && c.jours.some((j) => j.ferme || j.heures.length));
  return { ...d, cliniques: tidyServices(complete) };
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

// ---------- Recherche d'une adresse ou d'un code postal ----------
// Le site envoie l'adresse tapée par la personne ; on la transmet à Nominatim (OpenStreetMap) pour obtenir
// une position, puis on ne garde que le résultat en mémoire (pas l'adresse de la personne dans des journaux).
// Règles de Nominatim : au plus 1 requête par seconde, un User-Agent qui identifie le site, mention d'OpenStreetMap.
const GEOCODE_URL = process.env.GEOCODE_URL || "https://nominatim.openstreetmap.org/search";
const geoCache = new Map(), geoUse = new Map();
let geoLast = 0, geoChain = Promise.resolve();
const QC_BOX = "-79.8,62.6,-57.1,44.9"; // le Québec
async function nominatim(params) {
  const run = async () => {
    const wait = 1100 - (Date.now() - geoLast);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geoLast = Date.now();
    const u = new URL(GEOCODE_URL);
    for (const [k, v] of Object.entries({ format: "jsonv2", limit: "1", countrycodes: "ca", "accept-language": "fr", viewbox: QC_BOX, bounded: "1", ...params })) u.searchParams.set(k, v);
    const res = await fetch(u, { headers: { "User-Agent": "SalleAttente/1.0 (salle-attente.onrender.com)" }, signal: AbortSignal.timeout(10e3) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return (await res.json())[0] || null;
  };
  const p = geoChain.then(run, run);
  geoChain = p.catch(() => {});
  return p;
}
async function geocode(q) {
  const key = q.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const pc = q.toUpperCase().replace(/\s+/g, "").match(/^([A-Z]\d[A-Z])(\d[A-Z]\d)?$/);
  let hit = null, precision = "adresse";
  if (pc) {
    if (pc[2]) hit = await nominatim({ postalcode: pc[1] + " " + pc[2], country: "ca" });
    if (!hit) { hit = await nominatim({ postalcode: pc[1], country: "ca" }); precision = "secteur"; }
  } else {
    hit = await nominatim({ q: q + ", Québec" });
  }
  const out = hit ? { lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5), label: String(hit.display_name || "").split(",").slice(0, 3).join(",").trim(), precision } : null;
  if (geoCache.size > 1000) geoCache.clear();
  geoCache.set(key, out);
  return out;
}
async function handleGeocode(req, res, url) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const q = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
  if (q.length < 3 || q.length > 150) return json(400, { error: "Entrez une adresse ou un code postal." });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), recent = (geoUse.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 30) return json(429, { error: "Trop de recherches. Réessayez dans un moment." });
  recent.push(now); geoUse.set(ip, recent);
  if (geoUse.size > 5000) geoUse.clear();
  try {
    const r = await geocode(q);
    if (!r) return json(404, { error: "Adresse introuvable. Essayez avec le numéro, la rue et la ville, ou un code postal." });
    json(200, r);
  } catch (err) {
    console.error("Recherche d'adresse :", err.message);
    json(502, { error: "Recherche d'adresse indisponible pour le moment." });
  }
}

// ---------- Commentaires des utilisateurs ----------
// Chaque commentaire est écrit dans les journaux de Render (onglet Logs) et, si FEEDBACK_URL est défini
// (ex. un formulaire Formspree : https://formspree.io/f/xxxxxx), envoyé par courriel au propriétaire du site.
const FEEDBACK_URL = process.env.FEEDBACK_URL || "";
const sent = new Map(); // adresse IP -> envois de la dernière heure
function readBody(req, max = 8000) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > max) { reject(new Error("trop long")); req.destroy(); } });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}
async function handleFeedback(req, res) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
  if (req.method !== "POST") return json(405, { error: "Méthode non permise" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), recent = (sent.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 5) return json(429, { error: "Trop d'envois. Réessayez dans une heure." });
  let d;
  try { d = JSON.parse(await readBody(req)); } catch (e) { return json(400, { error: "Message illisible." }); }
  if (d.site_web) return json(200, { ok: true }); // champ piège pour les robots
  const message = String(d.message || "").trim().slice(0, 2000);
  if (message.length < 5) return json(400, { error: "Écrivez votre commentaire (au moins quelques mots)." });
  const type = ["donnees", "site", "suggestion", "partenariat", "autre"].includes(d.type) ? d.type : "autre";
  const nom = String(d.nom || "").trim().slice(0, 120), telephone = String(d.telephone || "").trim().slice(0, 40);
  if (type === "partenariat" && (!nom || telephone.replace(/\D/g, "").length < 10))
    return json(400, { error: "Pour un partenariat, indiquez votre nom et un numéro de téléphone valide." });
  const item = {
    type, nom, telephone,
    message, courriel: String(d.courriel || "").trim().slice(0, 200), page: String(d.page || "").slice(0, 200),
    date: new Date().toISOString(),
  };
  recent.push(now); sent.set(ip, recent);
  if (sent.size > 5000) sent.clear();
  console.log("COMMENTAIRE " + JSON.stringify(item));
  if (FEEDBACK_URL) {
    try {
      const r = await fetch(FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...item, _subject: "Salle d'attente : " + item.type }), signal: AbortSignal.timeout(15e3) });
      if (!r.ok) throw new Error("HTTP " + r.status);
    } catch (err) { console.error("Envoi du commentaire :", err.message); }
  }
  json(200, { ok: true });
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
  // Réveil (cron-job.org aux 10 min) : réponse minuscule ; prépare aussi les données en arrière-plan.
  if (url.pathname === "/api/ping") {
    getData().catch(() => {});
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("ok");
  }
  // Relais de la liste des installations (M02, Données Québec) pour installations.js sur GitHub
  if (url.pathname === "/api/installations.csv") {
    try {
      const r = await fetch("https://www.donneesquebec.ca/recherche/dataset/51998b55-7d4c-4381-8c20-0ac1cd9c1b87/resource/2aa06e66-c1d0-4e2f-bf3c-c2e413c3f84d/download/installationscsv.csv", { headers: { "User-Agent": "SalleAttente/1.0 (donnees ouvertes)" }, signal: AbortSignal.timeout(60e3) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      res.writeHead(200, { "Content-Type": "text/csv", "Cache-Control": "public, max-age=86400" });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
      console.error("Installations :", err.message);
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Liste des installations indisponible");
    }
    return;
  }
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
  if (url.pathname === "/api/commentaires") return handleFeedback(req, res);
  if (url.pathname === "/api/adresse") return handleGeocode(req, res, url);
  if (url.pathname === "/api/privees") {
    try {
      const d = await getPrivateComplete();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=900" });
      res.end(JSON.stringify(d));
    } catch (err) {
      console.error("Cliniques privées :", err.message);
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Liste des cliniques privées indisponible pour le moment." }));
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
