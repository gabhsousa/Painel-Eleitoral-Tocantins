import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBuilderMap,
  BUILDER_STORAGE_KEY,
  decodeBuilderDraft,
  emptyBuilderDraft,
  loadBuilderDraft,
  removeBuilderMap,
  saveBuilderDraft,
} from '../../src/features/builder/builderStorage.ts';

const card = {
  id: 'map-1',
  kind: 'heat',
  metric: 'percentual_abstencao',
  cargo: '1',
  eleicao: '6257',
  cargoName: 'Presidente',
  candidato: '',
  candidatoName: '',
  color: '#315c98',
  title: 'Meu mapa',
};
function example() {
  const draft = addBuilderMap(emptyBuilderDraft(), card);
  draft.canvas = {
    positions: { 'map-1': { x: 125.5, y: -84 } },
    pan: { x: -90, y: 42 },
    focused: 'map-1',
  };
  draft.views['map-1'] = {
    municipio: '73440',
    viewport: { latitude: -10.25, longitude: -48.32, zoom: 11.75 },
  };
  return draft;
}
test('a composição restaura configuração, título, posição, câmera do grid e vista do mapa', () => {
  const entries = new Map(),
    storage = {
      getItem: (key) => entries.get(key) || null,
      setItem: (key, value) => entries.set(key, value),
    };
  const draft = addBuilderMap(example(), {
    ...card,
    id: 'map-2',
    kind: 'normal',
    metric: 'percentual_votos',
    cargo: '3',
    eleicao: '6259',
    cargoName: 'Governador',
    candidato: '123',
    candidatoName: 'Nome de teste',
    color: '#123456',
    title: 'Mapa de votação',
  });
  draft.canvas.pan = { x: -90, y: 42 };
  draft.canvas.focused = 'map-1';
  assert.equal(saveBuilderDraft(draft, storage), true);
  assert.ok(entries.has(BUILDER_STORAGE_KEY));
  assert.deepEqual(loadBuilderDraft(storage), draft);
  const restored = loadBuilderDraft(storage);
  restored.cards[0].title = 'Título alterado';
  assert.equal(loadBuilderDraft(storage).cards[0].title, 'Meu mapa');
});
test('cache inválido não quebra o construtor e registros válidos são recuperados', () => {
  for (const input of [
    null,
    [],
    {},
    { version: 2, cards: [card] },
    { version: 1, cards: 'invalid' },
  ])
    assert.deepEqual(decodeBuilderDraft(input), emptyBuilderDraft());
  const result = decodeBuilderDraft({
    version: 1,
    cards: [
      card,
      card,
      { ...card, id: 'map-2', color: 'url(invalid)' },
      { ...card, id: '__proto__' },
    ],
    canvas: {
      positions: { 'map-1': { x: NaN, y: 0 }, orphan: { x: 1, y: 1 } },
      pan: { x: Infinity, y: 0 },
      focused: 'orphan',
    },
    views: {
      'map-1': { municipio: 'invalid', viewport: { latitude: -10, longitude: -48, zoom: 99 } },
      orphan: { municipio: '73440' },
    },
  });
  assert.deepEqual(result, addBuilderMap(emptyBuilderDraft(), card));
  // Missing fields get safe defaults rather than overwriting valid map settings.
  assert.equal(result.cards[0].metric, 'percentual_abstencao');
  saveBuilderDraft(emptyBuilderDraft(), { getItem: () => null, setItem: () => {} });
  assert.deepEqual(
    loadBuilderDraft({ getItem: () => '{broken', setItem: () => {} }),
    emptyBuilderDraft(),
  );
});
test('remover e adicionar mapas não ressuscita cards nem perde a composição restante', () => {
  let draft = addBuilderMap(example(), {
    ...card,
    id: 'map-2',
    kind: 'normal',
    metric: 'aptos',
    title: 'Segundo mapa',
  });
  draft.canvas.focused = 'map-1';
  draft = removeBuilderMap(draft, 'map-1');
  assert.equal(draft.canvas.focused, null);
  assert.equal(draft.canvas.positions['map-1'], undefined);
  assert.equal(draft.views['map-1'], undefined);
  const restored = decodeBuilderDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(restored, draft);
  const next = addBuilderMap(restored, { ...card, id: 'map-3' });
  assert.notDeepEqual(next.canvas.positions['map-2'], next.canvas.positions['map-3']);
  assert.equal(next.cards[0].title, 'Segundo mapa');
});
test('armazenamento bloqueado ou cheio ainda mantém o trabalho durante a navegação', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  const draft = example();
  assert.equal(saveBuilderDraft(draft, blocked), false);
  assert.deepEqual(loadBuilderDraft(blocked), draft);
  // A full storage may still read an older snapshot; prefer the latest session.
  const full = {
    getItem: () => JSON.stringify(emptyBuilderDraft()),
    setItem: () => {
      throw new Error('quota');
    },
  };
  const changed = { ...draft, cards: [{ ...card, title: 'Alteração mais recente' }] };
  assert.equal(saveBuilderDraft(changed, full), false);
  assert.deepEqual(loadBuilderDraft(full), changed);
});
