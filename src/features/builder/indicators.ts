export type MapIndicator =
  | 'blank'
  | 'percentual_abstencao'
  | 'percentual_comparecimento'
  | 'abstencoes'
  | 'comparecimento'
  | 'aptos'
  | 'votos'
  | 'percentual_votos'
  | 'brancos'
  | 'nulos'
  | 'abstencoes_brancos_nulos';
export type AbstentionScale = { minimo: number; media: number; maximo: number };
export const indicatorLabels: Record<MapIndicator, string> = {
  blank: 'Mapa em branco',
  percentual_abstencao: 'Taxa de abstenção',
  percentual_comparecimento: 'Taxa de comparecimento',
  abstencoes: 'Abstenções',
  comparecimento: 'Comparecimento',
  aptos: 'Eleitores aptos',
  votos: 'Votos nominais',
  percentual_votos: 'Percentual de votos nominais',
  brancos: 'Votos brancos',
  nulos: 'Votos nulos',
  abstencoes_brancos_nulos: 'Abstenções + brancos + nulos',
};
export const indicatorFormat = (value: number, indicator: MapIndicator) =>
  indicator.startsWith('percentual')
    ? `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
    : value.toLocaleString('pt-BR');
export const isVoting = (metric: MapIndicator) =>
  metric === 'votos' || metric === 'percentual_votos';
export const isNonNominal = (metric: MapIndicator) =>
  metric === 'brancos' || metric === 'nulos' || metric === 'abstencoes_brancos_nulos';
export const mapIndicators: MapIndicator[] = [
  'votos',
  'percentual_votos',
  'percentual_abstencao',
  'abstencoes',
  'brancos',
  'nulos',
  'abstencoes_brancos_nulos',
  'percentual_comparecimento',
  'comparecimento',
  'aptos',
  'blank',
];
const titles: Partial<Record<MapIndicator, string>> = {
  votos: 'Votação',
  percentual_votos: 'Percentual de votação',
  percentual_abstencao: 'Taxa de abstenção',
  percentual_comparecimento: 'Taxa de comparecimento',
};
export const generatedTitle = (metric: MapIndicator, cargoName: string, candidateName: string) =>
  `${titles[metric] || indicatorLabels[metric]}${isVoting(metric) ? ` · ${candidateName || cargoName}` : ''}`;
