import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMapCities } from '../../src/features/builder/mapCities.ts';
import {
  addBuilderMap,
  decodeBuilderDraft,
  emptyBuilderDraft,
  selectBuilderCity,
} from '../../src/features/builder/builderStorage.ts';

const cities = [
  { code: '73334', name: 'Araguaína' },
  { code: '73440', name: 'Palmas' },
  { code: '96792', name: 'Rio Sono' },
  { code: '92038', name: 'São Miguel do Tocantins' },
];
test('busca de cidades aceita acentos, caixa, parte do nome, espaços e código TSE', () => {
  assert.equal(searchMapCities(cities, 'ARAGUAINA')[0].code, '73334');
  assert.equal(searchMapCities(cities, 'sao miguel')[0].name, 'São Miguel do Tocantins');
  assert.equal(searchMapCities(cities, '  rio   sono ')[0].code, '96792');
  assert.equal(searchMapCities(cities, '73440')[0].name, 'Palmas');
  assert.equal(searchMapCities(cities, 'tocantins').length, 1);
  assert.equal(searchMapCities(cities, 'cidade inexistente').length, 0);
  assert.deepEqual(searchMapCities(cities, '   '), cities);
});
test('cada mapa mantém sua cidade e a seleção persiste sem reutilizar a câmera de outra cidade', () => {
  const config = {
    id: 'map-1',
    kind: 'heat',
    metric: 'brancos',
    cargo: '1',
    eleicao: '6257',
    cargoName: 'Presidente',
    candidato: '',
    candidatoName: '',
    color: '#315c98',
    title: 'Mapa 1',
  };
  let draft = addBuilderMap(addBuilderMap(emptyBuilderDraft(), config), {
    ...config,
    id: 'map-2',
    kind: 'normal',
    title: 'Mapa 2',
  });
  draft.views['map-1'] = {
    municipio: '96792',
    viewport: { latitude: -9.4, longitude: -47.8, zoom: 10 },
  };
  draft = selectBuilderCity(draft, 'map-2', '73334');
  const chosen = selectBuilderCity(draft, 'map-1', '73440');
  assert.equal(draft.views['map-1'].municipio, '96792');
  assert.deepEqual(chosen.views['map-1'], { municipio: '73440' });
  assert.deepEqual(chosen.views['map-2'], { municipio: '73334' });
  assert.equal(chosen.canvas.focused, 'map-1');
  assert.deepEqual(chosen.canvas.positions, draft.canvas.positions);
  assert.deepEqual(decodeBuilderDraft(JSON.parse(JSON.stringify(chosen))), chosen);
  const withCamera = {
    ...chosen,
    views: {
      ...chosen.views,
      'map-1': { municipio: '73440', viewport: { latitude: -10.2, longitude: -48.3, zoom: 12 } },
    },
  };
  assert.equal(selectBuilderCity(withCamera, 'map-1', '73440'), withCamera);
  const cleared = selectBuilderCity(withCamera, 'map-1', '');
  assert.deepEqual(cleared.views['map-1'], { municipio: '' });
  assert.equal(cleared.views['map-2'].municipio, '73334');
  assert.equal(selectBuilderCity(chosen, 'missing-map', '73334'), chosen);
});
