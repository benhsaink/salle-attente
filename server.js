// Salle d'attente — petit serveur
// 1) télécharge le fichier horaire des urgences du MSSS (données ouvertes)
// 2) garde le résultat en mémoire 10 minutes
// 3) le transmet au site (public/index.html) en JSON sur /api/urgences
//
// 4) y ajoute les tendances par jour et par heure (prévisions « meilleur moment »)
//
// Aucune dépendance externe : il faut seulement Node.js 18 ou plus récent.

const http = require("http");
const alertes = require("./alertes");
const statistiques = require("./statistiques");
const pages = require("./pages");
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
// Transmission au responsable : par Brevo si configuré (fournisseur de l'Union européenne), sinon par Formspree.
// CONTACT_TO = adresse qui reçoit les messages (par défaut ALERT_FROM).
async function forwardToOwner(item, subject, replyTo) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo || "")) replyTo = "";
  const lines = Object.entries(item).filter(([, v]) => v !== "" && v !== null && v !== undefined).map(([k, v]) => k + " : " + v);
  const to = process.env.CONTACT_TO || process.env.ALERT_FROM;
  if (alertes.brevoReady() && to) {
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    return alertes.sendEmail(to, subject, lines.join("\n"), "<pre style=\"font-family:Arial,sans-serif;white-space:pre-wrap\">" + esc(lines.join("\n")) + "</pre>", replyTo);
  }
  if (!FEEDBACK_URL) return;
  const r = await fetch(FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...item, ...(replyTo ? { email: replyTo, _replyto: replyTo } : {}), _subject: subject }), signal: AbortSignal.timeout(15e3) });
  if (!r.ok) throw new Error("HTTP " + r.status);
}

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
  // GET : liste publique des partenaires actifs (data/partenaires.json)
  if (req.method === "GET") {
    let list = [];
    try { list = (JSON.parse(fs.readFileSync(path.join(__dirname, "data", "partenaires.json"), "utf8")).partenaires || []).filter((p) => p && p.actif !== false && /^[a-z0-9-]{1,30}$/.test(p.id || "")); } catch (e) {}
    const pub = list.map(({ id, nom, services, regions, lieu, telephone, site, adresse, heures, ordre }) => ({ id, nom, services, regions, lieu, telephone, site, adresse, heures, ordre }));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" });
    return res.end(JSON.stringify({ partenaires: pub }));
  }
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
  try { await forwardToOwner(item, "Salle d'attente : " + item.type, item.courriel || ""); }
  catch (err) { console.error("Envoi du commentaire :", err.message); }
  json(200, { ok: true });
}

// ---------- Demandes de partenariat (Soins privés) ----------
async function handlePartner(req, res) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
  // GET : liste publique des partenaires actifs (data/partenaires.json)
  if (req.method === "GET") {
    let list = [];
    try { list = (JSON.parse(fs.readFileSync(path.join(__dirname, "data", "partenaires.json"), "utf8")).partenaires || []).filter((p) => p && p.actif !== false && /^[a-z0-9-]{1,30}$/.test(p.id || "")); } catch (e) {}
    const pub = list.map(({ id, nom, services, regions, lieu, telephone, site, adresse, heures, ordre }) => ({ id, nom, services, regions, lieu, telephone, site, adresse, heures, ordre }));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=600" });
    return res.end(JSON.stringify({ partenaires: pub }));
  }
  if (req.method !== "POST") return json(405, { error: "Méthode non permise" });
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), recent = (sent.get("p:" + ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 5) return json(429, { error: "Trop d'envois. Réessayez dans une heure." });
  let d;
  try { d = JSON.parse(await readBody(req, 12000)); } catch (e) { return json(400, { error: "Demande illisible." }); }
  if (d.site_web) return json(200, { ok: true }); // champ piège pour les robots
  const t = (v, n) => String(v || "").trim().slice(0, n);
  const list = (v, allowed) => (Array.isArray(v) ? v : []).map((x) => t(x, 60)).filter((x) => allowed.includes(x));
  const SOINS = ["Soins infirmiers", "Prélèvements et analyses", "Physiothérapie", "Ergothérapie", "Inhalothérapie", "Soins des pieds", "Aide et soutien à domicile", "Autre"];
  const REG = ["Montréal", "Laval", "Rive-Sud", "Rive-Nord", "Québec–Lévis", "Trois-Rivières", "Autre région"];
  const item = {
    type: "partenaire", entreprise: t(d.entreprise, 150), nom: t(d.nom, 120), telephone: t(d.telephone, 40), courriel: t(d.courriel, 200),
    site: t(d.site, 200), neq: t(d.neq, 20), soins: list(d.soins, SOINS).join(", "), lieu: ["domicile", "bureau", "les deux"].includes(d.lieu) ? d.lieu : "",
    regions: list(d.regions, REG).join(", "), ordre: t(d.ordre, 80), permis: t(d.permis, 40), message: t(d.message, 2000),
    accord: d.accord === true, date: new Date().toISOString(),
  };
  if (!item.entreprise || !item.nom) return json(400, { error: "Indiquez le nom de l'entreprise et votre nom." });
  if (item.telephone.replace(/\D/g, "").length < 10) return json(400, { error: "Indiquez un numéro de téléphone valide." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item.courriel)) return json(400, { error: "Indiquez un courriel valide." });
  if (!item.soins || !item.lieu || !item.regions) return json(400, { error: "Indiquez les soins offerts, le lieu et les régions desservies." });
  if (!item.accord) return json(400, { error: "Cochez la case d'accord pour être contacté." });
  recent.push(now); sent.set("p:" + ip, recent);
  console.log("PARTENAIRE " + JSON.stringify(item));
  try { await forwardToOwner(item, "Salle d'attente : demande de partenariat – " + item.entreprise, item.courriel); }
  catch (err) { console.error("Envoi de la demande de partenariat :", err.message); }
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


// ---------- Temps de route (openrouteservice) ----------
// Seulement si la personne l'active : sa position arrondie (environ 1 km) est envoyée ici, puis à
// openrouteservice pour les 25 urgences les plus proches à vol d'oiseau. Rien n'est conservé à part
// un cache de 30 minutes par secteur. Clé gratuite : variable ORS_KEY dans Render.
const ORS_KEY = process.env.ORS_KEY || "";
// Nouvelle adresse depuis avril 2026 (l'ancienne ferme début novembre 2026) ; l'ancienne reste en secours.
const ORS_URLS = [process.env.ORS_URL, "https://api.heigit.org/openrouteservice", "https://api.openrouteservice.org"].filter(Boolean);
const routeCache = new Map(), routeAsked = new Map();
function haversine(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function handleRoute(req, res, url) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  if (!ORS_KEY) return json(503, { error: "Temps de route pas encore activé." });
  const lat = Math.round(Number(url.searchParams.get("lat")) * 100) / 100, lon = Math.round(Number(url.searchParams.get("lon")) * 100) / 100;
  if (!isFinite(lat) || !isFinite(lon) || lat < 44 || lat > 63 || lon < -80 || lon > -56) return json(400, { error: "Position hors du Québec." });
  const type = ["cliniques", "privees"].includes(url.searchParams.get("type")) ? url.searchParams.get("type") : "urgences";
  const key = type + ":" + lat + "," + lon, hit = routeCache.get(key);
  if (hit && Date.now() - hit.t < 30 * 60e3) return json(200, hit.body);
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), recent = (routeAsked.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= 30) return json(429, { error: "Trop de demandes. Réessayez dans une heure." });
  recent.push(now); routeAsked.set(ip, recent);
  if (routeAsked.size > 5000) routeAsked.clear();
  try {
    // Urgences : clé = nom ; cliniques : clé = numéro de fiche du Répertoire.
    const items = type === "urgences" ? (await getData()).all.filter((h) => h.region !== "autre")
      : type === "cliniques" ? (await getClinics()).cliniques : (await getPrivateComplete()).cliniques;
    const idOf = (x) => (x.nofiche ? String(x.nofiche) : x.name);
    const origin = { lat, lon };
    const dest = items.filter((h) => typeof h.lat === "number" && typeof h.lon === "number")
      .map((h) => ({ h, d: haversine(origin, h) })).sort((a, b) => a.d - b.d).slice(0, 25).map((x) => x.h);
    if (!dest.length) return json(200, { trajets: {} });
    const body0 = JSON.stringify({ locations: [[lon, lat], ...dest.map((h) => [h.lon, h.lat])], sources: [0], destinations: dest.map((_, i) => i + 1), metrics: ["duration", "distance"], units: "km" });
    let m = null, last = "";
    for (const base of ORS_URLS) {
      const r = await fetch(base + "/v2/matrix/driving-car", {
        method: "POST", body: body0, signal: AbortSignal.timeout(15e3),
        headers: { Authorization: ORS_KEY, "Content-Type": "application/json", Accept: "application/json" },
      });
      if (r.ok) { m = await r.json(); break; }
      last = base + " HTTP " + r.status;
      if (![404, 405, 410].includes(r.status)) break; // erreur de clé ou de quota : inutile d'essayer l'autre adresse
    }
    if (!m) throw new Error("openrouteservice " + last);
    const trajets = {};
    dest.forEach((h, i) => {
      const sec = m.durations?.[0]?.[i], dist = m.distances?.[0]?.[i];
      if (typeof sec === "number") trajets[idOf(h)] = { min: Math.max(1, Math.round(sec / 60)), km: Math.round(dist * 10) / 10 };
    });
    const body = { trajets, source: "openrouteservice.org, données © OpenStreetMap" };
    routeCache.set(key, { t: Date.now(), body });
    if (routeCache.size > 2000) routeCache.clear();
    json(200, body);
  } catch (err) {
    console.error("Temps de route :", err.message);
    json(502, { error: "Temps de route indisponible pour le moment." });
  }
}

// ---------- Serveur web ----------
// Compression gzip (texte, JSON, JS) et ETag : moins de données sur un réseau cellulaire faible.
const zlib = require("zlib");
const cryptoMod = require("crypto");
const gzCache = new Map(); // ETag -> version compressée (fichiers du site seulement)
function sendBody(req, res, code, headers, body, etag) {
  body = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const h = { ...headers, Vary: "Accept-Encoding" };
  if (etag) {
    h.ETag = etag;
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, h); return res.end(); }
  }
  const type = String(h["Content-Type"] || "");
  if (body.length > 1024 && /gzip/.test(req.headers["accept-encoding"] || "") && /text|json|javascript|xml|manifest/.test(type)) {
    let gz = etag && gzCache.get(etag);
    if (!gz) { gz = zlib.gzipSync(body, { level: 6 }); if (etag) { if (gzCache.size > 50) gzCache.clear(); gzCache.set(etag, gz); } }
    h["Content-Encoding"] = "gzip";
    res.writeHead(code, h); return res.end(gz);
  }
  res.writeHead(code, h); res.end(body);
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };

// Adresse publique officielle (ex. https://salle-attente.ca), réglée dans Render : PUBLIC_URL.
// Si elle est réglée : les pages demandées sur une autre adresse (salle-attente.onrender.com, www.)
// sont redirigées vers elle (301). Les /api/ restent servies partout (collecte GitHub, cron-job.org).
// Tolère « salle-attente.ca », « https://salle-attente.ca/ » ou des espaces ; une valeur invalide est ignorée.
let PUBLIC_URL = String(process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
if (PUBLIC_URL && !/^https?:\/\//.test(PUBLIC_URL)) PUBLIC_URL = "https://" + PUBLIC_URL;
let PUBLIC_HOST = "";
try { if (PUBLIC_URL) PUBLIC_HOST = new URL(PUBLIC_URL).host; } catch (e) { console.warn("PUBLIC_URL invalide :", PUBLIC_URL); PUBLIC_URL = ""; }
if (PUBLIC_URL) console.log("Adresse publique :", PUBLIC_URL);
const OLD_URL = "https://salle-attente.onrender.com";
const withPublicUrl = (body, file) => PUBLIC_URL && /\.(html|txt|xml)$/.test(file) ? Buffer.from(body.toString("utf8").split(OLD_URL).join(PUBLIC_URL)) : body;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (PUBLIC_HOST && req.headers.host && req.headers.host !== PUBLIC_HOST && !url.pathname.startsWith("/api/") && !/^(localhost|127\.)/.test(req.headers.host)) {
    res.writeHead(301, { Location: PUBLIC_URL + url.pathname + url.search, "Cache-Control": "public, max-age=3600" });
    return res.end();
  }
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
      sendBody(req, res, 200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" }, JSON.stringify({ source: d.source, fetchedAt: d.fetchedAt, trend, hospitals }));
    } catch (err) {
      console.error(err);
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Les données du ministère sont indisponibles pour le moment." }));
    }
    return;
  }
  // Relais d'une fiche du Répertoire des ressources (Santé Québec), pour la mise à jour des cliniques
  // sur GitHub. Seulement des numéros de fiche ; résultat gardé 1 jour.
  // Relais de la recherche par nom du Répertoire (pour trouver les numéros de fiche à ajouter aux listes).
  if (url.pathname === "/api/repertoire-nom") {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
    const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" }); res.end(JSON.stringify(body)); };
    if (q.length < 2) return json(400, { error: "Nom manquant" });
    const page = Math.min(200, Math.max(1, Number(url.searchParams.get("page")) || 1));
    const qs = "?ch_nom=" + encodeURIComponent(q).replace(/%20/g, "+") + "&bt_rechNom=&ch_choixReg=&ch_rayon=0&ch_code=" + (page > 1 ? "&page=" + page : "");
    const paths = ["/repertoire-ressources/resultats-recherche/", "/repertoire-ressources/resultats/", "/repertoire-ressources/"];
    const essais = [];
    for (const pth of paths) {
      try {
        const r = await fetch("https://sante.gouv.qc.ca" + pth + qs, { headers: { "User-Agent": "SalleAttente/1.0 (donnees publiques)" }, signal: AbortSignal.timeout(30e3) });
        const html = r.ok ? await r.text() : "";
        const txt = (x) => x.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, " ").trim();
        const out = [], seen = new Set();
        const re = /nofiche=(\d+)[^>]*>([\s\S]{0,300}?)<\/a>([\s\S]{0,500}?)(?=nofiche=|$)/g;
        let m;
        while ((m = re.exec(html))) { if (!seen.has(m[1])) { seen.add(m[1]); out.push({ nofiche: Number(m[1]), nom: txt(m[2]), apres: txt(m[3]).slice(0, 200) }); } }
        essais.push({ chemin: pth, statut: r.status, longueur: html.length, resultats: out.length });
        const pages = Math.max(page, ...[...html.matchAll(/[?&;]page=(\d+)/g)].map((x) => Number(x[1])));
        if (out.length) return json(200, { q, page, pages, chemin: pth, resultats: out });
      } catch (err) { essais.push({ chemin: pth, erreur: err.message }); }
    }
    return json(200, { q, resultats: [], essais });
  }
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
      sendBody(req, res, 200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=900" }, JSON.stringify(d));
    } catch (err) {
      console.error("Cliniques :", err.message);
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Liste des cliniques indisponible pour le moment." }));
    }
    return;
  }
  if (url.pathname === "/api/commentaires") return handleFeedback(req, res);
  if (url.pathname === "/api/partenaires") return handlePartner(req, res);
  if (url.pathname === "/api/stat" || url.pathname === "/api/statistiques") return statistiques.handle(req, res, url, readBody);
  if (url.pathname.startsWith("/api/alertes")) {
    try { return await alertes.handle(req, res, url, getData); }
    catch (err) { console.error("Alertes :", err.message); res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ error: "Service des alertes indisponible pour le moment." })); }
  }
  if (url.pathname === "/api/adresse") return handleGeocode(req, res, url);
  if (url.pathname === "/api/trajet") return handleRoute(req, res, url);
  if (url.pathname === "/api/privees") {
    try {
      const d = await getPrivateComplete();
      sendBody(req, res, 200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=900" }, JSON.stringify(d));
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
  // Pages par région (texte lisible par Google) et plan du site avec ces pages
  if (url.pathname === "/urgences" || url.pathname.startsWith("/urgences/")) {
    try {
      const d = await getData();
      const html = pages.render(url.pathname, PUBLIC_URL || OLD_URL, d.all);
      if (html) return sendBody(req, res, 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" }, html);
    } catch (err) { console.error("Pages région :", err.message); res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Données momentanément indisponibles. Réessayez dans un instant."); }
  }
  if (url.pathname === "/sitemap.xml") {
    const base = PUBLIC_URL || OLD_URL;
    let all = null; try { all = (await getData()).all; } catch (e) {}
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      ["/", ...pages.sitemapPaths(all)].map((p) => `  <url><loc>${base}${p}</loc><changefreq>hourly</changefreq></url>`).join("\n") + "\n</urlset>\n";
    return sendBody(req, res, 200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }, xml);
  }
  const file = path.join(__dirname, "public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname));
  if (!file.startsWith(path.join(__dirname, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Page introuvable"); }
    // no-cache : le navigateur revérifie à chaque visite, pour voir tout de suite la dernière version du site.
    body = withPublicUrl(body, file);
    const etag = '"' + cryptoMod.createHash("sha1").update(body).digest("base64").slice(0, 20) + '"';
    sendBody(req, res, 200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }, body, etag);
  });
}).listen(PORT, () => console.log("Salle d'attente : http://localhost:" + PORT));

// Alertes : vérification toutes les 15 minutes (le site reste éveillé grâce à cron-job.org).
setTimeout(() => alertes.runAlerts(getData), 60e3);
setInterval(() => alertes.runAlerts(getData), 15 * 60e3);
