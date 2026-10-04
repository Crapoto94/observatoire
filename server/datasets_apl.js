// DREES : accessibilité potentielle localisée (APL) aux professionnels de santé de premier recours, par commune.
const B = 'https://data.drees.solidarites-sante.gouv.fr/api/datasets/1.0/530_l-accessibilite-potentielle-localisee-apl/attachments';

module.exports = [
  {
    id: 'apl_drees', provider: 'drees',
    label: 'Accessibilité potentielle localisée (APL) aux professionnels de santé',
    description: "DREES : indicateur d'accessibilité potentielle localisée (APL) par commune, qui croise l'offre (activité des professionnels, SNIIR-AM) et la demande (population standardisée par âge) des communes alentour, avec une décroissance selon le temps de trajet. Médecins généralistes : consultations ou visites accessibles par an et par habitant standardisé (zone sous-dense en dessous de 2,5) ; infirmiers, kinésithérapeutes, chirurgiens-dentistes, sages-femmes : équivalents temps plein accessibles pour 100 000 habitants standardisés. Moyennes de territoire pondérées par la population standardisée. Millésimes 2022 à 2024.",
    themes: ['cohesion'], doc_url: 'https://data.drees.solidarites-sante.gouv.fr/explore/dataset/530_l-accessibilite-potentielle-localisee-apl/information/',
    link: [{ groupe: 'sante', re: /rapport entre l offre et la demande|deficit d offre|offre de soin/ }],
    config: {
      sources: [
        { profession: 'MEDECIN_GENERALISTE', url: `${B}/indicateur_d_apl_aux_medecins_generalistes_xlsx` },
        { profession: 'INFIRMIER', url: `${B}/indicateur_d_apl_aux_infirmiers_xlsx` },
        { profession: 'KINESITHERAPEUTE', url: `${B}/indicateur_d_apl_aux_kinesitherapeutes_xlsx` },
        { profession: 'CHIRURGIEN_DENTISTE', url: `${B}/indicateur_d_apl_aux_chirurgiens_dentistes_xlsx` },
        { profession: 'SAGE_FEMME', url: `${B}/indicateur_d_apl_aux_sages_femmes_xlsx` },
      ],
      labels: {
        MESURE: { label: 'Mesure', values: { APL: 'Indicateur APL de la commune', POP_STD: 'Population standardisée (demande de soins)', APL_POND: 'APL × population standardisée (pour les moyennes de territoire)' } },
        PROFESSION: { label: 'Profession', values: { MEDECIN_GENERALISTE: 'Médecins généralistes', INFIRMIER: 'Infirmiers', KINESITHERAPEUTE: 'Masseurs-kinésithérapeutes', CHIRURGIEN_DENTISTE: 'Chirurgiens-dentistes', SAGE_FEMME: 'Sages-femmes' } },
      },
    },
  },
];
