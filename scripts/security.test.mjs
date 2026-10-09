import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {assertReadOnlyRole} from '../server/db.ts';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3002';
test('headers de proteção e arquivos privados inacessíveis',async()=>{
 const home=await fetch(base);assert.equal(home.status,200);
 assert.ok(home.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
 assert.equal(home.headers.get('x-content-type-options'),'nosniff');
 assert.equal(home.headers.get('x-frame-options'),'SAMEORIGIN');
 assert.ok(home.headers.get('permissions-policy')?.includes('geolocation=()'));
 assert.equal(home.headers.get('x-powered-by'),null);
 for(const path of ['/.env','/.env.admin','/server/index.ts','/database/security-db-audit.json','/%2e%2e/.env','/%2e%2e%2f.env','/assets/%2e%2e%2f%2e%2e%2f.env']){
  const r=await fetch(base+path);assert.ok([400,403,404].includes(r.status),`${path}: ${r.status}`);
 }
});
test('filtros, limites e rotas de leitura',async()=>{
 for(const path of ['/api/locais?limite=1000','/api/locais?municipio=1%27%20OR%201=1','/api/locais?sql=SELECT%201','/api/locais?cargo=1&cargo=3','/api/secoes','/api/mapa/locais'])assert.equal((await fetch(base+path)).status,400,path);
 assert.equal((await fetch(base+'/api/raw_bu')).status,404);
 assert.equal((await fetch(base+'/api/resumo',{method:'POST'})).status,404);
 const ready=await fetch(base+'/ready');assert.equal(ready.status,200);
 const r=await fetch(base+'/api/status');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).status,'conectado');
});
test('credencial real tem somente SELECT nas views permitidas',async()=>{
 const pool=new pg.Pool({connectionTimeoutMillis:5000,statement_timeout:10000});
 try{
  await assertReadOnlyRole(pool);
  await assert.rejects(pool.query('SELECT id FROM eleicoes_to.raw_bu LIMIT 0'),{code:'42501'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SET TRANSACTION READ WRITE');
   // A condição FALSE garante que nem uma configuração errada altere registros.
   await assert.rejects(client.query('UPDATE eleicoes_to.raw_bu SET ano=ano WHERE FALSE'),{code:'42501'});
  }finally{await client.query('ROLLBACK');client.release();}
 }finally{await pool.end();}
});
test('bundle não contém senhas locais',()=>{
 const passwords=[];
 for(const path of ['.env','.env.admin','.env.deploy','.env.readonly']){
  try{const match=readFileSync(path,'utf8').match(/^PGPASSWORD=(.+)$/m);if(match&&match[1].length>=8)passwords.push(match[1]);}catch{}
 }
 assert.ok(passwords.length>0);
 for(const name of readdirSync('dist/assets')){
  const source=readFileSync(`dist/assets/${name}`,'utf8');
  for(const password of passwords)assert.ok(!source.includes(password),'Credencial encontrada no bundle');
 }
});
test('produção rejeita a credencial administrativa anterior',async()=>{
 const child=spawn(process.execPath,['--env-file=.env.admin','build/server/index.js'],{env:{...process.env,NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3003',PGUSER:undefined,PGPASSWORD:undefined,DATABASE_URL:undefined},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 const timer=setTimeout(()=>child.kill('SIGTERM'),10000);
 try{const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,1);assert.ok(output.includes('Conexão de produção rejeitada'));assert.ok(!output.includes('Server listening'));}finally{clearTimeout(timer);}
});
test('limite de chamadas não confia em X-Forwarded-For arbitrário',async()=>{
 let limited=false;
 for(let i=0;i<130;i++){
  const r=await fetch(base+'/api/status',{headers:{'x-forwarded-for':`198.51.100.${i%250}`}});
  if(r.status===429){assert.ok(r.headers.get('retry-after'));limited=true;break;}
  assert.equal(r.status,200);
 }
 assert.ok(limited,'Limite de requisições não aplicado');
});
