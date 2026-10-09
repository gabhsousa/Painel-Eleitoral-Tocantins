import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { coordinateStatus } from './map.js';

const querySchema = {type:'object',additionalProperties:false,properties:{ano:{type:'integer',minimum:2000,maximum:2100,default:2026},turno:{type:'integer',enum:[1,2],default:1},eleicao:{type:'string',pattern:'^[0-9]{1,12}$'},cargo:{type:'string',pattern:'^[0-9]{1,12}$',default:'1'},municipio:{type:'string',pattern:'^[0-9]{1,12}$'},zona:{type:'string',pattern:'^[0-9]{1,12}$'},local:{type:'string',pattern:'^[0-9]{1,12}$'},secao:{type:'string',pattern:'^[0-9]{1,12}$'},busca:{type:'string',maxLength:120},pagina:{type:'integer',minimum:1,maximum:10000,default:1},limite:{type:'integer',minimum:1,maximum:100,default:20}}};
type Filters = {ano:number;turno:number;cargo:string;eleicao?:string;municipio?:string;zona?:string;local?:string;secao?:string;busca?:string;pagina:number;limite:number};
export async function registerApi(app:FastifyInstance,pool:Pool|null) {
  const cache = new Map<string,{until:number;data:unknown}>();
  const pending = new Map<string,Promise<unknown>>();
  const cacheSizes=new Map<string,number>();
  let cacheBytes=0;
  function evict(key:string){cache.delete(key);cacheBytes-=cacheSizes.get(key)||0;cacheSizes.delete(key);}
  function where(f:Filters,alias:string,kind:'local'|'bu'|'identified'='identified') {
    const values:unknown[]=[f.ano,f.turno];
    const clauses=[`${alias}.ano=$1`,`${alias}.turno=$2`,`${alias}.uf='TO'`];
    const pairs:[string,unknown][]=[['municipio_codigo',f.municipio],['zona',f.zona],['secao',f.secao], [kind==='identified'?'local_codigo_cadastro':'local_codigo',f.local]];
    if(kind!=='local')pairs.push(['cargo_codigo',f.cargo],['eleicao_codigo',f.eleicao]);
    for(const [column,value] of pairs)if(value!==undefined&&value!==''){values.push(String(value).replace(/^0+(?=\d)/,''));clauses.push(`${alias}.${column}=$${values.length}`);}
    return {sql:clauses.join(' AND '),values};
  }
  function route(path:string,handler:(f:Filters)=>Promise<unknown>) {
    app.get(path,{schema:{querystring:querySchema}},async(request,reply)=>{
      if(!pool)return reply.code(503).send({message:'Conexão com o banco não configurada.'});
      const f=request.query as Filters;
      if(path==='/api/mapa/locais'&&!f.municipio)return reply.code(400).send({message:'Selecione um município para consultar os locais no mapa.'});
      if(path==='/api/secoes'&&(!f.municipio||!f.zona||!f.local))return reply.code(400).send({message:'Informe município, zona e local para consultar as seções.'});
      for(const key of ['cargo','eleicao','municipio','zona','local','secao'] as const) if(f[key])f[key]=f[key]!.replace(/^0+(?=\d)/,'');
      if(path.includes(':codigo')){
        if(!f.municipio||!f.zona||!f.eleicao)return reply.code(400).send({message:'Informe município, zona e código da eleição para identificar o local.'});
        const codigo=(request.params as {codigo:string}).codigo;
        if(!/^\d{1,12}$/.test(codigo))return reply.code(400).send({message:'Código de local inválido.'});
        f.local=codigo.replace(/^0+(?=\d)/,'');
      }
      const key=path+JSON.stringify(f);const saved=cache.get(key);
      if(saved&&saved.until>Date.now())return saved.data;
      if(saved)evict(key);
      try {
        let work=pending.get(key);
        if(!work){
          if(pending.size>=12){reply.header('Retry-After','2');return reply.code(503).send({message:'Consultas em andamento. Tente novamente em instantes.'});}
          work=handler(f);pending.set(key,work);
        }
        const data=await work;
        const size=Buffer.byteLength(JSON.stringify(data));
        if(size<=2*1024*1024){
          if(cache.has(key))evict(key);
          while(cache.size&&(cache.size>=200||cacheBytes+size>16*1024*1024))evict(cache.keys().next().value!);
          cache.set(key,{until:Date.now()+60000,data});cacheSizes.set(key,size);cacheBytes+=size;
        }
        return data;
      }catch(error){request.log.error({code:(error as {code?:string}).code},'Consulta eleitoral falhou');return reply.code(503).send({message:'Não foi possível concluir a consulta. Tente novamente.'});}
      finally{pending.delete(key);}
    });
  }
  const rows=async(sql:string,values:unknown[]=[]) => (await pool!.query(sql,values)).rows;
  route('/api/eleicoes',async()=>rows(`SELECT DISTINCT ano,turno,uf,eleicao_codigo FROM eleicoes_to.comparecimento ORDER BY ano DESC,turno,eleicao_codigo`));
  route('/api/cargos',async f=>rows(`SELECT DISTINCT cargo_codigo,cargo,eleicao_codigo FROM eleicoes_to.comparecimento WHERE ano=$1 AND turno=$2 AND uf='TO' ORDER BY cargo_codigo`,[f.ano,f.turno]));
  route('/api/municipios',async f=>rows(`SELECT DISTINCT municipio_codigo,municipio FROM eleicoes_to.locais WHERE ano=$1 AND turno=$2 AND uf='TO' ORDER BY municipio`,[f.ano,f.turno]));
  route('/api/resumo',async f=>{
    const w=where(f,'c');
    return (await rows(`SELECT count(*) AS secoes_totalizadas,count(DISTINCT municipio_codigo) AS municipios,count(*) FILTER(WHERE situacao_local='Codigo divergente') AS divergencias,sum(aptos) AS aptos,sum(comparecimento) AS comparecimento,sum(abstencoes) AS abstencoes,round(100.0*sum(abstencoes)/nullif(sum(aptos),0),2) AS percentual_abstencao FROM eleicoes_to.comparecimento_identificado c WHERE ${w.sql}`,w.values))[0];
  });
  async function locais(f:Filters) {
    // Filtrar pela seção usa EXISTS: não reduz o total do local à seção encontrada.
    const lf={...f,secao:undefined};const l=where(lf,'l','local');
    if(f.secao){l.values.push(f.secao);l.sql+=` AND EXISTS(SELECT 1 FROM eleicoes_to.locais s WHERE s.ano=l.ano AND s.turno=l.turno AND s.uf=l.uf AND s.municipio_codigo=l.municipio_codigo AND s.zona=l.zona AND s.local_codigo=l.local_codigo AND s.secao=$${l.values.length})`;}
    if(f.busca){l.values.push(`%${f.busca.replace(/[\\%_]/g,'\\$&')}%`);l.sql+=` AND (l.local_nome ILIKE $${l.values.length} OR l.municipio ILIKE $${l.values.length} OR l.bairro ILIKE $${l.values.length})`;}
    const c=where({...f,local:undefined,secao:undefined},'c');
    const shift=c.sql.replace(/\$(\d+)/g,(_,n)=>`$${Number(n)+l.values.length}`);
    const values=[...l.values,...c.values];
    const result=await rows(`WITH cadastro AS MATERIALIZED (SELECT l.ano,l.turno,l.uf,l.municipio_codigo,min(l.municipio) AS municipio,l.zona,l.local_codigo,min(l.local_nome) AS local_nome,min(l.endereco) AS endereco,min(l.bairro) AS bairro,count(*) AS secoes_cadastradas,count(*) FILTER(WHERE l.tipo_secao='Agregada') AS secoes_agregadas FROM eleicoes_to.locais l WHERE ${l.sql} GROUP BY l.ano,l.turno,l.uf,l.municipio_codigo,l.zona,l.local_codigo), resumo AS MATERIALIZED (SELECT c.municipio_codigo,c.zona,c.local_codigo_cadastro,sum(c.aptos) AS aptos,sum(c.comparecimento) AS comparecimento,sum(c.abstencoes) AS abstencoes,count(*) AS secoes_totalizadas,count(*) FILTER(WHERE c.situacao_local='Codigo divergente') AS divergencias FROM eleicoes_to.comparecimento_identificado c WHERE ${shift} GROUP BY c.municipio_codigo,c.zona,c.local_codigo_cadastro) SELECT l.*,r.aptos,r.comparecimento,r.abstencoes,r.secoes_totalizadas,r.divergencias,round(100.0*r.abstencoes/nullif(r.aptos,0),2) AS percentual_abstencao,count(*) OVER() AS total FROM cadastro l LEFT JOIN resumo r ON r.municipio_codigo=l.municipio_codigo AND r.zona=l.zona AND r.local_codigo_cadastro=l.local_codigo ORDER BY l.municipio,l.local_nome,l.zona,l.local_codigo LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,f.limite,(f.pagina-1)*f.limite]);
    return {items:result,total:Number(result[0]?.total||0),pagina:f.pagina,limite:f.limite};
  }
  route('/api/locais',locais);
  route('/api/mapa/locais',async f=>{
    if(!f.municipio)throw new Error('Município obrigatório');
    const result=await locais({...f,pagina:1,limite:100});
    if(result.total>1000)throw new Error('Limite de locais por município excedido');
    for(let pagina=2;result.items.length<result.total&&pagina<=10;pagina++){
      const next=await locais({...f,pagina,limite:100});
      if(!next.items.length)break;
      result.items.push(...next.items);
    }
    const coords=await rows(`SELECT zona,local_codigo,array_agg(DISTINCT latitude) AS latitudes,array_agg(DISTINCT longitude) AS longitudes FROM eleicoes_to.locais WHERE ano=$1 AND turno=$2 AND uf='TO' AND municipio_codigo=$3 GROUP BY zona,local_codigo`,[f.ano,f.turno,f.municipio]);
    const positions=new Map(coords.map(r=>[`${r.zona}/${r.local_codigo}`,coordinateStatus(f.municipio!,r.latitudes,r.longitudes)]));
    const items=result.items.map(l=>({...l,...positions.get(`${l.zona}/${l.local_codigo}`)}));
    return {items,total:result.total,mapeados:items.filter(l=>l.latitude!=null).length};
  });
  route('/api/locais/:codigo',async f=>{
    const result=await locais({...f,pagina:1,limite:1});
    return {local:result.items[0]||null,secoes:await secoes(f)};
  });
  async function secoes(f:Filters){
    const l=where(f,'l','local');const c=where({...f,local:undefined,secao:undefined},'c');
    const shifted=c.sql.replace(/\$(\d+)/g,(_,n)=>`$${Number(n)+l.values.length}`);
    return rows(`WITH cadastro AS MATERIALIZED (SELECT l.ano,l.turno,l.uf,l.municipio_codigo,l.zona,l.secao,l.local_codigo,l.local_nome,l.tipo_secao,l.secao_principal FROM eleicoes_to.locais l WHERE ${l.sql}), boletins AS MATERIALIZED (SELECT c.* FROM eleicoes_to.comparecimento_identificado c WHERE ${shifted}) SELECT l.*,b.local_codigo AS local_codigo_bu,b.local_codigo_cadastro AS local_codigo_principal,b.local_nome AS local_nome_principal,b.secao AS secao_bu,b.situacao_local,b.aptos,b.comparecimento,b.abstencoes,CASE WHEN b.secao IS NULL THEN 'Sem BU encontrado' WHEN l.tipo_secao='Agregada' THEN 'Consolidado na seção principal' ELSE 'BU próprio' END AS status FROM cadastro l LEFT JOIN boletins b ON b.municipio_codigo=l.municipio_codigo AND b.zona=l.zona AND b.secao=CASE WHEN l.tipo_secao='Agregada' THEN l.secao_principal ELSE l.secao END ORDER BY l.secao::integer LIMIT 100`,[...l.values,...c.values]);
  }
  route('/api/secoes',async f=>{
    if(!f.municipio||!f.zona||!f.local)throw new Error('Recorte de local obrigatório');
    return secoes(f);
  });
  route('/api/votos',async f=>{
    const w=where({...f,local:undefined},'v','bu');
    if(f.local){w.values.push(f.local);w.sql+=` AND EXISTS (SELECT 1 FROM eleicoes_to.locais l WHERE l.ano=v.ano AND l.turno=v.turno AND l.uf=v.uf AND l.municipio_codigo=v.municipio_codigo AND l.zona=v.zona AND l.secao=v.secao AND l.local_codigo=$${w.values.length})`;}
    // EXISTS mantém uma linha por voto; agregadas não replicam o BU da principal.
    return rows(`WITH votos AS (SELECT v.tipo_codigo,v.tipo_voto,v.numero,v.nome,v.partido_numero,v.partido,sum(v.votos) AS votos FROM eleicoes_to.votacao v WHERE ${w.sql} GROUP BY v.tipo_codigo,v.tipo_voto,v.numero,v.nome,v.partido_numero,v.partido) SELECT *,count(*) OVER() AS total_resultados,sum(votos) OVER() AS total_votos,round(100.0*votos/nullif(sum(votos) OVER(),0),2) AS percentual FROM votos ORDER BY votos DESC,tipo_codigo,numero LIMIT $${w.values.length+1} OFFSET $${w.values.length+2}`,[...w.values,f.limite,(f.pagina-1)*f.limite]);
  });
  route('/api/fontes',async f=>{
    return rows(`SELECT ano,turno,concluida_em,bu,locais FROM eleicoes_to.fontes_publicas WHERE ano=$1 AND turno=$2 ORDER BY concluida_em DESC LIMIT 1`,[f.ano,f.turno]);
  });
}
