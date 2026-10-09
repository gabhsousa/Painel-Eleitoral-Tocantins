import assert from 'node:assert/strict';
const base='http://127.0.0.1:3001';
async function get(path){const start=Date.now();const r=await fetch(base+path);const body=await r.json();console.log(path,r.status,Date.now()-start,'ms');assert.equal(r.status,200,JSON.stringify(body));return body;}
const state=await get('/api/status');assert.equal(state.status,'conectado');
const bad=await fetch(base+'/api/locais?limite=1000');assert.equal(bad.status,400);
const missing=await fetch(base+'/api/locais/1368');assert.equal(missing.status,400);
const summary=await get('/api/resumo?cargo=1&eleicao=6257');assert.equal(Number(summary.aptos),1182023);assert.equal(Number(summary.comparecimento),965196);assert.equal(Number(summary.abstencoes),216827);
const faustino=await get('/api/locais/1368?municipio=95591&zona=3&cargo=1&eleicao=6257');assert.equal(Number(faustino.local.aptos),197);assert.equal(Number(faustino.local.comparecimento),149);assert.equal(Number(faustino.local.abstencoes),48);assert.equal(Number(faustino.local.percentual_abstencao),24.37);
const list=await get('/api/locais?cargo=1&eleicao=6257&limite=20');assert.equal(list.total,933);assert.equal(list.items.length,20);
const votes=await get('/api/votos?municipio=95591&zona=3&local=1368&cargo=1&eleicao=6257');assert.equal(votes.reduce((a,v)=>a+Number(v.votos),0),149);
const detail=faustino.secoes;assert.equal(detail[0].secao,'190');
console.log('Totais, caso Faustino, votos, paginação e validação de parâmetros conferidos.');
