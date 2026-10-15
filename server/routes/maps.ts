import { coordinateStatus } from '../map.js';
import { where, cacheKey, shiftParameters, statewideScope } from '../http/filters.js';
import type { Filters } from '../http/filters.js';
import type { RouteContext } from '../http/cachedRoutes.js';

export function registerMapRoutes({ route, rows, cache, pool }: RouteContext) {
  route('/api/mapa/indicadores', async (f) => {
    const w = where(statewideScope(f), 'c');
    return rows(
      `SELECT c.municipio_codigo,
      sum(c.aptos) AS aptos,sum(c.comparecimento) AS comparecimento,sum(c.abstencoes) AS abstencoes,
      round(100.0*sum(c.abstencoes)/nullif(sum(c.aptos),0),2) AS percentual_abstencao,
      round(100.0*sum(c.comparecimento)/nullif(sum(c.aptos),0),2) AS percentual_comparecimento
      FROM eleicoes_to.comparecimento_identificado c WHERE ${w.sql}
      GROUP BY c.municipio_codigo ORDER BY c.municipio_codigo`,
      w.values,
    );
  });
  route('/api/mapa/participacao', async (f) => {
    const scope = statewideScope(f);
    const c = where(scope, 'c'),
      l = where(scope, 'l', 'local');
    const lsql = shiftParameters(l.sql, c.values.length);
    // One turnout scan supplies municipality totals, school points and the
    // statewide scale. Keep unmapped schools in totals and scale calculations.
    const result = await rows(
      `WITH resumo AS MATERIALIZED (
      SELECT c.municipio_codigo,c.zona,c.local_codigo_cadastro AS local_codigo,
        sum(c.aptos) AS aptos,sum(c.comparecimento) AS comparecimento,sum(c.abstencoes) AS abstencoes,
        100.0*sum(c.abstencoes)/nullif(sum(c.aptos),0) AS taxa
      FROM eleicoes_to.comparecimento_identificado c WHERE ${c.sql}
      GROUP BY c.municipio_codigo,c.zona,c.local_codigo_cadastro
    ), cadastro AS (
      SELECT l.municipio_codigo,l.zona,l.local_codigo,min(l.local_nome) AS local_nome,
        array_agg(DISTINCT l.latitude) AS latitudes,array_agg(DISTINCT l.longitude) AS longitudes
      FROM eleicoes_to.locais l WHERE ${lsql} GROUP BY l.municipio_codigo,l.zona,l.local_codigo
    ) SELECT 'municipio' AS nivel,municipio_codigo,NULL::text AS zona,NULL::text AS local_codigo,
        NULL::text AS local_nome,NULL::text[] AS latitudes,NULL::text[] AS longitudes,
        sum(aptos) AS aptos,sum(comparecimento) AS comparecimento,sum(abstencoes) AS abstencoes,
        round(100.0*sum(abstencoes)/nullif(sum(aptos),0),2) AS percentual_abstencao,
        round(100.0*sum(comparecimento)/nullif(sum(aptos),0),2) AS percentual_comparecimento,
        NULL::bigint AS locais,NULL::numeric AS minimo,NULL::numeric AS media,NULL::numeric AS maximo,NULL::numeric AS media_ponderada
      FROM resumo GROUP BY municipio_codigo
    UNION ALL SELECT 'local',r.municipio_codigo,r.zona,r.local_codigo,l.local_nome,l.latitudes,l.longitudes,
        r.aptos,r.comparecimento,r.abstencoes,round(r.taxa,2),NULL::numeric,NULL::bigint,NULL::numeric,NULL::numeric,NULL::numeric,NULL::numeric
      FROM resumo r LEFT JOIN cadastro l USING(municipio_codigo,zona,local_codigo)
    UNION ALL SELECT 'escala',NULL::text,NULL::text,NULL::text,NULL::text,NULL::text[],NULL::text[],
        NULL::numeric,NULL::numeric,NULL::numeric,NULL::numeric,NULL::numeric,
        count(*),round(min(taxa),2),round(avg(taxa),2),round(max(taxa),2),round(100.0*sum(abstencoes)/nullif(sum(aptos),0),2)
      FROM resumo WHERE aptos>0`,
      [...c.values, ...l.values],
    );
    const municipios = result
      .filter((row) => row.nivel === 'municipio')
      .map((row) => ({
        municipio_codigo: row.municipio_codigo,
        aptos: row.aptos,
        comparecimento: row.comparecimento,
        abstencoes: row.abstencoes,
        percentual_abstencao: row.percentual_abstencao,
        percentual_comparecimento: row.percentual_comparecimento,
      }));
    const locais = result
      .filter((row) => row.nivel === 'local')
      .map((row) => {
        const { latitude, longitude } = coordinateStatus(
          String(row.municipio_codigo),
          row.latitudes || [null],
          row.longitudes || [null],
        );
        return {
          municipio_codigo: row.municipio_codigo,
          zona: row.zona,
          local_codigo: row.local_codigo,
          local_nome: row.local_nome,
          latitude,
          longitude,
          aptos: row.aptos,
          comparecimento: row.comparecimento,
          abstencoes: row.abstencoes,
          percentual_abstencao: row.percentual_abstencao,
        };
      })
      .filter((row) => row.latitude != null && row.longitude != null);
    const summary = result.find((row) => row.nivel === 'escala');
    const escala = summary
      ? {
          locais: summary.locais,
          minimo: summary.minimo,
          media: summary.media,
          maximo: summary.maximo,
          media_ponderada: summary.media_ponderada,
        }
      : null;
    return { municipios, locais, escala };
  });
  route('/api/mapa/calor-locais', async (f) => {
    const l = where({ ...f, zona: undefined, local: undefined, secao: undefined }, 'l', 'local');
    const c = where({ ...f, zona: undefined, local: undefined, secao: undefined }, 'c');
    const shifted = shiftParameters(c.sql, l.values.length);
    const result = await rows(
      `WITH cadastro AS MATERIALIZED (
      SELECT l.municipio_codigo,min(l.municipio) AS municipio,l.zona,l.local_codigo,
      min(l.local_nome) AS local_nome,array_agg(DISTINCT l.latitude) AS latitudes,array_agg(DISTINCT l.longitude) AS longitudes
      FROM eleicoes_to.locais l WHERE ${l.sql}
      GROUP BY l.municipio_codigo,l.zona,l.local_codigo
    ), resumo AS MATERIALIZED (
      SELECT c.municipio_codigo,c.zona,c.local_codigo_cadastro AS local_codigo,
      sum(c.aptos) AS aptos,sum(c.comparecimento) AS comparecimento,sum(c.abstencoes) AS abstencoes,
      round(100.0*sum(c.abstencoes)/nullif(sum(c.aptos),0),2) AS percentual_abstencao
      FROM eleicoes_to.comparecimento_identificado c WHERE ${shifted}
      GROUP BY c.municipio_codigo,c.zona,c.local_codigo_cadastro
    ) SELECT l.*,r.aptos,r.comparecimento,r.abstencoes,r.percentual_abstencao
      FROM cadastro l JOIN resumo r USING(municipio_codigo,zona,local_codigo)
      ORDER BY l.municipio,l.local_nome`,
      [...l.values, ...c.values],
    );
    const located = result
      .map((row) => {
        const { latitudes, longitudes, ...local } = row;
        return {
          ...local,
          ...coordinateStatus(String(row.municipio_codigo), latitudes, longitudes),
        };
      })
      .filter((row) => row.latitude != null && row.longitude != null);
    if (f.municipio) return located;
    // Keep the statewide payload compact, including names for the map data panel.
    return located.map((row) => ({
      municipio_codigo: row.municipio_codigo,
      zona: row.zona,
      local_codigo: row.local_codigo,
      local_nome: row.local_nome,
      latitude: row.latitude,
      longitude: row.longitude,
      aptos: row.aptos,
      abstencoes: row.abstencoes,
      comparecimento: row.comparecimento,
      percentual_abstencao: row.percentual_abstencao,
    }));
  });
  route('/api/mapa/escala-abstencao', async (f) => {
    const w = where(statewideScope(f), 'c');
    return (
      await rows(
        `WITH locais AS (
      SELECT c.municipio_codigo,c.zona,c.local_codigo_cadastro AS local_codigo,
      sum(c.aptos)::numeric AS aptos,sum(c.abstencoes)::numeric AS abstencoes,
      100.0*sum(c.abstencoes)/nullif(sum(c.aptos),0) AS taxa
      FROM eleicoes_to.comparecimento_identificado c WHERE ${w.sql}
      GROUP BY c.municipio_codigo,c.zona,c.local_codigo_cadastro
    ) SELECT count(*) AS locais,round(min(taxa),2) AS minimo,round(avg(taxa),2) AS media,
      round(max(taxa),2) AS maximo,round(100.0*sum(abstencoes)/nullif(sum(aptos),0),2) AS media_ponderada
      FROM locais WHERE aptos>0`,
        w.values,
      )
    )[0];
  });
  route('/api/mapa/candidatos', async (f) => {
    const w = where(statewideScope(f), 'v', 'bu');
    return rows(
      `WITH votos_base AS MATERIALIZED (
      SELECT v.numero,v.nome,v.partido FROM eleicoes_to.votacao v WHERE ${w.sql} AND v.tipo_codigo='1'
    ) SELECT v.numero,min(v.nome) AS nome,min(v.partido) AS partido
      FROM votos_base v
      GROUP BY v.numero ORDER BY nome,v.numero`,
      w.values,
    );
  });
  route('/api/mapa/votacao', async (f) => {
    const scope = statewideScope(f);
    const v = where(scope, 'v', 'bu'),
      c = where(scope, 'c'),
      l = where(scope, 'l', 'local');
    const values = [...v.values, ...l.values, ...(f.candidato ? [f.candidato] : [])];
    const lsql = shiftParameters(l.sql, v.values.length);
    const selected = f.candidato
      ? `coalesce(sum(v.votos) FILTER(WHERE v.numero=$${values.length}),0)`
      : 'sum(v.votos)';
    // Materialize scalar fields before grouping: otherwise the planner sorts
    // whole JSONB documents from the public view, spilling large files to disk.
    const result = await rows(
      `WITH votos_base AS MATERIALIZED (
      SELECT v.municipio_codigo,v.zona,v.secao,v.numero,v.votos
      FROM eleicoes_to.votacao v WHERE ${v.sql} AND v.tipo_codigo='1'
    ), votos_secao AS MATERIALIZED (
      SELECT v.municipio_codigo,v.zona,v.secao,${selected} AS votos,sum(v.votos) AS votos_nominais
      FROM votos_base v
      GROUP BY v.municipio_codigo,v.zona,v.secao
    ), votos_local AS (
      SELECT c.municipio_codigo,c.zona,c.local_codigo_cadastro AS local_codigo,
        sum(c.aptos)::numeric AS aptos,sum(vs.votos) AS votos,sum(vs.votos_nominais) AS votos_nominais
      FROM votos_secao vs JOIN eleicoes_to.comparecimento_identificado c
      ON c.municipio_codigo=vs.municipio_codigo AND c.zona=vs.zona AND c.secao=vs.secao AND ${c.sql}
      WHERE c.local_codigo_cadastro IS NOT NULL GROUP BY c.municipio_codigo,c.zona,c.local_codigo_cadastro
    ), cadastro AS (
      SELECT l.municipio_codigo,l.zona,l.local_codigo,array_agg(DISTINCT l.latitude) AS latitudes,
        array_agg(DISTINCT l.longitude) AS longitudes,min(l.local_nome) AS local_nome FROM eleicoes_to.locais l WHERE ${lsql}
      GROUP BY l.municipio_codigo,l.zona,l.local_codigo
    ) SELECT 'municipio' AS nivel,municipio_codigo,NULL::text AS zona,NULL::text AS local_codigo,NULL::text AS local_nome,
        NULL::text[] AS latitudes,NULL::text[] AS longitudes,NULL::numeric AS aptos,
        sum(votos) AS votos,sum(votos_nominais) AS votos_nominais,
        round(100.0*sum(votos)/nullif(sum(votos_nominais),0),2) AS percentual_votos
      FROM votos_secao GROUP BY municipio_codigo
    UNION ALL SELECT 'local' AS nivel,c.municipio_codigo,c.zona,c.local_codigo,c.local_nome,c.latitudes,c.longitudes,
        vl.aptos,vl.votos,vl.votos_nominais,round(100.0*vl.votos/nullif(vl.votos_nominais,0),2) AS percentual_votos
      FROM cadastro c JOIN votos_local vl USING(municipio_codigo,zona,local_codigo)`,
      values,
    );
    const municipios = result
      .filter((row) => row.nivel === 'municipio')
      .map(
        ({ nivel, latitudes, longitudes, aptos, zona, local_codigo, local_nome, ...row }) => row,
      );
    const locais = result
      .filter((row) => row.nivel === 'local')
      .map(({ nivel, latitudes, longitudes, ...row }) => ({
        ...row,
        ...coordinateStatus(String(row.municipio_codigo), latitudes, longitudes),
      }))
      .filter((row) => row.latitude != null && row.longitude != null);
    return { municipios, locais };
  });
  route('/api/mapa/nao-nominais', async (f) => {
    const scope = statewideScope(f);
    const c = where(scope, 'c'),
      v = where(scope, 'v', 'bu'),
      l = where(scope, 'l', 'local');
    const vsql = shiftParameters(v.sql, c.values.length);
    const lsql = shiftParameters(l.sql, c.values.length + v.values.length);
    // Vote rows repeat turnout for every choice. Join only after reducing them
    // to one row per section; local codes come from the identified cadastral link.
    const totals = `sum(aptos) AS aptos,sum(comparecimento) AS comparecimento,sum(abstencoes) AS abstencoes,
      CASE WHEN count(brancos)=count(*) THEN sum(brancos) END AS brancos,
      CASE WHEN count(nulos)=count(*) THEN sum(nulos) END AS nulos,
      CASE WHEN count(brancos)=count(*) AND count(nulos)=count(*) THEN sum(abstencoes)+sum(brancos)+sum(nulos) END AS abstencoes_brancos_nulos,
      count(*) FILTER(WHERE brancos IS NULL OR nulos IS NULL) AS secoes_sem_votos`;
    const result = await rows(
      `WITH votos_base AS MATERIALIZED (
      SELECT v.municipio_codigo,v.zona,v.secao,v.tipo_codigo,v.votos
      FROM eleicoes_to.votacao v WHERE ${vsql}
    ), votos_secao AS MATERIALIZED (
      SELECT v.municipio_codigo,v.zona,v.secao,
        coalesce(sum(v.votos) FILTER(WHERE v.tipo_codigo='2'),0) AS brancos,
        coalesce(sum(v.votos) FILTER(WHERE v.tipo_codigo='3'),0) AS nulos
      FROM votos_base v
      GROUP BY v.municipio_codigo,v.zona,v.secao
    ), secoes AS MATERIALIZED (
      SELECT c.municipio_codigo,c.zona,c.secao,c.local_codigo_cadastro AS local_codigo,
        c.aptos,c.comparecimento,c.abstencoes,vs.brancos,vs.nulos
      FROM eleicoes_to.comparecimento_identificado c LEFT JOIN votos_secao vs
        ON vs.municipio_codigo=c.municipio_codigo AND vs.zona=c.zona AND vs.secao=c.secao
      WHERE ${c.sql}
    ), municipios AS (
      SELECT municipio_codigo,${totals} FROM secoes GROUP BY municipio_codigo
    ), locais AS (
      SELECT municipio_codigo,zona,local_codigo,${totals} FROM secoes
      WHERE local_codigo IS NOT NULL GROUP BY municipio_codigo,zona,local_codigo
    ), cadastro AS (
      SELECT l.municipio_codigo,l.zona,l.local_codigo,min(l.local_nome) AS local_nome,
        array_agg(DISTINCT l.latitude) AS latitudes,array_agg(DISTINCT l.longitude) AS longitudes
      FROM eleicoes_to.locais l WHERE ${lsql} GROUP BY l.municipio_codigo,l.zona,l.local_codigo
    ) SELECT 'municipio' AS nivel,m.municipio_codigo,NULL::text AS zona,NULL::text AS local_codigo,
        NULL::text AS local_nome,NULL::text[] AS latitudes,NULL::text[] AS longitudes,
        m.aptos,m.comparecimento,m.abstencoes,m.brancos,m.nulos,m.abstencoes_brancos_nulos,m.secoes_sem_votos
      FROM municipios m
    UNION ALL SELECT 'local' AS nivel,r.municipio_codigo,r.zona,r.local_codigo,
        l.local_nome,l.latitudes,l.longitudes,r.aptos,r.comparecimento,r.abstencoes,r.brancos,r.nulos,r.abstencoes_brancos_nulos,r.secoes_sem_votos
      FROM locais r JOIN cadastro l USING(municipio_codigo,zona,local_codigo)`,
      [...c.values, ...v.values, ...l.values],
    );
    const municipios = result
      .filter((row) => row.nivel === 'municipio')
      .map(({ nivel, latitudes, longitudes, zona, local_codigo, local_nome, ...row }) => row);
    const locais = result
      .filter((row) => row.nivel === 'local')
      .map(({ nivel, latitudes, longitudes, ...row }) => ({
        ...row,
        ...coordinateStatus(String(row.municipio_codigo), latitudes, longitudes),
      }))
      .filter((row) => row.latitude != null && row.longitude != null);
    return { municipios, locais };
  });
  async function mapWinners(f: Filters) {
    // City winners use nominal votes only, independently of the selected local.
    const w = where(statewideScope(f), 'v', 'bu');
    return rows(
      `WITH candidatos AS (
      SELECT v.municipio_codigo,v.numero,min(v.nome) AS nome,min(v.partido) AS partido,min(v.partido_numero) AS partido_numero,sum(v.votos) AS votos
      FROM eleicoes_to.votacao v WHERE ${w.sql} AND v.tipo_codigo='1'
      GROUP BY v.municipio_codigo,v.numero HAVING sum(v.votos)>0
    ), ranking AS (
      SELECT *,rank() OVER(PARTITION BY municipio_codigo ORDER BY votos DESC) AS posicao,
      sum(votos) OVER(PARTITION BY municipio_codigo) AS votos_nominais FROM candidatos
    ) SELECT *,count(*) OVER(PARTITION BY municipio_codigo) AS empatados,
      round(100.0*votos/nullif(votos_nominais,0),2) AS percentual
      FROM ranking WHERE posicao=1 ORDER BY municipio_codigo,numero`,
      w.values,
    );
  }
  route('/api/mapa/vencedores', mapWinners);
  return {
    warmMapColors: async () => {
      if (!pool) return;
      const offices = await rows(
        `SELECT DISTINCT ano,turno,cargo_codigo,eleicao_codigo FROM eleicoes_to.votacao WHERE ano=2026 AND turno=1 AND uf='TO'`,
      );
      for (const office of offices) {
        const f: Filters = {
          ano: Number(office.ano),
          turno: Number(office.turno),
          cargo: String(office.cargo_codigo),
          eleicao: String(office.eleicao_codigo),
          pagina: 1,
          limite: 20,
        };
        cache.save(cacheKey('/api/mapa/vencedores', f), await mapWinners(f));
      }
    },
  };
}
