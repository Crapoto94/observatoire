# Catalogue des données ouvertes explorées pour l'observatoire

Exploration menée les 01 et 02/10/2026 : catalogue INSEE Melodi (147 jeux), catalogue SDES (DiDo), data.gouv.fr, portails Opendatasoft (Île-de-France Mobilités, Région Île-de-France, DREES, CAF, Éducation nationale), portail de l'Agence ORE (Data Fair) et API publiques.
Chaque source retenue a été **interrogée pour Ivry-sur-Seine (94041)** avant intégration, puis chargée pour les **communes d'Île-de-France** (onglet Carte). Les valeurs ci-dessous sont celles lues à l'import.

Principe d'import : on télécharge de préférence le fichier complet, ou filtré sur l'Île-de-France, puis on filtre et on agrège en interne par commune. Les requêtes commune par commune ne servent que lorsqu'aucune autre solution n'existe.

## 1. Jeux intégrés à l'application (41)

### INSEE, API Melodi (20 jeux, communes + département, métropole, région)

Série historique du recensement 1968-2023 (population de tous les niveaux géographiques : dénominateur du calcul « pour 1 000 habitants ») · population municipale 1968-2023 · population par sexe et âge (POP1) · naissances · décès · ménages par taille (MEN4) et par type (MEN5/6) · nationalité (NAT1) · immigration (IMG1) · migrations résidentielles · scolarisation (FOR1) · population active et chômage · CSP (POP6) · emploi au lieu de travail · Filosofi 2023 · stocks Sirene · créations d'entreprises · base permanente des équipements · logements (dossier complet) · déplacements domicile-travail (NAV2).
Ivry : 65 064 habitants (2023), niveau de vie médian 22 210 €, taux de pauvreté 28 %.

### Construction et parc social, SDES (téléchargement de fichiers CSV)

| Jeu | Source et accès | Niveaux | Valeur lue pour Ivry |
|---|---|---|---|
| Sit@del2 : logements autorisés, commencés, achevés | [catalogue SDES](https://www.statistiques.developpement-durable.gouv.fr/catalogue?page=dataset&datasetId=6513f0189d7d312c80ec5b5b), fichier au logement, CSV filtré par commune ou région puis agrégé par année | commune, département, région | autorisés 2022-2026 : 1 557 / 684 / 994 / 789 / 149 ; commencés : 377 / 1 737 / 281 / 685 / 567 ; achevés : 1 195 / 1 267 / 100 / 692 / 4 (années récentes incomplètes) |
| RPLS : parc locatif social | [catalogue SDES](https://www.statistiques.developpement-durable.gouv.fr/catalogue?page=dataset&datasetId=6390f7cb84f0679b04942fc2), RPLS au logement, 3 derniers millésimes, agrégé par nombre de pièces, DPE, époque, QPV, financement | commune, département, région | 12 101 logements sociaux au 1er janvier 2025, dont 3 373 (28 %) en quartier prioritaire |

### Énergie et mobilité électrique, Agence ORE (API Data Fair)

Portail : <https://opendata.agenceore.fr> (API `/data-fair/api/v1`).

| Jeu | Jeu source | Niveaux | Valeur lue pour Ivry |
|---|---|---|---|
| Consommation d'électricité et de gaz par commune | [noxwlxv702-ohfyt76f-a3y9](https://opendata.agenceore.fr/data-fair/api/v1/datasets/noxwlxv702-ohfyt76f-a3y9), 2011-2024 | commune, département, région | résidentiel 2022-2024 : 154 517 / 151 041 / 154 822 MWh ; total 2023-2024 : 593 658 / 569 386 MWh |
| Voitures particulières par commune | [h1alt47wy0mt88lu6ybebjf-](https://opendata.agenceore.fr/data-fair/api/v1/datasets/h1alt47wy0mt88lu6ybebjf-), trimestriel | commune | 40 019 voitures au 30/09/2025, dont 1 288 rechargeables électriques |
| Points de recharge de véhicules électriques (IRVE) | [ehixq-fg4tjp8zbcdayorvqt](https://opendata.agenceore.fr/data-fair/api/v1/datasets/ehixq-fg4tjp8zbcdayorvqt) | commune | par année de mise en service |

### Autres jeux agrégés par commune à l'import

| Jeu | Source et traitement | Valeur lue pour Ivry |
|---|---|---|
| Logements vacants du parc privé (LOVAC) | [data.gouv.fr](https://www.data.gouv.fr/datasets/61816c6e23197bb34835228e/), API tabulaire, 2020-2026 | 4 514 logements vacants sur 27 781 en 2024 (le parc de référence change selon les millésimes) |
| Stationnements cyclables (OpenStreetMap) | [data.gouv.fr](https://www.data.gouv.fr/datasets/614d7cd3474124ea1fa212f1/), emplacements et capacité par commune | données contributives, couverture variable |
| Cumul de nuisances environnementales | [Institut Paris Région, grille de 500 m](https://data.iledefrance.fr/explore/dataset/cumul-de-nuisances-environnementales-grille-regionale-au-pas-de-500m-dile-de-fra/), agrégation par commune à la source | mailles de 500 m par nombre de nuisances et point noir |
| Îlots de chaleur urbains | [Institut Paris Région](https://data.iledefrance.fr/explore/dataset/ilots-de-chaleur-urbains-icu-classification-des-imu-en-zone-climatique-locale-lc/), export CSV complet (237 000 îlots), **rattachement à la commune par point dans polygone**, surfaces par zone climatique, aléa et vulnérabilité | surfaces en hectares par zone climatique |
| Fréquentation du réseau ferré | [Île-de-France Mobilités](https://data.iledefrance-mobilites.fr/explore/dataset/validations-reseau-ferre-nombre-validations-par-jour-1er-trimestre/), validations par lieu d'arrêt rattachées aux communes par le [référentiel des zones d'arrêts](https://data.iledefrance-mobilites.fr/explore/dataset/zones-d-arrets/) | validations du 1er trimestre 2026 et nombre de lieux d'arrêt |

### Open data hors INSEE chargés auparavant (11 jeux)

| Jeu | Source et accès | Niveaux | Valeur lue pour Ivry |
|---|---|---|---|
| Loi SRU | [data.gouv.fr](https://www.data.gouv.fr/datasets/6564969d3579e21795ebd378/), API tabulaire | commune | 12 535 logements sociaux, taux SRU 44,15 % (cible 25 %) |
| Carte des loyers | [data.gouv.fr](https://www.data.gouv.fr/datasets/693aa2feed1bf4da603faa49/), API tabulaire | commune | appartement 23,6 €/m² en 2025 (20,2 en 2022) |
| Ventes immobilières (DVF) | [data.gouv.fr](https://www.data.gouv.fr/datasets/5c4ae55a634f4117716d5656/), fichiers geo-dvf, calcul à l'import | commune | prix médian appartement 4 932 €/m² en 2025 (5 500 en 2022) |
| Artificialisation des sols | [data.gouv.fr](https://www.data.gouv.fr/datasets/697b4f4d51a9d53976e5a8c9/), API tabulaire | commune, EPCI, département, région | 91,7 % puis 91,2 % |
| Occupation du sol (MOS 79 postes) | [Institut Paris Région](https://data.iledefrance.fr/explore/dataset/mos-occupation-du-sol-2025-and-2021-en-79-postes-de-la-region-ile-de-france/) | commune IdF | 612 ha, dont 38 ha de parcs et jardins publics |
| Multi-exposition environnementale | [Institut Paris Région](https://data.iledefrance.fr/explore/dataset/scores-multiexposition-environnementale-communes/) | commune IdF | répartition de la population en 6 classes |
| Établissements scolaires | [Éducation nationale](https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/) | commune | 31 écoles, 7 collèges, 5 lycées |
| Effectifs d'élèves | [Éducation nationale](https://data.education.gouv.fr/explore/dataset/fr-en-ecoles-effectifs-nb_classes/) | commune | environ 6 000 élèves |
| Foyers au RSA | [CAF](https://data.caf.fr/explore/dataset/rsa_s_type_com_f-copy/) | commune | 2 615 foyers (déc. 2021) |
| Accidents corporels (BAAC) | [data.gouv.fr](https://www.data.gouv.fr/datasets/53698f4ca3a729239d2036df/), API tabulaire | commune | 90 accidents en 2024 (120 en 2019) |
| Associations et ESS | [API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/docs/) | commune | 1 790 associations, 1 768 structures ESS |

## 2. Identifiés mais non intégrés

| Sujet | Source repérée | Pourquoi pas encore | Piste |
|---|---|---|---|
| Logements autorisés et commencés, séries officielles | SDES, [logements autorisés et commencés par commune](https://www.statistiques.developpement-durable.gouv.fr/catalogue) (séries annuelles et mensuelles) | l'intégration recalcule les années à partir de Sit@del2 au logement ; les séries officielles serviraient de contrôle | comparer les deux calculs |
| Parc de véhicules et immatriculations par commune | SDES, [catalogue](https://www.statistiques.developpement-durable.gouv.fr/catalogue) (parc de véhicules, immatriculations) | l'Agence ORE couvre déjà le parc par commune ; le SDES ajouterait énergie et vignette Crit'Air | agréger le CSV par commune et motorisation |
| Qualité de l'air | [hub Airparif](https://data-airparif-asso.opendata.arcgis.com/) (seuls des indices communaux du jour) ; SDES, indicateurs territoriaux (par agglomération) | pas de série communale ouverte trouvée | convention de données avec Airparif |
| Émissions de GES | SDES, comptes d'émissions (national) | pas de niveau communal ouvert trouvé | inventaire communal Airparif |
| Bruit | aucun jeu communal ouvert trouvé (Bruitparif, cartes stratégiques) | substitut intégré : multi-exposition et grille de nuisances | demande à Bruitparif |
| Fréquentation des bus | IDFM, [validations du réseau de surface](https://data.iledefrance-mobilites.fr/explore/dataset/validations-reseau-surface-nombre-validations-par-jour-1er-trimestre/) | publiées par ligne, sans arrêt ni commune | non rattachable |
| Parc privé potentiellement indigne (PPPI) | Cerema / ANAH, [fichiers fonciers](https://datafoncier.cerema.fr/) | accès réservé aux collectivités et à l'État | demande d'accès |
| Offre de soins, densité médicale | DREES, [APL](https://data.drees.solidarites-sante.gouv.fr/explore/dataset/530_l-accessibilite-potentielle-localisee-apl/) | l'API ne renvoie pas d'enregistrements | télécharger le fichier APL |
| Demandeurs d'emploi | [France Travail, API Open Data](https://francetravail.io/data/api) | API soumise à clé | demande de clé |
| Collecte des déchets | [SINOE](https://www.sinoe.org/), EPT Grand-Orly Seine Bièvre | pas de série communale ouverte | demande à l'EPT |
| Autres prestations CAF | [data.caf.fr](https://data.caf.fr/) | seul le RSA est publié à la commune dans les jeux trouvés | explorer le catalogue par prestation |

## 3. Limites rencontrées (à connaître avant d'exploiter les données)

- **Filosofi 2023 (INSEE)** : seuls le niveau de vie médian et le taux de pauvreté sont diffusés pour Ivry ; les autres mesures sont marquées « valeur manquante ».
- **Artificialisation** : pour les départements et les régions, la part en % est remplacée par des dates dans le fichier source. Seules les surfaces sont utilisables à ces niveaux.
- **Carte des loyers 2024** : le fichier n'est pas servi par l'API tabulaire (millésimes 2022, 2023 et 2025 intégrés).
- **Éducation nationale** : le champ « code commune INSEE » du jeu des effectifs contient en réalité le code postal ; la recherche se fait par nom de commune et département.
- **API Recherche d'entreprises** : résultats plafonnés à 10 000, stock du jour sans historique.
- **BAAC avant 2019** : codes communes au format départemental à 3 chiffres ; seules 2019 à 2024 sont intégrées.
- **DVF** : prix au m² calculés à l'import sur les ventes d'un seul logement (500 à 30 000 €/m²) ; l'année en cours est partielle.
- **Sit@del2** : les années récentes sont incomplètes (les chantiers achevés se déclarent avec retard).
- **LOVAC** : le parc de référence change selon les millésimes ; les évolutions ne sont pas toujours comparables.
- **RPLS et SRU** : 12 101 logements au RPLS, 12 535 à l'inventaire SRU : périmètre et date de référence différents.
- **Stationnements cyclables** : données contributives OpenStreetMap ; vérifier l'exhaustivité avant de comparer des communes.
- **Îlots de chaleur** : rattachement par le point central de chaque îlot sur des contours simplifiés : de rares îlots en limite peuvent être attribués à la commune voisine.
- **Fréquentation ferrée** : un seul trimestre publié en détail ; les voyageurs ne résident pas forcément dans la commune.
- **Multi-exposition** : l'échelle des 6 classes est celle de l'Institut Paris Région (voir la documentation du jeu).
- **Agence ORE** : consommations d'électricité et de gaz de réseau uniquement, soumises au secret statistique. L'adresse `portail.agenceore.fr` refuse les requêtes automatisées ; l'API utilisée est celle de `opendata.agenceore.fr`.

## 4. Indicateurs sans source ouverte exploitable (SI de la collectivité)

Fréquentation des équipements, signalements d'impayés, adhérents, bénévoles et salariés des associations, déclarations d'intention d'aliéner, arbres plantés, consommations d'énergie communales, programmes livrés et livraisons prévues. Ils sont marqués « interne » dans la liste des indicateurs.
