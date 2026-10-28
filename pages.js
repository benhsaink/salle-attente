// Salle d'attente — pages par région, écrites par le serveur (lisibles par Google sans JavaScript)
// /urgences/            liste des régions
// /urgences/<région>    urgences de la région, de la moins à la plus remplie, avec l'heure de mise à jour
// Les chiffres viennent du même fichier du ministère que l'application (getData du serveur).

// [code, slug fr, nom fr, « de … » fr, slug en, nom en, « in … » en]
const REGIONS = [
  ["mtl", "montreal", "Montréal", "de Montréal", "montreal", "Montréal", "in Montréal"],
  ["lav", "laval", "Laval", "de Laval", "laval", "Laval", "in Laval"],
  ["rs", "rive-sud", "Rive-Sud", "de la Rive-Sud de Montréal", "south-shore", "South Shore", "on Montréal's South Shore"],
  ["rn", "rive-nord", "Rive-Nord", "de la Rive-Nord de Montréal", "north-shore", "North Shore", "on Montréal's North Shore"],
  ["qc", "quebec-levis", "Québec et Lévis", "de Québec et de Lévis", "quebec-city-levis", "Québec City and Lévis", "in Québec City and Lévis"],
  ["tr", "trois-rivieres", "Trois-Rivières", "de Trois-Rivières", "trois-rivieres", "Trois-Rivières", "in Trois-Rivières"],
  ["r01", "bas-saint-laurent", "Bas-Saint-Laurent", "du Bas-Saint-Laurent", "bas-saint-laurent", "Bas-Saint-Laurent", "in Bas-Saint-Laurent"],
  ["r02", "saguenay-lac-saint-jean", "Saguenay–Lac-Saint-Jean", "du Saguenay–Lac-Saint-Jean", "saguenay-lac-saint-jean", "Saguenay–Lac-Saint-Jean", "in Saguenay–Lac-Saint-Jean"],
  ["r04", "mauricie-centre-du-quebec", "Mauricie et Centre-du-Québec", "de la Mauricie et du Centre-du-Québec (hors Trois-Rivières)", "mauricie-centre-du-quebec", "Mauricie and Centre-du-Québec", "in Mauricie and Centre-du-Québec (outside Trois-Rivières)"],
  ["r05", "estrie", "Estrie", "de l'Estrie", "eastern-townships", "Eastern Townships (Estrie)", "in the Eastern Townships (Estrie)"],
  ["r07", "outaouais", "Outaouais", "de l'Outaouais", "outaouais", "Outaouais (Gatineau)", "in Outaouais (Gatineau)"],
  ["r08", "abitibi-temiscamingue", "Abitibi-Témiscamingue", "de l'Abitibi-Témiscamingue", "abitibi-temiscamingue", "Abitibi-Témiscamingue", "in Abitibi-Témiscamingue"],
  ["r09", "cote-nord", "Côte-Nord", "de la Côte-Nord", "cote-nord", "Côte-Nord", "in Côte-Nord"],
  ["r10", "nord-du-quebec", "Nord-du-Québec", "du Nord-du-Québec", "nord-du-quebec", "Nord-du-Québec", "in Nord-du-Québec"],
  ["r11", "gaspesie-iles-de-la-madeleine", "Gaspésie–Îles-de-la-Madeleine", "de la Gaspésie et des Îles-de-la-Madeleine", "gaspesie-magdalen-islands", "Gaspésie–Magdalen Islands", "in Gaspésie and the Magdalen Islands"],
  ["r12", "chaudiere-appalaches", "Chaudière-Appalaches", "de Chaudière-Appalaches (hors Lévis)", "chaudiere-appalaches", "Chaudière-Appalaches", "in Chaudière-Appalaches (outside Lévis)"],
  ["r14", "lanaudiere", "Lanaudière", "de Lanaudière (hors Rive-Nord)", "lanaudiere", "Lanaudière", "in Lanaudière (outside the North Shore)"],
  ["r15", "laurentides", "Laurentides", "des Laurentides (hors Rive-Nord)", "laurentians", "Laurentians", "in the Laurentians (outside the North Shore)"],
  ["r16", "monteregie", "Montérégie", "de la Montérégie (hors Rive-Sud)", "monteregie", "Montérégie", "in Montérégie (outside the South Shore)"],
  ["r17", "nunavik", "Nunavik", "du Nunavik", "nunavik", "Nunavik", "in Nunavik"],
  ["r18", "terres-cries-de-la-baie-james", "Terres-Cries-de-la-Baie-James", "des Terres-Cries-de-la-Baie-James", "eeyou-istchee", "Eeyou Istchee (Cree Territory of James Bay)", "in Eeyou Istchee (Cree Territory of James Bay)"],
];
const BY_SLUG = new Map(REGIONS.map((r) => [r[1], r]));
const BY_SLUG_EN = new Map(REGIONS.map((r) => [r[4], r]));
const FR_BASE = "/urgences", EN_BASE = "/en/emergency-rooms";
const T = (lang, fr, en) => (lang === "en" ? en : fr);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const title = (s) => String(s).toLowerCase().replace(/(^|[\s\-'’(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Du|Des|La|Le|Les|Et|En|Of|Et)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
const fmt = (n) => (n === null || n === undefined ? "—" : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "));
function status(r, lang) {
  if (r === null || r === undefined) return ["warn", T(lang, "Inconnu", "Unknown")];
  if (r < 0.9) return ["ok", T(lang, "Fluide", "Light")];
  if (r <= 1.3) return ["warn", T(lang, "Chargée", "Busy")];
  return ["bad", T(lang, "Débordée", "Overcrowded")];
}
const score = (h) => (h.rate ?? 2) * 100 + (h.pec ?? 30) * 1.5;

const CSS = `
@font-face{font-family:"Familjen Grotesk";src:url(/fonts/FamiljenGrotesk.ttf) format("truetype");font-weight:400 700;font-display:swap}
@font-face{font-family:"Atkinson Hyperlegible";src:url(/fonts/AtkinsonHyperlegible-Regular.ttf) format("truetype");font-weight:400;font-display:swap}
@font-face{font-family:"Atkinson Hyperlegible";src:url(/fonts/AtkinsonHyperlegible-Bold.ttf) format("truetype");font-weight:700;font-display:swap}
:root{--bg:#f3f6f7;--surface:#fff;--ink:#132a33;--muted:#4d6069;--line:#d9e2e5;--accent:#1f5fae;--ok:#1d7a4f;--ok-soft:#e1f2e9;--warn:#8a5900;--warn-soft:#fbf0d9;--bad:#b3261e;--bad-soft:#fbe4e2}
@media (prefers-color-scheme:dark){:root{--bg:#0e1a1f;--surface:#15252c;--ink:#e6eef0;--muted:#97aab1;--line:#26393f;--accent:#7fb2ef;--ok:#5fcf97;--ok-soft:#173326;--warn:#f0bd5a;--warn-soft:#352a14;--bad:#f2857d;--bad-soft:#3a1d1b;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Atkinson Hyperlegible","Segoe UI",Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-left)) 40px}
a{color:var(--accent)}h1{font:700 1.6rem/1.2 "Familjen Grotesk","Helvetica Neue",Arial,sans-serif;margin:8px 0 6px;text-wrap:balance}
h2{font:700 1.15rem/1.3 "Familjen Grotesk","Helvetica Neue",Arial,sans-serif;margin:28px 0 8px}
.top{font-weight:700;text-decoration:none}.langlink{float:right;font-weight:700}.lead{color:var(--muted);margin:0 0 14px}
.alert{background:var(--bad-soft);border-radius:10px;padding:10px 12px;margin:12px 0}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:10px 14px;margin:6px 0 4px}
@media (prefers-color-scheme:dark){.cta{color:#0e1a1f}}
ol.er{list-style:none;padding:0;margin:14px 0;display:grid;gap:10px}
ol.er li{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
ol.er h3{font-size:1rem;margin:0 0 2px}ol.er h3 a{text-decoration:none}
.where{color:var(--muted);font-size:.9rem}.nums{margin-top:6px;font-size:.95rem}
.pill{display:inline-block;font-size:.8125rem;font-weight:700;border-radius:99px;padding:2px 9px;margin-right:6px}
.ok{color:var(--ok);background:var(--ok-soft)}.warn{color:var(--warn);background:var(--warn-soft)}.bad{color:var(--bad);background:var(--bad-soft)}
.tag{font-size:.8125rem;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:0 6px;margin-left:6px;font-weight:400}
ul.regions{columns:2;padding-left:18px}@media (max-width:480px){ul.regions{columns:1}}
footer{color:var(--muted);font-size:.875rem;margin-top:30px;border-top:1px solid var(--line);padding-top:12px}`;

function page({ base, lang, path, altPath, titleText, description, body }) {
  return `<!doctype html>
<html lang="${T(lang, "fr-CA", "en-CA")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(titleText)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${base}${path}">
<link rel="alternate" hreflang="${T(lang, "fr-CA", "en-CA")}" href="${base}${path}">
<link rel="alternate" hreflang="${T(lang, "en-CA", "fr-CA")}" href="${base}${altPath}">
<link rel="alternate" hreflang="x-default" href="${base}${lang === "en" ? altPath : path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Salle d'attente"><meta property="og:locale" content="${T(lang, "fr_CA", "en_CA")}">
<meta property="og:title" content="${esc(titleText)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${base}${path}"><meta property="og:image" content="${base}/og-image.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#1f5fae">
<style>${CSS}</style></head><body><main>
<a class="langlink" href="${altPath}" lang="${T(lang, "en", "fr")}">${T(lang, "English", "Français")}</a>
<a class="top" href="/" style="display:inline-flex;align-items:center;gap:8px"><img src="/logo.svg" alt="" width="28" height="28" style="border-radius:7px"> ← Salle d'attente</a>
${body}
<footer>
<p><b>${T(lang, "Urgence grave (douleur à la poitrine, AVC, difficulté à respirer) : composez le 911 sans attendre.", "Serious emergency (chest pain, stroke, trouble breathing): call 911 right away.")}</b> ${T(lang, "Besoin d'un conseil : Info-Santé 811.", "For advice: Info-Santé 811.")}</p>
<p>${T(lang, "Données : ministère de la Santé et des Services sociaux du Québec, relevé horaire des urgences (licence CC BY 4.0). Salle d'attente est un projet indépendant, sans lien avec le ministère ni Santé Québec.", "Data: Québec Ministère de la Santé et des Services sociaux, hourly emergency room report (CC BY 4.0 licence). Salle d'attente is an independent project, not affiliated with the ministry or Santé Québec.")} <a href="/#apropos">${T(lang, "À propos", "About")}</a> · <a href="/#confidentialite">${T(lang, "Confidentialité", "Privacy")}</a></p>
</footer></main>
<script>try{navigator.sendBeacon&&!(navigator.globalPrivacyControl===true||navigator.doNotTrack==="1")&&navigator.sendBeacon("/api/stat","visite vue:region-page langue:${lang}")}catch(e){}</script>
</body></html>`;
}

function hhmm(updated) {
  const m = String(updated || "").match(/(\d{1,2})[:h](\d{2})/);
  return m ? `${+m[1]} h ${m[2]}` : null;
}

function hhmmEn(updated) {
  const m = String(updated || "").match(/(\d{1,2})[:h](\d{2})/);
  if (!m) return null;
  const h = +m[1], ap = h < 12 ? "a.m." : "p.m.", h12 = h % 12 || 12;
  return `${h12}:${m[2]} ${ap}`;
}

function regionPage(base, reg, all, lang) {
  const [code, slug, name, deName, slugEn, nameEn, inName] = reg;
  const en = lang === "en";
  const list = all.filter((h) => h.region === code).sort((a, b) => score(a) - score(b));
  const unknown = list.filter((h) => !h.kids && !h.psy && !h.cardio && (h.rate === null || h.rate === undefined)).length;
  const best = list.find((h) => !h.kids && !h.psy && !h.cardio && h.rate !== null && h.rate !== undefined);
  const upd = (list.find((h) => h.updated) || {}).updated;
  const updated = en ? hhmmEn(upd) : hhmm(upd);
  const general = list.filter((h) => !h.kids && !h.psy && !h.cardio);
  const special = list.filter((h) => h.kids || h.psy || h.cardio);
  const item = (h) => {
    const [cls, label] = status(h.rate, lang);
    const pct = h.rate === null || h.rate === undefined ? null : Math.round(h.rate * 100);
    const tags = [h.kids && T(lang, "Enfants", "Children"), h.psy && T(lang, "Psychiatrie", "Psychiatry"), h.cardio && T(lang, "Cardiologie", "Cardiology")].filter(Boolean).map((t) => `<span class="tag">${t}</span>`).join("");
    const occ = pct === null ? T(lang, "Occupation des civières non transmise", "Stretcher occupancy not reported") : T(lang, `${pct} % des civières occupées (${fmt(h.occ)}/${fmt(h.stretchers)})`, `${pct}% of stretchers in use (${fmt(h.occ)}/${fmt(h.stretchers)})`);
    const pec = h.pec === null || h.pec === undefined ? "" : T(lang, ` · ${fmt(h.pec)} en attente d'un médecin`, ` · ${fmt(h.pec)} waiting for a doctor`);
    const o24 = h.over24 ? T(lang, ` · ${fmt(h.over24)} sur civière depuis plus de 24 h`, ` · ${fmt(h.over24)} on a stretcher for over 24 h`) : "";
    return `<li><h3><a href="/#fiche=${encodeURIComponent(h.name)}">${esc(title(h.name))}</a>${tags}</h3>
<div class="where">${esc(h.address || h.area || "")}</div>
<div class="nums"><span class="pill ${cls}">${label}</span>${occ}${pec}${o24}</div></li>`;
  };
  const items = general.map(item).join("\n");
  const specialHtml = special.length ? `<h2>${T(lang, "Urgences spécialisées", "Specialized emergency rooms")}</h2>
<p class="where">${T(lang, "Réservées à certains patients : enfants, santé mentale ou problèmes cardiaques déjà suivis. Ne vous y rendez que si elles vous concernent. Détresse psychologique : Info-Social 811 (option 2) ou 9-8-8.", "For certain patients only: children, mental health, or heart problems already followed there. Go only if they apply to you. Psychological distress: Info-Social 811 (option 2) or 9-8-8.")}</p>
<ol class="er">${special.map(item).join("\n")}</ol>` : "";
  const baseP = en ? EN_BASE : FR_BASE;
  const others = REGIONS.filter((r) => r[0] !== code && all.some((h) => h.region === r[0])).map((r) => `<li><a href="${baseP}/${en ? r[4] : r[1]}">${esc(en ? r[5] : r[2])}</a></li>`).join("");
  const n = general.length, bestName = best ? esc(title(best.name)) : "";
  const titleText = en ? `Emergency rooms ${inName.replace(/ \(.*\)$/, "")}: wait and crowding in real time` : `Urgences ${deName.replace(/ \(.*\)$/, "")} : attente et achalandage en temps réel`;
  const description = en
    ? `The ${list.length} emergency rooms ${inName}, from least to most crowded: stretchers in use and people waiting for a doctor, updated every hour with Québec Health Ministry data.`
    : `Les ${list.length} urgences ${deName}, de la moins à la plus remplie : civières occupées et personnes en attente d'un médecin, mis à jour chaque heure avec les données du ministère de la Santé.`;
  const body = en ? `<h1>Emergency rooms ${esc(inName)}</h1>
<p class="lead">From least to most crowded${updated ? `, as of the ${updated} report` : ""}. Québec Health Ministry data, updated every hour. Hospital names and addresses are shown in French, as published.</p>
${best ? `<p>Right now, the least crowded emergency room in the region is <b>${bestName}</b> (${Math.round(best.rate * 100)}% of stretchers in use).</p>` : ""}
<a class="cta" href="/">See the map, distance and driving time</a>
<p class="alert">A less crowded emergency room is not always faster for you: triage sees the most serious cases first. <b>Serious emergency: 911.</b> To find out where to go: Info-Santé 811.</p>
<h2>${n} emergency room${n > 1 ? "s" : ""} open to everyone${unknown ? ` (${unknown} ${unknown > 1 ? "do" : "does"} not report occupancy)` : ""}</h2>
<ol class="er">${items || "<li>No general emergency room in the ministry file for this region right now.</li>"}</ol>
${specialHtml}
<p class="where">“Light”: under 90% of stretchers in use · “Busy”: 90 to 130% · “Overcrowded”: over 130%. An emergency room can exceed 100%: patients then wait on extra stretchers.</p>
<h2>Other regions</h2><ul class="regions">${others}</ul>`
  : `<h1>Urgences ${esc(deName)}</h1>
<p class="lead">De la moins à la plus remplie${updated ? `, selon le relevé de ${updated}` : ""}. Données du ministère de la Santé, mises à jour chaque heure.</p>
${best ? `<p>En ce moment, l'urgence la moins remplie de la région est <b>${bestName}</b> (${Math.round(best.rate * 100)} % des civières occupées).</p>` : ""}
<a class="cta" href="/">Voir la carte, la distance et le temps de route</a>
<p class="alert">Une urgence moins remplie n'est pas toujours la plus rapide pour vous : le triage passe les cas graves en premier. <b>Urgence grave : 911.</b> Pour savoir où consulter : Info-Santé 811.</p>
<h2>${n} urgence${n > 1 ? "s" : ""} pour tous${unknown ? ` (${unknown} ne transmet${unknown > 1 ? "tent" : ""} pas l'occupation)` : ""}</h2>
<ol class="er">${items || "<li>Aucune urgence générale dans le fichier du ministère pour cette région en ce moment.</li>"}</ol>
${specialHtml}
<p class="where">« Fluide » : moins de 90 % des civières occupées · « Chargée » : 90 à 130 % · « Débordée » : plus de 130 %. Une urgence peut dépasser 100 % : des patients attendent alors sur des civières supplémentaires.</p>
<h2>Autres régions</h2><ul class="regions">${others}</ul>`;
  const frPath = `${FR_BASE}/${slug}`, enPath = `${EN_BASE}/${slugEn}`;
  return page({ base, lang, path: en ? enPath : frPath, altPath: en ? frPath : enPath, titleText, description, body });
}

function indexPage(base, all, lang) {
  const en = lang === "en";
  const rows = REGIONS.map((r) => {
    const n = all.filter((h) => h.region === r[0]).length;
    return n ? `<li><a href="${en ? EN_BASE + "/" + r[4] : FR_BASE + "/" + r[1]}">${esc(en ? r[5] : r[2])}</a> (${n})</li>` : "";
  }).join("");
  return page({
    base, lang, path: en ? EN_BASE : FR_BASE, altPath: en ? FR_BASE : EN_BASE,
    titleText: T(lang, "Urgences du Québec par région : attente en temps réel", "Québec emergency rooms by region: wait times in real time"),
    description: T(lang, "Toutes les urgences du Québec par région, de la moins à la plus remplie, mises à jour chaque heure avec les données du ministère de la Santé.", "Every emergency room in Québec by region, from least to most crowded, updated every hour with Québec Health Ministry data."),
    body: T(lang, `<h1>Urgences du Québec par région</h1><p class="lead">Choisissez une région pour voir ses urgences, de la moins à la plus remplie. Mises à jour chaque heure.</p>
<a class="cta" href="/">Ouvrir l'application (carte, distance, alertes)</a><ul class="regions">${rows}</ul>`,
      `<h1>Québec emergency rooms by region</h1><p class="lead">Choose a region to see its emergency rooms, from least to most crowded. Updated every hour.</p>
<a class="cta" href="/">Open the app (map, distance, alerts)</a><ul class="regions">${rows}</ul>`),
  });
}

// Renvoie le HTML d'une page, ou null si l'adresse n'est pas une page de région.
function render(pathname, base, all) {
  const p = pathname.replace(/\/+$/, "");
  if (p === FR_BASE) return indexPage(base, all, "fr");
  if (p === EN_BASE) return indexPage(base, all, "en");
  let m = p.match(/^\/urgences\/([a-z-]+)$/);
  if (m && BY_SLUG.has(m[1])) return regionPage(base, BY_SLUG.get(m[1]), all, "fr");
  m = p.match(/^\/en\/emergency-rooms\/([a-z-]+)$/);
  if (m && BY_SLUG_EN.has(m[1])) return regionPage(base, BY_SLUG_EN.get(m[1]), all, "en");
  return null;
}
// Seulement les régions qui ont au moins une urgence dans le fichier du ministère (pas de page vide pour Google).
const sitemapPaths = (all) => {
  const has = (r) => !all || all.some((h) => h.region === r[0]);
  return [FR_BASE, EN_BASE, ...REGIONS.filter(has).map((r) => FR_BASE + "/" + r[1]), ...REGIONS.filter(has).map((r) => EN_BASE + "/" + r[4])];
};

module.exports = { render, sitemapPaths, REGIONS };
