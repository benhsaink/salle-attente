# Salle d'attente : mise en ligne

Ce dossier contient tout ce qu'il faut pour mettre le site en ligne avec les **vraies données** des urgences du Grand Montréal.

- `server.js` : le serveur. Il télécharge chaque heure le fichier officiel du ministère de la Santé, garde le résultat 10 minutes et l'envoie au site.
- `public/index.html` : le site que voient les utilisateurs.
- `package.json` : la fiche d'identité du projet (nom, commande de démarrage).

Compte environ 20 minutes. Tout est gratuit.

## Étape 1 : créer un compte GitHub

GitHub sert à entreposer ton code en ligne.

1. Va sur github.com et crée un compte gratuit.
2. Clique sur le **+** en haut à droite, puis **New repository**.
3. Nom : `salle-attente`. Coche **Private** si tu veux garder le code privé. Clique **Create repository**.

## Étape 2 : déposer les fichiers

1. Décompresse le fichier `salle-attente.zip` sur ton ordinateur.
2. Sur la page de ton nouveau dépôt GitHub, clique sur le lien **uploading an existing file**.
3. Glisse **le contenu** du dossier (les fichiers `server.js`, `package.json`, `LISEZMOI.md` **et le dossier** `public`) dans la fenêtre.
4. Clique **Commit changes**.

Vérifie que tu vois bien le dossier `public` dans la liste. S'il manque, recommence en glissant le dossier `public` seul.

## Étape 3 : mettre en ligne avec Render

Render fait tourner ton serveur sur Internet.

1. Va sur render.com et crée un compte avec ton compte GitHub (bouton **GitHub**).
2. Clique **New +**, puis **Web Service**.
3. Choisis ton dépôt `salle-attente` (autorise Render à y accéder si on te le demande).
4. Remplis :
   - **Language / Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
5. Clique **Deploy Web Service**.

Après 2 ou 3 minutes, Render affiche une adresse du genre `https://salle-attente-xxxx.onrender.com`. Ouvre-la sur ton téléphone : tu vois les urgences réelles.

## Bon à savoir

- **Version gratuite de Render** : le serveur s'endort après 15 minutes sans visite. La première visite suivante prend environ 50 secondes. Pour un vrai lancement, la version payante (environ 7 $ US par mois) règle ce problème.
- **Données manquantes** : le ministère indique que certaines régions (dont le CIUSSS du Nord-de-l'Île-de-Montréal : Sacré-Cœur, Fleury, Jean-Talon) peuvent être absentes temporairement. Elles réapparaîtront automatiquement.
- **Si le site affiche « Données indisponibles »** : dans Render, ouvre l'onglet **Logs** et copie-moi les dernières lignes. Je corrige.
- **Modifier le site** : sur GitHub, ouvre un fichier, clique le crayon, modifie, puis **Commit changes**. Render remet le site à jour tout seul.
- **Attribution obligatoire** : la licence CC BY 4.0 exige de citer le ministère comme source. C'est déjà fait au bas de la page ; garde-le.

## Prochaines étapes

1. Nom de domaine (ex. salledattente.ca), relié à Render dans **Settings > Custom Domains**.
2. Historique des données dans une base de données, pour les prévisions « meilleur moment pour y aller ».
3. Comptes utilisateurs, alertes et abonnement payant (Stripe).
4. Application mobile (iPhone et Android).

## Historique et « meilleurs moments »

- `collect.js` enregistre les données du ministère dans `data/historique/` (un fichier par mois) et calcule `data/stats.json`.
- Il est lancé automatiquement toutes les 30 minutes par GitHub Actions (`.github/workflows/collecte.yml`). Onglet **Actions** du dépôt : bouton **Run workflow** pour une collecte manuelle.
- Le fichier du ministère ne donne que la situation actuelle : l'historique se construit heure par heure. Les « meilleurs moments » s'affichent après 7 jours de données.
- Le site lit `data/stats.json` sur GitHub (une fois par heure). Il relaie aussi le fichier du ministère sur /api/source.csv, car le ministère bloque GitHub.
- Les urgences psychiatriques sont cachées par défaut et s'affichent avec la case « Urgences psychiatriques ».

## Section pédiatrique

- La case « Pédiatrique seulement » montre les hôpitaux pour enfants, et aussi les hôpitaux généraux listés dans `PEDS` (lib.js), avec l'étiquette « Services pédiatriques ».
- `PEDS` est vide pour l'instant : on n'y ajoute un hôpital que s'il est confirmé par une source officielle (lien + date dans la ligne).

## Fiche par urgence

- Chaque urgence a sa fiche : touche son nom (ou « Voir la fiche ») dans la liste. L'adresse est du type `/#fiche=NOM`, qu'on peut partager.
- La fiche montre la situation actuelle détaillée, l'itinéraire, les 24 dernières heures (lues dans `data/historique/` par `/api/historique?nom=…`) et la semaine type dès 7 jours d'historique.
- Aucune information de service (téléphone, horaires, spécialités) n'y est ajoutée sans source officielle.

## Cliniques (onglet « Cliniques aujourd'hui »)

- La liste des cliniques vient de Québec.ca (GMF-A/R, les anciennes « super-cliniques ») : `data/cliniques/liste.json` (nom, numéro de fiche, région).
- Chaque matin vers 5 h, GitHub Actions (`.github/workflows/repertoire.yml`) lance `repertoire.js` : il lit la fiche officielle de chaque clinique dans le Répertoire des ressources de Santé Québec (par le relais du site, `/api/repertoire`, car GitHub est bloqué) et écrit `data/cliniques/cliniques.json`.
- On en tire seulement ce que la fiche dit : adresse, position (lien « Comment s'y rendre »), téléphone, horaire des 7 prochains jours, façons de prendre rendez-vous le jour même, et si c'est pour tous ou pour les patients inscrits.
- Ces fiches ne parlent pas de « sans rendez-vous » au sens strict : ce sont des rendez-vous le jour même. Le site le dit clairement, et il n'y a pas de places en temps réel.
- Ajouter une clinique : ajouter une ligne dans `liste.json` avec son numéro de fiche (le `nofiche=` de son adresse sur sante.gouv.qc.ca). La lecture se relance toute seule.

## Cliniques privées (onglet « Privées »)

- `data/cliniques/privees-liste.json` : les cliniques privées repérées dans la liste RAMQ des médecins non participants (septembre 2026), avec leur numéro de fiche du Répertoire des ressources.
- `repertoire.js` lit leurs fiches officielles chaque matin et écrit `data/cliniques/privees.json` (adresse, position, téléphone, heures, services).
- Le site n'affiche que les cliniques dont la fiche est complète (adresse, position, téléphone, heures, services). Aucun tarif n'est affiché : seulement la mention « Payant ».
- Filtre par service ou spécialité : la liste se construit à partir des services présents dans au moins 2 fiches.

## Commentaires des utilisateurs

- La section « Une erreur ? Une idée ? » au bas de la page envoie les messages à `/api/commentaires` (5 envois par heure au maximum par personne, champ piège contre les robots).
- Chaque message apparaît dans Render, onglet **Logs**, sur une ligne qui commence par `COMMENTAIRE`.
- Pour les recevoir par courriel : créer un formulaire gratuit sur formspree.io, puis dans Render, **Environment**, ajouter la variable `FEEDBACK_URL` avec l'adresse du formulaire (ex. `https://formspree.io/f/abcdwxyz`).
- Vérification du 20 octobre 2026 : sites officiels des CISSS/CIUSSS et fiches du Répertoire consultés pour les 22 urgences générales. Seule Maisonneuve-Rosemont est confirmée (« offre des services en pédiatrie », page Urgence du CIUSSS de l'Est). Les fiches d'hôpitaux du Répertoire ne listent pas leurs services. Les autres pages consultées ne mentionnent pas de section pédiatrique à l'urgence : on ne les ajoute pas.

## Capitale-Nationale (bouton « Québec »)

- 12 urgences de la région 03 ajoutées à `PLACES` (lib.js), avec l'adresse et la position de leur fiche officielle du Répertoire (20 octobre 2026).
- 8 GMF-A/R (liste Québec.ca) dans `liste.json` et 8 cliniques privées dans `privees-liste.json`, avec `"region": "qc"`.
- Aucune urgence pédiatrique confirmée par une source officielle dans la région pour l'instant (CHUL non confirmé) : rien d'ajouté à `PEDS`.

## Recherche par adresse ou code postal

- `/api/adresse?q=…` : le serveur demande la position à Nominatim (OpenStreetMap), au plus 1 requête par seconde, résultats gardés en mémoire, 30 recherches par heure et par personne. L'adresse n'est pas écrite dans les journaux.
- Si Nominatim ne connaît pas un code postal complet, on prend le secteur (3 premiers caractères) et le site l'indique.

## Langues (français / anglais)

- Bouton « English / Français » en haut de la page ; le choix est gardé dans le navigateur.
- `public/i18n.js` traduit l'interface au moment de l'affichage : un dictionnaire (texte français → anglais) et des modèles pour les textes avec des chiffres, des heures (« 8 h à 20 h » → « 8 a.m. to 8 p.m. ») et des dates.
- Les données officielles (noms d'hôpitaux et de cliniques, adresses, services, notes des fiches) restent en français, et le site le signale.
- Pour un nouveau texte en français dans la page : ajouter sa traduction dans le dictionnaire de `i18n.js`, sinon il reste en français.

## Onglet « Soins privés » (en développement)
- Annonce la future liste de prestataires de soins privés (à domicile ou en bureau) et invite les entreprises à proposer un partenariat.
- Le bouton « Nous contacter pour un partenariat » ouvre le formulaire de commentaires avec le type « Partenariat ».
- Le formulaire a maintenant les champs Nom et Téléphone (facultatifs, mais obligatoires pour un partenariat). Ils arrivent dans la ligne « COMMENTAIRE » des journaux Render et, si FEEDBACK_URL est réglée, par courriel.

## Filtre « Sans RAMQ ni assurance (statut migratoire précaire) » (onglet Cliniques)
- Montre les ressources gratuites pour les personnes sans couverture médicale, avec un encadré : PFSI pour les demandeurs d'asile, RAMQ pour les enfants, 911.
- Les ressources sont dans la liste NOCOV de public/index.html, ajoutées à la main avec leur source officielle et la date de vérification.
- Médecins du Monde, Clinique pour les personnes migrantes à statut précaire : 6235, rue Saint-Hubert, Montréal, 514 281-8998. Source : https://medecinsdumonde.ca/clinique-migrante/ (vérifiée le 20 octobre 2026). Coordonnées : OpenStreetMap.
- Région de Québec : aucune ressource vérifiée pour l'instant.

## Grand Montréal élargi (20 octobre 2026)
- Ajout de 4 urgences dans la zone de Saint-Jérôme à Saint-Jean-sur-Richelieu et de Valleyfield à Joliette : Hôpital du Suroît (Valleyfield) et Barrie Memorial (Ormstown) dans Rive-Sud ; Argenteuil (Lachute) et Hôpital de Lanaudière (Joliette) dans Rive-Nord.
- Toujours hors du site : Honoré-Mercier (Saint-Hyacinthe), Hôtel-Dieu de Sorel, Sainte-Agathe, Mont-Laurier, Rivière-Rouge.

## Québec–Lévis et Trois-Rivières (20 octobre 2026)
- Lévis est dans la région « qc » (bouton Québec–Lévis) : Hôtel-Dieu de Lévis (143 rue Wolfe) et Paul-Gilbert (9330 boulevard du Centre-Hospitalier, Charny). Adresses : liste des établissements de la RAMQ (15 juillet 2024).
- Nouvelle région « tr » (Trois-Rivières) : urgence du pavillon Sainte-Marie du CHAUR (1991 boulevard du Carmel).
- Cliniques GMF-A/R ajoutées depuis Québec.ca : GMF MAclinique Lévis (29382), Clinique réseau de Trois-Rivières (854870), GMF-A/R du Cap (606386).
- Cliniques privées : Clinique 1900 (Trois-Rivières, fiche 506231, médecin désengagé, « les soins sont payants »). Lévis : aucune fiche trouvée pour l'instant.

## Urgences de tout le Québec (20 octobre 2026)
- installations.js (Action « Adresses des urgences (M02) », chaque mois et à la main) lit la « Liste des installations » du ministère (fichiers cartographiques M02, Données Québec, CC BY 4.0) et écrit data/installations.json : adresse, municipalité, coordonnées et région sociosanitaire de chaque urgence. Le serveur relaie le fichier (/api/installations.csv) si GitHub n'y a pas accès.
- lib.js : les urgences hors de PLACES prennent leur région du code RSS (r01 Bas-Saint-Laurent… r18 Terres-Cries) ; 03 → qc, 06 → mtl, 13 → lav.
- Menu « Autres régions du Québec (urgences) » sous les boutons. Cliniques et Privées : pas offertes dans ces régions (message).
- Avec « Tout » : pas de « Meilleur choix » sans position ; avec la position, seulement une urgence à 75 km ou moins.

## « Comprendre le triage » (#triage) et « Où consulter ? » (#orienter)
- public/guide.js. Liens en haut de la page, sous le 911 / 811.
- #triage : les 5 niveaux de l'ÉTG et les délais visés (OIIQ et Collège des médecins, Triage à l'urgence : lignes directrices, 2019), réévaluation pendant l'attente, lien avec les chiffres du site.
- #orienter : (1) signes d'alarme officiels → 911, « pas sûr » → 911 ; (2) sinon le besoin : Centre antipoison, 9-8-8 / 811 option 2, Info-Santé 811, pharmacien, clinique / 811 option 3, urgences. N'évalue jamais la gravité.
- Sources : Québec.ca (AVC, urgence ambulance), Canada.ca (crise cardiaque), Santé Québec Laval (911), CIUSSS de la Capitale-Nationale (Où consulter), 988.ca. Consultées le 20 octobre 2026.

## Temps de route (openrouteservice)
- Case « Temps de route en voiture » dans le panneau de position (choix retenu dans le navigateur : sa-road). Si cochée, la position arrondie à 2 décimales (environ 1 km) est envoyée à /api/trajet.
- server.js (handleRoute) : les 25 urgences les plus proches à vol d'oiseau, une seule requête « matrix » à openrouteservice (driving-car), cache 30 min par secteur, 30 demandes par heure par IP.
- Clé gratuite à mettre dans Render : variable ORS_KEY. Sans clé, le site garde les distances à vol d'oiseau.
- Tris « Plus proche » et « Proche et peu remplie » : minutes de route quand elles sont connues.
- Aussi dans Cliniques et Privées : /api/trajet?type=cliniques|privees (clé = numéro de fiche), 25 plus proches.
- Relais /api/repertoire-nom?q=NOM : recherche par nom dans le Répertoire (renvoie nom, adresse et numéro de fiche) pour trouver de nouvelles cliniques.
- Ajoutées le 20 octobre 2026 : Clinique de santé familiale Harmonie (1154030), Clinique de santé M (854392), AxMédic (1204898 ; « des frais sont exigés » pour chaque service, même si « Coût pour services » dit Non) à Trois-Rivières ; Clinique médicale Lacroix (629768, « clinique médicale privée, hors RAMQ ») à Lévis.
- Écartées : AxMédic 1203796 (sans heures, sans frais), Clinique de santé M Trois-Rivières Ouest 1120582 (fiche vide). Introuvables dans le Répertoire : Clinique XO, Clinique Pro MD, Admedica, 8165 rue du Mistral.

## Vérification en lot des cliniques privées (20 octobre 2026)
- data/cliniques/privees-candidats.json : 93 adresses de la liste RAMQ (omnipraticiens non participants) sans clinique dans privees-liste.json.
- verifier-privees.js (Action « Vérifier les cliniques privées candidates ») : recherche par nom dans le Répertoire, même code postal, lecture de la fiche, décision. Journal : data/cliniques/privees-verifications.json.
- Retenues après relecture : Clinique DCS, RocklandMD centre-ville, Médecine privée – Cité médicale de Charlesbourg, Lacroix Saint-Sauveur, UnionMD Taschereau, Santé + (Vaudreuil-Dorion ; « Coût pour services : Non » mais frais exigés et médecin non participant, comme AxMédic).
- Écartées à la relecture : GMF (Physimed, Sillery, Cité médicale de Charlesbourg, Pincourt, 3090 Saint-Basile : services publics avec quelques frais), clinique dentaire, physiothérapie, pharmacie. ExcelleMD : fiche sans heures ni services.
- PointSanté : position ajoutée à la main (champ « position » de la liste), sa fiche n'a pas de lien de carte.
- Décisions sur les 5 fiches « à revoir » (23 octobre 2026) :
  - Santé + (Vaudreuil-Dorion, fiche 1091287) et UnionMD Gatineau (fiche 1086156) : gardées. « Coût pour services : Non » contredit « des frais sont exigés », mais le médecin est non participant ou désengagé (liste RAMQ) : les soins sont payants.
  - ExcelleMD Terrebonne (fiche 1121959) : écartée tant que la fiche n'a ni heures ni services. Relue par verifier-recherche.js (recherche « excellemd »).
  - GMF Plateau Marquette (Sherbrooke, 29650) et GMF des Collines (Wakefield, 911166) : écartées. Ce sont des GMF (services publics avec quelques frais), comme les autres GMF de la liste RAMQ.

## Formulaire de partenariat (onglet Soins privés, #partenaire)
- Champs : entreprise*, site, NEQ, nom*, téléphone*, courriel*, soins offerts*, lieu (domicile / locaux / les deux)*, régions desservies*, ordre professionnel et numéro de permis, précisions, accord pour être contacté*.
- POST /api/partenaires (server.js, handlePartner) : validation, champ piège, 5 envois par heure par IP, ligne « PARTENAIRE » dans les journaux, envoi à FEEDBACK_URL (Formspree) avec le sujet « demande de partenariat » et le courriel du partenaire en réponse (_replyto).

## Page « À propos » (#apropos)
- public/guide.js (apropos). Lien en bas de page : « À propos, sources et confidentialité ».
- Contenu : projet indépendant (non lié au ministère, à Santé Québec ni à la RAMQ), limites, sources et licences (CC BY 4.0, OpenStreetMap, openrouteservice), confidentialité (position, adresse, préférences, Formspree, journaux de Render, Google Fonts), contact.

## Cliniques dans les autres régions (21 octobre 2026)
- GMF-A/R : GMF des Grandes-Fourches (Sherbrooke, r05) et GMF Delta Santé (Gatineau, r07), seules GMF-A/R de la liste Québec.ca hors des secteurs déjà couverts.
- Cliniques privées (privees-candidats-regions.json → privees-verifications-regions.json) : Global MD (Saguenay), L'Accès (Drummondville), Pauzé Ferdais (Bromont), Santé Continuum (Sherbrooke), Lacroix (Gatineau), UnionMD Gatineau (contradiction « Coût : Non » mais frais exigés et médecin non participant, comme AxMédic et Santé +). GMF écartées comme ailleurs.
- verifier-gmf.js (Action « Vérifier les GMF ») : parcourt les ~570 GMF du Répertoire, lit chaque fiche, garde celles avec « rendez-vous le jour même pour tous » et une fiche complète (data/cliniques/gmf-verifications.json). 24 ajoutées le 21 octobre 2026, dont Bas-Saint-Laurent (Amqui, Sayabec), Saguenay–Lac-Saint-Jean (Roberval, Saint-Félicien, Saint-Prime), Abitibi (La Sarre), Chaudière-Appalaches (Montmagny, Saint-Patrice), Estrie (Lambton). Région : celle de l'urgence la plus proche.

## Pédiatrie, IPS et CLSC (23 octobre 2026)
- verifier-recherche.js (Action « Rechercher des cliniques ») : recherches par nom listées dans data/cliniques/recherches.json (modifier ce fichier relance la recherche). Résultats : data/cliniques/recherches/<id>.json. Rien n'est ajouté automatiquement.
- Première recherche : 575 CLSC, 35 IPS, 113 fiches pédiatriques. Seules les fiches « rendez-vous le jour même (pour tous) » et complètes sont gardées.
- Ajoutées dans liste.json (région de l'urgence la plus proche) :
  - CLSC : Mansfield-et-Pontefract, Chicoutimi, Pierrefonds (sans rendez-vous pour l'urgence seulement), Pohénégamook, Saint-Donat, Saint-Fabien-de-Panet, Saint-Pamphile, Saint-Jean-Port-Joli ; GMF CLSC de Saint-Michel (RVSQ la veille dès 18 h), GMF de Laurier-Station (même lieu que le CLSC 546, gardé une fois), GMF Les Myrtilles du Lac (Saint-Félicien).
  - IPS : Clinique IPS Santé Plus (Saguenay, frais), Justine Lagacé, infirmière praticienne (Lac-Mégantic, frais).
  - Pédiatrie : Cabinet pédiatrique du Dr Thomas Schwartz (Côte-Saint-Luc, 3 mois à 16 ans, appeler avant), avec "enfants": true.
- Écartées : CLSC Petite-Nation (« juste à l'urgence »), CLSC de Puvirnituq et Clinique spécialisée en pédiatrie de Saint-Hyacinthe (pas d'heures sur la fiche), Clinique médicale IPS de Victoriaville (fiche au futur : « sera située »).
- Toutes les autres fiches : patients inscrits seulement ou pas de rendez-vous le jour même indiqué.

## Ressources sans RAMQ hors Montréal et Québec (25 octobre 2026)
- Recherche « proximite » (verifier-recherche.js) : 46 fiches (proximité, itinérance, clinique de rue, migrants, réfugiés). Aucune ressource gratuite dont la fiche officielle confirme l'accès sans RAMQ, hors Médecins du Monde.
- Pas ajoutées faute de source sur la RAMQ : Équipe de soins de proximité de Trois-Rivières (fiche 1167469), cliniques de proximité de la Montérégie (Santé Montérégie, 9 avril 2026), SABSA (Québec : site officiel inaccessible d'ici).
- Cliniques des réfugiés (Québec, Saint-Jérôme…) : pour les réfugiés couverts par le PFSI ; celle de Saint-Jérôme exclut les personnes sans statut.
- Ajoutée aux Privées : Clinique médicale de proximité Saint-Wenceslas (fiche 1224401, r04), fiche : « Nous acceptons la clientèle avec et sans RAMQ », frais exigés.
- Note du filtre sans RAMQ : « Si vous pouvez payer : des cliniques privées reçoivent aussi des personnes sans RAMQ ».
- ExcelleMD Terrebonne relue : toujours sans heures (écartée).

## Meilleurs moments (25 octobre 2026)
- 7 jours atteints (stats.json : 19 → 25 oct.). Une mesure par case horaire pour l'instant ; 144 cases sur 168 couvertes, toutes le 26 oct. au soir.
- Petites urgences souvent vides (≥ 3 jours avec un créneau à 0 % et personne en attente) : message « Souvent calme » au lieu d'un classement arbitraire.

## Alertes (bêta gratuite) et site installable
- Site installable : public/manifest.webmanifest, icônes (icon-192/512, maskable, apple-touch-icon), public/sw.js (reçoit les notifications ; aucune mise en cache).
- Page #alertes (public/alertes-ui.js) ; #alertes=JETON pour gérer. Jeton gardé dans le navigateur (sa-alertes).
- alertes.js : 3 alertes (seuil d'occupation pour 1 à 5 urgences ; meilleure urgence de la zone qui change ; résumé quotidien à l'heure choisie). Pas d'alerte seuil/meilleure entre 23 h et 7 h ; seuil : 1 fois par 3 h par urgence ; meilleure : 1 fois par 2 h ; courriel : 4 par jour au maximum. Vérification toutes les 15 min dans server.js.
- webpush.js : Web Push sans dépendance (RFC 8291 aes128gcm, vérifié avec le vecteur de test officiel ; VAPID ES256).
- Adresses : GET /api/alertes/config ; POST /api/alertes (création) ; GET/PUT/DELETE /api/alertes?jeton= ; GET /api/alertes/confirmer?jeton= (double confirmation du courriel) ; GET /api/alertes/desabonner?jeton=.
- Variables Render : SUPABASE_URL, SUPABASE_KEY (clé secrète), VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, BREVO_KEY, ALERT_FROM, SITE_URL. Sans elles, la page dit « bientôt offertes ».
- Table Supabase (éditeur SQL) :
```sql
create table public.abonnements (
  jeton text primary key,
  canal text not null check (canal in ('push','courriel')),
  courriel text,
  push jsonb,
  confirme boolean not null default false,
  langue text not null default 'fr',
  alertes jsonb not null,
  zone jsonb,
  etat jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.abonnements enable row level security;
grant select, insert, update, delete on public.abonnements to service_role;
create index on public.abonnements (courriel);
```

## Politique de confidentialité (#confidentialite)
- public/guide.js (confidentialite). Liens : bas de page, À propos, page Alertes.
- Responsable : le fondateur, joignable par le formulaire du site (à compléter avec un nom ou un titre et un courriel dédié). Réponse en 24 à 72 heures.
- Durées : alertes jusqu'au désabonnement ; inscription par courriel non confirmée effacée après 7 jours (alertes.js, purgeUnconfirmed, une fois par jour) ; commentaires et demandes de partenariat 2 ans au plus.
- Fournisseurs listés : Supabase (Canada), Render (serveur en Virginie, É.-U.), Brevo (UE), services de notification Apple/Google/Mozilla, openrouteservice, OpenStreetMap, Google Fonts.
- Formulaires (commentaires, partenaires) : envoyés par Brevo à CONTACT_TO (ou ALERT_FROM) dès que BREVO_KEY et ALERT_FROM sont réglés ; sinon par Formspree (FEEDBACK_URL). Le 25 octobre 2026 : Brevo actif, FEEDBACK_URL retirée de Render et Formspree retiré de la politique de confidentialité. Si Brevo tombe en panne, les messages restent dans les journaux Render (lignes « COMMENTAIRE » et « PARTENAIRE »).
