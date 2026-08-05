# Guide de déploiement — Step into Football

Ce guide t'explique, étape par étape et sans jargon, comment mettre ce site en ligne gratuitement. Compte environ 45-60 minutes la première fois.

Le projet a 2 parties :
- **Le backend** (le "cerveau" qui traite les vidéos) → hébergé sur **Render.com**
- **Le frontend** (la page que voit l'utilisateur) → hébergé sur **Netlify**

---

## Étape 1 — Créer un compte Cloudinary (stockage des vidéos)

1. Va sur https://cloudinary.com et clique sur "Sign up free"
2. Une fois inscrit, tu arrives sur ton **Dashboard**
3. Note ces 3 informations affichées en haut (tu en auras besoin plus tard) :
   - `Cloud Name`
   - `API Key`
   - `API Secret` (clique sur l'icône œil pour l'afficher)

---

## Étape 2 — Mettre le code sur GitHub

Render et Netlify déploient à partir d'un dépôt GitHub.

1. Crée un compte sur https://github.com si tu n'en as pas
2. Clique sur le "+" en haut à droite → "New repository"
3. Nomme-le par exemple `step-into-football`, laisse-le en "Public" ou "Private", clique "Create repository"
4. Sur la page qui s'affiche, clique sur "uploading an existing file"
5. Glisse-dépose **tout le dossier** `step-into-football` (celui que je t'ai fourni (renomme-le `step-into-football` s'il ne s'appelle pas déjà comme ça)) dans la zone
6. Clique "Commit changes"

---

## Étape 3 — Déployer le backend sur Render

1. Va sur https://render.com et crée un compte (tu peux te connecter avec GitHub directement)
2. Clique "New +" → "Web Service"
3. Connecte ton dépôt GitHub `step-into-football`
4. Dans les réglages :
   - **Root Directory** : `backend`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Instance Type** : Free
5. Descends jusqu'à "Environment Variables" et ajoute :
   | Clé | Valeur |
   |---|---|
   | `CLOUDINARY_CLOUD_NAME` | ton Cloud Name de l'étape 1 |
   | `CLOUDINARY_API_KEY` | ton API Key de l'étape 1 |
   | `CLOUDINARY_API_SECRET` | ton API Secret de l'étape 1 |
6. Clique "Create Web Service"
7. Attends 3-5 minutes que le déploiement se termine (statut "Live")
8. **Copie l'URL de ton service** en haut de la page, du type `https://step-into-football.onrender.com`

⚠️ Sur le plan gratuit de Render, le serveur s'endort après 15 min d'inactivité et met ~30-60 secondes à se "réveiller" au premier appel. C'est normal, pas un bug.

---

## Étape 4 — Connecter le frontend au backend

1. Ouvre le fichier `frontend/app.js`
2. Tout en haut, remplace :
   ```js
   const API_BASE_URL = 'https://TON-BACKEND.onrender.com';
   ```
   par l'URL copiée à l'étape 4, par exemple :
   ```js
   const API_BASE_URL = 'https://step-into-football.onrender.com';
   ```
3. Sauvegarde, puis remets à jour ce fichier sur GitHub (dans le dépôt, ouvre `frontend/app.js`, clique l'icône crayon ✏️, colle le nouveau contenu, "Commit changes")

---

## Étape 5 — Déployer le frontend sur Netlify

1. Va sur https://netlify.com et connecte-toi avec GitHub
2. Clique "Add new site" → "Import an existing project"
3. Choisis ton dépôt `step-into-football`
4. Dans les réglages :
   - **Base directory** : `frontend`
   - **Build command** : *(laisse vide)*
   - **Publish directory** : `frontend`
5. Clique "Deploy site"
6. Après 1-2 minutes, Netlify te donne une URL du type `https://random-name-123.netlify.app`

C'est cette URL que tu partages avec ton cousin (ou l'agent) pour utiliser le site.

---

## Test rapide

1. Ouvre l'URL Netlify
2. Remplis le nom/poste/pied fort
3. Ajoute 1 à 5 vidéos (5-45 secondes chacune)
4. Clique "Générer le highlight"
5. Patiente 1-3 minutes (le premier essai peut être plus long si le backend Render se réveille)
6. La vidéo finale apparaît avec un bouton de téléchargement

---

## Limites du plan gratuit à connaître

- **Render Free** : le serveur s'endort après inactivité, RAM/CPU limités (le traitement de plusieurs vidéos peut prendre 1-2 min)
- **Cloudinary Free** : ~25 crédits/mois (largement assez pour des tests, mais pas pour un usage à grande échelle avec plein de joueurs)

Si un jour tu veux ouvrir ça à plus de monde, il faudra passer sur des plans payants (Render Starter ~7$/mois évite l'endormissement, Cloudinary Plus si plus de stockage).

---

## En cas de souci

- **"Erreur serveur" au moment de générer** → vérifie que les 3 variables d'environnement Cloudinary sont bien remplies sur Render
- **Rien ne se passe après 5 minutes** → le serveur Render gratuit peut mettre du temps à démarrer la première fois ; réessaie
- **Vidéo refusée** → vérifie qu'elle dure bien entre 5 et 45 secondes et qu'elle est en .mp4, .mov, .webm ou .mkv
