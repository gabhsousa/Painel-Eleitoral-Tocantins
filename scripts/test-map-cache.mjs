import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {setImmediate as nextTick} from 'node:timers/promises';
import {registerApi} from '../server/api.ts';

test('cores aquecidas, filtros equivalentes, atualização sem bloquear e validade limitada',async()=>{
 const now=Date.now;let clock=now(),reads=0,release,blocked=false,votes='10';Date.now=()=>clock;
 const pool={query:async sql=>{
  if(sql.includes('SELECT DISTINCT ano,turno,cargo_codigo'))return {rows:[{ano:2026,turno:1,cargo_codigo:'1',eleicao_codigo:'6257'}]};
  reads++;
  if(blocked)await new Promise(resolve=>{release=resolve;});
  return {rows:[{municipio_codigo:'95591',numero:'22',nome:'Candidato',partido:'PL',votos:votes,empatados:'1'}]};
 }};
 const app=Fastify();
 try{
  const api=await registerApi(app,pool);await api.warmMapColors();await app.ready();assert.equal(reads,1);
  const url='/api/mapa/vencedores?cargo=1&eleicao=6257';
  const hit=await app.inject(url);assert.equal(hit.statusCode,200);assert.equal(reads,1);
  await app.inject(url+'&municipio=95591&pagina=2');assert.equal(reads,1);
  clock+=61000;blocked=true;votes='20';
  const old=await app.inject(url);assert.equal(old.json()[0].votos,'10');assert.equal(reads,2);
  await app.inject(url);assert.equal(reads,2); // Only one background refresh.
  blocked=false;release();await nextTick();
  const fresh=await app.inject(url);assert.equal(fresh.json()[0].votos,'20');assert.equal(reads,2);
  clock+=300001;blocked=true;votes='30';
  let completed=false;const expired=app.inject(url).then(response=>{completed=true;return response;});
  await nextTick();assert.equal(completed,false);assert.equal(reads,3);
  blocked=false;release();assert.equal((await expired).json()[0].votos,'30');
 }finally{Date.now=now;await app.close();}
});
