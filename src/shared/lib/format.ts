export const num = (value: unknown) =>
  value == null ? 'Indisponível' : Number(value).toLocaleString('pt-BR');
export const pct = (value: unknown) =>
  value == null
    ? 'Indisponível'
    : `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
