// Salle d'attente — outils partagés par le serveur (server.js) et la collecte (collect.js)
// Lecture du fichier horaire du MSSS, choix des colonnes, région, calcul des tendances.

const fs = require("fs");

// Sources officielles (licence CC BY 4.0). On essaie la première, puis la seconde.
// Malgré son nom (« 7jours »), le fichier ne donne que la situation actuelle :
// une ligne par installation. L'historique se construit donc en le lisant chaque heure.
// SOURCE_CSV peut être remplacée par une variable d'environnement (ex. le relais du site pour GitHub).
const MSSS_CSV =
  "https://www.msss.gouv.qc.ca/professionnels/statistiques/documents/urgences/Releve_horaire_urgences_7jours_nbpers.csv";
const SOURCE_CSV = process.env.SOURCE_CSV || MSSS_CSV;
const SOURCE_API =
  "https://www.donneesquebec.ca/recherche/api/3/action/datastore_search?resource_id=b256f87f-40ec-4c79-bdba-a23e9c50e741&limit=32000";
// Pour tester sans Internet : SOURCE_FILE=exemple.csv npm start
const SOURCE_FILE = process.env.SOURCE_FILE;

// Urgences du Grand Montréal : mot-clé (nom normalisé) -> région, secteur, position, adresse.
// Les positions servent au calcul de distance (à vol d'oiseau, précision d'environ 1 km) ;
// l'itinéraire, lui, utilise l'adresse. Un mot-clé qui commence par « = » doit égaler le nom complet. Le plus précis d'abord (ex. « pour enfants » avant « de montreal »).
const PLACES = [
  // Capitale-Nationale (adresses et positions : fiches officielles du Répertoire des ressources, 20 octobre 2026)
  ["=centre hospitalier de l universite laval", "qc", "Sainte-Foy (CHUL)", 46.76787, -71.28234, "2705 boulevard Laurier, Québec"],
  ["l enfant-jesus", "qc", "Limoilou", 46.8372, -71.2255, "1401 18e Rue, Québec"],
  ["saint-sacrement", "qc", "Montcalm", 46.79901, -71.24657, "1050 chemin Sainte-Foy, Québec"],
  ["saint-francois d assise", "qc", "Limoilou", 46.8275, -71.23669, "10 rue De L'Espinay, Québec"],
  ["l hotel-dieu de quebec", "qc", "Vieux-Québec", 46.81539, -71.211, "11 côte du Palais, Québec"],
  ["cardiologie et de pneumologie de quebec", "qc", "Sainte-Foy", 46.77844, -71.29806, "2725 chemin Sainte-Foy, Québec"],
  ["chauveau", "qc", "Loretteville", 46.85365, -71.3709, "11999 rue de l'Hôpital, Québec"],
  ["de baie-saint-paul", "qc", "Baie-Saint-Paul", 47.44017, -70.51123, "88 rue Racine, Baie-Saint-Paul"],
  ["la malbaie", "qc", "La Malbaie", 47.65619, -70.15174, "303 rue Saint-Étienne, La Malbaie"],
  ["saint-raymond", "qc", "Saint-Raymond (Portneuf)", 46.89493, -71.82215, "700 rue Saint-Cyrille, Saint-Raymond"],
  ["sainte-anne-de-beaupre", "qc", "Beaupré", 47.04274, -70.9002, "11000 rue des Montagnards, Beaupré"],
  ["saint-marc-des-carrieres", "qc", "Saint-Marc-des-Carrières", 46.68055, -72.05029, "1045 boulevard Bona-Dussault, Saint-Marc-des-Carrières"],
  // Montréal
  ["centre hospitalier de l universite de montreal", "mtl", "Centre-ville", 45.5113, -73.5574, "1051 rue Sanguinet, Montréal"],
  ["sainte-justine", "mtl", "Côte-des-Neiges", 45.5030, -73.6243, "3175 chemin de la Côte-Sainte-Catherine, Montréal"],
  ["montreal pour enfants", "mtl", "Notre-Dame-de-Grâce (site Glen)", 45.4729, -73.6017, "1001 boulevard Décarie, Montréal"],
  ["royal victoria", "mtl", "Notre-Dame-de-Grâce (site Glen)", 45.4726, -73.6008, "1001 boulevard Décarie, Montréal"],
  ["general de montreal", "mtl", "Centre-ville", 45.4970, -73.5890, "1650 avenue Cedar, Montréal"],
  ["institut de cardiologie", "mtl", "Rosemont", 45.5743, -73.5888, "5000 rue Bélanger, Montréal"],
  ["general juif", "mtl", "Côte-des-Neiges", 45.4973, -73.6303, "3755 chemin de la Côte-Sainte-Catherine, Montréal"],
  ["st. mary", "mtl", "Côte-des-Neiges", 45.4950, -73.6240, "3830 avenue Lacombe, Montréal"],
  ["hopital de verdun", "mtl", "Verdun", 45.4615, -73.5700, "4000 boulevard LaSalle, Montréal"],
  ["=hopital notre-dame", "mtl", "Plateau / Centre-Sud", 45.5260, -73.5604, "1560 rue Sherbrooke Est, Montréal"],
  ["maisonneuve-rosemont", "mtl", "Rosemont", 45.5750, -73.5583, "5415 boulevard de l'Assomption, Montréal"],
  ["santa cabrini", "mtl", "Saint-Léonard", 45.5802, -73.5717, "5655 rue Saint-Zotique Est, Montréal"],
  ["sante mentale de montreal", "mtl", "Mercier–Hochelaga", 45.5886, -73.5290, "7401 rue Hochelaga, Montréal"],
  ["sacre-coeur", "mtl", "Ahuntsic–Cartierville", 45.5317, -73.7142, "5400 boulevard Gouin Ouest, Montréal"],
  ["albert-prevost", "mtl", "Ahuntsic–Cartierville", 45.5293, -73.7230, "6555 boulevard Gouin Ouest, Montréal"],
  ["hopital fleury", "mtl", "Ahuntsic", 45.5719, -73.6475, "2180 rue Fleury Est, Montréal"],
  ["jean-talon", "mtl", "Villeray", 45.5450, -73.6050, "1385 rue Jean-Talon Est, Montréal"],
  ["hopital de lasalle", "mtl", "LaSalle", 45.4290, -73.6250, "8585 terrasse Champlain, Montréal"],
  ["douglas", "mtl", "Verdun", 45.4422, -73.5854, "6875 boulevard LaSalle, Montréal"],
  ["lakeshore", "mtl", "Pointe-Claire", 45.4480, -73.8340, "160 avenue Stillview, Pointe-Claire"],
  ["hopital de lachine", "mtl", "Lachine", 45.4410, -73.6770, "650 16e Avenue, Montréal"],
  // Laval
  ["cite-de-la-sante", "lav", "Laval", 45.5590, -73.7225, "1755 boulevard René-Laennec, Laval"],
  // Rive-Sud
  ["charles-le moyne", "rs", "Greenfield Park, près de Brossard", 45.4930, -73.4740, "3120 boulevard Taschereau, Longueuil"],
  ["charles-lemoyne", "rs", "Greenfield Park, près de Brossard", 45.4930, -73.4740, "3120 boulevard Taschereau, Longueuil"],
  ["pierre-boucher", "rs", "Longueuil", 45.5430, -73.4720, "1333 boulevard Jacques-Cartier Est, Longueuil"],
  ["anna-laberge", "rs", "Châteauguay", 45.3510, -73.7280, "200 boulevard Brisebois, Châteauguay"],
  ["haut-richelieu", "rs", "Saint-Jean-sur-Richelieu", 45.3240, -73.2760, "920 boulevard du Séminaire Nord, Saint-Jean-sur-Richelieu"],
  // Rive-Nord
  ["saint-eustache", "rn", "Saint-Eustache", 45.5590, -73.9030, "520 boulevard Arthur-Sauvé, Saint-Eustache"],
  ["le gardeur", "rn", "Terrebonne", 45.7140, -73.4870, "911 montée des Pionniers, Terrebonne"],
  ["saint-jerome", "rn", "Saint-Jérôme", 45.7790, -74.0040, "290 rue De Montigny, Saint-Jérôme"],
];
const KIDS = ["sainte-justine", "enfants", "children"];
// Hôpitaux généraux avec une section pédiatrique à l'urgence. N'ajouter une ligne que si c'est
// confirmé par une source officielle (site de l'hôpital ou du CISSS/CIUSSS), avec le lien et la date :
//   ["mot-cle du nom", "https://source-officielle", "AAAA-MM-JJ"],
// Toutes les urgences générales soignent les enfants : cette liste ne sert qu'à signaler une section dédiée.
const PEDS = [
  // « Dirigez-vous vers l'urgence de l'Hôpital Maisonneuve-Rosemont qui offre des services en pédiatrie. » (page Urgence du CIUSSS de l'Est, mise à jour le 2026-06-13)
  ["maisonneuve-rosemont", "https://ciusss-estmtl.gouv.qc.ca/informations-pratiques/urgence", "2026-10-20"],
];
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
    date: find((n) => n.includes("mise a jour")),
  };
}

function region(etab, inst) {
  const n = norm(inst), e = norm(etab);
  for (const [key, reg, area, lat, lon, address] of PLACES)
    if (key.startsWith("=") ? n === key.slice(1) : n.includes(key)) return { reg, area, lat, lon, address };
  // Les hôpitaux de Québec (CHU de Québec – Université Laval) ne sont pas à Laval !
  if (e.includes("universite laval") || e.includes("de quebec")) return null;
  if (/\blaval\b/.test(e)) return { reg: "lav", area: "Laval" };
  if (e.includes("montreal") || e.includes("mcgill") || e.includes("chum") || e.includes("cusm") ||
      e.includes("muhc") || e.includes("sainte-justine") || n.includes("montreal"))
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
      lat: where && where.lat !== undefined ? where.lat : null,
      lon: where && where.lon !== undefined ? where.lon : null,
      address: where && where.address ? where.address : null,
      kids: KIDS.some((k) => norm(name).includes(k)),
      psy: PSY.some((k) => norm(name).includes(k)),
      cardio: norm(name).includes("cardiologie"),
      peds: PEDS.some(([k]) => norm(name).includes(k)),
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

// Heure de l'extraction (« 21:00:00 ») + date prise dans « Mise_a_jour ».
// Sans date lisible, on prend la date du jour au Québec (veille si l'heure n'est pas encore passée).
function stampOf(r, c) {
  const t = String(r[c.time] || "").trim();
  const own = parseTime(t);
  if (own) return own;
  const h = t.match(/^(\d{1,2})\s*[:h]/);
  if (!h) return null;
  const d = String((c.date && r[c.date]) || "");
  let m = d.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/), date;
  if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
  else if ((m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) date = `${m[3]}-${m[2]}-${m[1]}`;
  else {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Toronto" }));
    if (+h[1] > now.getHours()) now.setDate(now.getDate() - 1);
    date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }
  return parseTime(`${date} ${h[1]}:00`);
}

// Toutes les lignes horaires du fichier (pas seulement la plus récente), en format compact.
const HISTORY_COLUMNS = ["horodatage", "installation", "etablissement", "civieres", "occupees", "en_attente_medecin", "presents", "plus_24h", "plus_48h"];
function snapshots(records) {
  if (!records.length) return [];
  const c = columns(Object.keys(records[0]));
  const out = [];
  for (const r of records) {
    const inst = String(r[c.inst] || "").trim();
    const time = stampOf(r, c);
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

// ---------- Cliniques : fiches du Répertoire des ressources (Santé Québec) ----------

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", Eacute: "É", ndash: "–", mdash: "—" };
// Page HTML -> texte, une information par ligne.
function htmlText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|nav|header|footer)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d|tr|dt|dd|section|article|address)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENT[e] ?? m)
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DATE_LINE = new RegExp("^(\\d{1,2}) (" + MOIS.join("|") + ") (\\d{4})$");
// « 8 h 10 à 20 h 30 » -> [[490, 1230]] (minutes depuis minuit). « En tout temps » -> [[0, 1440]].
function ranges(s) {
  if (/en tout temps|24 h sur 24/i.test(s)) return [[0, 1440]];
  const out = [];
  for (const m of String(s).matchAll(/(\d{1,2}) h(?: (\d{2}))? à (\d{1,2}) h(?: (\d{2}))?/g)) {
    const a = +m[1] * 60 + +(m[2] || 0);
    let b = +m[3] * 60 + +(m[4] || 0);
    if (b <= a) b += 1440; // passe minuit
    out.push([a, b]);
  }
  return out;
}

// Nom d'un service, sans les mentions de frais, de clientèle ni de rendez-vous ajoutées par la clinique.
function cleanService(line) {
  return String(line)
    .replace(/\s*\((des frais sont exigés|pour tous|pour les patients inscrits)[^)]*\)/gi, "")
    .replace(/\s+(Avec|Sans) rendez-vous\b.*$/i, "")
    .replace(/\s+Pour tous les services\b.*$/i, "")
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
    .replace(/\s{2,}.*/, "").trim();
}
// Lignes de la section qui ne sont pas des services.
// (y compris les phrases de présentation que certaines cliniques y écrivent : listes à tirets, phrases finissant par « : » ou « ; »).
const NOT_SERVICE = /^(Renseignements importants|Services spécifiques|Médecin (non participant|désengagé)|Ressources ITSS)|^[-•*]|[:;.]$|succursale|frais|coût|débourser|\$/i;

// Texte d'une fiche -> informations utiles. Ne garde que ce qui est écrit dans la fiche.
function parseFiche(text) {
  const L = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const at = (re, from = 0) => { for (let i = from; i < L.length; i++) if (re.test(L[i])) return i; return -1; };
  const out = { nomOfficiel: null, adresse: null, ville: null, codePostal: null, telephone: null, jours: [], systemes: [], miseAJour: null };

  const iCoord = at(/^Coordonnées$/);
  const t = L.find((l) => / - Trouver une ressource/.test(l));
  if (t) out.nomOfficiel = t.split(" - Trouver une ressource")[0].trim();
  if (iCoord >= 0) {
    out.adresse = L[iCoord + 1] || null;
    const m = (L[iCoord + 2] || "").match(/^(.*?) \(Québec\)\s*([A-Z]\d[A-Z] ?\d[A-Z]\d)?/);
    if (m) { out.ville = m[1]; out.codePostal = m[2] || null; }
  }
  // Téléphone : le numéro du sans rendez-vous s'il y en a un, sinon le numéro général, sinon le premier.
  const iTelSec = at(/^Téléphone$/), iTelEnd = at(/^Horaire$/);
  const phones = [];
  for (let i = iTelSec + 1; iTelSec >= 0 && i < (iTelEnd < 0 ? L.length : iTelEnd); i++) {
    const m = L[i].match(/(\d{3} \d{3}-\d{4})/);
    if (m) phones.push({ num: m[1], walk: /sans rendez-vous|jour même/i.test(L[i]), general: /^Numéro général/i.test(L[i]) });
  }
  const ph = phones.find((p) => p.walk) || phones.find((p) => p.general) || phones[0];
  if (ph) { out.telephone = ph.num; out.telephoneSansRdv = !!ph.walk; }
  // Service officiel « Consultations médicales le jour même ou dans les jours suivants » : pour qui ?
  const iServ = at(/^Consultations médicales le jour même ou dans les jours suivants/);
  out.acces = null; out.accesNote = null;
  if (iServ >= 0) {
    const l = L[iServ];
    out.acces = /\(pour tous\)/i.test(l) ? "tous" : /patients inscrits/i.test(l) ? "inscrits" : null;
    out.frais = /des frais sont exigés/i.test(l);
    const note = l.replace(/^Consultations médicales le jour même ou dans les jours suivants\s*(\([^)]*\))?\s*(\(des frais sont exigés\))?\s*/i, "").trim();
    if (note) out.accesNote = note;
  }
  const iMaj = at(/^Dernière mise à jour : /);
  if (iMaj >= 0) out.miseAJour = L[iMaj].replace(/^Dernière mise à jour : /, "");

  // Horaire : une section par date, jusqu'à « Services offerts ».
  const iH = at(/^Horaire$/), iEnd = at(/^Services offerts/);
  let day = null, block = null;
  for (let i = iH + 1; iH >= 0 && i < (iEnd < 0 ? L.length : iEnd); i++) {
    const l = L[i], d = l.match(DATE_LINE);
    if (d) {
      day = { date: `${d[3]}-${String(MOIS.indexOf(d[2]) + 1).padStart(2, "0")}-${d[1].padStart(2, "0")}`, ferme: false, ouverture: null, heures: [], rdvJour: [] };
      out.jours.push(day); block = null; continue;
    }
    if (!day) continue;
    if (/^Fermé$/i.test(l)) { day.ferme = true; continue; }
    if (/^Heures d'ouverture$/i.test(l)) { block = { type: "ouverture" }; continue; }
    if (/^Heures pour prendre un rendez-vous/i.test(l)) {
      const jour = /le jour même/i.test(l), auto = /système automatisé/i.test(l);
      const medecin = /pour (Médecine familiale|médecin|Médecine d'urgence)/i.test(l);
      block = jour && medecin ? { type: "rdv", entry: { auto, heures: null, plages: [], systemes: [], notes: [] } } : { type: "autre" };
      if (block.type === "rdv") day.rdvJour.push(block.entry);
      continue;
    }
    if (!block) continue;
    if (block.type === "ouverture" && !day.ouverture) { day.ouverture = l; day.heures = ranges(l); continue; }
    if (block.type === "rdv") {
      const e = block.entry;
      if (/^Système : /.test(l)) e.systemes = l.replace(/^Système : /, "").split(/\s*,\s*/).filter(Boolean);
      else if (/^- /.test(l)) e.notes.push(l.slice(2));
      else if (!e.heures) { e.heures = l; e.plages = ranges(l); }
    }
  }
  out.systemes = [...new Set(out.jours.flatMap((j) => j.rdvJour.flatMap((e) => e.systemes)))];
  // Médecins non participants à la RAMQ (le patient paie) : écrit dans la fiche.
  out.nonParticipant = L.some((l) => /^Médecin non participant à la RAMQ/i.test(l));
  // Services et spécialités, tels que listés dans la fiche (sans les mentions de frais).
  const iS = at(/^Services offerts et spécialités$/), iA = at(/^Accessibilité$/, iS + 1);
  out.services = [];
  for (let i = iS + 1; iS >= 0 && i < (iA < 0 ? L.length : iA); i++) {
    const s = cleanService(L[i]);
    if (s && s.length < 90 && !NOT_SERVICE.test(s) && !out.services.includes(s)) out.services.push(s);
  }
  return out;
}

// Liens de la fiche (HTML) : position (lien « Comment s'y rendre »), site web, réservation en ligne.
function ficheLinks(html) {
  const out = { lat: null, lon: null, site: null, reservation: {} };
  for (const m of String(html).matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*([^<]{1,40})/gi)) {
    const href = m[1].replace(/&amp;/g, "&"), label = m[2].replace(/&nbsp;|&#160;/g, " ").replace(/&eacute;/g, "é").trim();
    if (/comment s.y rendre/i.test(label)) {
      const g = href.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
      if (g) { out.lat = Math.round(+g[1] * 1e5) / 1e5; out.lon = Math.round(+g[2] * 1e5) / 1e5; }
    } else if (/^site web$/i.test(label) && /^https?:/.test(href) && !out.site) out.site = href;
    else if (/^(RVSQ|Bonjour-santé|Bonjour santé)$/i.test(label) && /^https?:/.test(href)) {
      const key = /rvsq/i.test(label) ? "RVSQ" : "Bonjour-santé";
      if (!out.reservation[key]) out.reservation[key] = href;
    }
  }
  return out;
}

module.exports = {
  htmlText, parseFiche, ficheLinks, ranges, cleanService, NOT_SERVICE,
  MSSS_CSV, SOURCE_CSV, SOURCE_API, fetchCSV, norm, num, decode, parseCSV, columns, region, build, download,
  parseTime, stampOf, snapshots, computeStats, HISTORY_COLUMNS,
};
