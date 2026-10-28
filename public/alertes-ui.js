// Salle d'attente — page « Alertes » (#alertes, ou #alertes=JETON pour gérer un abonnement)
// Utilise les variables de la page principale : data (urgences), REGIONS, pos, route().
(function () {
  const EN = window.SA_LANG === "en";
  const L = (fr, en) => (EN ? en : fr);
  const KEY = "sa-alertes";
  const getSaved = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
  const setSaved = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} };
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // Le service worker reçoit les notifications ; il est aussi nécessaire pour installer le site.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function chk(label, checked) { const l = el("label", "chk"); const i = el("input"); i.type = "checkbox"; i.checked = !!checked; l.append(i, document.createTextNode(" " + label)); return [l, i]; }
  function b64ToBytes(s) { const p = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
  function panel(title) { const s = el("section", "panel"); if (title) s.appendChild(el("h3", "", title)); return s; }

  async function page(box) {
    const back = el("button", "back", L("‹ Retour", "‹ Back")); back.type = "button";
    back.addEventListener("click", () => { location.hash = "#urgences"; });
    box.appendChild(back);
    document.title = L("Alertes", "Alerts") + " · Salle d'attente";
    const head = el("div", "fh");
    head.append(el("h2", "", L("Alertes · gratuit pendant le lancement", "Alerts · free during launch")),
      el("p", "where", L("Recevez un avis quand une urgence se vide, quand la meilleure urgence près de chez vous change, ou un résumé chaque jour. Gratuit pendant le lancement. Avant tout passage au payant, les inscrits seront avisés au moins 30 jours à l'avance et pourront se désabonner.",
        "Get notified when an ER empties out, when the best ER near you changes, or get a daily summary. Free during launch. Before any paid plan starts, subscribers will be notified at least 30 days in advance and can unsubscribe.")));
    box.appendChild(head);

    const status = el("p", "legend", L("Chargement…", "Loading…")); box.appendChild(status);
    let cfg = {};
    try { cfg = await (await fetch("/api/alertes/config")).json(); } catch (e) {}
    if (!cfg.actif) { status.textContent = L("Les alertes seront offertes très bientôt. Revenez dans quelques jours !", "Alerts will be available very soon. Check back in a few days!"); return; }
    status.remove();

    const jeton = (location.hash.split("=")[1] || getSaved()).trim();
    let existing = null;
    if (jeton) { try { const r = await fetch("/api/alertes?jeton=" + encodeURIComponent(jeton)); if (r.ok) existing = await r.json(); else if (r.status === 404) setSaved(""); } catch (e) {} }
    if (existing) {
      const info = panel(L("Vos alertes sont actives", "Your alerts are active"));
      info.appendChild(el("p", "g-line", existing.canal === "push" ? L("Par notification sur cet appareil.", "By notification on this device.")
        : L("Par courriel", "By email") + (existing.courriel ? " (" + existing.courriel + ")" : "") + (existing.confirme ? "." : L(" — en attente de confirmation : ouvrez le courriel reçu.", " — waiting for confirmation: open the email you received."))));
      const del = el("button", "g-btn", L("Me désabonner", "Unsubscribe")); del.type = "button";
      del.addEventListener("click", async () => {
        await fetch("/api/alertes?jeton=" + encodeURIComponent(jeton), { method: "DELETE" }).catch(() => {});
        try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) {}
        setSaved(""); box.innerHTML = ""; delete document.getElementById("infopage").dataset.page; location.hash = "#alertes"; route();
      });
      info.append(el("p", "legend", L("Vous pouvez modifier vos choix ci-dessous.", "You can change your choices below.")), del);
      box.appendChild(info);
    }
    const A = (existing && existing.alertes) || {};

    // 1. Quelles alertes
    const p1 = panel(L("1. Quelles alertes ?", "1. Which alerts?"));
    const [l1, c1] = chk(L("Une urgence se vide (sous un seuil d'occupation)", "An ER empties out (below an occupancy threshold)"), A.seuil && A.seuil.actif);
    const seuilBox = el("div", "al-sub");
    const pctSel = el("select"); pctSel.setAttribute("aria-label", L("Seuil", "Threshold"));
    [60, 70, 80, 90, 100].forEach((v) => { const o = el("option", "", L("sous ", "below ") + v + " %"); o.value = v; pctSel.appendChild(o); });
    pctSel.value = (A.seuil && A.seuil.pct) || 80;
    const erSel = el("select"); erSel.setAttribute("aria-label", L("Ajouter une urgence", "Add an ER"));
    const chosen = new Set((A.seuil && A.seuil.urgences) || []);
    const chips = el("div", "al-chips");
    function drawChips() {
      chips.innerHTML = "";
      chosen.forEach((n) => { const b = el("button", "al-chip", n + " ✕"); b.type = "button"; b.addEventListener("click", () => { chosen.delete(n); drawChips(); }); chips.appendChild(b); });
      if (!chosen.size) chips.appendChild(el("span", "legend", L("Aucune urgence choisie (5 au maximum).", "No ER chosen (5 at most).")));
    }
    const names = (typeof data !== "undefined" ? data : []).filter((h) => !h.psy).map((h) => h.name).sort((a, b) => a.localeCompare(b, "fr"));
    erSel.appendChild(Object.assign(el("option", "", L("+ Ajouter une urgence…", "+ Add an ER…")), { value: "" }));
    names.forEach((n) => { const o = el("option", "", n); o.value = n; erSel.appendChild(o); });
    erSel.addEventListener("change", () => { if (erSel.value && chosen.size < 5) chosen.add(erSel.value); erSel.value = ""; drawChips(); });
    drawChips();
    seuilBox.append(pctSel, erSel, chips);
    const [l2, c2] = chk(L("La meilleure urgence près de moi change", "The best ER near me changes"), A.meilleure && A.meilleure.actif);
    const [l3, c3] = chk(L("Un résumé chaque jour", "A daily summary"), A.resume && A.resume.actif);
    const hSel = el("select"); hSel.setAttribute("aria-label", L("Heure du résumé", "Summary time"));
    for (let h = 5; h <= 22; h++) { const o = el("option", "", L("à " + h + " h", "at " + (h % 12 || 12) + (h < 12 ? " a.m." : " p.m."))); o.value = h; hSel.appendChild(o); }
    hSel.value = (A.resume && A.resume.heure) || 7;
    const resBox = el("div", "al-sub"); resBox.appendChild(hSel);
    p1.append(l1, seuilBox, l2, l3, resBox, el("p", "legend", L("Pas d'alerte de seuil ni de « meilleur choix » entre 23 h et 7 h. Les urgences pour enfants, psychiatriques et l'Institut de cardiologie ne sont jamais proposées comme « meilleur choix ».",
      "No threshold or “best choice” alerts between 11 p.m. and 7 a.m. Children's, psychiatric ERs and the Montreal Heart Institute are never suggested as the “best choice”.")));
    const sync = () => { seuilBox.hidden = !c1.checked; resBox.hidden = !c3.checked; zoneP.hidden = !(c2.checked || c3.checked); };
    [c1, c2, c3].forEach((c) => c.addEventListener("change", sync));
    box.appendChild(p1);

    // 2. Zone
    const zoneP = panel(L("2. Pour quelle zone ?", "2. For which area?"));
    const zSel = el("select"); zSel.setAttribute("aria-label", L("Zone", "Area"));
    const Z = (existing && existing.zone) || {};
    const optPos = el("option", "", L("Autour de ma position (25 km)", "Around my location (25 km)")); optPos.value = "pos";
    zSel.appendChild(optPos);
    Object.keys(REGIONS).forEach((r) => { const o = el("option", "", REGIONS[r]); o.value = r; zSel.appendChild(o); });
    zSel.value = Z.region || (Z.lat ? "pos" : (typeof region !== "undefined" && REGIONS[region] ? region : "mtl"));
    let zonePos = Z.lat ? { lat: Z.lat, lon: Z.lon } : null;
    const posNote = el("p", "legend");
    const drawPos = () => { posNote.textContent = zSel.value !== "pos" ? "" : (zonePos || (typeof pos !== "undefined" && pos)) ? L("Position arrondie à environ 1 km, gardée seulement pour vos alertes.", "Location rounded to about 1 km, kept only for your alerts.") : L("Utilisez d'abord « Trier selon ma position » ou la recherche d'adresse sur la page des urgences, puis revenez ici.", "First use “Sort by my location” or the address search on the ER page, then come back here."); };
    zSel.addEventListener("change", drawPos); drawPos();
    zoneP.append(zSel, posNote);
    box.appendChild(zoneP);

    // 3. Canal
    const p3 = panel(L("3. Comment les recevoir ?", "3. How do you want them?"));
    const choices = el("div", "al-canal");
    const mkRadio = (v, label, on) => { const l = el("label", "chk"); const i = el("input"); i.type = "radio"; i.name = "al-canal"; i.value = v; i.checked = on; l.append(i, document.createTextNode(" " + label)); choices.appendChild(l); return i; };
    const rPush = cfg.push ? mkRadio("push", L("Notification sur ce téléphone", "Notification on this phone"), !existing || existing.canal === "push") : null;
    const rMail = cfg.courriel ? mkRadio("courriel", L("Courriel", "Email"), !rPush || (existing && existing.canal === "courriel")) : null;
    const pushNote = el("p", "legend");
    if (rPush) {
      if (isIOS && !standalone) pushNote.innerHTML = L("Sur iPhone, les notifications marchent seulement si le site est installé : touchez <b>Partager</b> ⎙ puis <b>Sur l'écran d'accueil</b>, ouvrez Salle d'attente depuis la nouvelle icône, puis revenez ici.",
        "On iPhone, notifications only work if the site is installed: tap <b>Share</b> ⎙ then <b>Add to Home Screen</b>, open Salle d'attente from the new icon, then come back here.");
      else if (!pushSupported) pushNote.textContent = L("Ce navigateur ne permet pas les notifications. Choisissez le courriel.", "This browser does not support notifications. Choose email.");
    }
    const mailBox = el("div", "al-sub");
    const mail = el("input"); mail.type = "email"; mail.maxLength = 200; mail.placeholder = L("Votre courriel", "Your email"); mail.setAttribute("aria-label", L("Votre courriel", "Your email")); mail.autocomplete = "email";
    const [lOk, cOk] = chk(L("J'accepte de recevoir les alertes choisies par courriel. Je peux me désabonner en tout temps.", "I agree to receive the chosen alerts by email. I can unsubscribe at any time."), false);
    mailBox.append(mail, lOk, el("p", "legend", L("Un courriel de confirmation vous sera envoyé : les alertes commencent après votre confirmation.", "A confirmation email will be sent: alerts start after you confirm.")));
    const syncC = () => { mailBox.hidden = !(rMail && rMail.checked); pushNote.hidden = !(rPush && rPush.checked); };
    [rPush, rMail].filter(Boolean).forEach((r) => r.addEventListener("change", syncC));
    p3.append(choices, pushNote, mailBox);
    if (existing) p3.hidden = true; // le canal d'un abonnement existant ne change pas ici
    box.appendChild(p3);

    // Envoi
    const send = el("button", "al-send", existing ? L("Enregistrer mes choix", "Save my choices") : L("Activer mes alertes", "Turn on my alerts")); send.type = "button";
    const st = el("p", "legend"); st.setAttribute("role", "status");
    const priv = el("p", "legend", L("Nous gardons seulement ce qu'il faut pour vous envoyer vos alertes (votre choix, la zone, et votre courriel ou l'adresse technique de notification). Rien n'est vendu ni partagé. Désabonnement = suppression.",
      "We keep only what is needed to send your alerts (your choices, the area, and your email or the technical notification address). Nothing is sold or shared. Unsubscribing deletes it."));
    const pl = el("a", "", L("Politique de confidentialité", "Privacy policy")); pl.href = "#confidentialite";
    priv.append(" ", pl);
    box.append(send, st, priv);
    sync(); syncC();

    send.addEventListener("click", async () => {
      const zone = zSel.value === "pos" ? (zonePos || (typeof pos !== "undefined" && pos ? { lat: pos.lat, lon: pos.lon } : null)) : { region: zSel.value };
      const body = { langue: EN ? "en" : "fr",
        alertes: { seuil: { actif: c1.checked, pct: Number(pctSel.value), urgences: [...chosen] }, meilleure: { actif: c2.checked }, resume: { actif: c3.checked, heure: Number(hSel.value) } },
        zone: zone && zone.lat ? { lat: zone.lat, lon: zone.lon, rayon: 25 } : zone };
      if ((c2.checked || c3.checked) && !zone) { st.textContent = L("Choisissez une région, ou définissez d'abord votre position.", "Choose a region, or set your location first."); return; }
      send.disabled = true; st.textContent = L("Envoi…", "Sending…");
      try {
        let method = "POST", url = "/api/alertes";
        if (existing) { method = "PUT"; url += "?jeton=" + encodeURIComponent(jeton); }
        else if (rPush && rPush.checked) {
          if (isIOS && !standalone) throw new Error(L("Installez d'abord le site sur l'écran d'accueil (voir ci-dessus).", "Install the site on your home screen first (see above)."));
          if (!pushSupported) throw new Error(L("Ce navigateur ne permet pas les notifications.", "This browser does not support notifications."));
          const perm = await Notification.requestPermission();
          if (perm !== "granted") throw new Error(L("Notifications refusées. Vous pouvez les autoriser dans les réglages.", "Notifications blocked. You can allow them in settings."));
          const reg = await navigator.serviceWorker.ready;
          const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublic) });
          body.canal = "push"; body.push = sub.toJSON();
        } else if (rMail && rMail.checked) {
          body.canal = "courriel"; body.courriel = mail.value.trim(); body.accord = cOk.checked;
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.courriel)) throw new Error(L("Indiquez un courriel valide.", "Enter a valid email."));
          if (!body.accord) throw new Error(L("Cochez la case d'accord.", "Check the consent box."));
        } else throw new Error(L("Choisissez notification ou courriel.", "Choose notification or email."));
        const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || L("Envoi impossible pour le moment.", "Cannot send right now."));
        if (j.jeton) setSaved(j.jeton);
        if (!existing && window.SA_STAT) SA_STAT("action:alertes:" + (body.canal === "push" ? "notification" : "courriel"));
        st.textContent = existing ? L("Vos choix sont enregistrés.", "Your choices are saved.")
          : j.confirmation ? L("Presque fini ! Ouvrez le courriel reçu et touchez « Confirmer mon adresse ».", "Almost done! Open the email you received and tap “Confirm my address”.")
          : L("C'est fait ! Une notification de bienvenue devrait arriver dans un instant.", "Done! A welcome notification should arrive in a moment.");
      } catch (err) { st.textContent = err.message; }
      send.disabled = false;
    });
  }

  if (window.SA_GUIDE) {
    SA_GUIDE.pages["#alertes"] = page;
    if (location.hash.startsWith("#alertes")) { const i = document.getElementById("infopage"); if (i) i.dataset.page = ""; route(); }
  }
})();
