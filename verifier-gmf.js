// Salle d'attente — GMF offrant des rendez-vous le jour même pour tous, partout au Québec
// 1. Parcourt toutes les pages de la recherche « GMF » du Répertoire des ressources (relais /api/repertoire-nom).
// 2. Lit chaque fiche absente de data/cliniques/liste.json (relais /api/repertoire).
// 3. Note : accès le jour même (pour tous / patients inscrits), fiche complète, région (urgence la plus proche).
// Résultat : data/cliniques/gmf-verifications.json. Lancé à la main par .github/workflows/verifier-gmf.yml.
const fs = require("fs");
const path = require("path");
const { htmlText, parseFiche, ficheLinks } = require("./lib");

const SITE = process.env.SITE || "https://salle-attente.onrender.com";
const OUT = path.join(__dirname, "data", "cliniques", "gmf-verifications.json");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, asJson) {
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60e3) });
      if (r.ok) return asJson ? r.json() : r.text();
      throw new Error("HTTP " + r.status);
    } catch (err) { console.warn(`Essai ${i} ${url} : ${err.message}`); await wait(8e3 * i); }
  }
  return null;
}
function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

(async () => {
  const known = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, "data", "cliniques", "liste.json"), "utf8")).cliniques.map((c) => c.nofiche));
  const ers = Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, "data", "installations.json"), "utf8")).urgences)
    .map(([nom, u]) => ({ nom, lat: u.lat, lon: u.lon, rss: u.rss, ville: u.ville }));

  // 1. Toutes les GMF du Répertoire
  const found = new Map();
  let pages = 1;
  for (let p = 1; p <= pages && p <= 200; p++) {
    const r = await get(SITE + "/api/repertoire-nom?q=GMF&page=" + p, true);
    await wait(1200);
    if (!r || !r.resultats) continue;
    pages = Math.max(pages, r.pages || 1);
    for (const x of r.resultats) if (/\bGMF\b/i.test(x.nom)) found.set(x.nofiche, x.nom);
    console.log(`Page ${p}/${pages} : ${found.size} GMF`);
  }

  // 2-3. Lecture des fiches
  const out = [];
  for (const [nofiche, nom] of found) {
    if (known.has(nofiche)) continue;
    const html = await get(SITE + "/api/repertoire?nofiche=" + nofiche, false);
    await wait(1200);
    if (!html) { out.push({ nofiche, nom, decision: "illisible" }); continue; }
    const f = parseFiche(htmlText(html)), links = ficheLinks(html);
    const heures = (f.jours || []).some((j) => j.ferme || (j.heures || []).length);
    const manque = [!f.adresse && "adresse", !f.telephone && "téléphone", !heures && "heures", links.lat === null && "position"].filter(Boolean);
    let rss = "", urgence = "";
    if (links.lat !== null) {
      const near = ers.map((e) => ({ e, d: km(links, e) })).sort((a, b) => a.d - b.d)[0];
      if (near) { rss = near.e.rss; urgence = near.e.nom; }
    }
    const decision = f.acces === "tous" && !manque.length ? "ajout possible"
      : f.acces === "tous" ? "pour tous, fiche incomplète" : f.acces === "inscrits" ? "patients inscrits seulement" : "pas de rendez-vous le jour même indiqué";
    out.push({ nofiche, nom, adresse: [f.adresse, f.ville].filter(Boolean).join(", "), rss, urgenceProche: urgence, acces: f.acces || "", frais: !!f.frais, manque, decision });
    console.log(`${decision.toUpperCase()} ${rss} ${nofiche} ${nom}`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ verifie: new Date().toISOString().slice(0, 10), total: found.size, resultats: out }, null, 1) + "\n");
  const n = (k) => out.filter((x) => x.decision === k).length;
  console.log(`GMF trouvées ${found.size} · lues ${out.length} · ajout possible ${n("ajout possible")}`);
})().catch((err) => { console.error(err); process.exit(1); });
