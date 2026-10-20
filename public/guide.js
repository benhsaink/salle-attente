// Salle d'attente — « Comprendre le triage » (#triage) et « Où consulter ? » (#orienter)
// Ces pages n'évaluent jamais la gravité d'un cas : seule l'infirmière au triage le fait.
// Tout le contenu médical vient des sources officielles listées dans SRC (avec date de consultation).
(function () {
  const EN = window.SA_LANG === "en";
  const T = (fr, en) => (EN ? en : fr);
  const SRC = {
    oiiq: { url: "https://www.cisssca.com/clients/CISSSCA/TriageUrgence/2510-triage-urgence-lignes-directrices-2019.pdf",
      name: T("OIIQ et Collège des médecins du Québec, Triage à l'urgence : lignes directrices, 2e édition, 2019", "OIIQ and Collège des médecins du Québec, Triage à l'urgence : lignes directrices (emergency triage guidelines), 2nd edition, 2019") },
    avc: { url: "https://www.quebec.ca/sante/problemes-de-sante/a-z/accident-vasculaire-cerebral-avc/information-accident-vasculaire-cerebral-avc",
      name: T("Québec.ca, Information sur l'accident vasculaire cérébral (mis à jour le 15 mai 2025)", "Québec.ca, stroke information (updated May 15, 2025)") },
    coeur: { url: "https://www.canada.ca/fr/sante-publique/services/maladies/sante-coeur/crise-cardiaque/signes-symptomes-crise-cardiaque.html",
      name: T("Canada.ca, Signes et symptômes d'une crise cardiaque (modifié le 12 février 2026)", "Canada.ca, heart attack signs and symptoms (modified February 12, 2026)") },
    arret: { url: "https://www.quebec.ca/sante/systeme-et-services-de-sante/services-prehospitaliers-urgence/que-faire-cas-urgence-necessitant-ambulance",
      name: T("Québec.ca, Que faire en cas d'urgence nécessitant une ambulance (mis à jour le 20 août 2024)", "Québec.ca, what to do in an emergency requiring an ambulance (updated August 20, 2024)") },
    laval: { url: "https://www.lavalensante.com/en-cas-durgence/911/",
      name: T("Santé Québec Laval, 911 (mis à jour le 15 septembre 2021)", "Santé Québec Laval, 911 (updated September 15, 2021)") },
    s988: { url: "https://988.ca/fr", name: T("988.ca, Ligne d'aide en cas de crise de suicide", "988.ca, Suicide Crisis Helpline") },
    oc: { url: "https://www.ciusss-capitalenationale.gouv.qc.ca/sites/d8/files/docs/NosServices/ConsulterMd-Inf/Ou-consulter.pdf",
      name: T("CIUSSS de la Capitale-Nationale, Où consulter (31 mars 2023)", "CIUSSS de la Capitale-Nationale, Où consulter / where to get care (March 31, 2023)") },
  };
  const CHECKED = T("Sources consultées le 20 octobre 2026.", "Sources checked on October 20, 2026.");

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function tel(num, label) { const a = el("a", "g-call", label || num); a.href = "tel:" + num.replace(/[^\d]/g, ""); return a; }
  function sources(keys) {
    const s = el("section", "panel");
    s.appendChild(el("h3", "", T("Sources", "Sources")));
    const ul = el("ul", "g-src");
    keys.forEach(k => { const li = el("li"); const a = el("a", "", SRC[k].name); a.href = SRC[k].url; a.target = "_blank"; a.rel = "noopener"; li.appendChild(a); ul.appendChild(li); });
    s.append(ul, el("p", "fc-note", CHECKED));
    return s;
  }
  function sos() {
    const s = el("section", "g-sos");
    const p = el("p");
    p.append(el("b", "", T("Urgence grave ? ", "Serious emergency? ")), document.createTextNode(T("N'attendez pas : ", "Don't wait: ")), tel("911", T("composez le 911", "call 911")), document.createTextNode("."));
    s.appendChild(p);
    return s;
  }
  function back(box) {
    const b = el("button", "back", T("‹ Retour", "‹ Back"));
    b.type = "button";
    b.addEventListener("click", () => { if (history.state && history.state.fromList) history.back(); else location.hash = "#urgences"; });
    box.appendChild(b);
  }

  // ---------- Comprendre le triage ----------
  function triage(box) {
    back(box);
    document.title = T("Comprendre le triage", "Understanding triage") + " · Salle d'attente";
    const h = el("div", "fh");
    h.append(el("h2", "", T("Comprendre le triage à l'urgence", "Understanding emergency triage")),
      el("p", "where", T("À l'urgence, on ne passe pas par ordre d'arrivée. Une infirmière évalue chaque personne et lui donne une priorité de 1 à 5, selon l'Échelle canadienne de triage et de gravité (ÉTG).",
        "In the ER, people are not seen in order of arrival. A nurse assesses each person and gives them a priority from 1 to 5, using the Canadian Triage and Acuity Scale (CTAS).")));
    box.appendChild(h);

    const lv = el("section", "panel");
    lv.appendChild(el("h3", "", T("Les 5 niveaux de priorité", "The 5 priority levels")));
    const LEVELS = [
      ["1", T("Prise en charge immédiate", "Immediate care"), T("Immédiat", "Immediate"), T("Conditions qui menacent la vie ou l'intégrité d'un membre et qui demandent une intervention énergique et immédiate.", "Conditions that threaten life or limb and require aggressive, immediate intervention.")],
      ["2", T("Très urgent", "Very urgent"), "15 min", T("Conditions qui menacent la vie, l'intégrité d'un membre ou sa fonction, et qui exigent une intervention médicale rapide.", "Conditions that threaten life, limb or function and require rapid medical intervention.")],
      ["3", T("Urgent", "Urgent"), "30 min", T("Conditions souvent associées à un inconfort important et à une incapacité à faire ses activités de tous les jours.", "Conditions often associated with significant discomfort and inability to carry out daily activities.")],
      ["4", T("Moins urgent", "Less urgent"), "60 min", T("Conditions qui varient selon l'âge et la détresse de la personne, avec des risques de détérioration ou de complications.", "Conditions that vary with the person's age and distress, with risks of deterioration or complications.")],
      ["5", T("Non urgent", "Non-urgent"), "120 min", T("Conditions qui peuvent être aiguës mais non urgentes, ou faire partie d'un problème chronique.", "Conditions that may be acute but not urgent, or part of a chronic problem.")],
    ];
    const ol = el("ol", "g-levels");
    LEVELS.forEach(([n, name, delay, desc]) => {
      const li = el("li", "g-l" + n);
      const top = el("div", "g-ltop");
      top.append(el("span", "g-num", n), el("b", "", name), el("span", "g-delay", delay));
      li.append(top, el("p", "", desc));
      ol.appendChild(li);
    });
    lv.append(ol, el("p", "fc-note", T("Délai visé pour voir un médecin. Ce sont des buts à atteindre, pas des garanties : quand l'urgence est pleine, l'attente est souvent plus longue.",
      "Target time to see a doctor. These are goals, not guarantees: when the ER is full, the wait is often longer.")));
    box.appendChild(lv);

    const how = el("section", "panel");
    how.appendChild(el("h3", "", T("Pendant l'attente", "While you wait")));
    const ul = el("ul", "g-list");
    [T("Quelqu'un arrivé après vous peut passer avant : son état demande une prise en charge plus rapide.", "Someone who arrived after you may be seen first: their condition needs faster care."),
     T("Si l'attente se prolonge, l'infirmière réévalue votre état. Votre priorité peut monter ou baisser.", "If the wait gets long, the nurse reassesses you. Your priority can go up or down."),
     T("Deux personnes de même priorité peuvent être dirigées vers des secteurs différents de l'urgence.", "Two people with the same priority may be sent to different areas of the ER.")]
      .forEach(t => ul.appendChild(el("li", "", t)));
    how.appendChild(ul);
    box.appendChild(how);

    const site = el("section", "panel");
    site.appendChild(el("h3", "", T("Et les chiffres du site ?", "What about the numbers on this site?")));
    const ul2 = el("ul", "g-list");
    [T("« En attente » compte les personnes pas encore vues par un médecin, toutes priorités confondues.", "“Waiting” counts people not yet seen by a doctor, all priorities combined."),
     T("Une urgence moins remplie aide souvent, mais votre attente dépend aussi de votre priorité et de celle des autres patients.", "A less crowded ER often helps, but your wait also depends on your priority and other patients'."),
     T("Ce site ne peut pas évaluer votre priorité. Seule l'infirmière au triage le fait.", "This site cannot assess your priority. Only the triage nurse does that.")]
      .forEach(t => ul2.appendChild(el("li", "", t)));
    const go = el("a", "g-btn", T("🧭 Où consulter ? (quelques questions)", "🧭 Where should I go? (a few questions)")); go.href = "#orienter";
    site.append(ul2, go);
    box.appendChild(site);
    box.append(sos(), sources(["oiiq"]));
  }

  // ---------- Où consulter ? ----------
  const ALARM = [
    [T("Signes d'AVC (V-I-T-E) : visage affaissé, incapacité à lever les deux bras normalement, trouble de la parole", "Signs of stroke (FAST): face drooping, inability to raise both arms normally, speech problems"), "avc"],
    [T("Douleur ou inconfort à la poitrine, qui peut s'étendre aux bras, au cou, à la mâchoire ou aux épaules, avec ou sans essoufflement", "Chest pain or discomfort, which may spread to the arms, neck, jaw or shoulders, with or without shortness of breath"), "coeur"],
    [T("Personne inconsciente, qui ne réagit pas, ou qui ne respire pas ou respire anormalement", "Person unconscious, not responding, or not breathing or breathing abnormally"), "arret"],
    [T("Détresse respiratoire ou étouffement", "Respiratory distress or choking"), "laval"],
    [T("Convulsions ou perte de connaissance", "Seizures or loss of consciousness"), "laval"],
    [T("Hémorragie (saignement interne ou externe)", "Hemorrhage (internal or external bleeding)"), "laval"],
    [T("Réaction allergique avec difficulté à respirer ou à avaler", "Allergic reaction with difficulty breathing or swallowing"), "laval"],
    [T("Noyade, électrisation, accouchement, accident grave", "Drowning, electric shock, childbirth, serious accident"), "laval"],
  ];
  const NEEDS = [
    ["poison", T("Une intoxication ou un empoisonnement possible", "A possible poisoning")],
    ["psy", T("Détresse psychologique ou idées suicidaires", "Psychological distress or suicidal thoughts")],
    ["conseil", T("Je ne sais pas si je dois consulter, ou je veux un conseil", "I don't know if I need care, or I want advice")],
    ["medic", T("Un médicament : renouvellement, question, ajustement", "A medication: renewal, question, adjustment")],
    ["vite", T("Un problème à faire voir aujourd'hui ou demain, qui ne menace pas ma vie", "A problem to be seen today or tomorrow, not life-threatening")],
    ["urg", T("J'ai déjà décidé d'aller à l'urgence", "I have already decided to go to the ER")],
  ];

  function answer(title, items, foot) {
    const s = el("section", "panel g-answer");
    s.appendChild(el("h3", "", title));
    items.forEach(it => s.appendChild(it));
    if (foot) s.appendChild(el("p", "fc-note", foot));
    return s;
  }
  function line(text, link) { const p = el("p", "g-line"); p.appendChild(document.createTextNode(text)); if (link) { p.appendChild(document.createTextNode(" ")); p.appendChild(link); } return p; }
  function navLink(href, text) { const a = el("a", "g-btn", text); a.href = href; return a; }

  function orienter(box) {
    back(box);
    document.title = T("Où consulter ?", "Where should I go?") + " · Salle d'attente";
    const h = el("div", "fh");
    h.append(el("h2", "", T("Où consulter ?", "Where should I go?")),
      el("p", "where", T("Quelques questions pour trouver le bon service. Cet outil n'évalue pas la gravité de votre état et ne remplace pas un avis médical.",
        "A few questions to find the right service. This tool does not assess how serious your condition is and does not replace medical advice.")));
    box.appendChild(h);

    const q1 = el("section", "panel");
    q1.appendChild(el("h3", "", T("1. Une de ces situations s'applique-t-elle, pour vous ou la personne à aider ?", "1. Does one of these situations apply to you or the person you are helping?")));
    const ul = el("ul", "g-alarm");
    ALARM.forEach(([t]) => ul.appendChild(el("li", "", t)));
    q1.appendChild(ul);
    const row = el("div", "g-choices");
    const out = el("div", "g-out");
    const bYes = el("button", "g-choice g-red", T("Oui, au moins une", "Yes, at least one"));
    const bDoubt = el("button", "g-choice", T("Je ne suis pas sûr", "I'm not sure"));
    const bNo = el("button", "g-choice", T("Non, aucune", "No, none"));
    [bYes, bDoubt, bNo].forEach(b => { b.type = "button"; row.appendChild(b); });
    q1.appendChild(row);
    box.append(q1, out);

    const pick = (b) => [bYes, bDoubt, bNo].forEach(x => x.setAttribute("aria-pressed", x === b));
    bYes.addEventListener("click", () => {
      pick(bYes); out.innerHTML = "";
      out.appendChild(answer(T("Composez le 911 maintenant", "Call 911 now"), [
        tel("911", T("📞 Appeler le 911", "📞 Call 911")),
        line(T("Restez calme, répondez aux questions et suivez les indications. Restez en ligne jusqu'à ce qu'on vous dise de raccrocher.", "Stay calm, answer the questions and follow the instructions. Stay on the line until you are told to hang up.")),
        line(T("En cas d'AVC, ne vous rendez pas à l'hôpital par vos propres moyens.", "In case of stroke, do not go to the hospital on your own.")),
      ]));
      out.appendChild(sources(["avc", "coeur", "arret", "laval"]));
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    bDoubt.addEventListener("click", () => {
      pick(bDoubt); out.innerHTML = "";
      out.appendChild(answer(T("En cas de doute, composez le 911", "If in doubt, call 911"), [
        tel("911", T("📞 Appeler le 911", "📞 Call 911")),
        line(T("Répondez aux questions et suivez les indications qu'on vous donne.", "Answer the questions and follow the instructions you are given.")),
      ]));
      out.appendChild(sources(["laval"]));
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    bNo.addEventListener("click", () => {
      pick(bNo); out.innerHTML = "";
      const q2 = el("section", "panel");
      q2.appendChild(el("h3", "", T("2. Qu'est-ce qui décrit le mieux votre besoin ?", "2. What best describes your need?")));
      const opts = el("div", "g-needs");
      const res = el("div", "g-out");
      NEEDS.forEach(([k, label]) => {
        const b = el("button", "g-choice", label); b.type = "button";
        b.addEventListener("click", () => {
          opts.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
          res.innerHTML = ""; res.appendChild(need(k)); res.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        opts.appendChild(b);
      });
      q2.appendChild(opts);
      out.append(q2, res);
      q2.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    box.append(sos());
  }

  function need(k) {
    const wrap = el("div", "g-out");
    const worse = T("Si l'état s'aggrave ou si un signe d'alarme apparaît : 911.", "If things get worse or an alarm sign appears: 911.");
    if (k === "poison") wrap.append(answer(T("Centre antipoison du Québec", "Centre antipoison du Québec (poison centre)"), [
      tel("18004635060", "📞 1 800 463-5060"),
      line(T("Ouvert en tout temps, pour la population et les professionnels.", "Open at all times, for the public and professionals.")),
      line(T("Personne inconsciente, qui convulse ou qui respire mal : 911.", "Person unconscious, having seizures or breathing poorly: 911.")),
    ]), sources(["oc", "laval"]));
    if (k === "psy") wrap.append(answer(T("Vous n'êtes pas seul", "You are not alone"), [
      line(T("Idées suicidaires : 9-8-8, par téléphone ou texto, en tout temps.", "Suicidal thoughts: 9-8-8, by phone or text, at any time."), tel("988", "📞 9-8-8")),
      line(T("Détresse psychologique ou situation difficile : Info-Social, 811, option 2, en tout temps.", "Psychological distress or a difficult situation: Info-Social, 811, option 2, at any time."), tel("811", "📞 811")),
      line(T("Danger immédiat : 911.", "Immediate danger: 911.")),
    ]), sources(["s988", "oc"]));
    if (k === "conseil") wrap.append(answer(T("Info-Santé : 811, option 1", "Info-Santé: 811, option 1"), [
      tel("811", "📞 811"),
      line(T("Une infirmière répond à vos questions et vous conseille, pour vous ou un proche, en tout temps.", "A nurse answers your questions and advises you, for yourself or a loved one, at any time.")),
    ], worse), sources(["oc"]));
    if (k === "medic") wrap.append(answer(T("Votre pharmacien", "Your pharmacist"), [
      line(T("Il peut prolonger une ordonnance, ajuster ou administrer votre médication.", "They can extend a prescription, adjust or give your medication.")),
    ], worse), sources(["oc"]));
    if (k === "vite") wrap.append(answer(T("Une clinique, plutôt que l'urgence", "A clinic rather than the ER"), [
      line(T("Avec un médecin de famille : appelez votre clinique.", "With a family doctor: call your clinic.")),
      line(T("Sans médecin de famille : Guichet d'accès à la première ligne, 811, option 3.", "Without a family doctor: primary care access point (GAP), 811, option 3."), tel("811", "📞 811")),
      navLink("#cliniques", T("Voir les cliniques avec rendez-vous le jour même", "See clinics with same-day appointments")),
    ], worse), sources(["oc"]));
    if (k === "urg") wrap.append(answer(T("L'urgence la moins remplie près de vous", "The least crowded ER near you"), [
      line(T("Triez selon votre position pour combiner distance et achalandage.", "Sort by your location to combine distance and crowding.")),
      navLink("#urgences", T("Voir les urgences", "See emergency rooms")),
      navLink("#triage", T("Comment fonctionne le triage ?", "How does triage work?")),
    ], worse));
    return wrap;
  }

  window.SA_GUIDE = {
    pages: { "#triage": triage, "#orienter": orienter },
    render(hash, box) { box.innerHTML = ""; this.pages[hash](box); },
  };
})();
