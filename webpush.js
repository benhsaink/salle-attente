// Salle d'attente — envoi de notifications Web Push, sans dépendance (module crypto de Node)
// Chiffrement : RFC 8291 (aes128gcm). Identification du serveur : VAPID (RFC 8292), clés dans Render :
//   VAPID_PUBLIC (65 octets en base64url) et VAPID_PRIVATE (32 octets en base64url), VAPID_SUBJECT (mailto:...).
const crypto = require("crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

// Paire de clés VAPID (à générer une seule fois)
function generateVAPIDKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function privateKeyObject(pub, priv) {
  const P = unb64u(pub);
  return crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(unb64u(priv)), x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33, 65)) }, format: "jwk" });
}

function vapidHeader(endpoint, vapid) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject }));
  const data = header + "." + claims;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: privateKeyObject(vapid.publicKey, vapid.privateKey), dsaEncoding: "ieee-p1363" });
  return "vapid t=" + data + "." + b64u(sig) + ", k=" + vapid.publicKey;
}

// Chiffre un message pour un abonnement { keys: { p256dh, auth } }. salt et asKey servent seulement aux tests.
function encrypt(payload, keys, salt = crypto.randomBytes(16), asKey = null) {
  const uaPublic = unb64u(keys.p256dh), authSecret = unb64u(keys.auth);
  const ecdh = crypto.createECDH("prime256v1");
  if (asKey) ecdh.setPrivateKey(unb64u(asKey)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Envoie ; renvoie { ok, status, expired } (expired : abonnement à supprimer, codes 404/410).
async function sendPush(subscription, payload, vapid, ttl = 6 * 3600) {
  const body = encrypt(typeof payload === "string" ? payload : JSON.stringify(payload), subscription.keys);
  const r = await fetch(subscription.endpoint, {
    method: "POST",
    headers: { Authorization: vapidHeader(subscription.endpoint, vapid), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal" },
    body, signal: AbortSignal.timeout(15e3),
  });
  return { ok: r.ok, status: r.status, expired: r.status === 404 || r.status === 410 };
}

module.exports = { generateVAPIDKeys, encrypt, vapidHeader, sendPush, b64u, unb64u };
