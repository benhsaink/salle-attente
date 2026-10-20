// Salle d'attente — outils partagés par le serveur (server.js) et la collecte (collect.js)
// Lecture du fichier horaire du MSSS, choix des colonnes, région, calcul des tendances.

const fs = require("fs");

// Sources officielles (licence CC BY 4.0). On essaie la première, puis la seconde.
// Le fichier couvre les 7 derniers jours, heure par heure.
// SOURCE_CSV peut être remplacée par une variable d'environnement (ex. le relais du site pour GitHub).
const MSSS_CSV =
  "https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv";
const SOURCE_CSV = process.env.SOURCE_CSV || MSSS_CSV;
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
// Urgences psychiatriques : gardées, mais affichées seulement avec le filtre « Psychiatrie ».
const PSY = ["sante mentale", "psychiatri", "albert-prevost", "albert prevost", "louis-h", "douglas", "pinel"];

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
      psy: PSY.some((k) => norm(name).includes(k)),
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

async function fetchCSV(url) {
  const res = await fetch(url, { headers: { "User-Agent": "SalleAttente/1.0 (donnees ouvertes)" }, signal: AbortSignal.timeout(120e3) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return parseCSV(decode(Buffer.from(await res.arrayBuffer())));
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


// ---------- Historique et tendances ----------

// « 2026-10-19 20:00 », « 2026-10-19T20:00:00 », « 2026/10/19 20h00 » ou « 19/10/2026 20:00 »
// -> { date: "2026-10-19", hour: 20, dow: 1 (0 = dimanche) }. Heure du Québec, telle que publiée.
function parseTime(s) {
  const t = String(s || "").trim();
  let m = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T]+(\d{1,2})\s*[:h]\s*(\d{2})?/);
  let y, mo, d, h;
  if (m) [, y, mo, d, h] = m;
  else if ((m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2})\s*[:h]/))) [, d, mo, y, h] = m;
  else return null;
  y = +y; mo = +mo; d = +d; h = +h;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h <= 23)) return null;
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { date, hour: h, dow: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), stamp: `${date} ${String(h).padStart(2, "0")}:00` };
}

// Toutes les lignes horaires du fichier (pas seulement la plus récente), en format compact.
const HISTORY_COLUMNS = ["horodatage", "installation", "etablissement", "civieres", "occupees", "en_attente_medecin", "presents", "plus_24h", "plus_48h"];
function snapshots(records) {
  if (!records.length) return [];
  const c = columns(Object.keys(records[0]));
  const out = [];
  for (const r of records) {
    const inst = String(r[c.inst] || "").trim();
    const time = parseTime(r[c.time]);
    if (!inst || /total/i.test(inst) || !time) continue;
    out.push({
      horodatage: time.stamp, installation: inst, etablissement: String(r[c.etab] || "").trim(),
      civieres: num(r[c.stretchers]), occupees: num(r[c.occ]), en_attente_medecin: num(r[c.pec]),
      presents: num(r[c.present]), plus_24h: num(r[c.over24]), plus_48h: num(r[c.over48]),
    });
  }
  return out;
}

// Moyennes par installation, jour de la semaine et heure (7 x 24 = 168 cases).
// Chaque case : [taux d'occupation x 1000, personnes en attente x 10, nombre de mesures] ou null.
function computeStats(rows) {
  const acc = new Map();
  const dates = new Set();
  for (const r of rows) {
    const time = parseTime(r.horodatage);
    if (!time) continue;
    const civ = num(r.civieres), occ = num(r.occupees), pec = num(r.en_attente_medecin);
    const rate = civ && occ !== null ? occ / civ : null;
    if (rate === null && pec === null) continue;
    dates.add(time.date);
    if (!acc.has(r.installation)) acc.set(r.installation, Array.from({ length: 168 }, () => [0, 0, 0, 0]));
    const cell = acc.get(r.installation)[time.dow * 24 + time.hour];
    if (rate !== null) { cell[0] += rate; cell[1]++; }
    if (pec !== null) { cell[2] += pec; cell[3]++; }
  }
  const hospitals = {};
  for (const [name, cells] of acc) {
    hospitals[name] = cells.map(([sr, nr, sp, np]) =>
      nr || np ? [nr ? Math.round((sr / nr) * 1000) : null, np ? Math.round((sp / np) * 10) : null, Math.max(nr, np)] : null);
  }
  const sorted = [...dates].sort();
  return { generatedAt: new Date().toISOString(), from: sorted[0] || null, to: sorted.at(-1) || null, days: dates.size, hospitals };
}

module.exports = {
  MSSS_CSV, SOURCE_CSV, SOURCE_API, fetchCSV, norm, num, decode, parseCSV, columns, region, build, download,
  parseTime, snapshots, computeStats, HISTORY_COLUMNS,
};
