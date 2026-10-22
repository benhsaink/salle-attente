// Salle d'attente — alertes (bêta gratuite)
// Trois alertes : « urgence qui se vide » (sous un seuil d'occupation), « meilleure urgence près de moi »
// (quand elle change) et « résumé quotidien » (à l'heure choisie). Deux canaux : notification (Web Push,
// site installé sur l'écran d'accueil) ou courriel (Brevo, après confirmation de l'adresse).
//
// Réglages dans Render (Environment) — sans eux, les alertes restent désactivées :
//   SUPABASE_URL, SUPABASE_KEY   base de données des abonnements (table « abonnements », voir LISEZMOI)
//   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT   notifications
//   BREVO_KEY, ALERT_FROM        courriels (ALERT_FROM = adresse d'expéditeur validée dans Brevo)
//   SITE_URL                     adresse publique du site (liens dans les courriels)
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sendPush } = require("./webpush");

const ENV = process.env;
const SITE_URL = (ENV.SITE_URL || "https://salle-attente.onrender.com").replace(/\/$/, "");
const VAPID = ENV.VAPID_PUBLIC && ENV.VAPID_PRIVATE ? { publicKey: ENV.VAPID_PUBLIC, privateKey: ENV.VAPID_PRIVATE, subject: ENV.VAPID_SUBJECT || "mailto:" + (ENV.ALERT_FROM || "alertes@example.com") } : null;
const BREVO = ENV.BREVO_KEY && ENV.ALERT_FROM ? { key: ENV.BREVO_KEY, from: ENV.ALERT_FROM } : null;
const LOCAL = ENV.ALERTES_LOCAL === "1"; // essais seulement : fichier local au lieu de Supabase
const MAX_ABONNES = 5000;

// ---------- Stockage (Supabase, API REST) ----------
// On ne garde que l'origine (https://xxxx.supabase.co), même si l'adresse collée contient /rest/v1/ ou autre chose.
const sbOrigin = (u) => { try { return new URL(String(u).trim()).origin; } catch (e) { return String(u).trim().replace(/\/.*$/, ""); } };
const SB = ENV.SUPABASE_URL && ENV.SUPABASE_KEY ? { url: sbOrigin(ENV.SUPABASE_URL) + "/rest/v1/abonnements", key: ENV.SUPABASE_KEY.trim() } : null;
const LOCAL_FILE = path.join(__dirname, "data-local", "abonnements.json");
function sbHeaders(extra) {
  const h = { apikey: SB.key, "Content-Type": "application/json", Accept: "application/json", ...extra };
  if (/^eyJ/.test(SB.key)) h.Authorization = "Bearer " + SB.key; // anciennes clés (JWT) seulement
  return h;
}
async function sb(method, query, body, prefer) {
  const r = await fetch(SB.url + (query || ""), { method, headers: sbHeaders(prefer ? { Prefer: prefer } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15e3) });
  if (!r.ok) throw new Error("Supabase HTTP " + r.status + " " + (await r.text()).slice(0, 200));
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const readLocal = () => { try { return JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")); } catch (e) { return []; } };
const writeLocal = (rows) => { fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true }); fs.writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 1)); };
const store = {
  ready: () => !!SB || LOCAL,
  async all() { return SB ? sb("GET", "?select=*&confirme=eq.true") : readLocal().filter((r) => r.confirme); },
  async count() { return SB ? (await sb("GET", "?select=jeton")).length : readLocal().length; },
  async get(jeton) { return SB ? (await sb("GET", "?select=*&jeton=eq." + encodeURIComponent(jeton)))[0] || null : readLocal().find((r) => r.jeton === jeton) || null; },
  async byEndpoint(ep) { return SB ? (await sb("GET", "?select=*&canal=eq.push&push->>endpoint=eq." + encodeURIComponent(ep)))[0] || null : readLocal().find((r) => r.push && r.push.endpoint === ep) || null; },
  async byEmail(c) { return SB ? (await sb("GET", "?select=*&canal=eq.courriel&courriel=eq." + encodeURIComponent(c)))[0] || null : readLocal().find((r) => r.courriel === c) || null; },
  async insert(rec) { if (SB) return (await sb("POST", "", rec, "return=representation"))[0]; const rows = readLocal(); rows.push(rec); writeLocal(rows); return rec; },
  async update(jeton, patch) {
    patch = { ...patch, modifie_le: new Date().toISOString() };
    if (SB) return sb("PATCH", "?jeton=eq." + encodeURIComponent(jeton), patch);
    const rows = readLocal(), i = rows.findIndex((r) => r.jeton === jeton); if (i >= 0) { rows[i] = { ...rows[i], ...patch }; writeLocal(rows); }
  },
  // Inscriptions par courriel jamais confirmées : effacées après 7 jours (politique de confidentialité).
  async purgeUnconfirmed() {
    const limit = new Date(Date.now() - 7 * 86400e3).toISOString();
    if (SB) return sb("DELETE", "?confirme=eq.false&cree_le=lt." + encodeURIComponent(limit));
    writeLocal(readLocal().filter((r) => r.confirme || !r.cree_le || r.cree_le >= limit));
  },
  async remove(jeton) { if (SB) return sb("DELETE", "?jeton=eq." + encodeURIComponent(jeton)); writeLocal(readLocal().filter((r) => r.jeton !== jeton)); },
};

// ---------- Utilitaires ----------
const T = (lang, fr, en) => (lang === "en" ? en : fr);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const score = (h) => (h.rate ?? 2) * 100 + (h.pec ?? 30) * 1.5;
const pct = (h) => (h.rate === null || h.rate === undefined ? null : Math.round(h.rate * 100));
function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function quebecNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
// Urgences d'une zone (région, ou rayon autour d'une position arrondie), sans les urgences spécialisées.
function inZone(all, zone) {
  return all.filter((h) => h.region !== "autre" && !h.psy && !h.kids && !h.cardio && h.rate !== null && h.rate !== undefined)
    .filter((h) => zone.region ? h.region === zone.region : (typeof h.lat === "number" && km(zone, h) <= (zone.rayon || 25)));
}
const ficheUrl = (name) => SITE_URL + "/#fiche=" + encodeURIComponent(name);

// ---------- Envoi ----------
async function sendEmail(to, subject, text, html, replyTo) {
  if (!BREVO) throw new Error("Courriels non configurés");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", signal: AbortSignal.timeout(15e3),
    headers: { "api-key": BREVO.key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Salle d'attente", email: BREVO.from }, to: [{ email: to }], subject, textContent: text, htmlContent: html, ...(replyTo ? { replyTo: { email: replyTo } } : {}) }),
  });
  if (!r.ok) throw new Error("Brevo HTTP " + r.status + " " + (await r.text()).slice(0, 200));
}
function emailFrame(lang, jeton, bodyHtml) {
  const unsub = SITE_URL + "/api/alertes/desabonner?jeton=" + jeton, manage = SITE_URL + "/#alertes=" + jeton;
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1b2430;max-width:560px">${bodyHtml}
<p style="background:#fbe4e2;padding:10px 12px;border-radius:8px">${T(lang, "Urgence grave ? N'attendez pas : composez le 911.", "Serious emergency? Don't wait: call 911.")}</p>
<p style="font-size:12px;color:#5b6675">${T(lang, "Vous recevez ce courriel parce que vous avez demandé des alertes sur", "You are receiving this email because you asked for alerts on")} <a href="${SITE_URL}">Salle d'attente</a>.
<a href="${manage}">${T(lang, "Modifier mes alertes", "Change my alerts")}</a> · <a href="${unsub}">${T(lang, "Me désabonner", "Unsubscribe")}</a></p></div>`;
}
// Envoie une alerte à un abonné ; supprime les abonnements push expirés.
async function deliver(sub, msg) {
  if (sub.canal === "push") {
    if (!VAPID) return false;
    const r = await sendPush(sub.push, { title: msg.title, body: msg.body, url: msg.url || "/", tag: msg.tag }, VAPID);
    if (r.expired) { await store.remove(sub.jeton); console.log("ALERTE push expirée, abonnement supprimé"); }
    return r.ok;
  }
  const lang = sub.langue;
  const html = emailFrame(lang, sub.jeton, `<h2 style="font-size:18px;margin:0 0 8px">${esc(msg.title)}</h2>${msg.html || "<p>" + esc(msg.body) + "</p>"}<p><a href="${msg.url || SITE_URL}">${T(lang, "Voir sur Salle d'attente", "See on Salle d'attente")}</a></p>`);
  await sendEmail(sub.courriel, msg.title, msg.body + "\n\n" + (msg.url || SITE_URL) + "\n\n" + T(lang, "Urgence grave : 911. Se désabonner : ", "Serious emergency: 911. Unsubscribe: ") + SITE_URL + "/api/alertes/desabonner?jeton=" + sub.jeton, html);
  return true;
}

// ---------- Moteur (appelé toutes les 15 minutes) ----------
let lastPurge = 0;
const QUIET = (h) => h >= 23 || h < 7; // pas d'alerte « seuil » ni « meilleure » la nuit
async function runAlerts(getData, clock) { // clock : { date, hour } pour les essais
  if (!store.ready() || (!VAPID && !BREVO)) return;
  if (Date.now() - lastPurge > 24 * 3600e3) { lastPurge = Date.now(); store.purgeUnconfirmed().catch((err) => console.error("Purge des inscriptions :", err.message)); }
  let subs, data;
  try { [subs, data] = await Promise.all([store.all(), getData()]); } catch (err) { console.error("Alertes :", err.message); return; }
  const all = data.all, now = clock || quebecNow(), t = Date.now();
  let sent = 0;
  for (const s of subs) {
    const a = s.alertes || {}, etat = s.etat || {}, lang = s.langue;
    const msgs = [];
    const emailToday = etat.courrielsJour === now.date ? etat.courrielsN || 0 : 0;
    // 1. Urgence qui se vide
    if (a.seuil && a.seuil.actif) {
      const seuil = Math.min(150, Math.max(30, Number(a.seuil.pct) || 80));
      etat.seuil = etat.seuil || {};
      for (const name of (a.seuil.urgences || []).slice(0, 5)) {
        const h = all.find((x) => x.name === name); if (!h || pct(h) === null) continue;
        const prev = etat.seuil[name] || {}, below = pct(h) < seuil;
        if (below && !prev.sous && !QUIET(now.hour) && t - (prev.envoye || 0) > 3 * 3600e3) {
          msgs.push({ tag: "seuil-" + name, url: ficheUrl(name), title: T(lang, "Urgence moins remplie : ", "Less crowded ER: ") + name,
            body: T(lang, `${pct(h)} % des civières occupées (votre seuil : ${seuil} %). ${h.pec ?? "?"} personne(s) en attente d'un médecin.`, `${pct(h)}% of stretchers in use (your threshold: ${seuil}%). ${h.pec ?? "?"} people waiting for a doctor.`) });
          etat.seuil[name] = { sous: true, envoye: t };
        } else etat.seuil[name] = { ...prev, sous: below };
      }
    }
    // 2. Meilleure urgence près de moi
    if (a.meilleure && a.meilleure.actif && s.zone) {
      const best = inZone(all, s.zone).sort((x, y) => score(x) - score(y))[0];
      const prev = etat.meilleure || {};
      if (best && best.name !== prev.nom) {
        if (prev.nom && !QUIET(now.hour) && t - (prev.envoye || 0) > 2 * 3600e3) {
          msgs.push({ tag: "meilleure", url: ficheUrl(best.name), title: T(lang, "Nouveau meilleur choix : ", "New best choice: ") + best.name,
            body: T(lang, `${pct(best)} % des civières occupées, ${best.pec ?? "?"} en attente d'un médecin. ${best.area || ""}`, `${pct(best)}% of stretchers in use, ${best.pec ?? "?"} waiting for a doctor. ${best.area || ""}`).trim() });
          etat.meilleure = { nom: best.name, envoye: t };
        } else if (!prev.nom) etat.meilleure = { nom: best.name, envoye: 0 };
      }
    }
    // 3. Résumé quotidien
    if (a.resume && a.resume.actif && s.zone) {
      const heure = Math.min(22, Math.max(5, Number(a.resume.heure) || 7));
      if (now.hour === heure && etat.resume !== now.date) {
        const top = inZone(all, s.zone).sort((x, y) => score(x) - score(y)).slice(0, 3);
        if (top.length) {
          const lines = top.map((h, i) => `${i + 1}. ${h.name} : ${pct(h)} %, ${h.pec ?? "?"} ${T(lang, "en attente", "waiting")}`);
          msgs.push({ tag: "resume", url: SITE_URL + "/#urgences", title: T(lang, "Résumé : vos urgences les moins remplies", "Summary: your least crowded ERs"),
            body: lines.join("\n"), html: "<ol>" + top.map((h) => `<li><a href="${ficheUrl(h.name)}">${esc(h.name)}</a> : ${pct(h)} % ${T(lang, "des civières occupées", "of stretchers in use")}, ${h.pec ?? "?"} ${T(lang, "en attente", "waiting")}</li>`).join("") + "</ol>" });
        }
        etat.resume = now.date;
      }
    }
    // Envoi (courriel : 4 alertes par jour au maximum)
    let n = emailToday;
    for (const m of msgs) {
      if (s.canal === "courriel" && n >= 4) break;
      try { if (await deliver(s, m)) { sent++; n++; } } catch (err) { console.error("Alerte non envoyée :", err.message); }
    }
    if (s.canal === "courriel") { etat.courrielsJour = now.date; etat.courrielsN = n; }
    try { await store.update(s.jeton, { etat }); } catch (err) { console.error("État d'alerte :", err.message); }
  }
  if (sent) console.log(`ALERTES ${sent} envoyée(s) à ${subs.length} abonné(s)`);
}

// ---------- Validation des choix ----------
const REGIONS = /^(mtl|lav|rs|rn|qc|tr|r\d\d)$/;
function cleanChoice(d, names) {
  const a = d.alertes || {};
  const alertes = {
    seuil: { actif: !!(a.seuil && a.seuil.actif), pct: Math.min(150, Math.max(30, Number(a.seuil && a.seuil.pct) || 80)),
      urgences: [...new Set(((a.seuil && a.seuil.urgences) || []).map(String))].filter((n) => names.has(n)).slice(0, 5) },
    meilleure: { actif: !!(a.meilleure && a.meilleure.actif) },
    resume: { actif: !!(a.resume && a.resume.actif), heure: Math.min(22, Math.max(5, Number(a.resume && a.resume.heure) || 7)) },
  };
  let zone = null;
  const z = d.zone || {};
  if (REGIONS.test(z.region || "")) zone = { region: z.region };
  else if (isFinite(z.lat) && isFinite(z.lon)) zone = { lat: Math.round(z.lat * 100) / 100, lon: Math.round(z.lon * 100) / 100, rayon: Math.min(100, Math.max(5, Number(z.rayon) || 25)) };
  if (alertes.seuil.actif && !alertes.seuil.urgences.length) return { error: "Choisissez au moins une urgence pour l'alerte de seuil." };
  if ((alertes.meilleure.actif || alertes.resume.actif) && !zone) return { error: "Choisissez une région ou votre position." };
  if (!alertes.seuil.actif && !alertes.meilleure.actif && !alertes.resume.actif) return { error: "Choisissez au moins une alerte." };
  return { alertes, zone };
}

// ---------- Adresses du serveur (/api/alertes...) ----------
const asked = new Map();
function readBody(req, max = 8000) {
  return new Promise((resolve, reject) => {
    let b = ""; req.on("data", (c) => { b += c; if (b.length > max) { reject(new Error("trop long")); req.destroy(); } });
    req.on("end", () => resolve(b)); req.on("error", reject);
  });
}
async function handle(req, res, url, getData) {
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const page = (title, text) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;line-height:1.5"><h1 style="font-size:1.3rem">${esc(title)}</h1><p>${text}</p><p><a href="/">Salle d'attente</a></p>`); };
  const p = url.pathname;
  if (p === "/api/alertes/config") {
    let base = store.ready() ? "ok" : "non configurée";
    // Diagnostic : ?test=1 vérifie la connexion à la base (sans rien révéler des abonnés)
    if (url.searchParams.get("test") === "1" && store.ready()) { try { await store.count(); } catch (err) { base = "erreur : " + err.message.replace(/sb_[a-z]+_[\w-]+|eyJ[\w.-]+/g, "…").slice(0, 300); } }
    return json(200, { actif: store.ready() && (!!VAPID || !!BREVO), push: store.ready() && !!VAPID, courriel: store.ready() && !!BREVO, vapidPublic: VAPID ? VAPID.publicKey : null, base });
  }
  if (!store.ready()) return json(503, { error: "Les alertes ne sont pas encore activées." });

  if (p === "/api/alertes/confirmer") {
    const s = await store.get(url.searchParams.get("jeton") || "");
    if (!s) return page("Lien expiré", "Cet abonnement n'existe plus. Vous pouvez en créer un nouveau sur le site.");
    await store.update(s.jeton, { confirme: true });
    return page(T(s.langue, "Alertes activées", "Alerts activated"), T(s.langue, "Merci ! Votre adresse est confirmée : vous recevrez vos alertes par courriel. Chaque courriel contient un lien pour vous désabonner.", "Thank you! Your address is confirmed: you will receive your alerts by email. Every email has an unsubscribe link."));
  }
  if (p === "/api/alertes/desabonner") {
    const s = await store.get(url.searchParams.get("jeton") || "");
    if (s) await store.remove(s.jeton);
    return page(T(s && s.langue, "Désabonnement fait", "Unsubscribed"), T(s && s.langue, "Vous ne recevrez plus d'alertes. Vos coordonnées ont été supprimées.", "You will no longer receive alerts. Your details have been deleted."));
  }
  if (p !== "/api/alertes") return json(404, { error: "Introuvable" });

  const jeton = url.searchParams.get("jeton") || "";
  if (req.method === "GET") {
    const s = jeton && await store.get(jeton);
    if (!s) return json(404, { error: "Abonnement introuvable." });
    return json(200, { canal: s.canal, courriel: s.courriel ? s.courriel.replace(/^(.).*(@.*)$/, "$1…$2") : null, confirme: s.confirme, alertes: s.alertes, zone: s.zone, langue: s.langue });
  }
  if (req.method === "DELETE") { if (jeton) await store.remove(jeton); return json(200, { ok: true }); }
  if (req.method !== "POST" && req.method !== "PUT") return json(405, { error: "Méthode non permise" });

  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), recent = (asked.get(ip) || []).filter((x) => now - x < 3600e3);
  if (recent.length >= 10) return json(429, { error: "Trop de demandes. Réessayez dans une heure." });
  recent.push(now); asked.set(ip, recent); if (asked.size > 5000) asked.clear();

  let d; try { d = JSON.parse(await readBody(req)); } catch (e) { return json(400, { error: "Demande illisible." }); }
  if (d.site_web) return json(200, { ok: true });
  // Noms d'urgences valides ; si les données du ministère sont momentanément indisponibles, on accepte les noms reçus.
  let names;
  try { names = new Set((await getData()).all.map((h) => h.name)); }
  catch (err) { names = { has: (n) => typeof n === "string" && n.length > 3 && n.length < 200 }; }
  const c = cleanChoice(d, names); if (c.error) return json(400, { error: c.error });
  const langue = d.langue === "en" ? "en" : "fr";

  if (req.method === "PUT") {
    const s = jeton && await store.get(jeton); if (!s) return json(404, { error: "Abonnement introuvable." });
    await store.update(jeton, { alertes: c.alertes, zone: c.zone, langue, etat: {} });
    return json(200, { ok: true, jeton });
  }

  if (d.canal === "push") {
    if (!VAPID) return json(503, { error: "Les notifications ne sont pas encore activées." });
    const sub = d.push || {};
    if (!/^https:\/\//.test(sub.endpoint || "") || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json(400, { error: "Abonnement aux notifications invalide." });
    const push = { endpoint: String(sub.endpoint).slice(0, 1000), keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } };
    const old = await store.byEndpoint(push.endpoint);
    if (old) { await store.update(old.jeton, { alertes: c.alertes, zone: c.zone, langue, etat: {}, push }); return json(200, { ok: true, jeton: old.jeton }); }
    if ((await store.count()) >= MAX_ABONNES) return json(503, { error: "La bêta est complète pour le moment." });
    const rec = { jeton: crypto.randomBytes(24).toString("base64url"), canal: "push", push, confirme: true, langue, alertes: c.alertes, zone: c.zone, etat: {} };
    await store.insert(rec);
    try { await deliver(rec, { title: T(langue, "Alertes activées", "Alerts activated"), body: T(langue, "Vous recevrez ici vos alertes Salle d'attente. Urgence grave : 911.", "You will get your Salle d'attente alerts here. Serious emergency: 911."), tag: "bienvenue" }); } catch (err) { console.error("Notification de bienvenue :", err.message); }
    return json(200, { ok: true, jeton: rec.jeton });
  }

  if (d.canal === "courriel") {
    if (!BREVO) return json(503, { error: "Les alertes par courriel ne sont pas encore activées." });
    const courriel = String(d.courriel || "").trim().toLowerCase().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(courriel)) return json(400, { error: "Indiquez un courriel valide." });
    if (!d.accord) return json(400, { error: "Cochez la case d'accord pour recevoir les alertes." });
    let rec = await store.byEmail(courriel);
    if (rec) await store.update(rec.jeton, { alertes: c.alertes, zone: c.zone, langue, etat: {} });
    else {
      if ((await store.count()) >= MAX_ABONNES) return json(503, { error: "La bêta est complète pour le moment." });
      rec = { jeton: crypto.randomBytes(24).toString("base64url"), canal: "courriel", courriel, confirme: false, langue, alertes: c.alertes, zone: c.zone, etat: {} };
      await store.insert(rec);
    }
    if (!rec.confirme) {
      const link = SITE_URL + "/api/alertes/confirmer?jeton=" + rec.jeton;
      try {
        await sendEmail(courriel, T(langue, "Confirmez vos alertes Salle d'attente", "Confirm your Salle d'attente alerts"),
          T(langue, "Pour recevoir vos alertes, confirmez votre adresse : ", "To receive your alerts, confirm your address: ") + link,
          emailFrame(langue, rec.jeton, `<p>${T(langue, "Pour recevoir vos alertes, confirmez votre adresse :", "To receive your alerts, confirm your address:")}</p><p><a href="${link}" style="background:#1f5fae;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">${T(langue, "Confirmer mon adresse", "Confirm my address")}</a></p><p style="font-size:13px;color:#5b6675">${T(langue, "Vous n'avez rien demandé ? Ignorez ce courriel : aucune alerte ne sera envoyée.", "Didn't ask for this? Ignore this email: no alerts will be sent.")}</p>`));
      } catch (err) { console.error("Courriel de confirmation :", err.message); return json(502, { error: "Envoi du courriel impossible pour le moment." }); }
    }
    return json(200, { ok: true, jeton: rec.jeton, confirmation: !rec.confirme });
  }
  return json(400, { error: "Choisissez notification ou courriel." });
}

module.exports = { handle, runAlerts, store, inZone, cleanChoice, sendEmail, brevoReady: () => !!BREVO };
