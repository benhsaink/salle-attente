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
