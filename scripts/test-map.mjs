import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {coordinateStatus} from '../server/map.ts';
const geo=JSON.parse(readFileSync('public/maps/tocantins.geojson','utf8'));
assert.equal(geo.features.length,139);assert.equal(new Set(geo.features.map(f=>f.properties.municipio_codigo)).size,139);
assert.equal(coordinateStatus('95591',['-10,56007'],['-48,5398733']).status,'Coordenadas do cadastro');
assert.equal(coordinateStatus('95591',['-1'],['-1']).latitude,null);
assert.equal(coordinateStatus('95591',['-10'],['-10']).status,'Coordenadas fora do limite municipal');
assert.equal(coordinateStatus('95591',['-10','-11'],['-48']).latitude,null);
const invalid=await fetch('http://127.0.0.1:3001/api/mapa/locais');assert.equal(invalid.status,400);
for(const code of ['95591','73440']){
 const r=await fetch(`http://127.0.0.1:3001/api/mapa/locais?municipio=${code}&cargo=1&eleicao=6257`);assert.equal(r.status,200);const data=await r.json();assert.equal(data.items.length,data.total);assert.equal(data.mapeados,data.items.filter(l=>l.latitude!==null).length);assert.equal(new Set(data.items.map(l=>`${l.municipio_codigo}/${l.zona}/${l.local_codigo}`)).size,data.total);for(const l of data.items)assert.ok(l.latitude===null||['Coordenadas do cadastro','Coordenadas fora do limite municipal'].includes(l.status));console.log('Município',code,'Locais',data.total,'Pontos válidos',data.mapeados);
}
console.log('139 limites municipais, coordenadas inválidas, completude e ausência de duplicações conferidos.');
