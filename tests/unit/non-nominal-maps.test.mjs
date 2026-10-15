import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApi } from '../../server/api.ts';
import {
  addBuilderMap,
  decodeBuilderDraft,
  emptyBuilderDraft,
} from '../../src/features/builder/builderStorage.ts';

test('novos parâmetros sobrevivem ao cache da composição', () => {
  for (const metric of ['brancos', 'nulos', 'abstencoes_brancos_nulos']) {
    const draft = addBuilderMap(emptyBuilderDraft(), {
      id: 'map-1',
      kind: 'heat',
      metric,
      cargo: '1',
      eleicao: '6257',
      cargoName: 'Presidente',
      candidato: '',
      candidatoName: '',
      color: '#315c98',
      title: metric,
    });
    assert.deepEqual(decodeBuilderDraft(JSON.parse(JSON.stringify(draft))), draft);
  }
});
test('mapas não nominais preservam zeros, ausência de dados, cadastro e cache por cargo', async () => {
  const calls = [],
    app = Fastify();
  const rows = [
    {
      nivel: 'municipio',
      municipio_codigo: '73440',
      aptos: '100',
      abstencoes: '20',
      brancos: '0',
      nulos: '5',
      abstencoes_brancos_nulos: '25',
    },
    {
      nivel: 'local',
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '1015',
      local_nome: 'Escola',
      aptos: '100',
      abstencoes: '20',
      brancos: '0',
      nulos: '5',
      abstencoes_brancos_nulos: '25',
      latitudes: ['-10.2'],
      longitudes: ['-48.3'],
    },
    {
      nivel: 'local',
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '1031',
      brancos: null,
      nulos: null,
      abstencoes_brancos_nulos: null,
      secoes_sem_votos: '1',
      latitudes: ['-10.21'],
      longitudes: ['-48.31'],
    },
    {
      nivel: 'local',
      municipio_codigo: '73440',
      zona: '29',
      local_codigo: '1040',
      brancos: '2',
      nulos: '3',
      abstencoes_brancos_nulos: '6',
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
    const url = '/api/mapa/nao-nominais?ano=2026&turno=1&cargo=1&eleicao=6257';
    const response = await app.inject(url);
    assert.equal(response.statusCode, 200);
    const data = response.json();
    assert.equal(data.municipios[0].abstencoes_brancos_nulos, '25');
    assert.equal(data.locais.length, 2);
    assert.equal(data.locais[0].local_codigo, '1015');
    assert.equal(data.locais[0].brancos, '0');
    assert.equal(data.locais[1].brancos, null);
    assert.ok(calls[0].sql.includes("v.tipo_codigo='2'"));
    assert.ok(calls[0].sql.includes("v.tipo_codigo='3'"));
    assert.ok(calls[0].sql.includes('GROUP BY v.municipio_codigo,v.zona,v.secao'));
    assert.deepEqual(calls[0].values, [2026, 1, '1', '6257', 2026, 1, '1', '6257', 2026, 1]);
    await app.inject(url + '&pagina=2&municipio=73440&candidato=123');
    assert.equal(calls.length, 1);
    await app.inject('/api/mapa/nao-nominais?cargo=3&eleicao=6259');
    assert.equal(calls.length, 2);
    assert.equal((await app.inject('/api/mapa/nao-nominais?cargo=1%27OR%201=1')).statusCode, 400);
    assert.equal(calls.length, 2);
  } finally {
    await app.close();
  }
});
