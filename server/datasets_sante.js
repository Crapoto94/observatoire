// Données de santé de l'Assurance Maladie (data.ameli.fr, Opendatasoft) — maille départementale.
// L'application est centrée sur la commune ; ces jeux apportent le contexte départemental (Val-de-Marne)
// et, quand la mesure est sommable, régional (Île-de-France). Aucune donnée communale n'est diffusée par l'Assurance Maladie.
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'ameli_ald', provider: 'ods',
    label: 'Personnes en affection de longue durée (ALD) — département',
    description: "Cnam, cartographie des pathologies (data.ameli.fr) : nombre de personnes en affection de longue durée (ALD) par département et par an, tous sexes confondus (code « top » ALD_CAT_CAT). Maille départementale : alimente le Val-de-Marne et, par somme, l'Île-de-France ; pas la commune.",
    themes: ['cohesion'], doc_url: 'https://data.ameli.fr/explore/dataset/effectifs/',
    link: [{ theme: 'cohesion', re: /nb ald|evolution du nombre d ald/ }],
    config: {
      base: 'https://data.ameli.fr', dataset: 'effectifs',
      levels: { DEP: 'dept', REG: 'region' },
      columns: [{ field: 'ntop', measure: 'ALD', periodField: 'annee' }],
      queries: [{ where: 'sexe="9" and top="ALD_CAT_CAT"', select: 'annee, sum(ntop) as ntop', groupBy: 'annee', periodYear: true }],
      labels: mesure({ ALD: 'Personnes en affection de longue durée' }),
    },
  },
  {
    id: 'ameli_ald_sans_mt', provider: 'ods',
    label: 'Patients en ALD sans médecin traitant — département',
    description: "Cnam (data.ameli.fr) : part des patients en affection de longue durée qui n'ont pas de médecin traitant déclaré, par département et par an. Indicateur d'accès aux soins. Maille départementale.",
    themes: ['cohesion'], doc_url: 'https://data.ameli.fr/explore/dataset/patients-longueduree-annuelle/',
    link: [{ theme: 'cohesion', re: /rapport entre l offre et la demande en soins|acces/ }],
    config: {
      base: 'https://data.ameli.fr', dataset: 'patients-longueduree-annuelle',
      levels: { DEP: 'departement' },
      columns: [{ field: 'taux_patients_ald_sans_mt_integer', measure: 'TAUX_ALD_SANS_MT', periodField: 'annee' }],
      queries: [{ select: 'annee, taux_patients_ald_sans_mt_integer' }],
      labels: mesure({ TAUX_ALD_SANS_MT: 'Patients en ALD sans médecin traitant (%)' }),
    },
  },
  {
    id: 'ameli_sas', provider: 'ods',
    label: 'Population couverte par le SAS — département',
    description: "Cnam (data.ameli.fr) : part de la population couverte par un service d'accès aux soins (SAS, soins non programmés), par département et par an. Maille départementale.",
    themes: ['cohesion'], doc_url: 'https://data.ameli.fr/explore/dataset/couverture-sas/',
    link: [{ theme: 'cohesion', re: /acces/ }],
    config: {
      base: 'https://data.ameli.fr', dataset: 'couverture-sas',
      levels: { DEP: 'departement' },
      columns: [{ field: 'taux_population_couverte_integer', measure: 'TAUX_SAS', periodField: 'annee' }],
      queries: [{ select: 'annee, taux_population_couverte_integer' }],
      labels: mesure({ TAUX_SAS: 'Population couverte par le SAS (%)' }),
    },
  },
];
