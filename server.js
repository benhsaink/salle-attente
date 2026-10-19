// Salle d'attente — petit serveur
// 1) télécharge le fichier horaire des urgences du MSSS (données ouvertes)
// 2) garde le résultat en mémoire 10 minutes
// 3) le transmet au site (public/index.html) en JSON sur /api/urgences
//
// Aucune dépendance externe : il faut seulement Node.js 18 ou plus récent.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const CACHE_MINUTES = 10;

// Sources officielles (licence CC BY 4.0). On essaie la première, puis la seconde.
const SOURCE_CSV =
  "https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv";
const SOURCE_API =
  "https://www.donneesquebec.ca/recherche/api/3/action/datastore_search?resource_id=b256f87f-40ec-4c79-bdba-a23e9c50e741&limit=32000";
// Pour tester sans Internet : SOURCE_FILE=exemple.csv npm start
const SOURCE_FILE = process.env.SOURCE_FILE;

// Hôpitaux du Grand Montréal hors de l'île : mot-clé dans le nom -> région et lieu
const KNOWN = [
  ["charles-lemoyne", "rs", "Greenfield Park, près de Brossard"],
  ["pierre-boucher", "rs", "Longueuil"],
  ["anna-laberge", "rs", "Châteauguay"],
  ["haut-richelieu", "rs", "Saint-Jean-sur-Richelieu"],
  ["cite-de-la-sante", "lav", "Laval"],
  ["saint-eustache", "rn", "Saint-Eustache"],
  ["le gardeur", "rn", "Terrebonne"],
  ["saint-jerome", "rn", "Saint-Jérôme"],
];
const KIDS = ["sainte-justine", "enfants", "children"];

// ---------- Outils ----------
const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_']/g, " ").trim();

function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || /^(n\.?d\.?|na|-)$/i.test(s)) return null;
  const hm = s.match(/^(\d+):(\d{2})/); // durée « 5:13 » -> 5,22 h
  if (hm) return +hm[1] + +hm[2] / 60;
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function decode(buf) {
  const utf = new TextDecoder("utf-8").decode(buf);
  // Fichier en latin-1 ? Les accents deviennent « � » en UTF-8.
  return utf.includes("�") ? new TextDecoder("latin1").decode(buf) : utf.replace(/^﻿/, "");
}

function parseCSV(text) {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// Trouve les colonnes par mots-clés : le fichier change parfois de libellés.
function columns(keys) {
  const k = keys.map((key) => [key, norm(key)]);
  const find = (test) => (k.find(([, n]) => test(n)) || [])[0];
  return {
    etab: find((n) => n.includes("etablissement")),
    inst: find((n) => n.includes("installation") && !n.includes("permis") && !/^no\b/.test(n)),
    stretchers: find((n) => n.includes("civiere") && n.includes("fonctionnel")),
    occ: find((n) => n.includes("civiere") && n.includes("occup")) ||
         find((n) => n.includes("patient") && n.includes("civiere") && !/24|48/.test(n)),
    over24: find((n) => n.includes("24")),
    over48: find((n) => n.includes("48")),
    present: find((n) => n.includes("present")),
    pec: find((n) => /\bpec\b/.test(n) || n.includes("prise en charge")),
    dmsAmb: find((n) => n.includes("dms") && n.includes("ambul")),
    dmsCiv: find((n) => n.includes("dms") && n.includes("civ")),
    time: find((n) => n.includes("extraction")) || find((n) => n.includes("mise a jour")),
  };
}

function region(etab, inst) {
  const n = norm(inst), e = norm(etab);
  for (const [key, reg, area] of KNOWN) if (n.includes(key)) return { reg, area };
  if (e.includes("laval")) return { reg: "lav", area: "Laval" };
  if (e.includes("montreal") || e.includes("chum") || e.includes("cusm") || e.includes("muhc") ||
      e.includes("sainte-justine") || n.includes("montreal"))
    return { reg: "mtl", area: "Montréal" };
  return null; // hors du Grand Montréal
}

function build(records, everywhere) {
  if (!records.length) throw new Error("Fichier vide");
  const c = columns(Object.keys(records[0]));
  if (!c.inst || !c.stretchers) throw new Error("Colonnes introuvables : " + Object.keys(records[0]).join(" | "));

  // Le fichier contient plusieurs heures : on garde la plus récente par installation.
  const latest = new Map();
  for (const r of records) {
    const name = String(r[c.inst] || "").trim();
    if (!name || /total/i.test(name)) continue;
    const t = String(r[c.time] || "");
    const prev = latest.get(name);
    if (!prev || t > String(prev[c.time] || "")) latest.set(name, r);
  }

  const out = [];
  for (const [name, r] of latest) {
    const where = region(r[c.etab], name);
    if (!where && !everywhere) continue;
    const stretchers = num(r[c.stretchers]);
    const occ = num(r[c.occ]);
    out.push({
      name,
      establishment: r[c.etab] || "",
      region: where ? where.reg : "autre",
      area: where ? where.area : "",
      kids: KIDS.some((k) => norm(name).includes(k)),
      stretchers, occ,
      rate: stretchers && occ !== null ? occ / stretchers : null,
      over24: num(r[c.over24]), over48: num(r[c.over48]),
      present: num(r[c.present]), pec: num(r[c.pec]),
      dmsAmb: num(r[c.dmsAmb]), dmsCiv: num(r[c.dmsCiv]),
      updated: r[c.time] || null,
    });
  }
  return out;
}

async function download() {
  if (SOURCE_FILE) return { records: parseCSV(decode(fs.readFileSync(SOURCE_FILE))), source: "fichier local" };
  const headers = { "User-Agent": "SalleAttente/1.0 (donnees ouvertes)" };
  try {
    const res = await fetch(SOURCE_CSV, { headers });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return { records: parseCSV(decode(Buffer.from(await res.arrayBuffer()))), source: "MSSS" };
  } catch (err) {
    console.warn("Source MSSS indisponible (" + err.message + "), essai Données Québec");
    const res = await fetch(SOURCE_API, { headers });
    if (!res.ok) throw new Error("Données Québec HTTP " + res.status);
    const json = await res.json();
    return { records: json.result.records, source: "Données Québec" };
  }
}

// ---------- Cache ----------
let cache = null, cacheTime = 0, pending = null;
async function getData() {
  if (cache && Date.now() - cacheTime < CACHE_MINUTES * 60e3) return cache;
  if (!pending) {
    pending = download()
      .then(({ records, source }) => {
        cache = { source, fetchedAt: new Date().toISOString(), all: build(records, true) };
        cacheTime = Date.now();
        return cache;
      })
      .finally(() => (pending = null));
  }
  try { return await pending; }
  catch (err) { if (cache) return cache; throw err; } // en cas de panne, on sert la dernière version
}

// ---------- Serveur web ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/urgences") {
    try {
      const d = await getData();
      const everywhere = url.searchParams.get("tout") === "1";
      const hospitals = everywhere ? d.all : d.all.filter((h) => h.region !== "autre");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" });
      res.end(JSON.stringify({ source: d.source, fetchedAt: d.fetchedAt, hospitals }));
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
