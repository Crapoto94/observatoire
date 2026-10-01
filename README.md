# Observatoire de la ville

Application de conception des indicateurs de l'observatoire municipal (Ivry-sur-Seine).

## Lancer

```bat
run.bat
```

ou `npm install` puis `npm run dev` (API : http://localhost:2508, client de développement : http://localhost:5180).
En production : `npm run build` puis `npm start` (tout est servi sur le port 2508). Node 22.13 ou plus (`node:sqlite`).

## Docker

```bash
docker compose up -d --build
```

L'application est alors sur http://localhost:2508.

- Image : build en 2 étapes (client Vite, puis serveur Node 24 sans dépendances de développement), exécutée avec l'utilisateur `node`.
- Données : volume nommé `observatoire-data` monté sur `/app/data` (base SQLite, indicateurs modifiés, données importées). Il survit aux mises à jour de l'image.
- Premier démarrage : la base est créée à partir de `server/seed/indicators.json`, puis les données INSEE d'Ivry et des territoires de comparaison sont importées automatiquement (désactivable avec `AUTO_IMPORT=false`).
- Le conteneur doit pouvoir joindre `api.insee.fr` et `geo.api.gouv.fr` (imports et recherche de communes).
- Santé : `GET /api/status` (ou `/api/health`), utilisé par le `HEALTHCHECK`.
- Configuration : copier `.env.example` en `.env` (port publié `APP_PORT`, `AUTO_IMPORT`, fuseau). `.env` n'est pas versionné.
- Sauvegarde de la base : `docker run --rm -v observatoire-data:/d -v "%cd%":/b alpine tar czf /b/observatoire-data.tgz -C /d .`
- Changer le port publié : modifier `ports` dans `docker-compose.yml` (par exemple `"8080:2508"`).

## Rubriques

| Rubrique | Rôle |
|---|---|
| Conception des indicateurs | Liste du classeur Excel (209 indicateurs), recherche, filtres, édition. Colonnes : lien d'origine, lien corrigé, proposition, lien données, jeux importés rattachés, statut, faisabilité. Fiche complète par indicateur (définition, formule, unité, périmètre, porteur, cible, indicateur de contexte associé, décision), historique des modifications, export Excel et CSV. |
| Pilotage | Couverture par thème (source, jeu importé, définition, porteur, validation), matrice priorité × faisabilité, doublons possibles, indicateurs de suivi sans indicateur de contexte. |
| Carte mentale | Générée à partir de la base, géométrie relevée sur la carte PDF (cadres, pastilles, couleurs par niveau et par priorité). Export SVG, versions enregistrées (par exemple une par CODIR), pastille verte sur les indicateurs validés, indicateurs abandonnés masqués. |
| Données | Jeux importés dans la base (SQLite) : tableau brut, graphique, comparaison avec un territoire au choix, valeurs pour 1 000 habitants, écart à la dernière période commune, bouton de mise à jour par jeu et bouton « Tout mettre à jour » (réimporte tous les jeux publics pour tous les territoires, avec progression et bilan ; un seul import à la fois). |

## Territoires de comparaison

Importés d'emblée avec Ivry : Val-de-Marne, Métropole du Grand Paris, Île-de-France, et 11 communes proches (Vitry-sur-Seine, Villejuif, Le Kremlin-Bicêtre, Gentilly, Alfortville, Choisy-le-Roi, Créteil, Champigny-sur-Marne, Montreuil, Saint-Denis, Nanterre). Liste dans `server/seed.js` (`DEFAULT_GEOS`).
Une autre commune s'ajoute depuis la page Données (recherche par nom ou code INSEE) ; son import démarre aussitôt.

## Données

- Base : `data/observatoire.sqlite` (ignorée par git). Les données sont **importées**, jamais lues en direct par l'interface.
- Connecteurs : API Melodi de l'INSEE (`server/connectors/melodi.js`) ; API tabulaire data.gouv.fr, portails Opendatasoft, fichiers geo-dvf et API Recherche d'entreprises (`server/connectors/open.js`).
- Catalogue des jeux : `server/datasets.js` (INSEE) et `server/datasets_open.js` (open data). 31 jeux, voir `CATALOGUE_DONNEES_OUVERTES.md` pour les sources, les valeurs vérifiées, les pistes et les limites.
- Chaque jeu s'ouvre sur des **préréglages** (119 au total) : évolution, répartition, comparaison de territoires, ratios calculés (taux de chômage, part d'étrangers, taux de motorisation…), indice base 100, tranches d'âge de 5 ans. Les catégories qui s'emboîtent ne sont jamais additionnées. Définition : `client/src/datasetViews.ts`.
- Le pied de page affiche la date de la version déployée (utile pour repérer une image Docker périmée) ; `GET /api/status` la renvoie aussi.
- Présentation de chaque jeu dans l'explorateur : `client/src/datasetViews.ts` ; logique de sélection testable : `client/src/explorer.ts` (`node tools/test-explorer.mjs` avec le serveur lancé).
- Pour ajouter un jeu : ajouter une entrée dans `server/datasets.js` (identifiant Melodi + règles de rattachement aux indicateurs), puis redémarrer le serveur.
- Les liens vers d'autres portails (CAF, France Travail, Airparif, etc.) dans la colonne « Lien données » sont des pages d'accueil ou de recherche à confirmer ; aucun connecteur n'existe encore pour ces sources.

## Régénérer le jeu de départ

`npm run seed:build` relit le classeur et la carte PDF (Python avec `openpyxl` et `pymupdf`) et écrit `server/seed/indicators.json`.
`npm run seed:reset` recharge ce jeu dans la base : **les modifications faites dans l'interface sont perdues**.
Les propositions et liens de départ viennent de `server/seed/enrichment.js`.
