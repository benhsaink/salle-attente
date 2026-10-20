// Salle d'attente — lecture des fiches officielles des cliniques (Répertoire des ressources, Santé Québec)
// Lancé par GitHub Actions (.github/workflows/repertoire.yml).
// Pour chaque clinique de data/cliniques/liste.json :
//   1) télécharge sa fiche officielle (directement, sinon par le relais du site sur Render)
//   2) en garde le texte dans data/cliniques/fiches/<numéro>.txt (pour vérification)
// Les adresses et heures affichées sur le site viennent ensuite de ces fiches, jamais d'une supposition.

const fs = require("fs");
const path = require("path");

const LIST = path.join(__dirname, "data", "cliniques", "liste.json");
const DIR = path.join(__dirname, "data", "cliniques", "fiches");
const DIRECT = (n) => "https://sante.gouv.qc.ca/repertoire-ressources/ressource/?nofiche=" + n;
const RELAY = (n) => (process.env.RELAY || "https://salle-attente.onrender.com/api/repertoire?nofiche=") + n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": "SalleAttente/1.0 (donnees publiques; salle-attente.onrender.com)" }, signal: AbortSignal.timeout(60e3) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", Eacute: "É", ndash: "–", mdash: "—" };
function text(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|h\d|tr|dt|dd|section|article|address)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENT[e] ?? m)
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

async function fetchFiche(n) {
  try { return { html: await get(DIRECT(n)), via: "direct" }; }
  catch (err) {
    console.warn(`Fiche ${n} : accès direct impossible (${err.message}), essai par le relais`);
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return { html: await get(RELAY(n)), via: "relais" }; }
    catch (err) {
      console.warn(`Fiche ${n} : relais, essai ${attempt} (${err.message})`);
      await sleep(30e3); // le site peut être en train de se réveiller ou de se redéployer
    }
  }
  throw new Error("fiche " + n + " inaccessible");
}

async function main() {
  const { cliniques } = JSON.parse(fs.readFileSync(LIST, "utf8"));
  fs.mkdirSync(DIR, { recursive: true });
  let ok = 0;
  for (const c of cliniques) {
    try {
      const { html, via } = await fetchFiche(c.nofiche);
      // Une copie brute de la première fiche aide à écrire la lecture automatique.
      if (c === cliniques[0]) fs.writeFileSync(path.join(DIR, "exemple-brut.html"), html);
      // Coordonnées éventuellement présentes dans la page (carte)
      const geo = [...html.matchAll(/(lat(?:itude)?|lng|lon(?:gitude)?)["'\s:=]+(-?\d{2,3}\.\d{3,})/gi)].map((m) => m[1] + "=" + m[2]);
      const body = `# ${c.nom}\n# Source : ${DIRECT(c.nofiche)} (lu ${new Date().toISOString().slice(0, 10)}, ${via})\n` +
        (geo.length ? "# Coordonnées trouvées : " + [...new Set(geo)].join(" ") + "\n" : "") + "\n" + text(html) + "\n";
      fs.writeFileSync(path.join(DIR, c.nofiche + ".txt"), body);
      ok++;
      console.log(`OK ${c.nofiche} ${c.nom} (${via})`);
    } catch (err) {
      console.error(`ÉCHEC ${c.nofiche} ${c.nom} : ${err.message}`);
    }
    await sleep(1500); // poli envers le site du gouvernement
  }
  console.log(`${ok} fiches lues sur ${cliniques.length}`);
  if (!ok) process.exit(1);
}

main();
