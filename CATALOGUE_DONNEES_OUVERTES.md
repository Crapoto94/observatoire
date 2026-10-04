# Catalogue des données ouvertes explorées pour l'observatoire

Exploration menée les 01 et 02/10/2026 : catalogue INSEE Melodi (147 jeux), catalogue SDES (DiDo), data.gouv.fr, portails Opendatasoft (Île-de-France Mobilités, Région Île-de-France, DREES, CAF, Éducation nationale), portail de l'Agence ORE (Data Fair) et API publiques.
Chaque source retenue a été **interrogée pour Ivry-sur-Seine (94041)** avant intégration, puis chargée pour les **communes d'Île-de-France** (onglet Carte). Les valeurs ci-dessous sont celles lues à l'import. Une source fermée à accès habilité figure dans une section dédiée (§1 bis) : elle est intégrée mais ses valeurs ne sont pas diffusables.

Principe d'import : on télécharge de préférence le fichier complet, ou filtré sur l'Île-de-France, puis on filtre et on agrège en interne par commune. Les requêtes commune par commune ne servent que lorsqu'aucune autre solution n'existe.

## 1. Jeux intégrés à l'application (58)

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

### Île-de-France, OpenStreetMap, base Basilic et Métropole du Grand Paris (oct. 2026)

Requêtes ODSQL groupées par commune (région uniquement pour les jeux OpenStreetMap) pour éviter les 1 266 requêtes communales ; trame verte lue en une seule pagination du FeatureServer MGP puis agrégée en interne.

| Jeu | Source et accès | Niveaux | Valeur lue pour Ivry |
|---|---|---|---|
| Aménagements cyclables (OpenStreetMap) | [Région Île-de-France](https://data.iledefrance.fr/explore/dataset/amenagements-velo-en-ile-de-france/), linéaires et nombre de segments par type de voie | commune IdF (1 034 communes couvertes) | 500 segments, 50 414 m (50,4 km) |
| Licences sportives par fédération | [Région Île-de-France](https://data.iledefrance.fr/explore/dataset/carte-des-licencies-sportifs-dans-le-val-de-marne/), millésime 2011, par fédération, âge et sexe | commune du Val-de-Marne (48 communes) | 5 302 licences, dont 3 027 de moins de 20 ans, 1 258 féminines et 1 034 en zone urbaine sensible |
| Lieux et équipements culturels | [Région Île-de-France, base Basilic](https://data.iledefrance.fr/explore/dataset/base-des-lieux-et-des-equipements-culturels-ile-de-france/), par domaine et type d'équipement | commune IdF (1 033 communes couvertes) | 27 lieux et équipements |
| Trame verte (composantes communales) | [Métropole du Grand Paris, FeatureServer](https://www.carto-metropolegrandparis.fr/server/rest/services/opendata_trameVerte_composantesCommune/FeatureServer/8) `opendata_trameVerte_composantesCommune`, surfaces converties en hectares | communes de la MGP (131 communes) | 1 265 secteurs, 169,3 ha (sous-trames et rôles ventilés) |

Le jeu d'équipements sportifs retenu reste [recensement-des-equipements-sportifs](https://data.iledefrance.fr/explore/dataset/recensement-des-equipements-sportifs/) (112 équipements à Ivry) : il est plus complet que le *recensement régional* (86 équipements), qui n'apporte que le nombre de places et la nature publique ou privée de la gestion.

### Emploi, sécurité, finances locales, santé et sport (oct. 2026)

| Jeu | Source et accès | Niveaux | Valeur lue pour Ivry |
|---|---|---|---|
| Demandeurs d'emploi inscrits à France Travail (catégories A, B, C, sexe, âge) | [DARES / France Travail](https://www.data.gouv.fr/datasets/66df098924d76afbdd70938a), portail ouvert de la DARES (Opendatasoft), sans clé, 4ᵉ trimestre sur 10 ans | commune | 6 500 demandeurs fin 2024, soit 99,9 pour 1 000 habitants (GOSB 85,2 ; Val-de-Marne 78,4 ; Île-de-France 81,5) |
| Délinquance enregistrée (15 catégories, 2016-2025) | [SSMSI, ministère de l'Intérieur](https://www.data.gouv.fr/datasets/621df2954fa5a3b5a023e23c), fichier CSV national compressé (40 Mo), filtré sur l'Île-de-France | commune | 167 cambriolages de logement en 2025 (2,6 pour 1 000 habitants) |
| Finances de la commune (comptes individuels) | [DGFiP, data.economie.gouv.fr](https://data.economie.gouv.fr/explore/?q=comptes+individuels+des+communes) : un fichier par période (2011-2015, 2016, 2017, 2018, 2019-2020, 2021, 2022, 2023-2024, 2025) | commune | dette 1 433 €/hab., personnel 1 445 €/hab. (2025) ; moyenne de la strate fournie |
| Offre sanitaire et sociale (FINESS) | [Région Île-de-France](https://data.iledefrance.fr/explore/dataset/finess/) | commune | 80 établissements, dont 16 pharmacies |
| Équipements sportifs | [Région Île-de-France](https://data.iledefrance.fr/explore/dataset/recensement-des-equipements-sportifs/) | commune | 112 équipements |
| Allocataires CAF par prestation (2020-2024) | [data.caf.fr, toutes prestations](https://data.caf.fr/explore/dataset/s_ben_com_f/) | commune | 17 610 foyers allocataires fin 2024 (35 920 personnes), dont 5 005 à la prime d'activité et 2 790 au RSA |
| Risques naturels et technologiques (GASPAR) | [Géorisques / data.gouv.fr](https://www.data.gouv.fr/datasets/536995eea3a729239d20486b), archive nationale (8 Mo) | commune | 3 arrêtés de catastrophe naturelle sur 10 ans (2025), 2 risques majeurs recensés (inondation, transport de marchandises dangereuses) |
| Performance énergétique des logements (DPE) | [ADEME / Terralyse](https://www.data.gouv.fr/datasets/6a9bea1e50326fc16ecb5bc7), millésime 2026, environ 5 500 communes | commune | 22 420 diagnostics, dont 11,5 % de logements classés F ou G |
| Impôt sur le revenu par commune (IRCOM) | [DGFiP](https://www.data.gouv.fr/datasets/536998cba3a729239d20505e), une archive Excel par année de revenus (2021-2024) | commune | 42 024 foyers fiscaux, dont 43,7 % imposés ; revenu fiscal de référence moyen de 25 926 € par foyer (22 991 € en 2021) |
| Professionnels de santé libéraux | [Région Île-de-France, annuaire santé](https://data.iledefrance.fr/explore/dataset/annuaire-et-localisation-des-professionnels-de-sante/), export CSV dédoublonné | commune | 57 professionnels conventionnés, dont 23 médecins généralistes (0,35 pour 1 000 habitants) et 15 chirurgiens-dentistes |
| Indice de position sociale des écoles (IPS) | [Éducation nationale](https://data.education.gouv.fr/explore/dataset/fr-en-ips-ecoles-ap2022/), rentrées 2022 à 2024 | commune | IPS moyen des écoles publiques : 98,0 (2022) puis 99,5 (2024) |

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
| Complémentaire santé solidaire (C2S, ex-CMU-C et ACS) | [INSEE / Cnam, bénéficiaires du régime général et de la C2S dans les QPV et leurs communes](https://www.insee.fr/fr/statistiques/8736902), fichiers CSV 2023 et 2025 | communes comptant un QPV (26 dans le Val-de-Marne) ; GOSB recalculé | 10 440 bénéficiaires de la C2S en 2025 (9 404 en 2023), 16,2 % de la population couverte par le régime général ; AME non publiée à la commune |
| Associations et ESS | [API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/docs/) | commune | 1 790 associations, 1 768 structures ESS |

### Déchets, émissions et séries du recensement (oct. 2026)

| Jeu | Source | Niveaux | Ce qui est calculé |
|---|---|---|---|
| Collecte des déchets ménagers et assimilés | [ADEME SINOE®, flux de collecte](https://data.ademe.fr/datasets/rsqxbwsxhk-ngmmu5fcasf5t) (API Data Fair) | EPT Grand-Orly Seine Bièvre 2016-2024 (collectivité compétente, valeurs reportées sur ses communes) ; Ivry seule 2009-2015 | kg/hab., part des biodéchets, valorisation matière, projection 2030 |
| Émissions de GES par secteur | [Airparif, inventaire des émissions](https://data-airparif-asso.opendata.arcgis.com/) (FeatureServer ArcGIS) | EPT, Val-de-Marne, Île-de-France ; 2005, 2010, 2015, 2019, 2022 | t éq. CO2/hab. (scopes 1 et 2), transport routier, projection 2030 |
| Population par grande tranche d'âge, familles, navettes, scolarisation | INSEE, dossiers complets Melodi (`DS_RP_POPULATION_PRINC`, `DS_RP_FAMILLE_COMP`, `DS_RP_NAVETTES_PRINC`, `DS_RP_EDUCATION_PRINC`) | communes, 2012, 2017, 2023 | évolutions par tranche d'âge, familles monoparentales, 6-17 ans non scolarisés, part modale active et sa projection, emplois occupés par des habitants |

| Allocataires CAF selon le quotient familial | [CAF, data.caf.fr](https://data.caf.fr/explore/dataset/ndur_s_qf_400_com_f/) (API Opendatasoft) | communes, 2020-2024 | part des foyers allocataires au quotient familial inférieur à 800 € |
| Allocataires CAF des quartiers prioritaires | [CAF, data.caf.fr](https://data.caf.fr/explore/dataset/ndur_s_qf_400_qpv_f/) | QPV 2024 rattachés à leur commune, décembre 2024 | même part dans les QPV : approche des revenus des QPV |
| Effectifs salariés du privé par secteur | [URSSAF, open.urssaf.fr](https://open.urssaf.fr/explore/dataset/etablissements-et-effectifs-salaries-au-niveau-commune-x-ape-last/) | communes, département, région ; 2006 à la dernière année | effectifs par secteur (NA17), part des emplois dans les secteurs en croissance sur 5 ans |

KPI dérivés (sans nouveau jeu) : âge moyen, écart de niveau de vie au Val-de-Marne, taux de création d'établissements, prix d'un appartement en années de niveau de vie, foncier disponible ou mutable et surfaces désimperméabilisables (MOS), taux annuel d'artificialisation, projections par tendance (population, demandeurs d'emploi, RSA).

### Sources à accès habilité, non publiques (2 jeux)

| Jeu | Source et accès | Niveaux | Ce qui est stocké |
|---|---|---|---|
| Vie associative : adhérents, bénévoles, salariés, comptes | [API Entreprise (DINUM), catalogue DJEPVA](https://entreprise.api.gouv.fr/catalogue/djepva/associations) — Le Compte Asso, RNA, Sirene ; **clé API délivrée à la Ville, source fermée** | communes dont le siège de l'association est dans le périmètre (Ivry-sur-Seine) | agrégats communaux par objet social et champ d'action : associations actives, ressources humaines déclarées du siège (adhérents, bénévoles, salariés, volontaires), comptes (subventions perçues, dons, produits, charges), agréments, affiliations, créations par année ; têtes de réseau nationales exclues des totaux |
| Subventions publiques aux associations | [API Entreprise (DINUM), Data Subvention](https://entreprise.api.gouv.fr/catalogue/data_subvention/subventions) — État (Chorus, Osiris dont ANS, Dauphin politique de la ville, Fonjep) et collectivités publiant au format SCDL ; **clé API délivrée à la Ville, source fermée** | associations dont le siège est dans la commune (Ivry-sur-Seine), têtes de réseau exclues | séries annuelles depuis 2015 par financeur (État, Région, Département, commune, EPT…) et politique publique : montants demandés, accordés, versés ; demandes instruites et accordées ; associations soutenues |

Ces valeurs sont signalées par un badge « Non public » dans l'application (catalogue, liste des jeux, valeur d'Ivry d'un indicateur, cartes de KPI) : elles ne doivent pas être diffusées telles quelles. Deux limites : les ressources humaines et les comptes ne sont connus que pour les associations ayant déclaré via Le Compte Asso (ce sont des minima), et aucun engin ne renvoie de données nominatives — seuls des agrégats par objet social sont conservés.

## 2. Identifiés mais non intégrés

| Sujet | Source repérée | Pourquoi pas encore | Piste |
|---|---|---|---|
| Logements autorisés et commencés, séries officielles | SDES, [logements autorisés et commencés par commune](https://www.statistiques.developpement-durable.gouv.fr/catalogue) (séries annuelles et mensuelles) | l'intégration recalcule les années à partir de Sit@del2 au logement ; les séries officielles serviraient de contrôle | comparer les deux calculs |
| Parc de véhicules et immatriculations par commune | SDES, [catalogue](https://www.statistiques.developpement-durable.gouv.fr/catalogue) (parc de véhicules, immatriculations) | l'Agence ORE couvre déjà le parc par commune ; le SDES ajouterait énergie et vignette Crit'Air | agréger le CSV par commune et motorisation |
| Qualité de l'air (jours de dépassement) | [hub Airparif](https://data-airparif-asso.opendata.arcgis.com/) (seuls les indices communaux du jour ; l'inventaire des émissions est intégré) | pas d'historique communal ouvert | demande à Airparif (voir `docs/demandes-donnees/07-airparif.md`) |
| Bruit | aucun jeu communal ouvert trouvé (Bruitparif, cartes stratégiques) | substitut intégré : multi-exposition et grille de nuisances | demande à Bruitparif |
| Fréquentation des bus | IDFM, [validations du réseau de surface](https://data.iledefrance-mobilites.fr/explore/dataset/validations-reseau-surface-nombre-validations-par-jour-1er-trimestre/) | publiées par ligne, sans arrêt ni commune | non rattachable |
| Accessibilité aux équipements (isochrones) | IDFM, [offre de transports GTFS](https://data.iledefrance-mobilites.fr/explore/dataset/offre-de-transports-gtfs/) et indicateurs 981/984/985 | les indicateurs supposent un calcul d'isochrones par arrêt (routage, temps de trajet), pas un simple comptage d'équipements | calculer les isochrones 10/20/30 minutes à partir des arrêts et de la graphine GTFS |
| Pollution lumineuse | [MGP, `opendata_trameVerte_radiance`](https://www.carto-metropolegrandparis.fr/server/rest/services/opendata_trameVerte_radiance/FeatureServer) (442 910 points de luminance nocturne) | luminance au point, sans code commune | calcul zonal ( moyenne par commune ou par secteur ) |
| Secteurs scolaires | [Région Île-de-France](https://data.iledefrance.fr/explore/dataset/secteurs-scolaires/) | ne couvre que Paris et ses arrondissements | rattacher les autres communes par le RPE |
| Parc privé potentiellement indigne (PPPI), vacance des locaux d'activité, foncier mutable | Cerema, [fichiers fonciers et DV3F](https://datafoncier.cerema.fr/) | accès réservé aux collectivités et à l'État | demande d'accès (voir `docs/demandes-donnees/01-cerema-fichiers-fonciers.md`) |
| Demandeurs d'emploi par QPV et métiers | [France Travail](https://francetravail.io/data/api) (le volume communal est déjà intégré) | API soumise à clé, pas de détail infracommunal ouvert | demande à la direction territoriale (voir `docs/demandes-donnees/06-france-travail.md`) |
| Résultats au brevet (DNB) par établissement | [Éducation nationale](https://data.education.gouv.fr/explore/dataset/fr-en-dnb-par-etablissement/) | s'arrête à la session 2021 | taux de réussite par commune |

- **Quartiers prioritaires (QPV)** : les contours (ANCT, géographie 2024) sont affichés en surcouche sur la cartographie : 298 quartiers en Île-de-France, 47 dans le Val-de-Marne, 36 dans le GOSB, dont 4 à Ivry (Pierre et Marie Curie, Gagarine, Ivry Port, Monmousseau). Les revenus des QPV sont approchés par le quotient familial des allocataires CAF (jeu `caf_qf_qpv`) ; le revenu disponible de l'ensemble des habitants (Filosofi QPV) reste à charger depuis les fichiers de l'INSEE.

## 2 bis. Portails du GOSB, du Val-de-Marne et de la Région : ce qui a été trouvé

- **Grand-Orly Seine Bièvre** : aucun portail de données ouvertes. Le profil [data.gouv.fr du GOSB](https://www.data.gouv.fr/organizations/grand-orly-seine-bievre/) ne publie aucun jeu. Des couches cartographiques « ept12 » (structures de l'emploi, ports fluviaux, syndicats de déchets, bus structurants) existent via l'Apur sur geo.data.gouv.fr, mais ne sont plus mises à jour. Le [PLUi, pré-diagnostic socio-économique](https://www.grandorlyseinebievre.fr/fileadmin/PORTAIL/PLUi/Majnov2023/20221110_PLUi_PreDiagnosticSocioEconomique_v2.pdf) est un document PDF exploitable pour le cadrage.
- **Département du Val-de-Marne** : pas de portail ouvert trouvé (les adresses testées ne répondent pas) et aucune organisation du département sur data.gouv.fr.
- **Résultats au brevet (DNB) par établissement** : publiés par l'Éducation nationale mais seulement jusqu'à la session 2021 ; non intégrés pour cette raison.
- **Ville d'Ivry** : les adresses data.ivry94.fr et opendata.ivry94.fr répondent « Accès restreint ».
- **Région Île-de-France** ([data.iledefrance.fr](https://data.iledefrance.fr/)) : portail riche, déjà utilisé (occupation du sol, nuisances, îlots de chaleur, multi-exposition). Intégrés cette fois : FINESS, équipements sportifs, aménagements cyclables, licences sportives, base Basilic des lieux culturels. Repérés mais non intégrés : annuaire des professionnels de santé (déjà intégré par ailleurs, dédoublonné), établissements pour personnes âgées (sans code commune), répertoire des bibliothèques (sans code INSEE), hébergement touristique, mobilités scolaires, registre des cantines, indices de position sociale des lycées (lycées seulement).
- **Métropole du Grand Paris** ([carto-metropolegrandparis.fr](https://www.carto-metropolegrandparis.fr/)) : serveur ArcGIS public inventorié. Intégrée : trame verte (composantes par commune). Services Naturalistes (`opendata_NbObsCommune`, `opendata_NbEspCommune`) et `opendata_energie_geothermie_commune` repérés mais sans couche exploitable ; le service `opendata_trameVerte_radiance` contient 442 910 points de luminance sans code commune.

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

## 4. Indicateurs sans source ouverte exploitable

Il reste 24 fiches sans valeur. Elles relèvent des systèmes d'information de la Ville ou de données d'organismes accessibles sur demande. Les demandes sont préparées dans `docs/demandes-donnees/` du dépôt (méthode, suivi, un dossier par organisme avec le texte à envoyer) :

| Données | Détenteur | Dossier |
|---|---|---|
| Vacance des commerces et locaux d'activité, foncier mutable, PPPI | Cerema (fichiers fonciers, DV3F) | `01-cerema-fichiers-fonciers.md` |
| Logements vacants à l'adresse | DGALN, Zéro Logement Vacant | `02-zlv-lovac.md` |
| Demandes et attributions de logements sociaux | DRIHL (Infocentre SNE) ; service logement (Pelehas) | `03-drihl-infocentre-sne.md`, `10-interne-pelehas.md` |
| Allocataires par quartier, non-recours | CAF du Val-de-Marne | `04-caf-94.md` |
| AME, C2S et ALD à la commune | CPAM du Val-de-Marne | `05-cpam-94.md` |
| Demandeurs d'emploi par QPV, métiers | France Travail | `06-france-travail.md` |
| Jours de dépassement des seuils de pollution | Airparif | `07-airparif.md` |
| Trafic routier | Département du Val-de-Marne | `08-cd94-comptages-routiers.md` |
| Temps de trajet, accessibilité aux pôles | IDFM, Institut Paris Region | `09-idfm-ipr-mobilite.md` |
| Impayés de loyer et d'énergie, accès aux droits | CCAS (Millésime) | `11-interne-millesime.md` |

Restent purement internes : la fréquentation des équipements, les publics touchés et l'origine des adhérents des associations (à recueillir avec les dossiers de subvention). Ces fiches sont marquées « interne » dans la liste des indicateurs.
