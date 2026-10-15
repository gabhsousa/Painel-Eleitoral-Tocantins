export const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ano: { type: 'integer', minimum: 2000, maximum: 2100, default: 2026 },
    turno: { type: 'integer', enum: [1, 2], default: 1 },
    eleicao: { type: 'string', pattern: '^[0-9]{1,12}$' },
    cargo: { type: 'string', pattern: '^[0-9]{1,12}$', default: '1' },
    candidato: { type: 'string', pattern: '^[0-9]{1,12}$' },
    municipio: { type: 'string', pattern: '^[0-9]{1,12}$' },
    zona: { type: 'string', pattern: '^[0-9]{1,12}$' },
    local: { type: 'string', pattern: '^[0-9]{1,12}$' },
    secao: { type: 'string', pattern: '^[0-9]{1,12}$' },
    busca: { type: 'string', maxLength: 120 },
    pagina: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
    limite: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};
export type Filters = {
  ano: number;
  turno: number;
  cargo: string;
  eleicao?: string;
  candidato?: string;
  municipio?: string;
  zona?: string;
  local?: string;
  secao?: string;
  busca?: string;
  pagina: number;
  limite: number;
};

export function where(
  f: Filters,
  alias: string,
  kind: 'local' | 'bu' | 'identified' = 'identified',
) {
  const values: unknown[] = [f.ano, f.turno];
  const clauses = [`${alias}.ano=$1`, `${alias}.turno=$2`, `${alias}.uf='TO'`];
  const pairs: [string, unknown][] = [
    ['municipio_codigo', f.municipio],
    ['zona', f.zona],
    ['secao', f.secao],
    [kind === 'identified' ? 'local_codigo_cadastro' : 'local_codigo', f.local],
  ];
  if (kind !== 'local') pairs.push(['cargo_codigo', f.cargo], ['eleicao_codigo', f.eleicao]);
  for (const [column, value] of pairs)
    if (value !== undefined && value !== '') {
      values.push(String(value).replace(/^0+(?=\d)/, ''));
      clauses.push(`${alias}.${column}=$${values.length}`);
    }
  return { sql: clauses.join(' AND '), values };
}

export const statewideScope = (f: Filters): Filters => ({
  ...f,
  municipio: undefined,
  zona: undefined,
  local: undefined,
  secao: undefined,
});
export const shiftParameters = (sql: string, offset: number) =>
  sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);

export function cacheKey(path: string, f: Filters) {
  const statewide = [
    '/api/mapa/vencedores',
    '/api/mapa/escala-abstencao',
    '/api/mapa/candidatos',
    '/api/mapa/indicadores',
    '/api/mapa/votacao',
    '/api/mapa/nao-nominais',
    '/api/mapa/participacao',
  ].includes(path);
  const heat = path === '/api/mapa/calor-locais';
  return (
    path +
    JSON.stringify(
      statewide || heat
        ? {
            ano: f.ano,
            turno: f.turno,
            cargo: f.cargo,
            eleicao: f.eleicao || '',
            ...(heat ? { municipio: f.municipio || '' } : {}),
            ...(path === '/api/mapa/votacao' ? { candidato: f.candidato || '' } : {}),
          }
        : Object.entries(f).sort(([a], [b]) => a.localeCompare(b)),
    )
  );
}
