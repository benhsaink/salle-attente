// Salle d'attente — fiches officielles des cliniques (Répertoire des ressources, Santé Québec)
// Lancé chaque matin par GitHub Actions (.github/workflows/repertoire.yml).
// Pour chaque clinique de data/cliniques/liste.json :
//   1) télécharge sa fiche officielle (directement, sinon par le relais du site sur Render)
//   2) en tire l'adresse, la position (lien « Comment s'y rendre »), le téléphone, l'horaire des 7 prochains jours,
//      la prise de rendez-vous le jour même et à qui elle s'adresse
//   3) écrit le tout dans data/cliniques/cliniques.json, que le site affiche
// Rien n'est deviné : une information absente de la fiche reste vide (et la dernière version lue est gardée en cas de panne).

const fs = require("fs");
const path = require("path");
const { htmlText, parseFiche, ficheLinks } = require("./lib");

// Deux listes : les GMF-A/R (publics) et les cliniques privées.
const JOBS = [
  { list: "liste.json", out: "cliniques.json" },
  { list: "privees-liste.json", out: "privees.json" },
  { list: "prelevements-liste.json", out: "prelevements.json" },
].map((j) => ({ list: path.join(__dirname, "data", "cliniques", j.list), out: path.join(__dirname, "data", "cliniques", j.out) }));
const FICHE = (n) => "https://sante.gouv.qc.ca/repertoire-ressources/ressource/?nofiche=" + n;
const RELAY = (n) => (process.env.RELAY || "https://salle-attente.onrender.com/api/repertoire?nofiche=") + n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "SalleAttente/1.0 (donnees publiques; salle-attente.onrender.com)" }, signal: AbortSignal.timeout(60e3) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

let direct = true; // si l'accès direct est bloqué une fois, on passe au relais pour la suite
async function fetchFiche(n) {
  if (direct) {
    try { return await get(FICHE(n)); }
    catch (err) { console.warn(`Accès direct impossible (${err.message}) : passage au relais du site`); direct = false; }
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return await get(RELAY(n)); }
    catch (err) {
      console.warn(`Fiche ${n} : relais, essai ${attempt} (${err.message})`);
      await sleep(30e3); // le site peut être en train de se réveiller
    }
  }
  throw new Error("inaccessible");
}

async function run(LIST, OUT) {
  if (!fs.existsSync(LIST)) return;
  const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
  let previous = {};
  try { previous = Object.fromEntries(JSON.parse(fs.readFileSync(OUT, "utf8")).cliniques.map((c) => [c.nofiche, c])); } catch (e) {}
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const out = [];
  let ok = 0;
  for (const c of list.cliniques) {
    try {
      const html = await fetchFiche(c.nofiche);
      const info = parseFiche(htmlText(html));
      if (!info.adresse) throw new Error("fiche illisible (adresse introuvable)");
      const links = ficheLinks(html);
      // Fiche sans lien de carte : position notée à la main dans la liste (adresse officielle, OpenStreetMap).
      if (links.lat === null && c.position) { links.lat = c.position.lat; links.lon = c.position.lon; }
      out.push({ ...c, url: FICHE(c.nofiche), lu: today, ...info, ...links });
      ok++;
      console.log(`OK ${c.nofiche} ${c.nom}`);
    } catch (err) {
      console.error(`ÉCHEC ${c.nofiche} ${c.nom} : ${err.message}`);
      if (previous[c.nofiche]) out.push(previous[c.nofiche]); // on garde la dernière version lue
    }
    await sleep(1500); // poli envers le site du gouvernement
  }
  if (!ok) throw new Error(path.basename(LIST) + " : aucune fiche lue");
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: "Répertoire des ressources en santé et services sociaux (Santé Québec), " + list.source,
    cliniques: out,
  }, null, 1));
  console.log(`${path.basename(OUT)} : ${ok} fiches lues sur ${list.cliniques.length}`);
}

async function main() {
  for (const j of JOBS) await run(j.list, j.out);
}

main().catch((err) => { console.error("Lecture des fiches échouée :", err.message); process.exit(1); });
