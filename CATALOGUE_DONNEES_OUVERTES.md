# Catalogue des données ouvertes explorées pour l'observatoire

Exploration menée le 01/10/2026 : catalogue INSEE Melodi (147 jeux), data.gouv.fr (recherche par thème), portails Opendatasoft (Île-de-France Mobilités, Région Île-de-France, DREES, CAF, Éducation nationale) et API publiques.
Chaque source retenue a été **interrogée pour Ivry-sur-Seine (94041)** avant intégration. Les valeurs ci-dessous sont celles lues à l'import.

## 1. Jeux intégrés à l'application (31)

### INSEE, API Melodi (20 jeux, communes + département, métropole, région)

Série historique du recensement 1968-2023 (population de tous les niveaux géographiques : dénominateur du calcul « pour 1 000 habitants ») · population municipale 1968-2023 · population par sexe et âge (POP1) · naissances · décès · ménages par taille (MEN4) et par type (MEN5/6) · nationalité (NAT1) · immigration (IMG1) · migrations résidentielles · scolarisation (FOR1) · population active et chômage · CSP (POP6) · emploi au lieu de travail · Filosofi 2023 · stocks Sirene · créations d'entreprises · base permanente des équipements · logements (dossier complet) · déplacements domicile-travail (NAV2).
Ivry : 65 064 habitants (2023), niveau de vie médian 22 210 €, taux de pauvreté 28 %.

### Open data hors INSEE (11 jeux)

| Jeu | Source et accès | Niveaux | Période | Valeur lue pour Ivry | Indicateurs alimentés |
|---|---|---|---|---|---|
| Loi SRU | Ministère de la Transition écologique, API tabulaire data.gouv.fr | commune | 2024, 2025 | 12 535 logements sociaux, taux SRU 44,15 % (cible 25 %) | respect SRU, part de logements sociaux |
| Carte des loyers | idem | commune | 2022, 2023, 2025 | appartement 23,6 €/m² en 2025 (20,2 en 2022) | prix et loyers |
| Ventes immobilières (DVF) | DGFiP / Etalab, fichiers geo-dvf par commune, calcul à l'import | commune | 2020-2025 | prix médian appartement 4 932 €/m² en 2025 (5 500 en 2022) | prix, évolution des prix |
| Artificialisation des sols | Portail de l'artificialisation (Cerema), API tabulaire | commune, EPCI, département, région | 2018, 2021 | 91,7 % puis 91,2 % | imperméabilité, espaces naturels |
| Occupation du sol (MOS 79 postes) | Institut Paris Région, Opendatasoft (agrégation à la source) | commune IdF | 2021, 2025 | 612 ha, dont 38 ha de parcs et jardins publics | espaces verts, surfaces |
| Multi-exposition environnementale | Institut Paris Région, Opendatasoft | commune IdF | actuel | répartition de la population en 6 classes | bruit, air, îlots de chaleur (approchant) |
| Établissements scolaires | Éducation nationale, annuaire | commune | courant | 31 écoles, 7 collèges, 5 lycées | équipements, besoins scolaires |
| Effectifs d'élèves | Éducation nationale | commune | 2009-2025 | environ 6 000 élèves (public + privé) | besoins scolaires |
| Foyers au RSA | CAF (data.caf.fr) | commune | 2020-2023 | 2 615 foyers (déc. 2021) au RSA non majoré | aides sociales, minima sociaux |
| Accidents corporels (BAAC) | ONISR, API tabulaire | commune | 2019-2024 | 90 accidents en 2024 (120 en 2019) | accidents corporels |
| Associations et ESS | API Recherche d'entreprises | commune | stock du jour | 1 790 associations, 1 768 structures ESS | nombre d'associations, ESS |

## 2. Identifiés mais non intégrés

| Sujet | Source repérée | Pourquoi pas encore | Piste |
|---|---|---|---|
| Logements commencés, permis de construire | Sit@del2 (SDES) | l'API DiDo du SDES refuse les paramètres de recherche testés ; les jeux data.gouv sont des cartes de 2010 | tester l'API DiDo avec la documentation du SDES |
| Parc social (RPLS) | SDES | idem ; seuls des extraits locaux trouvés sur data.gouv | idem |
| Logements vacants (LOVAC), parc privé potentiellement indigne (PPPI) | Fichiers fonciers / ANAH | accès restreint aux collectivités | demande d'accès via le Cerema ou l'ANAH |
| Consommation d'énergie à la commune | Agence ORE (CSV de 820 Mo), Enedis | fichier trop volumineux, pas d'API tabulaire | télécharger le fichier une fois et filtrer sur 94041 |
| Qualité de l'air, émissions de GES | Airparif | pas d'API ouverte testée (portail cartographique) | convention de données avec Airparif |
| Bruit | Bruitparif, cartes stratégiques de bruit | données géographiques (polygones) | agrégation par commune à construire |
| Îlots de chaleur | Institut Paris Région (classification en zones climatiques locales) | 237 000 polygones | agrégation par commune à construire |
| Fréquentation des transports | Île-de-France Mobilités (validations par arrêt) | à rattacher aux arrêts de la commune | croiser avec le référentiel des arrêts |
| Stationnements vélo | Base nationale des stationnements cyclables ; jeux locaux (Nanterre, GPSO) | aucun jeu d'Ivry trouvé | donnée à demander au service mobilité |
| Offre de soins, densité médicale | DREES (APL), RPPS | le jeu APL ne renvoie pas d'enregistrements par l'API | télécharger le fichier APL à la commune |
| Demandeurs d'emploi | France Travail | API soumise à clé | demande de clé |
| Collecte des déchets | SINOE (ADEME), EPT Grand-Orly Seine Bièvre | non testé | à étudier avec l'EPT |
| Autres prestations CAF (allocations logement, prime d'activité) | data.caf.fr | seul le RSA est publié à la commune dans les jeux trouvés | explorer le catalogue par prestation |

## 3. Limites rencontrées (à connaître avant d'exploiter les données)

- **Filosofi 2023 (INSEE)** : seuls le niveau de vie médian et le taux de pauvreté sont diffusés pour Ivry ; les déciles et les autres mesures sont marquées « valeur manquante ».
- **Artificialisation** : pour les départements et les régions, la part en % est remplacée par des dates dans le fichier source. Seules les surfaces sont utilisables à ces niveaux.
- **Carte des loyers 2024** : le fichier n'est pas servi par l'API tabulaire (millésimes 2022, 2023 et 2025 intégrés).
- **Éducation nationale** : le champ « code commune INSEE » du jeu des effectifs contient en réalité le code postal ; la recherche se fait donc par nom de commune et département.
- **API Recherche d'entreprises** : le nombre de résultats est plafonné à 10 000, le comptage des entreprises actives n'a donc pas été retenu. Les chiffres sont un stock du jour, sans historique.
- **BAAC avant 2019** : les codes communes y sont au format départemental à 3 chiffres ; seules les années 2019 à 2024 sont intégrées.
- **DVF** : les prix au m² sont calculés à l'import sur les ventes d'un seul logement (prix entre 500 et 30 000 €/m²) ; l'année en cours est partielle.
- **Multi-exposition** : l'échelle des 6 classes est celle de l'Institut Paris Région (voir la documentation du jeu avant toute interprétation).

## 4. Indicateurs sans source ouverte exploitable (SI de la collectivité)

Fréquentation des équipements, signalements d'impayés, adhérents, bénévoles et salariés des associations, déclarations d'intention d'aliéner, arbres plantés, consommations d'énergie communales, programmes livrés et livraisons prévues. Ils sont marqués « interne » dans la liste des indicateurs.
