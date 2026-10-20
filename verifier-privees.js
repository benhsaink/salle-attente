// Salle d'attente — vérification en lot des cliniques privées candidates
// Pour chaque adresse de data/cliniques/privees-candidats.json (liste RAMQ des médecins non participants) :
// 1. recherche du nom de la clinique dans le Répertoire des ressources (relais du site : /api/repertoire-nom) ;
// 2. on garde les fiches au même code postal ;
// 3. lecture de chaque fiche (relais /api/repertoire) : frais indiqués ? fiche complète ?
// Résultat : data/cliniques/privees-verifications.json (une décision et sa raison par fiche).
// Lancé par .github/workflows/verifier-privees.yml (à la main).
const fs = require("fs");
const path = require("path");
const { htmlText, parseFiche, ficheLinks } = require("./lib");

const SITE = process.env.SITE || "https://salle-attente.onrender.com";
const IN = path.join(__dirname, "data", "cliniques", "privees-candidats.json");
const OUT = path.join(__dirname, "data", "cliniques", "privees-verifications.json");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cpOf = (s) => String(s || "").toUpperCase().replace(/\s/g, "").match(/[A-Z]\d[A-Z]\d[A-Z]\d/)?.[0] || "";

async function get(url, asJson) {
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60e3) });
      if (r.ok) return asJson ? r.json() : r.text();
      if (r.status === 400) return null;
      throw new Error("HTTP " + r.status);
    } catch (err) { console.warn(`Essai ${i} ${url} : ${err.message}`); await wait(10e3 * i); }
  }
  return null;
}

// Variantes du nom à chercher : le nom complet, puis sans « clinique médicale », « centre médical », etc.
function variants(name) {
  const n = name.replace(/\s+INC\.?$/i, "").trim();
  const short = n.replace(/^(LA\s+)?(CLINIQUE|CENTRE|CENTRE MEDICALE?|CLIN\.?)\s+(MEDICALE?|MÉDICALE?|PRIVEE|PRIVÉE|DE SANTE|DE SANTÉ)?\s*(PRIVEE|PRIVÉE)?\s*/i, "").trim();
  return [...new Set([n, short].filter((x) => x.length >= 3))];
}

function decide(text, f, links) {
  const cout = (text.match(/Co[uû]t pour services\s*:?\s*(Oui|Non)/i) || [])[1] || "";
  const fraisServ = /des frais sont exig[ée]s/i.test(text);
  const payant = /soins sont payants|clinique m[ée]dicale priv[ée]e|hors RAMQ|co[uû]t pour tous les services/i.test(text);
  const nonPart = f.nonParticipant || /M[ée]decin (non participant|d[ée]sengag[ée])/i.test(text);
  const signes = [cout === "Oui" && "Coût pour services : Oui", fraisServ && "des frais sont exigés", payant && "mention privée/payante", nonPart && "médecin non participant ou désengagé"].filter(Boolean);
  const heures = (f.jours || []).some((j) => j.ferme || (j.heures || []).length);
  const manque = [!f.adresse && "adresse", !f.telephone && "téléphone", !(f.services || []).length && "services", !heures && "heures", !(links && links.lat) && "position"].filter(Boolean);
  let decision, raison;
  if (!signes.length) { decision = "écartée"; raison = "aucun frais indiqué dans la fiche" + (cout === "Non" ? " (Coût pour services : Non)" : ""); }
  else if (manque.length) { decision = "à revoir"; raison = "frais indiqués, mais fiche incomplète : " + manque.join(", "); }
  else if (cout === "Non" && !payant) { decision = "à revoir"; raison = "contradiction : Coût pour services : Non, mais " + signes.join(", "); }
  else { decision = "retenue"; raison = signes.join(", "); }
  return { decision, raison, signes, manque, cout };
}

(async () => {
  const { candidats } = JSON.parse(fs.readFileSync(IN, "utf8"));
  const out = [];
  const seenFiche = new Set();
  for (const c of candidats) {
    const trouvees = new Map();
    for (const nom of c.noms) {
      for (const q of variants(nom)) {
        const r = await get(SITE + "/api/repertoire-nom?q=" + encodeURIComponent(q), true);
        await wait(1500);
        for (const x of (r && r.resultats) || []) if (cpOf(x.apres) === c.codePostal) trouvees.set(x.nofiche, x.nom);
        if (trouvees.size) break;
      }
    }
    if (!trouvees.size) {
      out.push({ ...c, decision: "introuvable", raison: "aucune fiche du Répertoire à ce nom et à ce code postal" });
      console.log(`INTROUVABLE ${c.region} ${c.noms[0]} ${c.codePostal}`);
      continue;
    }
    for (const [nofiche, nomFiche] of trouvees) {
      if (seenFiche.has(nofiche)) continue;
      seenFiche.add(nofiche);
      const html = await get(SITE + "/api/repertoire?nofiche=" + nofiche, false);
      await wait(1500);
      if (!html) { out.push({ ...c, nofiche, nomFiche, decision: "à revoir", raison: "fiche illisible" }); continue; }
      const text = htmlText(html);
      const f = parseFiche(text), links = ficheLinks(html);
      const d = decide(text, f, links);
      out.push({ ...c, nofiche, nomFiche, ...d, ficheAdresse: [f.adresse, f.ville].filter(Boolean).join(", "), miseAJour: f.miseAJour || "" });
      console.log(`${d.decision.toUpperCase()} ${c.region} ${nofiche} ${nomFiche} — ${d.raison}`);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ verifie: new Date().toISOString().slice(0, 10), resultats: out }, null, 1) + "\n");
  const n = (k) => out.filter((x) => x.decision === k).length;
  console.log(`Retenues ${n("retenue")} · à revoir ${n("à revoir")} · écartées ${n("écartée")} · introuvables ${n("introuvable")}`);
})().catch((err) => { console.error(err); process.exit(1); });
