// Salle d'attente — collecte de l'historique
// Lancé automatiquement par GitHub Actions (.github/workflows/collecte.yml) toutes les 6 heures.
// 1) télécharge le fichier du MSSS (7 derniers jours, heure par heure)
// 2) ajoute les nouvelles heures dans data/historique/AAAA-MM.csv (sans doublons)
// 3) recalcule data/stats.json : moyennes par hôpital, jour de la semaine et heure
//
// Comme le fichier couvre 7 jours, une collecte manquée se rattrape toute seule à la suivante.

const fs = require("fs");
const path = require("path");
const { download, parseCSV, snapshots, computeStats, HISTORY_COLUMNS } = require("./lib");

const DIR = path.join(__dirname, "data", "historique");
const STATS = path.join(__dirname, "data", "stats.json");

const csvCell = (v) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const keyOf = (r) => r.horodatage + "|" + r.installation;

function readMonth(file) {
  if (!fs.existsSync(file)) return [];
  return parseCSV(fs.readFileSync(file, "utf8"));
}

function writeMonth(file, rows) {
  rows.sort((a, b) => (a.horodatage + a.installation).localeCompare(b.horodatage + b.installation, "fr"));
  const lines = [HISTORY_COLUMNS.join(",")].concat(rows.map((r) => HISTORY_COLUMNS.map((k) => csvCell(r[k])).join(",")));
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

async function main() {
  const { records, source } = await download();
  const fresh = snapshots(records);
  if (!fresh.length) throw new Error("Aucune ligne lisible dans le fichier (" + records.length + " enregistrements)");
  fs.mkdirSync(DIR, { recursive: true });

  // Regroupe par mois et fusionne avec ce qui est déjà enregistré.
  const byMonth = new Map();
  for (const r of fresh) {
    const month = r.horodatage.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r);
  }
  let added = 0;
  for (const [month, rows] of byMonth) {
    const file = path.join(DIR, month + ".csv");
    const merged = new Map(readMonth(file).map((r) => [keyOf(r), r]));
    for (const r of rows) {
      if (!merged.has(keyOf(r))) added++;
      merged.set(keyOf(r), r); // la version la plus récente du ministère l'emporte
    }
    writeMonth(file, [...merged.values()]);
  }

  // Recalcule les tendances à partir de tout l'historique.
  const all = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}\.csv$/.test(f)).sort()
    .flatMap((f) => readMonth(path.join(DIR, f)));
  const stats = computeStats(all);
  fs.writeFileSync(STATS, JSON.stringify(stats));

  console.log(`Source : ${source}. ${fresh.length} lignes lues, ${added} nouvelles heures ajoutées.`);
  console.log(`Historique : ${all.length} lignes, ${stats.days} jours (${stats.from} au ${stats.to}), ${Object.keys(stats.hospitals).length} installations.`);
}

main().catch((err) => { console.error("Collecte échouée :", err.message); process.exit(1); });
