// Salle d'attente — surveillance : échoue (et GitHub envoie un courriel au propriétaire du dépôt) si
// 1. le dernier relevé enregistré dans data/historique a plus de 4 heures (collecte ou ministère arrêtés) ;
// 2. le site ne répond pas (accueil, /api/urgences, une page de région).
// Lancé toutes les 6 heures par .github/workflows/surveillance.yml.
const fs = require("fs");
const path = require("path");
const SITE = (process.env.SITE || "https://salle-attente.ca").replace(/\/$/, "");
const MAX_HOURS = 4;
const problems = [];

function quebecNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); // heure du Québec « comme si » UTC
}

async function get(url, test) {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "SalleAttente-surveillance/1.0" }, signal: AbortSignal.timeout(90e3) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const body = await r.text();
      const err = test ? test(body) : null;
      if (err) throw new Error(err);
      console.log("OK", url);
      return body;
    } catch (e) { if (i === 3) problems.push(`${url} : ${e.message}`); else await new Promise((r) => setTimeout(r, 20e3)); }
  }
}

(async () => {
  // 1. Fraîcheur de l'historique
  const dir = path.join(__dirname, "data", "historique");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.csv$/.test(f)).sort() : [];
  if (!files.length) problems.push("Aucun fichier d'historique.");
  else {
    const lines = fs.readFileSync(path.join(dir, files.at(-1)), "utf8").trim().split("\n");
    const last = lines.slice(1).map((l) => l.split(",")[0]).sort().at(-1) || "";
    const t = new Date(last.replace(" ", "T") + ":00Z");
    const hours = (quebecNow() - t) / 3600e3;
    console.log(`Dernier relevé : ${last} (il y a ${hours.toFixed(1)} h)`);
    if (!(hours <= MAX_HOURS)) problems.push(`Dernier relevé enregistré : ${last}, il y a ${isFinite(hours) ? hours.toFixed(1) : "?"} h (maximum ${MAX_HOURS} h). La collecte ou le fichier du ministère est peut-être arrêté.`);
  }
  // 2. Site en ligne
  await get(SITE + "/", (b) => (/Salle d'attente/.test(b) ? null : "page d'accueil inattendue"));
  await get(SITE + "/api/urgences", (b) => { const d = JSON.parse(b); return d.hospitals && d.hospitals.length >= 20 ? null : "moins de 20 urgences dans la réponse"; });
  await get(SITE + "/urgences/montreal", (b) => (/Urgences de Montréal/.test(b) ? null : "page de région inattendue"));

  if (problems.length) {
    console.error("\nPROBLÈMES :\n- " + problems.join("\n- "));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Problèmes détectés\n" + problems.map((p) => "- " + p).join("\n") + "\n");
    process.exit(1);
  }
  console.log("Tout va bien.");
})();
