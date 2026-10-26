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

  // ---------- À propos ----------
  function apropos(box) {
    back(box);
    document.title = T("À propos", "About") + " · Salle d'attente";
    const h = el("div", "fh");
    h.append(el("h2", "", T("À propos de Salle d'attente", "About Salle d'attente")),
      el("p", "where", T("Salle d'attente aide à choisir où se faire soigner au Québec : l'urgence la moins remplie, une clinique avec rendez-vous le jour même, ou une clinique privée. C'est un projet indépendant : il n'est pas lié au ministère de la Santé, à Santé Québec ni à la RAMQ.",
        "Salle d'attente helps you choose where to get care in Québec: the least crowded ER, a clinic with same-day appointments, or a private clinic. It is an independent project, not affiliated with the Ministry of Health, Santé Québec or the RAMQ.")));
    box.appendChild(h);

    const mis = el("section", "panel");
    mis.appendChild(el("h3", "", T("Notre mission", "Our mission")));
    [T("Trouver où se faire soigner est devenu difficile, surtout sans médecin de famille. L'information existe, mais elle est éparpillée entre plusieurs sites, et on la cherche souvent au pire moment.",
       "Finding where to get care has become hard, especially without a family doctor. The information exists, but it is scattered across several sites, and people often look for it at the worst possible moment."),
     T("Salle d'attente rassemble cette information au même endroit, selon votre besoin : une urgence moins remplie, une clinique avec rendez-vous le jour même, une ressource gratuite sans RAMQ, une clinique privée, ou le bon numéro à appeler.",
       "Salle d'attente brings this information together in one place, based on your need: a less crowded ER, a clinic with same-day appointments, a free resource without RAMQ, a private clinic, or the right number to call."),
     T("Notre objectif : vous informer correctement, à partir de sources officielles, et vous aider à accéder plus facilement aux soins.",
       "Our goal: to inform you accurately, using official sources, and to make it easier for you to access care.")]
      .forEach(t => mis.appendChild(el("p", "g-line", t)));
    const fig = el("p", "g-line");
    fig.append(el("b", "", T("En chiffres : ", "By the numbers: ")),
      document.createTextNode(T("au 1er juillet 2026, 359 061 personnes attendaient encore d'être prises en charge au Guichet d'accès à un médecin de famille (GAMF). Un an plus tôt, elles étaient 655 174. Les personnes inscrites auprès d'un groupe de médecins ne sont pas comptées comme en attente. ",
        "as of July 1, 2026, 359,061 people were still waiting to be taken on at the family doctor access point (GAMF). A year earlier, there were 655,174. People registered with a group of doctors are not counted as waiting. ")));
    const fa = el("a", "", T("Source : RAMQ, Évolution du nombre de personnes inscrites au GAMF selon leur statut (mis à jour le 25 août 2026)", "Source: RAMQ, number of people registered at the GAMF by status (updated August 25, 2026)"));
    fa.href = "https://www.ramq.gouv.qc.ca/fr/media/856"; fa.target = "_blank"; fa.rel = "noopener";
    fig.appendChild(fa);
    mis.appendChild(fig);
    const who = el("p", "g-line");
    who.append(el("b", "", T("Qui est derrière le site : ", "Who is behind the site: ")),
      document.createTextNode(T("Salle d'attente est créé par un infirmier clinicien, membre de l'Ordre des infirmières et infirmiers du Québec (OIIQ). Le site informe et oriente ; il ne donne pas de consultation et ne remplace pas un avis médical.",
        "Salle d'attente is created by a clinical nurse, a member of the Ordre des infirmières et infirmiers du Québec (OIIQ). The site informs and guides; it does not provide consultations and does not replace medical advice.")));
    mis.appendChild(who);
    box.appendChild(mis);

    const lim = el("section", "panel");
    lim.appendChild(el("h3", "", T("À savoir", "Good to know")));
    const ul = el("ul", "g-list");
    [T("Ce site ne remplace pas un avis médical et n'évalue pas la gravité de votre état. En cas d'urgence grave, appelez le 911. Pour un conseil, le 811.", "This site does not replace medical advice and does not assess how serious your condition is. In a serious emergency, call 911. For advice, call 811."),
     T("Les chiffres des urgences sont publiés par le ministère environ chaque heure. Ils peuvent changer vite, et certains établissements ne les transmettent pas toujours (« Inconnu »).", "ER figures are published by the Ministry about every hour. They can change quickly, and some facilities do not always send them (“Unknown”)."),
     T("Les heures et les services des cliniques viennent de leurs fiches officielles, relues chaque matin. Téléphonez avant de vous déplacer.", "Clinic hours and services come from their official listings, checked every morning. Call before you go."),
     T("Aucune information médicale ou de service n'est devinée : sans source officielle, elle n'est pas affichée. Seule exception, signalée : l'urgence pédiatrique du CHUL, « à confirmer ».", "No medical or service information is guessed: without an official source, it is not shown. One flagged exception: the CHUL pediatric ER, “to be confirmed”."),
     T("Les entreprises de soins privés qui deviendront partenaires seront toujours identifiées « Partenaire · Commandité » et ne passeront jamais avant l'information d'urgence.", "Private care companies that become partners will always be labelled “Partner · Sponsored” and will never be shown above emergency information.")]
      .forEach(t => ul.appendChild(el("li", "", t)));
    lim.appendChild(ul);
    box.appendChild(lim);

    const src = el("section", "panel");
    src.appendChild(el("h3", "", T("Sources des données", "Data sources")));
    const SRCS = [
      [T("Ministère de la Santé et des Services sociaux, fichier horaire de la situation à l'urgence, Données Québec (licence CC BY 4.0)", "Ministry of Health and Social Services, hourly ER situation file, Données Québec (CC BY 4.0 licence)"), "https://www.donneesquebec.ca/recherche/dataset/fichier-horaire-des-donnees-de-la-situation-a-l-urgence"],
      [T("Ministère de la Santé et des Services sociaux, fichiers cartographiques M02 des installations, Données Québec (licence CC BY 4.0) : adresses et positions des urgences", "Ministry of Health and Social Services, M02 facility map files, Données Québec (CC BY 4.0 licence): ER addresses and locations"), "https://www.donneesquebec.ca/recherche/dataset/51998b55-7d4c-4381-8c20-0ac1cd9c1b87"],
      [T("Santé Québec, Répertoire des ressources en santé et services sociaux : fiches des cliniques (heures, services, frais)", "Santé Québec, health and social services resource directory: clinic listings (hours, services, fees)"), "https://sante.gouv.qc.ca/repertoire-ressources/"],
      [T("Québec.ca, liste des GMF-A/R (accès-réseau)", "Québec.ca, list of GMF-A/R (access-network clinics)"), "https://www.quebec.ca/sante/systeme-et-services-de-sante/organisation-des-services/gmf-gmf-u-et-super-clinique"],
      [T("RAMQ, liste des professionnels non participants ou désengagés (15 septembre 2026) : repérage des cliniques privées", "RAMQ, list of non-participating or opted-out professionals (September 15, 2026): used to find private clinics"), "https://www.ramq.gouv.qc.ca/"],
      [T("Médecins du Monde, Clinique pour les personnes migrantes à statut précaire", "Médecins du Monde, clinic for migrants with precarious status"), "https://medecinsdumonde.ca/clinique-migrante/"],
      [T("Cartes et adresses : © les contributeurs d'OpenStreetMap (recherche Nominatim)", "Maps and addresses: © OpenStreetMap contributors (Nominatim search)"), "https://www.openstreetmap.org/copyright"],
      [T("Temps de route : openrouteservice (HeiGIT), données © OpenStreetMap", "Driving times: openrouteservice (HeiGIT), data © OpenStreetMap"), "https://openrouteservice.org/"],
    ];
    const ul2 = el("ul", "g-src");
    SRCS.forEach(([t, u]) => { const li = el("li"); const a = el("a", "", t); a.href = u; a.target = "_blank"; a.rel = "noopener"; li.appendChild(a); ul2.appendChild(li); });
    src.append(ul2, el("p", "fc-note", T("Les pages « Comprendre le triage » et « Où consulter ? » citent leurs propres sources.", "The “Understanding triage” and “Where should I go?” pages cite their own sources.")));
    box.appendChild(src);

    const priv = el("section", "panel");
    priv.appendChild(el("h3", "", T("Confidentialité", "Privacy")));
    const ul3 = el("ul", "g-list");
    [T("Aucun compte, aucune publicité, aucun outil de suivi des visiteurs.", "No account, no advertising, no visitor tracking tools."),
     T("Alertes (bêta) : nous gardons seulement vos choix d'alertes, la zone (région ou position arrondie à environ 1 km) et votre courriel ou l'adresse technique de notification de votre appareil. Ces données sont hébergées par Supabase (serveurs au Canada) ; les courriels sont envoyés par Brevo. Le désabonnement efface tout.",
       "Alerts (beta): we keep only your alert choices, the area (region or location rounded to about 1 km) and your email or your device's technical notification address. This data is hosted by Supabase (servers in Canada); emails are sent by Brevo. Unsubscribing deletes everything."),
     T("Votre position reste sur votre téléphone. Si vous cochez « Temps de route en voiture », elle est arrondie à environ 1 km puis envoyée à notre serveur et à openrouteservice pour calculer les trajets. Elle n'est pas conservée.", "Your location stays on your phone. If you check “Driving time”, it is rounded to about 1 km and sent to our server and to openrouteservice to calculate routes. It is not kept."),
     T("Une adresse ou un code postal cherché est envoyé à OpenStreetMap pour trouver sa position. Il n'est pas conservé.", "An address or postal code you search is sent to OpenStreetMap to find its location. It is not kept."),
     T("Vos choix (langue, région, onglet, application de navigation) sont gardés dans votre navigateur seulement.", "Your choices (language, region, tab, navigation app) are kept in your browser only."),
     T("Les commentaires et les demandes de partenariat sont transmis par courriel au responsable du site (service Brevo, ou Formspree en secours), seulement pour y répondre.", "Comments and partnership requests are emailed to the site owner (Brevo service, or Formspree as a backup), only to reply to them."),
     T("Comme tout site web, l'hébergeur (Render) garde des journaux techniques des visites. Les polices de caractères sont chargées depuis Google Fonts.", "Like any website, the host (Render) keeps technical visit logs. Fonts are loaded from Google Fonts.")]
      .forEach(t => ul3.appendChild(el("li", "", t)));
    priv.appendChild(ul3);
    const full = el("a", "g-btn", T("Lire la politique de confidentialité complète", "Read the full privacy policy")); full.href = "#confidentialite";
    priv.appendChild(full);
    box.appendChild(priv);

    const c = el("section", "panel");
    c.appendChild(el("h3", "", T("Nous joindre", "Contact us")));
    c.appendChild(el("p", "g-line", T("Une erreur, une idée, une clinique à ajouter ? Écrivez-nous avec le formulaire au bas de la page. Entreprises de soins privés : voyez l'onglet Soins privés.", "An error, an idea, a clinic to add? Write to us with the form at the bottom of the page. Private care companies: see the Private care tab.")));
    c.appendChild(el("p", "g-line", T("Courriel : salle.dattente.qc@gmail.com", "Email: salle.dattente.qc@gmail.com")));
    const b = el("button", "g-btn", T("Écrire un commentaire", "Write a comment")); b.type = "button";
    b.addEventListener("click", () => document.getElementById("commentaires").scrollIntoView({ behavior: "smooth", block: "start" }));
    c.appendChild(b);
    c.appendChild(el("p", "fc-note", T("Page mise à jour le 25 octobre 2026.", "Page updated on October 25, 2026.")));
    box.append(c, sos());
  }

  // ---------- Politique de confidentialité (Loi 25) ----------
  function confidentialite(box) {
    back(box);
    document.title = T("Politique de confidentialité", "Privacy policy") + " · Salle d'attente";
    const h = el("div", "fh");
    h.append(el("h2", "", T("Politique de confidentialité", "Privacy policy")),
      el("p", "where", T("Comment Salle d'attente recueille, utilise, protège et supprime vos renseignements personnels. En vigueur le 21 octobre 2026.",
        "How Salle d'attente collects, uses, protects and deletes your personal information. In effect on October 21, 2026.")));
    box.appendChild(h);
    const sec = (title, items, after) => {
      const s = el("section", "panel"); s.appendChild(el("h3", "", title));
      if (items.length === 1 && !Array.isArray(items[0])) s.appendChild(el("p", "g-line", items[0]));
      else { const ul = el("ul", "g-list"); items.forEach((t) => ul.appendChild(el("li", "", t))); s.appendChild(ul); }
      if (after) s.appendChild(after);
      box.appendChild(s);
    };
    sec(T("1. Responsable", "1. Person in charge"), [T("Responsable de la protection des renseignements personnels : Karim Benhsain, infirmier clinicien, fondateur de Salle d'attente. Courriel : salle.dattente.qc@gmail.com. Pour toute question, demande d'accès, de correction ou de suppression, écrivez à cette adresse (ou avec le formulaire au bas du site, en indiquant « Confidentialité »). Une réponse vous sera donnée dans un délai de 24 à 72 heures.",
      "Person in charge of the protection of personal information: Karim Benhsain, clinical nurse, founder of Salle d'attente. Email: salle.dattente.qc@gmail.com. For any question, or any request for access, correction or deletion, write to this address (or use the form at the bottom of the site, mentioning “Privacy”). You will get an answer within 24 to 72 hours.")]);
    sec(T("2. Ce que nous recueillons, et pourquoi", "2. What we collect, and why"), [
      T("Consulter le site : aucun renseignement personnel n'est demandé. Pas de compte, pas de publicité, pas d'outil de suivi ni de témoins (cookies) de mesure d'audience.", "Browsing the site: no personal information is requested. No account, no advertising, no tracking tools or analytics cookies."),
      T("Position : utilisée dans votre navigateur seulement, pour calculer les distances. Si vous cochez « Temps de route en voiture », elle est arrondie à environ 1 km et envoyée à notre serveur, puis à openrouteservice, pour calculer les trajets ; elle n'est pas conservée.", "Location: used in your browser only, to calculate distances. If you check “Driving time”, it is rounded to about 1 km and sent to our server, then to openrouteservice, to calculate routes; it is not kept."),
      T("Adresse ou code postal cherché : envoyé à OpenStreetMap (Nominatim) pour trouver la position ; non conservé.", "Address or postal code searched: sent to OpenStreetMap (Nominatim) to find the location; not kept."),
      T("Alertes (bêta) : vos choix d'alertes, la zone (région ou position arrondie à environ 1 km), la langue, et votre courriel ou l'adresse technique de notification de votre appareil. Seul but : vous envoyer les alertes demandées.", "Alerts (beta): your alert choices, the area (region or location rounded to about 1 km), the language, and your email or your device's technical notification address. Only purpose: sending you the alerts you asked for."),
      T("Commentaires et demandes de partenariat : ce que vous écrivez dans le formulaire (et vos coordonnées, si vous les donnez). Seul but : vous répondre et corriger le site.", "Comments and partnership requests: what you write in the form (and your contact details, if you give them). Only purpose: replying to you and fixing the site."),
      T("Préférences (langue, région, onglet, application de navigation, alertes) : gardées dans votre navigateur seulement (stockage local).", "Preferences (language, region, tab, navigation app, alerts): kept in your browser only (local storage)."),
    ]);
    sec(T("3. Consentement", "3. Consent"), [T("Chaque renseignement est donné par vous, pour un but précis : la position seulement si vous l'acceptez sur votre téléphone, les alertes par courriel seulement après confirmation de votre adresse, les notifications seulement si vous les autorisez. Vous pouvez retirer votre consentement en tout temps (désabonnement, réglages du téléphone).",
      "Each piece of information is given by you, for a specific purpose: location only if you allow it on your phone, email alerts only after you confirm your address, notifications only if you allow them. You can withdraw your consent at any time (unsubscribe, phone settings).")]);
    sec(T("4. Fournisseurs et lieu des données", "4. Service providers and data location"), [
      T("Supabase : base de données des alertes, serveurs au Canada (région Canada Central, Montréal).", "Supabase: alerts database, servers in Canada (Canada Central region, Montréal)."),
      T("Render : hébergement du site et journaux techniques des visites (adresse IP, page demandée), serveur en Virginie (États-Unis).", "Render: site hosting and technical visit logs (IP address, page requested), server in Virginia (United States)."),
      T("Brevo : envoi des courriels d'alertes, des commentaires et des demandes de partenariat (Union européenne).", "Brevo: sending alert emails, comments and partnership requests (European Union)."),
      T("Formspree : transmission des commentaires et des demandes de partenariat, seulement en secours si Brevo n'est pas disponible (États-Unis).", "Formspree: forwarding comments and partnership requests, only as a backup if Brevo is unavailable (United States)."),
      T("Services de notification d'Apple, de Google ou de Mozilla, selon votre appareil : livraison des notifications chiffrées.", "Apple, Google or Mozilla notification services, depending on your device: delivery of encrypted notifications."),
      T("openrouteservice (HeiGIT, Allemagne) et OpenStreetMap (Nominatim) : calcul des trajets et recherche d'adresse, avec une position arrondie ou l'adresse tapée, sans autre renseignement.", "openrouteservice (HeiGIT, Germany) and OpenStreetMap (Nominatim): route calculation and address search, with a rounded location or the typed address, without any other information."),
      T("Google Fonts : chargement des polices de caractères (votre navigateur contacte Google).", "Google Fonts: loading fonts (your browser contacts Google)."),
      T("Aucun renseignement n'est vendu, loué ni utilisé à des fins publicitaires.", "No information is sold, rented or used for advertising."),
      T("Communication à l'extérieur du Québec : certains de ces fournisseurs traitent des renseignements hors du Québec. En utilisant ces fonctions (alertes par courriel, formulaires), vous y consentez. Chaque fournisseur est lié par ses conditions écrites de protection des données ; Salle d'attente reste responsable des renseignements qui lui sont confiés.",
        "Communication outside Québec: some of these providers process information outside Québec. By using these features (email alerts, forms), you consent to it. Each provider is bound by its written data protection terms; Salle d'attente remains responsible for the information entrusted to it."),
    ]);
    sec(T("5. Conservation et suppression", "5. Retention and deletion"), [
      T("Alertes : conservées tant que vous êtes abonné ; le désabonnement les efface immédiatement. Une inscription par courriel non confirmée est effacée après 7 jours. Un abonnement aux notifications que votre appareil n'accepte plus est effacé automatiquement.", "Alerts: kept while you are subscribed; unsubscribing deletes them immediately. An unconfirmed email sign-up is deleted after 7 days. A notification subscription your device no longer accepts is deleted automatically."),
      T("Commentaires et demandes de partenariat : conservés le temps de les traiter, au plus 2 ans.", "Comments and partnership requests: kept while they are handled, for 2 years at most."),
      T("Journaux techniques de l'hébergeur : selon la durée fixée par Render.", "Host technical logs: for the period set by Render."),
    ]);
    sec(T("6. Rôles et responsabilités", "6. Roles and responsibilities"), [T("Seul le responsable de la protection des renseignements personnels a accès aux abonnements, aux commentaires et aux demandes de partenariat. Il veille à l'application de cette politique, aux effacements prévus et au traitement des demandes et des plaintes.",
      "Only the person in charge of the protection of personal information has access to subscriptions, comments and partnership requests. They ensure this policy is applied, scheduled deletions are made, and requests and complaints are handled.")]);
    sec(T("7. Plaintes", "7. Complaints"), [
      T("Écrivez au responsable (section 1) en décrivant votre plainte.", "Write to the person in charge (section 1) describing your complaint."),
      T("Vous recevez une réponse dans un délai de 24 à 72 heures, avec les mesures prises.", "You get an answer within 24 to 72 hours, with the measures taken."),
      T("Si la réponse ne vous satisfait pas, vous pouvez vous adresser à la Commission d'accès à l'information du Québec.", "If you are not satisfied with the answer, you can contact the Commission d'accès à l'information du Québec."),
    ]);
    sec(T("8. Sécurité", "8. Security"), [T("Connexions chiffrées (HTTPS), notifications chiffrées de bout en bout, base de données accessible seulement par notre serveur, liens personnels de gestion des alertes difficiles à deviner. En cas d'incident de confidentialité présentant un risque de préjudice sérieux, les personnes concernées et la Commission d'accès à l'information seront avisées.",
      "Encrypted connections (HTTPS), end-to-end encrypted notifications, database reachable only by our server, hard-to-guess personal links to manage alerts. In case of a privacy incident with a risk of serious injury, the people concerned and the Commission d'accès à l'information will be notified.")]);
    sec(T("9. Vos droits", "9. Your rights"), [
      T("Savoir quels renseignements nous avons sur vous et en obtenir une copie.", "Know what information we hold about you and get a copy."),
      T("Les faire corriger ou supprimer, et retirer votre consentement.", "Have it corrected or deleted, and withdraw your consent."),
      T("Porter plainte à la Commission d'accès à l'information du Québec (cai.gouv.qc.ca) si vous n'êtes pas satisfait de notre réponse.", "File a complaint with the Commission d'accès à l'information du Québec (cai.gouv.qc.ca) if you are not satisfied with our answer."),
    ]);
    sec(T("10. Modifications", "10. Changes"), [T("Toute modification de cette politique sera publiée sur cette page, avec sa date. Dernière mise à jour : 25 octobre 2026.", "Any change to this policy will be published on this page, with its date. Last updated: October 25, 2026.")]);
    box.appendChild(sos());
  }

  window.SA_GUIDE = {
    pages: { "#triage": triage, "#orienter": orienter, "#apropos": apropos, "#confidentialite": confidentialite },
    render(hash, box) { box.innerHTML = ""; this.pages[hash](box); },
  };
})();
