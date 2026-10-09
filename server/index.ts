import Fastify,{LogController} from 'fastify';
import type {FastifyError} from 'fastify';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {isIP} from 'node:net';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {registerApi} from './api.js';
import {createPool,assertReadOnlyRole} from './db.js';

const production=process.env.NODE_ENV==='production';
const app=Fastify({logger:{redact:['req.headers.authorization','req.headers.cookie','req.headers.cf-access-jwt-assertion']},logController:new LogController({disableRequestLogging:true}),bodyLimit:16384,routerOptions:{maxParamLength:120},connectionTimeout:10000,requestTimeout:20000,trustProxy:false,ajv:{customOptions:{removeAdditional:false}}});
const pool=createPool();
if(production){
  if(!pool)throw new Error('Credencial de leitura PostgreSQL obrigatória em produção.');
  if(!existsSync(resolve('dist/index.html')))throw new Error('Frontend compilado ausente.');
  await assertReadOnlyRole(pool).catch(async()=>{await pool.end();throw new Error('Conexão de produção rejeitada: verifique disponibilidade e permissões mínimas do banco.');});
}
await app.register(helmet,{
  contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"],frameAncestors:["'none'"],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'none'"],upgradeInsecureRequests:null}},
  hsts:production?{maxAge:31536000,includeSubDomains:false}:false,
});
app.addHook('onSend',async(_request,reply,payload)=>{reply.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');return payload;});
await app.register(rateLimit,{global:false,max:120,timeWindow:'1 minute',cache:10000,keyGenerator:request=>{
  // Enable only behind the existing tunnel, with no published application port.
  const ip=request.headers['cf-connecting-ip'];
  return process.env.TRUST_CLOUDFLARE==='true'&&typeof ip==='string'&&isIP(ip)?ip:request.ip;
},errorResponseBuilder:(_request,context)=>({statusCode:context.statusCode,message:'Limite de consultas atingido. Aguarde um minuto e tente novamente.'})});
const limitApi=app.rateLimit();
app.addHook('onRequest',async(request,reply)=>{
  if(request.raw.url?.split('?')[0].startsWith('/api/')){
    reply.header('Cache-Control','no-store');
    await limitApi.call(app,request,reply);
  }
});
pool?.on('error',error=>app.log.error({code:(error as {code?:string}).code},'Conexão ociosa com o banco interrompida'));
app.get('/health',async()=>({status:'ok'}));
app.get('/ready',async(_request,reply)=>{
  if(!pool)return reply.code(503).send({status:'indisponivel'});
  try{await pool.query('SELECT ano FROM eleicoes_to.comparecimento_identificado LIMIT 1');return {status:'ok'};}
  catch{return reply.code(503).send({status:'indisponivel'});}
});
app.get('/api/status',async(_request,reply)=>{
  if(!pool)return reply.code(503).send({status:'pendente',message:'Conexão com o banco não configurada.'});
  try{await pool.query('SELECT 1');return {status:'conectado',message:'Conectado ao banco eleitoral do Tocantins.'};}
  catch{return reply.code(503).send({status:'indisponivel',message:'Não foi possível conectar ao banco.'});}
});
await registerApi(app,pool);
app.get('/api/*',async(_request,reply)=>reply.code(404).send({error:'ROTA_INEXISTENTE'}));
if(existsSync(resolve('dist'))){
  await app.register(fastifyStatic,{root:resolve('dist'),dotfiles:'deny',list:false,setHeaders: (response,path)=>{
    response.header('Cache-Control',path.includes('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  }});
  // This dashboard has one page. Unknown paths never receive the frontend.
  app.setNotFoundHandler((_request,reply)=>reply.code(404).send({error:'ROTA_INEXISTENTE'}));
}
app.setErrorHandler((error,request,reply)=>{
  const failure=error as FastifyError;
  const status=failure.validation?400:failure.statusCode&&failure.statusCode<500?failure.statusCode:500;
  if(status>=500)request.log.error({code:failure.code},'Erro na aplicação');
  reply.code(status).send({message:status===400?'Parâmetros inválidos. Confira os filtros da consulta.':status===429?'Limite de consultas atingido. Aguarde e tente novamente.':status===404?'Rota não encontrada.':'Não foi possível concluir a solicitação.'});
});
app.addHook('onClose',async()=>{await pool?.end();});
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{void app.close();});
await app.listen({port:Number(process.env.PORT||3000),host:process.env.HOST||(production?'0.0.0.0':'127.0.0.1')});
