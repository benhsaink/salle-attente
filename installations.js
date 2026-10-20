// Salle d'attente — adresses et coordonnées de toutes les urgences du Québec
// Source : « Liste des installations » (fichiers cartographiques M02), ministère de la Santé,
// Données Québec, licence CC BY 4.0. Lancé par .github/workflows/installations.yml.
// Pour chaque urgence de l'historique (data/historique), on cherche son installation par le nom
// et on garde adresse, municipalité, code postal, coordonnées et région sociosanitaire (RSS).
// Résultat : data/installations.json (lu par lib.js pour les urgences hors de la liste PLACES).
const fs = require("fs");
const path = require("path");
const { fetchCSV, norm } = require("./lib");

const URL_M02 = "https://www.donneesquebec.ca/recherche/dataset/51998b55-7d4c-4381-8c20-0ac1cd9c1b87/resource/2aa06e66-c1d0-4e2f-bf3c-c2e413c3f84d/download/installationscsv.csv";
const RELAY = "https://salle-attente.onrender.com/api/installations.csv";
const OUT = path.join(__dirname, "data", "installations.json");

// Noms des urgences publiés par le ministère (toutes les régions), d'après le dernier mois d'historique.
function erNames() {
  const dir = path.join(__dirname, "data", "historique");
  const file = fs.readdirSync(dir).filter((f) => f.endsWith(".csv")).sort().pop();
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  const names = new Map();
  for (const line of text.split("\n").slice(1)) {
    const m = line.match(/^[^,]+,("?)(.*?)\1,("?)(.*?)\3,/);
    if (m && m[2]) names.set(m[2], m[4]);
  }
  return names;
}

const pick = (cols, ...tests) => cols.find((c) => tests.some((t) => t.test(c)));

(async () => {
  let rows = null;
  for (const url of [URL_M02, RELAY]) {
    for (let i = 1; i <= 3 && !rows; i++) {
      try { rows = await fetchCSV(url); console.log(`Lu : ${url} (${rows.length} lignes)`); }
      catch (err) { console.warn(`Essai ${i} : ${url} -> ${err.message}`); await new Promise((r) => setTimeout(r, 10e3)); }
    }
    if (rows) break;
  }
  if (!rows || !rows.length) throw new Error("Liste des installations introuvable");

  const cols = Object.keys(rows[0]);
  console.log("Colonnes : " + cols.join(" | "));
  const C = {
    nom: pick(cols, /^instal_nom$/i, /^instal_nom/i, /nom.*install/i),
    adresse: pick(cols, /^adresse/i),
    ville: pick(cols, /^mun_nom/i, /municip/i),
    cp: pick(cols, /^code_posta/i, /postal/i),
    lat: pick(cols, /^latitude/i, /^lat$/i),
    lon: pick(cols, /^longitude/i, /^lon/i),
    rss: pick(cols, /^rss_code/i),
    rssNom: pick(cols, /^rss_nom/i),
    chsgs: pick(cols, /^chsgs/i),
  };
  for (const k of ["nom", "adresse", "lat", "lon", "rss"]) if (!C[k]) throw new Error("Colonne introuvable : " + k);

  const byName = new Map();
  for (const r of rows) {
    const k = norm(r[C.nom]);
    if (!k) continue;
    (byName.get(k) || byName.set(k, []).get(k)).push(r);
  }
  const best = (list) => list.find((r) => /^o/i.test(r[C.chsgs] || "")) || list[0];

  const urgences = {}, nonTrouvees = [];
  for (const [name] of erNames()) {
    const k = norm(name);
    let r = byName.has(k) ? best(byName.get(k)) : null;
    if (!r) {
      // Nom un peu différent : une installation dont le nom contient celui de l'urgence (ou l'inverse)
      const cands = [...byName.entries()].filter(([n]) => n.includes(k) || (n.length > 12 && k.includes(n)));
      if (cands.length === 1) r = best(cands[0][1]);
    }
    const lat = r && Number(String(r[C.lat]).replace(",", ".")), lon = r && Number(String(r[C.lon]).replace(",", "."));
    if (!r || !isFinite(lat) || !isFinite(lon) || !lat || !lon) { nonTrouvees.push(name); continue; }
    urgences[name] = {
      lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5,
      adresse: (r[C.adresse] || "").trim(), ville: (r[C.ville] || "").trim(), codePostal: (r[C.cp] || "").trim(),
      rss: String(r[C.rss] || "").trim().padStart(2, "0"), rssNom: (r[C.rssNom] || "").trim(),
      nomM02: r[C.nom],
    };
  }
  const out = {
    source: "Fichiers cartographiques M02 des installations et établissements, ministère de la Santé et des Services sociaux, Données Québec (CC BY 4.0)",
    url: URL_M02, consulte: new Date().toISOString().slice(0, 10), urgences, nonTrouvees,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`${Object.keys(urgences).length} urgences placées, ${nonTrouvees.length} non trouvées : ${nonTrouvees.join(" ; ")}`);
})().catch((err) => { console.error(err.message); process.exit(1); });
