// Salle d'attente — recherche de cliniques par nom dans le Répertoire des ressources (pédiatrie, IPS, CLSC…)
// Config : data/cliniques/recherches.json. Pour chaque recherche :
// 1. parcourt toutes les pages de chaque mot-clé (relais /api/repertoire-nom) et garde les noms qui correspondent ;
// 2. lit chaque fiche absente de data/cliniques/liste.json (relais /api/repertoire) ;
// 3. note l'accès le jour même (pour tous / inscrits), les manques, l'urgence la plus proche et les lignes utiles de la fiche.
// Résultat : data/cliniques/recherches/<id>.json. Rien n'est ajouté au site automatiquement : chaque ajout est vérifié.
const fs = require("fs");
const path = require("path");
const { htmlText, parseFiche, ficheLinks } = require("./lib");

const SITE = process.env.SITE || "https://salle-attente.onrender.com";
const DIR = path.join(__dirname, "data", "cliniques");
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
  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, "recherches.json"), "utf8"));
  const known = new Set(JSON.parse(fs.readFileSync(path.join(DIR, "liste.json"), "utf8")).cliniques.map((c) => c.nofiche));
  const ers = Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, "data", "installations.json"), "utf8")).urgences)
    .map(([nom, u]) => ({ nom, lat: u.lat, lon: u.lon, rss: u.rss }));
  fs.mkdirSync(path.join(DIR, "recherches"), { recursive: true });
  const seen = new Map(); // fiches déjà lues (partagées entre recherches)

  for (const R of cfg.recherches.filter((r) => r.actif !== false)) {
    const keep = new RegExp(R.garder, "i");
    const found = new Map();
    for (const q of R.q) {
      let pages = 1;
      for (let p = 1; p <= pages && p <= 200; p++) {
        const r = await get(SITE + "/api/repertoire-nom?q=" + encodeURIComponent(q) + "&page=" + p, true);
        await wait(1200);
        if (!r || !r.resultats) continue;
        pages = Math.max(pages, r.pages || 1);
        for (const x of r.resultats) if (keep.test(x.nom)) found.set(x.nofiche, x.nom);
        console.log(`[${R.id}] « ${q} » page ${p}/${pages} : ${found.size}`);
      }
    }
    const out = [];
    for (const [nofiche, nom] of found) {
      if (known.has(nofiche)) { out.push({ nofiche, nom, decision: "déjà sur le site" }); continue; }
      let row = seen.get(nofiche);
      if (!row) {
        const html = await get(SITE + "/api/repertoire?nofiche=" + nofiche, false);
        await wait(1200);
        if (!html) { out.push({ nofiche, nom, decision: "illisible" }); continue; }
        const text = htmlText(html), f = parseFiche(text), links = ficheLinks(html);
        const heures = (f.jours || []).some((j) => j.ferme || (j.heures || []).length);
        const manque = [!f.adresse && "adresse", !f.telephone && "téléphone", !heures && "heures", links.lat === null && "position"].filter(Boolean);
        let rss = "", urgence = "";
        if (links.lat !== null) {
          const near = ers.map((e) => ({ e, d: km(links, e) })).sort((a, b) => a.d - b.d)[0];
          if (near) { rss = near.e.rss; urgence = near.e.nom; }
        }
        const lignes = text.split("\n").map((l) => l.trim())
          .filter((l) => l && l.length < 300 && /sans rendez-vous|jour même|p[ée]diatr|praticienne|\bIPS\b|enfants?\b|0 ?[-àa] ?17 ans|moins de 18 ans|RAMQ|assurance maladie|assurance médicaments|sans carte|statut|itin[ée]ran|PFSI|clientèle/i.test(l))
          .filter((l, i, a) => a.indexOf(l) === i).slice(0, 14);
        const decision = f.acces === "tous" && !manque.length ? "ajout possible"
          : f.acces === "tous" ? "pour tous, fiche incomplète" : f.acces === "inscrits" ? "patients inscrits seulement" : "pas de rendez-vous le jour même indiqué";
        row = { adresse: [f.adresse, f.ville].filter(Boolean).join(", "), telephone: f.telephone || "", rss, urgenceProche: urgence,
          acces: f.acces || "", accesNote: f.accesNote || "", frais: !!f.frais, miseAJour: f.miseAJour || "", manque, lignes, decision };
        seen.set(nofiche, row);
      }
      out.push({ nofiche, nom, ...row });
      console.log(`[${R.id}] ${row.decision.toUpperCase()} ${row.rss} ${nofiche} ${nom}`);
    }
    fs.writeFileSync(path.join(DIR, "recherches", R.id + ".json"),
      JSON.stringify({ verifie: new Date().toISOString().slice(0, 10), recherche: R, total: found.size, resultats: out }, null, 1) + "\n");
    const n = (k) => out.filter((x) => x.decision === k).length;
    console.log(`[${R.id}] trouvées ${found.size} · ajout possible ${n("ajout possible")} · déjà sur le site ${n("déjà sur le site")}`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
