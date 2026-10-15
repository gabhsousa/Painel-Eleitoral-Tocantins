import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApi } from '../../server/api.ts';

test('catálogo de candidatos usa cargo e eleição, é alfabético e rejeita parâmetros inválidos', async () => {
  const calls = [];
  const app = Fastify();
  try {
    await registerApi(app, {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [{ numero: '13', nome: 'Nome de teste', partido: 'PT' }] };
      },
    });
    const response = await app.inject('/api/mapa/candidatos?cargo=1&eleicao=6257');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().length, 1);
    assert.ok(calls[0].sql.includes("v.tipo_codigo='1'"));
    assert.ok(calls[0].sql.includes('ORDER BY nome,v.numero'));
    assert.deepEqual(calls[0].values, [2026, 1, '1', '6257']);
    assert.equal(
      (await app.inject('/api/mapa/candidatos?cargo=1&eleicao=invalid')).statusCode,
      400,
    );
    assert.equal(calls.length, 1);
  } finally {
    await app.close();
  }
});

test('votação geográfica preserva os totais municipais e localiza BUs pelo cadastro da seção', async () => {
  const calls = [];
  const app = Fastify();
  const rows = [
    {
      nivel: 'municipio',
      municipio_codigo: '73440',
      votos: '30',
      votos_nominais: '100',
      percentual_votos: '30',
    },
    {
      nivel: 'local',
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '1',
      local_nome: 'Escola de teste',
      aptos: '120',
      votos: '30',
      votos_nominais: '100',
      percentual_votos: '30',
      latitudes: ['-10.2'],
      longitudes: ['-48.3'],
    },
    {
      nivel: 'local',
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '2',
      aptos: '50',
      votos: '0',
      votos_nominais: '40',
      percentual_votos: '0',
      latitudes: [null],
      longitudes: [null],
    },
  ];
  try {
    await registerApi(app, {
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows };
      },
    });
    const url = '/api/mapa/votacao?cargo=1&eleicao=6257&candidato=013';
    const response = await app.inject(url);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().municipios[0].votos, '30');
    assert.equal(response.json().locais.length, 1);
    assert.equal(response.json().locais[0].local_codigo, '1');
    assert.equal(response.json().locais[0].aptos, '120');
    assert.equal(response.json().locais[0].local_nome, 'Escola de teste');
    assert.equal(response.json().locais[0].percentual_votos, '30');
    assert.ok(calls[0].sql.includes('min(l.local_nome) AS local_nome'));
    const { sql, values } = calls[0];
    assert.equal(values.at(-1), '13');
    assert.ok(sql.includes(`FILTER(WHERE v.numero=$${values.length})`));
    assert.ok(sql.includes('GROUP BY v.municipio_codigo,v.zona,v.secao'));
    assert.ok(sql.includes('c.secao=vs.secao'));
    assert.ok(sql.includes('c.local_codigo_cadastro AS local_codigo'));
    assert.ok(!sql.includes("v.numero='13'"));
    await app.inject(url + '&pagina=2');
    assert.equal(calls.length, 1);
    await app.inject('/api/mapa/votacao?cargo=1&eleicao=6257&candidato=22');
    assert.equal(calls.length, 2);
    assert.equal((await app.inject('/api/mapa/votacao?candidato=1%27OR%201=1')).statusCode, 400);
    assert.equal(calls.length, 2);
  } finally {
    await app.close();
  }
});
