// Complémentaire santé solidaire (C2S, ex-CMU-C et ACS) : bénéficiaires du régime général et de la C2S au 1er janvier,
// INSEE / Cnam, pour les quartiers prioritaires et les communes qui en comptent au moins un (dont Ivry-sur-Seine).
const mesure = (values) => ({ MESURE: { label: 'Mesure', values } });

module.exports = [
  {
    id: 'c2s_cnam', provider: 'inseezip',
    label: 'Complémentaire santé solidaire (C2S, ex-CMU-C) : bénéficiaires par commune',
    description: "INSEE, à partir des données de la Cnam : population couverte par le régime général de l'assurance maladie et bénéficiaires de la Complémentaire santé solidaire au 1er janvier (C2S non participative, ex-CMU-C ; C2S participative, ex-ACS). Diffusé pour les communes comptant au moins un quartier prioritaire de la politique de la ville (26 communes du Val-de-Marne, dont Ivry-sur-Seine) ; les autres communes n'ont pas de valeur. Régime général uniquement (les autres régimes ne sont pas comptés). L'AME n'est pas publiée à la commune. Millésimes 2023 et 2025.",
    themes: ['cohesion'], doc_url: 'https://www.insee.fr/fr/statistiques/8736902',
    link: [{ groupe: 'sante', re: /cmu|ame\b/ }],
    config: {
      sources: [
        { period: '2025', url: 'https://www.insee.fr/fr/statistiques/fichier/8736902/beneficiaires_CNAM_01-01-2025_QP24_csv.zip', file: 'data_CNAM2025_COM\\.csv$' },
        { period: '2023', url: 'https://www.insee.fr/fr/statistiques/fichier/7733887/beneficiaires_CNAM_01-01-2023_QP_csv.zip', file: 'data_CNAM2023_COM\\.csv$' },
      ],
      columns: [
        { field: 'C', measure: 'BENEF_RG' }, { field: 'C_C2SNP', measure: 'C2S_NP' }, { field: 'C_C2SP', measure: 'C2S_P' },
        { field: 'C_17_C2SNP', measure: 'C2S_NP_MOINS18' }, { field: 'C_60_C2SNP', measure: 'C2S_NP_60PLUS' },
      ],
      sum: [{ measure: 'C2S_TOTAL', fields: ['C_C2SNP', 'C_C2SP'] }],
      labels: mesure({
        BENEF_RG: 'Population couverte par le régime général', C2S_NP: 'Bénéficiaires de la C2S non participative (ex-CMU-C)', C2S_P: 'Bénéficiaires de la C2S participative (ex-ACS)',
        C2S_TOTAL: 'Bénéficiaires de la C2S (participative et non participative)', C2S_NP_MOINS18: 'Bénéficiaires de la C2S non participative de moins de 18 ans', C2S_NP_60PLUS: 'Bénéficiaires de la C2S non participative de 60 ans ou plus',
      }),
    },
  },
];
