// Salle d'attente — statistiques d'utilisation, sans témoin ni renseignement personnel
// Le navigateur envoie un mot-clé par geste (« vue:cliniques », « filtre:c-nocov »…), une seule fois par visite.
// Le serveur ne garde que des compteurs par jour : ni adresse IP, ni identifiant, ni appareil, ni heure précise.
// Stockage : table « statistiques » de Supabase (voir LISEZMOI), envoyée toutes les 10 minutes.
// Lecture : /api/statistiques?jours=30 (avec &cle=STATS_KEY si la variable STATS_KEY est réglée dans Render).
const ENV = process.env;
const sbOrigin = (u) => { try { return new URL(String(u).trim()).origin; } catch (e) { return ""; } };
const SB = ENV.SUPABASE_URL && ENV.SUPABASE_KEY ? { url: sbOrigin(ENV.SUPABASE_URL) + "/rest/v1/statistiques", key: ENV.SUPABASE_KEY.trim() } : null;
const KEY_RE = /^(visite|vue|filtre|region|tri|action|langue|app)(:[a-z0-9_-]{1,30}){0,2}$/;
const MAX_KEYS_PER_DAY = 400;
const BOT_RE = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|node-fetch|headless|lighthouse/i;

let pending = new Map(); // « jour|clé » -> nombre pas encore envoyé
const seenToday = new Map(); // jour -> Set des clés (limite de sécurité)
const recent = new Map(); // adresse IP -> envois de la dernière minute (en mémoire seulement, jamais écrit)
let warned = false;

function quebecDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function headers(extra) {
  const h = { apikey: SB.key, "Content-Type": "application/json", Accept: "application/json", ...extra };
  if (/^eyJ/.test(SB.key)) h.Authorization = "Bearer " + SB.key;
  return h;
}

function count(key) {
  if (!KEY_RE.test(key)) return false;
  const day = quebecDay();
  if (!seenToday.has(day)) { seenToday.clear(); seenToday.set(day, new Set()); }
  const seen = seenToday.get(day);
  if (!seen.has(key) && seen.size >= MAX_KEYS_PER_DAY) return false;
  seen.add(key);
  const k = day + "|" + key;
  pending.set(k, (pending.get(k) || 0) + 1);
  return true;
}

// Envoie les compteurs en attente : lit les valeurs du jour, additionne, réécrit (un seul serveur, pas de conflit).
async function flush() {
  if (!SB || !pending.size) return;
  const batch = pending; pending = new Map();
  try {
    const byDay = new Map();
    for (const [k, n] of batch) { const [jour, cle] = k.split("|"); if (!byDay.has(jour)) byDay.set(jour, []); byDay.get(jour).push({ cle, n }); }
    for (const [jour, rows] of byDay) {
      const r = await fetch(SB.url + "?select=cle,n&jour=eq." + jour, { headers: headers(), signal: AbortSignal.timeout(15e3) });
      if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 160));
      const old = new Map((await r.json()).map((x) => [x.cle, x.n]));
      const body = rows.map(({ cle, n }) => ({ jour, cle, n: (old.get(cle) || 0) + n }));
      const w = await fetch(SB.url + "?on_conflict=jour,cle", { method: "POST", headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(body), signal: AbortSignal.timeout(15e3) });
      if (!w.ok) throw new Error("HTTP " + w.status + " " + (await w.text()).slice(0, 160));
    }
  } catch (err) {
    for (const [k, n] of batch) pending.set(k, (pending.get(k) || 0) + n); // on réessaiera
    if (pending.size > 5000) pending = new Map(); // table absente depuis longtemps : on abandonne
    if (!warned) { console.warn("Statistiques non enregistrées :", err.message); warned = true; }
  }
}

async function read(days) {
  const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  let rows = [];
  if (SB) {
    const r = await fetch(SB.url + "?select=jour,cle,n&jour=gte." + since + "&order=jour.desc", { headers: headers(), signal: AbortSignal.timeout(15e3) });
    if (!r.ok) throw new Error("Supabase HTTP " + r.status + " " + (await r.text()).slice(0, 160));
    rows = await r.json();
  }
  for (const [k, n] of pending) { const [jour, cle] = k.split("|"); const row = rows.find((x) => x.jour === jour && x.cle === cle); if (row) row.n += n; else rows.push({ jour, cle, n }); }
  const total = {};
  for (const x of rows) total[x.cle] = (total[x.cle] || 0) + x.n;
  const parJour = {};
  for (const x of rows) if (x.cle === "visite") parJour[x.jour] = x.n;
  return { depuis: since, jours: days, total: Object.fromEntries(Object.entries(total).sort((a, b) => b[1] - a[1])), visitesParJour: parJour };
}

async function handle(req, res, url, readBody) {
  const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
  if (url.pathname === "/api/stat" && req.method === "POST") {
    const ua = req.headers["user-agent"] || "";
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const now = Date.now(), list = (recent.get(ip) || []).filter((t) => now - t < 60e3);
    if (!BOT_RE.test(ua) && list.length < 60) {
      list.push(now); recent.set(ip, list);
      let body = ""; try { body = await readBody(req, 2000); } catch (e) {}
      String(body).split(/[\s,]+/).slice(0, 20).forEach((k) => count(k.trim()));
    }
    res.writeHead(204, { "Cache-Control": "no-store" }); return res.end();
  }
  if (url.pathname === "/api/statistiques") {
    if (ENV.STATS_KEY && url.searchParams.get("cle") !== ENV.STATS_KEY) return json(403, { error: "Clé requise." });
    const days = Math.min(400, Math.max(1, parseInt(url.searchParams.get("jours") || "30", 10) || 30));
    try { return json(200, { stockage: SB ? "supabase" : "mémoire seulement", ...(await read(days)) }); }
    catch (err) { return json(500, { error: err.message }); }
  }
  return false;
}

setInterval(() => { flush(); for (const [ip, l] of recent) if (!l.some((t) => Date.now() - t < 60e3)) recent.delete(ip); }, 10 * 60e3).unref();
process.on("SIGTERM", () => { flush().finally(() => process.exit(0)); });

module.exports = { handle, count, flush, KEY_RE };
