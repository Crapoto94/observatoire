# Manifest fonctionnel – Observatoire

## 1. Présentation générale

L'**Observatoire** est une application web de consultation et d'exploration d'indicateurs territoriaux. Elle a pour vocation de rendre des données territoriales structurées accessibles, compréhensibles et comparables, afin de faciliter le diagnostic et l'analyse d'un territoire.

Ce document décrit exclusivement le **fonctionnement, les écrans, les parcours, les entités et les comportements** de l'application. Il ne décrit pas l'identité visuelle ni la charte graphique : l'objectif est de permettre à Google Stitch de proposer un **refonte complète du style** à partir de ce seul périmètre fonctionnel.

## 2. Objectifs fonctionnels

L'application répond aux objectifs suivants :

- Permettre la **consultation synthétique** d'indicateurs territoriaux sur un tableau de bord.
- Permettre l'**exploration géographique** des indicateurs via une carte interactive.
- Permettre l'**exploration tabulaire** des indicateurs avec filtrage, tri et recherche.
- Permettre la **consultation détaillée** de chaque indicateur (fiche).
- Permettre de **croiser territoire, thématique et période** pour affiner l'analyse.
- Garantir la **cohérence des filtres** entre les différentes vues (tableau de bord, carte, liste).
- Proposer une **navigation simple et structurée** entre les vues principales.

## 3. Publics et cas d'usage

| Public | Cas d'usage principal | Besoin fonctionnel |
|---|---|---|
| **Chargés d'études** | Analyser, croiser et comparer des indicateurs sur un territoire. | Explorer via carte + liste, filtrer finement, consulter fiches détaillées. |
| **Observatoires territoriaux** | Diffuser et mettre à disposition des indicateurs. | Consultation structurée, accès par thématique/territoire, navigation claire. |
| **Élus** | Obtenir une vision synthétique du territoire. | Tableau de bord avec indicateurs clés, bascule rapide vers carte ou détail. |
| **Techniciens de collectivité** | Consulter des données de référence par périmètre. | Filtrage par territoire, accès direct aux fiches, recherche d'indicateurs. |
| **Partenaires** | Exploiter des indicateurs partagés. | Navigation structurée, accès aux métadonnées (définition, source, période). |

## 4. Périmètre fonctionnel

L'Observatoire est une application de **lecture/consultation** d'indicateurs territoriaux. Elle met à disposition des vues d'exploration (tableau de bord, carte, liste d'indicateurs) et des fiches détaillées. Les pages annexes assurent l'information institutionnelle.

## 5. Architecture de l'information

L'application est organisée autour d'une **navigation principale** et de plusieurs vues :

| Vue | Chemin | Rôle |
|---|---|---|
| **Mon tableau de bord** | `/mon-tableau` | Vue synthétique personnalisable (KPI, graphiques et cartes dont les styles cartographiques et la position de légende sont enregistrés par tuile) |
| **Indicateurs** | `/tableau-de-bord` | Consultation synthétique des indicateurs clés (KPI) par thématique |
| **Conception des indicateurs** | `/indicateurs` | Vue exploratoire (liste, filtres, tri, recherche, fiches) |
| **Autres** | `/autres` | Indicateurs calculables à partir des données importées mais absents de la conception, regroupés par thème avec valeur d'Ivry et repères GOSB / Val-de-Marne / Île-de-France (dont formes d'emploi, diplômes, immigrés, modes de déplacement domicile-travail, véhicules électriques et bornes de recharge, délinquance, DGF, allocations familiales) ; « Ajouter à la conception » crée une fiche brouillon avec nature et formule de calcul déjà renseignées. Section « Couches géographiques du Val-de-Marne (lecture en direct) » : indicateurs disponibles par couche (nombre, pour 1 000 hab., sommes) et lien vers la carte pour créer la fiche. Éclairage emploi (France Travail). |
| **IA** | `/ia` | Assistant conversationnel adossé aux données |
| **Pilotage** | `/pilotage` | Suivi de la conception (cohérence, doublons, priorisation) ; valeurs calculées pour Ivry : nombre d'indicateurs calculés, répartition fiables / approchées / partielles / sans valeur, taux de fiabilité estimé (moyenne pondérée : fiable 1, partielle 0,6, approchée 0,4), sources en écart ou incohérentes ; mêmes mesures par thème |
| **Carte mentale** | `/carte` | Vue relationnelle des indicateurs |
| **Données** | `/donnees` | Explorateur tabulaire et graphique ; chargement/actualisation des jeux sur les 1 266 communes d'Île-de-France si les sources le permettent. Les réponses paginées sont contrôlées ; un lot trop volumineux est subdivisé et réessayé pour éviter qu'une limite d'API ne laisse des communes sans données. |
| **Cartographie** | `/cartographie` | Carte géographique par couche (contours GOSB, départements, QPV), avec fonds IGN optionnels et réglage d'opacité des communes mémorisé localement |
| **Couches 94** | `/couches` | Couches géographiques du géoportail du Val-de-Marne lues en direct (WFS) : carte d'une commune du département sur fond de plan IGN (plan ou photographies aériennes) et indicateurs calculés à la volée |
| **Catalogue** | `/catalogue` | Catalogue des données : document de référence des données ouvertes et bouton « Liste des jeux de données » (`/catalogue?vue=jeux`, ancienne adresse `/jeux-de-donnees` redirigée) : jeux importés et couches lues en direct, avec source (icône par producteur : INSEE, DGFiP, géoportail du Val-de-Marne, MGP…), périmètre, granularité géographique et temporelle, champs et modalités dépliables, indicateurs et KPI qui y font référence ; recherche et filtres par source et par mode (importé / live) ; « Documentation de la source » : métadonnées publiées par la source (Melodi, data.gouv.fr, Opendatasoft, Data Fair, DiDo, géoportail du Val-de-Marne) lues en direct et mises en forme (producteur, couverture, résolution, période, fréquence, licence, description, champs, fichiers, liens), les métadonnées brutes restant accessibles par un lien ; badge « 🔒 Non public » pour les jeux à accès habilité (API Entreprise : vie associative), également affiché dans Données, sur les cartes KPI et dans la conception ; mode des jeux importés : temps de réponse de la source mesuré pour Ivry (renouvelé chaque semaine), « ⚡ live proposé » si la source répond en 300 ms ou moins, sélecteur Base / Live (administrateurs) ; en mode live, la page Données relit la source à l'affichage (délai 1,5 s), met la base à jour et se replie sur la base si la source ne répond pas (« ⚠ source injoignable : repli sur la base ») ; KPI et cartographie régionale restent calculés sur la base |
| **Nouveautés** | `/nouveautes` | Historique des versions |
| **Paramètres** | `/parametres` | Administration (réservé aux administrateurs) — inclut l'onglet IA |

Le **manifest fonctionnel** (`docs/manifest.md`) est servi par le serveur à l'URL `/manifest.md` et accessible depuis le footer.

## 6. Vues et écrans – Définition fonctionnelle détaillée

### 6.1 Tableau de bord – `/`

**Objectif fonctionnel** : Présenter une synthèse des indicateurs pour donner une vision d'ensemble du territoire à l'ouverture de l'application.

**Éléments fonctionnels présents** :

- **En-tête de page** : Titre fonctionnel "Tableau de bord". Peut comporter un sous-titre explicatif décrivant la portée de la vue.
- **Indicateurs clés (KPI)** : Bloc(s) présentant un ensemble d'indicateurs majeurs. Pour chaque KPI, l'application doit pouvoir afficher : libellé de l'indicateur, valeur, unité, territoire concerné, période de référence. Peut comporter une indication d'évolution lorsque disponible.
- **Aperçu cartographique** : Zone fonctionnelle permettant d'accéder à la vue cartographique. Son rôle est d'orienter l'utilisateur vers l'exploration géographique.
- **Accès rapides** : Liens fonctionnels vers les autres vues principales (Carte, Liste des indicateurs).
- **Regroupement thématique** : Possibilité de regrouper les indicateurs par thématique pour structurer la synthèse.

**Comportement** :
- Affichage d'une vue synthétique à l'arrivée.
- Permet d'orienter l'utilisateur vers des vues plus analytiques (carte ou liste).
- Peut refléter un contexte de territoire/thématique par défaut si défini.

### 6.2 Carte interactive – `/carte`

**Objectif fonctionnel** : Permettre l'exploration géographique des indicateurs afin de visualiser leur répartition sur le territoire.

**Éléments fonctionnels présents** :

- **Zone cartographique** : Surface principale dédiée à l'affichage du fond de carte et des données géographiques. Doit permettre la **navigation** (déplacement, zoom), l'**interaction avec les entités géographiques** (sélection/clic) et l'affichage de données par entité territoriale.
- **Panneau de filtres latéral** : Panneau de filtrage dédié à la vue carte. Contient les critères permettant de restreindre les données affichées sur la carte.
- **Légende** : Élément fonctionnel décrivant la signification des représentations cartographiques (classes, seuils ou modalités selon l'indicateur sélectionné). Doit être dynamique selon les données filtrées/affichées.
- **Contrôles cartographiques** : Outils fonctionnels de navigation (zoom, recentrage) et de gestion des couches si plusieurs indicateurs sont exploitables.
- **Zone de résultats/context** : Peut afficher des informations liées à l'entité sélectionnée sur la carte (territoire cliqué) pour contextualiser les données.

**Critères de filtrage fonctionnels (attendus sur cette vue)** :
- **Territoire** : Filtrage par périmètre ou niveau territorial.
- **Thématique** : Filtrage par regroupement d'indicateurs.
- **Indicateur** : Sélection de l'indicateur à représenter cartographiquement.
- **Période** : Sélection de la période de référence des données.

**Comportements** :
- **Synchronisation des filtres** avec les autres vues principales (tableau de bord, indicateurs). Un changement de filtre dans une vue doit pouvoir impacter les données présentées dans les autres vues.
- **Interaction clic sur entité** : Un clic sur une entité territoriale permet d'accéder à des informations contextuelles ou de naviguer vers une fiche/éléments liés à ce territoire/indicateur.
- **Mise à jour dynamique** : L'affichage cartographique se met à jour en fonction des filtres appliqués sans rechargement de page.
- **Réinitialisation des filtres** : Fonction permettant d'annuler l'ensemble des filtres appliqués sur cette vue.

**Contraintes fonctionnelles** : La vue doit pouvoir basculer entre états (données chargées, aucun résultat, erreur, chargement). L'affichage doit rester exploitable sur différentes largeurs d'écran (fonctionnellement responsive).

### 6.3 Liste des indicateurs – `/indicateurs`

**Objectif fonctionnel** : Proposer un explorateur tabulaire structuré permettant de parcourir, filtrer, trier et rechercher l'ensemble des indicateurs.

**Éléments fonctionnels présents** :

- **En-tête de page** : Titre "Indicateurs". Peut inclure un compteur fonctionnel indiquant le nombre d'indicateurs affichés / total.
- **Barre de filtres** : Ensemble de critères de filtrage permettant de réduire la liste.
- **Champ de recherche** : Recherche textuelle sur les indicateurs (portée fonctionnelle : libellé, nom, code ou mots-clés liés à l'indicateur).
- **Tableau de données** : Liste structurée des indicateurs. Colonnes fonctionnelles identifiées : **Indicateur** (libellé), **Thématique**, **Territoire**, **Période**, **Valeur**, **Unité**. Chaque ligne représente un indicateur (ou une occurrence territoriale/périodique selon structuration des données).
- **Actions par ligne** : Lien/action fonctionnel permettant d'accéder à la **fiche détaillée** de l'indicateur concerné.
- **Édition directe** : Cliquer sur le libellé d'un indicateur ouvre sa fenêtre d'édition, organisée par fiche, sources et données, validation et historique.
- **Tri par colonnes** : Possibilité de trier le tableau sur les colonnes pertinentes.
- **Compteur de résultats** : Indication fonctionnelle du nombre d'éléments filtrés/affichés.
- **État vide** : Message fonctionnel lorsque aucun indicateur ne correspond aux filtres appliqués.
- **États de chargement/erreur** : Gestion fonctionnelle des états d'attente ou d'erreur d'accès aux données.
- **Fiabilité de la valeur** : chaque rapprochement fiche ↔ KPI est contrôlé (thème compatible ; unité compatible : une « part » ou un « taux » attend un pourcentage ou un taux, un « nombre » un effectif). Valeur « fiable », « ≈ approchée » (valeur voisine, base d'une projection ou d'une évaluation, unité différente : affichée en italique atténué, raison en infobulle) ou « ◐ partielle » (données déclaratives incomplètes) ; fond hachuré quand aucune valeur n'est calculée ; filtre « Fiabilité ».
- **Vie associative (API Entreprise)** : unité d'analyse = associations dont le siège est dans la commune (pour comparer : celles dont le siège est dans la commune comparée, communes ajoutées par API_ENTREPRISE_COMMUNES) ; « nb d'adhérents » et « nb de salariés » (« par association » sur la carte) affichent une moyenne par association ayant déclaré ses effectifs ; le nombre d'associations est exhaustif (valeur fiable), les effectifs et comptes sont déclaratifs (valeur partielle) ; agrégats des associations ayant leur siège à Ivry, chiffres du siège uniquement, têtes de réseau nationales exclues des totaux ; fiches d'association conservées 30 jours sous forme d'extrait non nominatif pour accélérer les imports suivants.
- **Santé, C2S (ex-CMU-C)** : bénéficiaires de la Complémentaire santé solidaire et part dans la population couverte par le régime général (INSEE / Cnam, communes comptant un QPV, 2023 et 2025) alimentent les fiches « CMU et AME » (valeur approchée : l'AME n'est pas publiée à la commune) ; les fiches ALD n'ont de valeur qu'au niveau du Val-de-Marne (data.ameli.fr). Une fiche dont le libellé est ambigu est rapprochée par son libellé « carte ».
- **Badge « 🏢 Besoin interne » / « 🏢 Complément interne »** : fiche dont la donnée n'existe que dans les systèmes d'information de la collectivité (origine interne) ou dont la source externe doit être complétée par des données internes (origine mixte, ou proposition citant une donnée interne : dossiers de subvention, relevés terrain, SI des services…) ; filtre « Besoins internes » (avec, exclusif, sans) et carte « besoins internes » dans le pilotage.
- **Pastille « multi »** : quand plusieurs sources mesurent le même concept (ex. population du recensement et populations légales, foyers RSA de deux fichiers CAF, logements sociaux RPLS et inventaire SRU), la valeur porte « multi ×n · écart » : vert si l'écart entre sources est ≤ 2 %, orange jusqu'à 20 %, rouge au-delà (incohérent) ; comparaison sur la dernière période commune, sinon sur les dernières valeurs ; détail des sources en infobulle. Également sur les cartes KPI du tableau de bord et d'« Autres ».
- **Badge « 🔒 Non public »** sur les fiches dont un jeu rattaché est à accès habilité (API Entreprise).
- **Tableau de bord des indicateurs** : un KPI sans fiche de conception et sans valeur calculée n'est pas proposé.
- **Unité « pour 1 000 hab. »** affichée avec la valeur pour tous les indicateurs rapportés à la population (cartes KPI du tableau de bord et colonne Valeur de la conception).
- **Colonne Valeur · Ivry** : dernière valeur calculée pour Ivry-sur-Seine (KPI rattaché à la fiche), avec la période, l'unité et un lien vers l'indicateur calculé dans le tableau de bord ; pour les fiches « évolution… », la valeur affichée est la variation par rapport à la période précédente (en points pour un pourcentage, en % sinon, avec le rythme annuel moyen quand plusieurs années séparent les deux valeurs), le niveau n'apparaissant qu'en complément ; « évolution non calculable » quand une seule période est disponible ; « ⚡ en direct » pour une couche géographique ; « — » sinon (infobulle : aucune donnée, calcul pas encore défini, ou projection/analyse sans valeur automatique).
- **Pastille de nature** (colonne Nature) : « ● Donnée directe » (valeur lue telle quelle dans un jeu de données), « ƒx Calculé » (ratio, différence, projection ou agrégat ; la formule s'affiche sous le libellé et en infobulle) ou « Sans donnée » (aucun jeu ni couche rattaché).
- **Badge d'accès aux données** : « ⬇ Importé » (jeu importé et stocké dans l'observatoire) et/ou « ⚡ Live » (couche géographique lue en direct, lien vers la page Couches 94).
- **Formule de calcul documentée** : chaque indicateur porte une nature et une formule (mesures et dimensions des jeux utilisés) ; les indicateurs sans données ont un bloc « [Sources identifiées] » dans leur proposition (source ouverte trouvée, lien, faisabilité).

**Critères de filtrage fonctionnels** :
- **Territoire** : Filtrage par périmètre territorial.
- **Thématique** : Filtrage par thématique d'indicateurs.
- **Période** : Filtrage par période de référence.
- **Nature** : donnée directe, calculé, sans donnée, formule non documentée.
- **Accès** : données importées ou lues en direct (live).
- **Autres critères** : Filtrage multi-critères pour affiner l'exploration.

**Comportements** :
- **Synchronisation des filtres** avec les vues Tableau de bord et Carte.
- **Ouverture de l'éditeur** : Le clic sur le libellé ou l'action d'édition ouvre la fenêtre de modification sans quitter la liste.
- **Chargement progressif** : La liste des indicateurs s'affiche dès sa réception ; le catalogue des jeux de données, utilisé pour les rattachements, se charge en complément.
- **Recherche + filtres combinables** : La recherche textuelle se combine avec les filtres appliqués.
- **Mise à jour dynamique** de la liste selon les critères.
- **Conservation de contexte** : Les critères de filtrage peuvent influencer les autres vues pour assurer une exploration cohérente entre écrans.

### 6.4 Fiche détaillée d'indicateur – `/indicateurs/:id`

**Objectif fonctionnel** : Présenter l'intégralité des informations relatives à un indicateur pour permettre une analyse approfondie.

**Éléments fonctionnels présents** :

- **En-tête de fiche** : Titre de l'indicateur, identifiant si utile, thématique associée, périmètre territorial concerné.
- **Bloc "Données principales"** : Valeur(s) principale(s), unité, période de référence, territoire. Doit présenter les données dans un ordre hiérarchique clair du point de vue fonctionnel.
- **Métadonnées de l'indicateur** : **Définition** (description fonctionnelle de ce que mesure l'indicateur), **Méthodologie** (modalités de calcul/mesure), **Source** (origine des données), **Date de mise à jour** (actualisation des données).
- **Visualisations associées** : Zone fonctionnelle destinée à présenter des graphiques liés à l'indicateur (évolution dans le temps, comparaison par territoires, etc.), lorsque des données historiques ou comparatives existent.
- **Données associées / éléments liés** : Liens fonctionnels vers d'autres indicateurs ou éléments connexes de la même thématique.
- **Navigation retour** : Action fonctionnelle permettant de revenir à la liste des indicateurs (`/indicateurs`) ou au contexte précédent (carte/tableau de bord).

**Comportements** :
- **Accès direct par URL** : Accessible via identifiant unique (`:id`).
- **Affichage structuré** : Organisation hiérarchisée de l'information (données principales > métadonnées > visualisations).
- **Gestion des états** : Gestion fonctionnelle des cas "indicateur introuvable" (redirigé ou page d'erreur appropriée), chargement, erreur.
- **Préservation du contexte de navigation** : Permet un retour cohérent vers la vue d'origine (liste/carte) au travers de la navigation.

### 6.4 bis Couches géographiques du Val-de-Marne – `/couches`

**Objectif fonctionnel** : Exploiter sans import les couches publiées par le Conseil départemental du Val-de-Marne (géoportail geo.valdemarne.fr, service WFS) pour n'importe quelle commune du département (Ivry-sur-Seine par défaut).

**Éléments fonctionnels présents** :
- **Sélecteur de commune** (47 communes du Val-de-Marne) et lien vers le géoportail.
- **Liste des couches par thème** (équipements, environnement, urbanisme et logement, mobilité, indicateurs par IRIS Babord), cases à cocher, nombre d'objets lus.
- **Carte** de la commune (points d’environ 10 px, agrandis au zoom ; contour communal, fond de plan IGN au choix : plan, photographies aériennes ou aucun) avec les couches superposées : points, lignes, polygones, aplats par quantiles pour les indicateurs par IRIS ; zoom à la molette, déplacement par glisser, infobulle au survol.
- **Cartes d'indicateurs** par couche active : nombre d'objets, nombre pour 1 000 habitants, sommes ou moyennes de champs (élèves, places, logements, surfaces, linéaire cyclable, taux d'EnR…), comparaison avec le Val-de-Marne, formule en infobulle, badge « ⚡ Live » avec l'heure de lecture.
- **« + fiche »** : crée une fiche brouillon dans la conception des indicateurs (nature « calculé », formule, source, couche rattachée).

**Comportements** : lecture en direct à chaque affichage (cache serveur de 10 minutes) ; objets filtrés par intersection avec le contour communal ; message « API indisponible » si le géoportail ne répond pas ; aucune donnée stockée.

### 6.5 Pages annexes

| Page | Chemin | Objectif fonctionnel |
|---|---|---|
| **À propos** | `/a-propos` | Présenter l'objet, les finalités et le contexte de l'Observatoire (information institutionnelle/fonctionnelle). |
| **Mentions légales** | `/mentions-legales` | Page d'informations légales (contenu informationnel). |
| **Accessibilité** | `/accessibilite` | Déclaration d'accessibilité et informations relatives à l'accessibilité fonctionnelle de l'application. |
| **Page non trouvée** | `/404` | Gérer les URLs inexistantes. Doit proposer un **moyen fonctionnel de retour** vers une page existante (accueil ou navigation principale). |

### 6.6 Assistant IA – `/ia`

**Objectif fonctionnel** : Permettre d'interroger en langage naturel l'ensemble des données de l'observatoire et d'obtenir des réponses fondées exclusivement sur ces données.

**Éléments fonctionnels présents** :

- **Sélecteur de fournisseur / modèle** : Choix de la source d'IA — **Groq** (API externe) ou **IA locale (API Ville / APM)**. Les modèles hébergés par la Ville sont proposés dans une **liste déroulante** (modèles locaux et RGPD++ notamment). Pour Groq, le modèle est unique et configuré côté serveur.
- **Sélecteur de « niveau de pensée »** : Choix du niveau de détail de la réponse — **Sommaire**, **Normal**, **Approfondi**. Le niveau ajuste directement la consigne envoyée au modèle (réponse plus ou moins développée), sans reformatage a posteriori.
- **Fil de conversation** : Affichage des questions de l'utilisateur et des réponses de l'assistant.
- **Réponse progressive** : La réponse de l'assistant s'affiche **au fur et à mesure de sa génération** (texte partiel, compteur de jetons reçus, curseur de génération) plutôt qu'en un seul bloc.
- **Sources associées** : Sous chaque réponse, liens fonctionnels vers les jeux de données et KPI consultés pour produire la réponse.
- **Détail des données consultées** : Liste des « outils » (extraits de données) utilisés par l'assistant, consultable/dépliable.
- **Évaluation de la réponse** : Après réception, l'utilisateur est invité à **noter la réponse de 1 à 4 étoiles** et à laisser éventuellement un **commentaire**. La note et le commentaire sont enregistrés.
- **Nouvelle conversation** : Action de réinitialisation du fil.
- **Exemples de questions** : Suggestions cliquables à l'ouverture (état vide).

**Comportements** :
- **Chaque demande est indépendante** : l'assistant ne conserve pas le fil ; il repart des seules données de l'observatoire pour chaque question.
- **Réponses sourcées** : l'assistant n'utilise que les données de l'observatoire (indicateurs de la conception, jeux importés, KPI, classements) et cite les jeux/territoires/périodes.
- **Génération asynchrone** : la génération côté IA locale (API Ville) est suivie en tâche de fond ; la réponse s'affiche progressivement sans bloquer l'interface.
- **Traçabilité** : chaque demande (question, réponse, modèle, sources, durée a été journalisée) est consultable dans **Paramètres → IA**, avec sa note et son commentaire.
- **Recherche de jeux associée** : la recherche comprend les synonymes et propose les jeux proches en signalant clairement les différences. Une question sur les pistes cyclables peut ainsi proposer les données de stationnement vélo OpenStreetMap et leur couche cartographique.
- **Adaptation au fournisseur** : le contexte et les consignes sont optimisés séparément pour l'IA locale (NVIDIA DGX Spark, contexte plus riche en une passe) et Groq (résultats ciblés et échanges compacts).

### 6.7 Journal IA – Paramètres → IA

**Objectif fonctionnel** : Permettre à l'administrateur de consulter les prompts utilisés et le journal des demandes, avec filtrage par évaluation.

**Éléments fonctionnels présents** :
- **Prompts** : Prompt système, règles, territoires reconnus, outils disponibles.
- **Profils de prompt** : stratégies et état de configuration présentés séparément pour l'IA locale NVIDIA DGX Spark et Groq.
- **État de la base** : synthèse rapide des volumes, des jeux importés et de la couverture territoriale globale. Les compteurs d'observations proviennent des métadonnées d'import ; aucun parcours exhaustif des observations n'est lancé depuis cette page.
- **Journal des demandes** : Liste des demandes (date, demandeur, fournisseur, modèle, durée, note). Chaque entrée est dépliable (question, réponse, sources, outils) et peut être **évaluée de 1 à 4 étoiles** avec commentaire.
- **Filtres** : Toutes les demandes / sans évaluation / **notes faibles (≤ 2 étoiles)**.

## 7. Entités métier (modèle fonctionnel)

| Entité | Définition fonctionnelle | Champs fonctionnels |
|---|---|---|
| **Indicateur** | Mesure chiffrée décrivant un aspect du territoire, consultable dans le temps et/ou par espace. | `id`, libellé, code, définition, nature (donnée directe / calculé), formule de calcul, couche en direct rattachée, méthodologie, unité, valeur(s), période(s), territoire(s), thématique, source, date de mise à jour, données historiques/comparatives. |
| **Territoire** | Périmètre géographique sur lequel s'appliquent les indicateurs. | Identifiant, nom, code, niveau territorial, géométrie (nécessaire au rendu cartographique). |
| **Thématique** | Regroupement fonctionnel d'indicateurs par domaine. | Identifiant, nom, description, liste d'indicateurs associés. |
| **Période** | Temporalité de référence des valeurs d'indicateur. | Identifiant, libellé (année/période), date/intervalle. |
| **Couche géographique (live)** | Couche du géoportail du Val-de-Marne lue en direct par WFS, jamais importée. | Identifiant, libellé, thème, type de géométrie, couche WFS, lien source, indicateurs calculés (nombre, pour 1 000 hab., sommes). |
| **Fiche indicateur** | Agrégation fonctionnelle de toutes les informations décrivant un indicateur. | Métadonnées, valeurs, visualisations, éléments liés. |

## 8. Fonctionnalités transversales

| Fonctionnalité | Description fonctionnelle | Portée |
|---|---|---|
| **Navigation principale** | Accès direct aux 3 vues principales (Tableau de bord, Carte, Indicateurs) depuis l'en-tête de l'application. Doit indiquer l'**état actif** de la vue courante. | Toutes les pages |
| **Filtrage synchronisé** | Les critères de filtrage (territoire, thématique, période, indicateur le cas échéant) sont **partagés entre les vues**. L'application maintient une cohérence fonctionnelle du contexte entre Tableau de bord, Carte et Liste des indicateurs. | `/`, `/carte`, `/indicateurs` |
| **Recherche textuelle** | Permet de rechercher des indicateurs par leur libellé ou éléments identifiants. **Combinable** avec les filtres. | `/indicateurs` |
| **Tri** | Tri des résultats sur colonnes pertinentes dans la vue liste. | `/indicateurs` |
| **Navigation contextuelle** | Passage fluide entre vue synthétique (dashboard), géographique (carte), exploratoire (liste) et détaillée (fiche). | Transverse |
| **Gestion des états** | L'application doit distinguer fonctionnellement les états : **chargement**, **données disponibles**, **aucun résultat** (état vide), **erreur**. Chaque état doit permettre une action fonctionnelle de reprise si pertinent. | Toutes vues avec données |
| **Responsive (fonctionnel)** | L'application s'adapte fonctionnellement aux différentes largeurs d'écran. Sur plus petit écran, les éléments fonctionnels (notamment filtres, panneau latéral carte) doivent rester accessibles via une organisation fonctionnelle adaptée (accès aux filtres maintenu). | Global |
| **Gestion d'erreurs & 404** | Page 404 avec chemin de retour fonctionnel vers une page valide. États d'erreur explicites avec possibilité de réessayer lorsque cela est pertinent fonctionnellement. | Transverse |
| **Signalement des données non publiques** | Un jeu de données soumis à un **accès habilité** (clé délivrée à la collectivité) est signalé par un badge « Non public » dans le catalogue des jeux, la liste des jeux importés, la colonne valeur d'un indicateur et les cartes de KPI. Ce badge a pour fonction d'avertir que la valeur ne doit pas être diffusée telle quelle. | Catalogue, `/donnees`, `/indicateurs`, `/` |

## 9. Parcours utilisateurs (user flows)

| Parcours | Étapes fonctionnelles | Destination finale |
|---|---|---|
| **Parcours synthétique** | Tableau de bord → Consultation KPIs → Bascule vers Carte ou Indicateurs | Exploration ciblée |
| **Parcours cartographique** | Tableau de bord → `/carte` → Application filtres → Sélection entité territoriale → Consultation contexte/fiche | Analyse géographique |
| **Parcours exploratoire** | `/indicateurs` → Filtres + recherche → Tri → Clic ligne → `/indicateurs/:id` → Retour vers contexte | Analyse détaillée |
| **Parcours croisé** | Modification filtres sur une vue → Bascule vers autre vue → Filtres conservés → Approfondissement fiche | Analyse transversale |

## 10. Comportements applicatifs (règles fonctionnelles)

- **Cohérence des filtres** : Les critères actifs doivent rester cohérents d'une vue à l'autre. Un filtre modifié sur `/carte` doit pouvoir s'appliquer à l'affichage sur `/indicateurs` et inversement.
- **Hiérarchie de l'information** : Sur la fiche indicateur, l'information est présentée par ordre fonctionnel décroissant d'importance (données principales → métadonnées → visualisations → éléments liés).
- **Exploration guidée** : Les vues sont conçues pour permettre une progression fonctionnelle (synthèse → exploration → détail).
- **États vides utiles** : Lorsqu'aucun résultat ne correspond aux filtres, l'application fournit un état vide explicite (sans prescription visuelle) indiquant l'absence de données pour les critères sélectionnés, avec possibilité fonctionnelle de modifier les filtres.
- **Accessibilité fonctionnelle** : L'arborescence, les titres de page/sections, la navigation et les états doivent être structurés pour permettre une navigation logique (préoccupation fonctionnelle, indépendante du style).
- **URL comme état fonctionnel** : L'identifiant d'indicateur dans l'URL (`/indicateurs/:id`) permet un accès direct fonctionnel à une fiche. Le choix est fait de privilégier une navigation partageable/fonctionnelle.

## 11. Données attendues

L'application manipule des **indicateurs territoriaux** structurés. Les éléments fonctionnellement requis pour chaque vue sont :

- **Dashboard** : Liste d'indicateurs clés (avec valeur, unité, territoire, période, éventuelle évolution).
- **Carte** : Données géoréférencées par territoire + valeur/indicateur sélectionné + légende (définition des classes/modalités).
- **Liste** : Collection d'indicateurs avec métadonnées de filtrage/recherche (thématique, territoire, période).
- **Fiche** : Données complètes d'un indicateur (définition, méthodologie, source, historique si disponible, séries de données pour visualisations).

### 11.1 Sources communales récemment intégrées

Quatre sources agrégées par commune alimentent désormais le tableau de bord, la carte et les fiches indicateurs :

| Source | Restitution | Couverture | Indicateurs rattachés |
|---|---|---|---|
| Aménagements cyclables (OpenStreetMap, Région Île-de-France) | nombre de segments et linéaire par type de voie | communes d'Île-de-France | stationnements vélo, accessibilité en modes actifs |
| Licences sportives par fédération (Région Île-de-France, millésime 2011) | licences par fédération, tranche d'âge et sexe | communes du Val-de-Marne | accès, fréquentation, accessibilité et besoins en équipements |
| Lieux et équipements culturels (base Basilic, Région Île-de-France) | nombre de lieux par domaine et par type | communes d'Île-de-France | accès, fréquentation, accessibilité et besoins en équipements |
| Trame verte (composantes communales, Métropole du Grand Paris) | nombre de secteurs et surface en hectares par sous-trame et par rôle | communes de la Métropole du Grand Paris | espaces verts par habitant, évolution, accessibilité, besoins, espaces naturels |

Règles fonctionnelles associées :

- Un **KPI dont la source ne couvre pas tout un territoire de comparaison** n'affiche **ni valeur départementale ni régionale** : seul le cumul sur les communes réellement couvertes est proposé. La trame verte (MGP) est concerned sur les deux territoires, les licences sportives uniquement sur la région.
- Les **licences sportives** sont un millésime 2011 : la comparaison départementale (Val-de-Marne complet) reste affichée, la valeur régionale est masquée.
- Une **source à couverture partielle** reste consultable dans l'onglet Catalogue de données et rattachée à ses indicateurs.

### 11.2 Données à accès habilité (non publiques)

Un jeu peut être alimenté par une source soumise à **accès habilité** (clé API délivrée à la collectivité). La source n'est alors pas ouverte et ses valeurs ne doivent pas être diffusées telles quelles.

| Jeu | Source | Restitution | Couverture |
|---|---|---|---|
| Vie associative (adhérents, bénévoles, salariés, comptes) | API Entreprise (DINUM), fiches « association » de la DJEPVA — Le Compte Asso, RNA, Sirene | agrégats communaux par objet social et champ d'action : associations actives, ressources humaines déclarées du siège, comptes, agréments, affiliations, créations par année ; têtes de réseau nationales exclues | associations dont le siège est dans la commune (Ivry-sur-Seine ; comparaisons via API_ENTREPRISE_COMMUNES) |
| Subventions publiques aux associations | API Entreprise (DINUM), Data Subvention — État et collectivités publiant au format SCDL | séries annuelles par financeur et politique publique : montants demandés, accordés et versés, taux d'accord, associations soutenues ; KPI en € et €/hab. (évolutions sur plusieurs années) | associations dont le siège est dans la commune, têtes de réseau exclues |

Règles fonctionnelles associées :

- **Agrégats uniquement** : aucune donnée nominative n'est stockée ni affichée.
- **Valeurs minimales** : les ressources humaines et les comptes ne sont connus que pour les associations qui les ont déclarés ; l'interface et les fiches indicateurs doivent le signaler.
- Le badge **« Non public »** accompagne le jeu dans le catalogue, la liste des jeux importés, la valeur d'Ivry d'un indicateur et les cartes de KPI.
- Une **formule d'indicateur** qui s'appuie sur ce jeu renvoie vers la source habilitée et mentionne que la donnée n'est pas publique.

### 11.3 Millésimes historiques et jeux à sources multiples

Un même indicateur peut s'appuyer sur **plusieurs millésimes** issus de sources différentes dès lors qu'ils produisent les **mêmes mesures**. C'est le cas de **Filosofi** (niveau de vie et pauvreté), séparé en deux jeux pour que chacun ait son propre bouton de réimport :

| Jeu | Source | Millésimes |
|---|---|---|
| `filosofi` | API Melodi (INSEE) | 2021, 2023 |
| `filosofi_fichier` | Fichiers INSEE téléchargés (base « structure et distribution des revenus ») | 2020 |

Le calcul des KPI (niveau de vie médian, taux de pauvreté) **lit les deux jeux** pour reconstituer une série unique 2020 → 2023 et calculer les évolutions.

Règles associées :

- Une valeur non diffusée (secret statistique) n'est pas importée : les périodes réellement disponibles peuvent varier selon les mesures et les communes.
- Un KPI peut référencer **plusieurs jeux** (`datasets`) en plus de son jeu principal (`dataset`), qui sert aux rattachements et à l'étiquette affichée.
- La vue « Liste des jeux de données » du **Catalogue** offre une **recherche** (jeu, champ, modalité, indicateur) et, pour les administrateurs, un bouton **« Réimporter »** sur chaque jeu importé (relance pour toutes les communes d'Île-de-France).

### 11.4 Données de santé de l'Assurance Maladie (maille départementale)

Trois jeux issus de **data.ameli.fr** (Cnam, Opendatasoft) apportent le contexte départemental de santé, l'application restant centrée sur la commune :

| Jeu | Source | Restitution | Maille |
|---|---|---|---|
| `ameli_ald` | Cnam, cartographie des pathologies (`effectifs`) | personnes en affection de longue durée (ALD) par an | département, région (somme) |
| `ameli_ald_sans_mt` | Cnam (`patients-longueduree-annuelle`) | part des patients en ALD sans médecin traitant | département |
| `ameli_sas` | Cnam (`couverture-sas`) | part de la population couverte par le service d'accès aux soins | département |

Règles associées :

- L'Assurance Maladie ne diffuse **pas de données communales** : ces jeux alimentent la valeur du **Val-de-Marne** et, quand la mesure est sommable, de l'**Île-de-France** — pas la valeur communale d'Ivry.
- Le nombre de personnes en ALD (code `top` ALD_CAT_CAT) alimente les indicateurs « nb ALD » et « évolution du nombre d'ALD ».

## 12. Instructions destinées à Google Stitch

Google Stitch doit **refaire intégralement le style visuel** de cette application à partir des spécifications ci-dessus.

**Consignes fonctionnelles à respecter pour la proposition graphique/UI :**

- **Base-toi uniquement sur le fonctionnel** décrit ci-dessus. Ne pas conserver les choix stylistiques existants comme contrainte, mais respecter **tous les écrans, éléments fonctionnels, parcours et comportements** listés.
- **Conserve l'architecture fonctionnelle** : mêmes vues, mêmes chemins de navigation, mêmes blocs fonctionnels, mêmes colonnes de tableau, mêmes filtres, mêmes états.
- **Priorité au fonctionnel** : L'interface proposée doit servir la **lisibilité des données**, l'**exploration** (carte + liste + fiche) et la **progression synthèse→détail**. Le graphisme doit être complètement redéfini pour soutenir ce fonctionnement.
- **Ne pas détailler le style** ici volontairement : propose un système visuel **entièrement nouveau** (typographie, espacements, formes, couleurs, composants) cohérent entre tous les écrans, tout en préservant **intégralement le périmètre fonctionnel** décrit.
- **Génère des maquettes/composants couvrant l'ensemble des écrans** : Dashboard `/`, Carte `/carte`, Indicateurs `/indicateurs`, Fiche `/indicateurs/:id`, pages annexes + états (chargement, vide, erreur, 404).
- **Respecte les interactions fonctionnelles** : filtres synchronisés, navigation retour, accès fiche depuis liste/carte, bascule entre vues, états dynamiques.

**Point clé** : Ce document décrit le **« quoi » et le « comment ça fonctionne »**. Il n'impose **aucun « à quoi ça ressemble »**. Google Stitch est invité à proposer une **identité visuelle et un style UI entièrement nouveaux**, en s'assurant uniquement que le fonctionnement décrit ci-dessus est intégralement préservé.
