# Demandes de données de l'Observatoire

Demandes externes et extractions internes pour alimenter les fiches indicateurs encore sans valeur ou seulement approchées. Un fichier par organisme, avec la procédure et un texte prêt à envoyer (passages entre crochets à compléter).

## Méthode

1. Désigner un référent données (Observatoire ou DSI) qui porte les demandes, détient les comptes d'accès et tient le suivi ci-dessous.
2. Saisir le délégué à la protection des données avant l'envoi : inscription du traitement « Observatoire territorial » au registre (finalité : production de statistiques et pilotage des politiques publiques ; base légale : mission d'intérêt public). Les fichiers fonciers et LOVAC contiennent des données à caractère personnel : une analyse rapide des risques est attendue.
3. Demander des agrégats chaque fois que c'est possible (commune, quartier, IRIS, QPV), jamais de fichier nominatif quand une statistique suffit. Seules les données foncières sont livrées au niveau du local ; elles sont alors agrégées dans l'Observatoire et ne sont jamais publiées à l'adresse.
4. Faire signer par l'autorité territoriale (maire ou DGS par délégation) les actes d'engagement et les courriers aux administrations.
5. Prévoir le format de livraison : CSV ou tableur, une ligne par année, territoire et modalité, avec une série historique (idéalement depuis 2015) et une mise à jour annuelle.
6. Intégrer et tracer : chaque jeu reçu est déclaré dans l'Observatoire avec sa source, sa date et son régime d'accès (badge « Non public » quand la diffusion est restreinte).

## Suivi des demandes

| Priorité | Organisme | Données | Procédure | Délai indicatif | Fiches |
|---|---|---|---|---|---|
| 1 | Cerema | Fichiers fonciers, DV3F | Acte d'engagement en ligne | 2 à 6 sem. | 11 |
| 1 | Services de la Ville | Pelehas, Millésime | Note interne | 2 à 4 sem. | 5 |
| 2 | DGALN (ZLV) | Logements vacants détaillés | Inscription + droits LOVAC | 2 à 4 sem. | 2 |
| 2 | DRIHL | Infocentre SNE | Courrier | 1 à 3 mois | 2 |
| 3 | CAF du Val-de-Marne | Allocataires infracommunaux | Courrier (CTG) | 1 à 3 mois | 3 |
| 3 | CPAM du Val-de-Marne | C2S, AME, ALD à la commune | Convention | 2 à 6 mois | 3 |
| 3 | France Travail | Demandeurs d'emploi par QPV, métiers | Courrier | 1 à 2 mois | 2 |
| 4 | Airparif | Historique des indices | Courriel | 1 mois | 1 |
| 4 | Département 94 | Comptages routiers | Courriel | 1 mois | 1 |
| 4 | IDFM, Institut Paris Region | Temps de trajet, accessibilité | Courriel | 1 à 3 mois | 5 |

Délais habituellement observés, à confirmer auprès de chaque organisme. Procédures et intitulés de service à vérifier sur le site de chaque organisme avant l'envoi.

## Dossiers

- [Cerema : fichiers fonciers et DV3F](01-cerema-fichiers-fonciers.md) — Priorité 1
- [DGALN : Zéro Logement Vacant (LOVAC détaillé)](02-zlv-lovac.md) — Priorité 2
- [DRIHL : accès à l'Infocentre du SNE](03-drihl-infocentre-sne.md) — Priorité 2
- [CAF du Val-de-Marne : données allocataires infracommunales](04-caf-94.md) — Priorité 3
- [CPAM du Val-de-Marne : C2S, AME et ALD à la commune](05-cpam-94.md) — Priorité 3
- [France Travail : demandeurs d'emploi par quartier et métiers](06-france-travail.md) — Priorité 3
- [Airparif : historique de la qualité de l'air à Ivry](07-airparif.md) — Priorité 4
- [Département du Val-de-Marne : comptages routiers](08-cd94-comptages-routiers.md) — Priorité 4
- [IDFM et Institut Paris Region : temps de trajet et accessibilité](09-idfm-ipr-mobilite.md) — Priorité 4
- [Pelehas : demandes et attributions](10-interne-pelehas.md) — Service logement
- [Millésime : impayés, aides et accès aux droits](11-interne-millesime.md) — CCAS

Format attendu des extractions internes : CSV `annee ; mesure ; modalite ; valeur`, comptages uniquement, aucune donnée nominative, cases de moins de 5 personnes masquées.
