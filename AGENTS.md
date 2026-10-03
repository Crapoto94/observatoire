# Observatoire — consignes de travail

## Manifest fonctionnel

- Le fichier `docs/manifest.md` décrit le **périmètre fonctionnel** de l'application (écrans, parcours, entités, comportements transverses). Il est destiné à Google Stitch pour une refonte graphique et sert aussi de documentation fonctionnelle.
- **À chaque modification fonctionnelle de l'application** (nouvel écran, nouvelle route, changement de parcours, nouvelle fonctionnalité, entité modifiée), **mettre à jour `docs/manifest.md`** en conséquence, dans le même commit.
- Le manifest est servi par le serveur à l'URL `/manifest.md` (lien présent dans le footer de l'app).

## Build & vérifications

- `npm run build` (Vite) : construit le client (`client/dist`).
- `npm run dev:api` / `npm run dev:web` : serveur d'API (port 2508) et front Vite (port 5180, proxy `/api` → 2508).

## Déploiement

- Pousser sur `origin main`, puis déployer en prod via `pulldocker.ps1` (git pull → build Docker → up).
