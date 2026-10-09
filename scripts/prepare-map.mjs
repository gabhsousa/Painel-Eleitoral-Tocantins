import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
const geometryUrl='https://servicodados.ibge.gov.br/api/v3/malhas/estados/17?formato=application/vnd.geo%2Bjson&qualidade=maxima&intrarregiao=municipio';
const namesUrl='https://servicodados.ibge.gov.br/api/v1/localidades/estados/17/municipios';
const pool=new pg.Pool({connectionTimeoutMillis:5000,statement_timeout:15000,options:'-c default_transaction_read_only=on'});
try {
 const responses=await Promise.all([fetch(geometryUrl),fetch(namesUrl)]);
 if(responses.some(r=>!r.ok))throw new Error('Falha ao baixar malhas oficiais do IBGE.');
 const [geo,names]=await Promise.all(responses.map(r=>r.json()));
 await mkdir('public/maps',{recursive:true});
 await writeFile('public/maps/to-ibge-original.geojson',JSON.stringify(geo));
 await writeFile('public/maps/municipios-ibge.json',JSON.stringify(names));
 console.log('Malha:',geo.type,'Municípios:',geo.features?.length,'Primeira propriedade:',geo.features?.[0]?.properties);
 const municipalities=(await pool.query("SELECT DISTINCT municipio_codigo,municipio FROM eleicoes_to.locais WHERE ano=2026 AND turno=1 AND uf='TO' ORDER BY municipio")).rows;
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const byName=new Map(names.map(m=>[normalize(m.nome),m]));
 const matched=[],unmatched=[];
 for(const m of municipalities){const match=byName.get(normalize(m.municipio));if(match)matched.push({...m,ibge_codigo:String(match.id),nome_ibge:match.nome});else unmatched.push(m);}
 await writeFile('database/map-matching.json',JSON.stringify({matched,unmatched},null,2));
 console.log('Correspondências por nome normalizado:',matched.length,'Pendências:',JSON.stringify(unmatched));
 if(unmatched.length||matched.length!==139||geo.features.length!==139)throw new Error('A malha exige revisão das correspondências municipais.');
 const byCode=new Map(matched.map(m=>[m.ibge_codigo,m]));
 for(const feature of geo.features){const match=byCode.get(String(feature.properties.codarea));if(!match)throw new Error('Município da malha sem correspondência eleitoral.');feature.properties={...feature.properties,...match};}
 await writeFile('public/maps/tocantins.geojson',JSON.stringify(geo));
 await writeFile('public/maps/fontes.json',JSON.stringify({geometryUrl,namesUrl,downloadedAt:new Date().toISOString(),quality:'maxima',municipalities:139},null,2));
 const locations=(await pool.query(`SELECT municipio_codigo,municipio,zona,local_codigo,min(local_nome) AS local_nome,array_agg(DISTINCT latitude) AS latitudes,array_agg(DISTINCT longitude) AS longitudes FROM eleicoes_to.locais WHERE ano=2026 AND turno=1 AND uf='TO' GROUP BY municipio_codigo,municipio,zona,local_codigo`)).rows;
 await writeFile('database/map-coordinate-audit.json',JSON.stringify(locations,null,2));
 console.log('Locais para auditoria:',locations.length,'Exemplos:',JSON.stringify(locations.slice(0,3)));
}catch(e){console.error(e.message);process.exitCode=1;}finally{await pool.end();}
