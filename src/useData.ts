import {useEffect,useState} from 'react';
type Entry={until:number;data:unknown};
const cache=new Map<string,Entry>(),pending=new Map<string,Promise<unknown>>();
const cacheable=(url:string)=>url.startsWith('/api/mapa/vencedores?')||url==='/api/cargos';
function cached(url:string|null){
  if(!url||!cacheable(url))return null;
  let entry=cache.get(url);
  if(!entry&&url.startsWith('/api/mapa/vencedores?')){
    try{const value=JSON.parse(sessionStorage.getItem(`eleitoral-colors:${url}`)||'null') as Entry|null;if(value&&value.until>Date.now()&&value.until<=Date.now()+60000&&Array.isArray(value.data)){entry=value;cache.set(url,value);}}catch{}
  }
  return entry&&entry.until>Date.now()?entry:null;
}
async function request(url:string,signal?:AbortSignal):Promise<unknown>{
  const saved=cached(url);if(saved)return saved.data;
  const reusable=cacheable(url);if(reusable&&pending.has(url))return pending.get(url)!;
  const work=fetch(url,{signal:reusable?undefined:signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.message||'Consulta indisponível.');return body;}).then(data=>{
    if(reusable){
      while(cache.size>=16)cache.delete(cache.keys().next().value!);
      const entry={until:Date.now()+60000,data};cache.set(url,entry);
      if(url.startsWith('/api/mapa/vencedores?'))try{sessionStorage.setItem(`eleitoral-colors:${url}`,JSON.stringify(entry));}catch{}
    }
    return data;
  }).finally(()=>{if(reusable)pending.delete(url);});
  if(reusable)pending.set(url,work);return work;
}
export async function prefetchData(url:string){if(cacheable(url))await request(url);}
export function useData<T>(url:string|null){
  const initial=cached(url);
  const [state,setState]=useState<{url:string|null;data:T|null;error:string;loading:boolean}>({url,data:initial?.data as T||null,error:'',loading:!!url&&!initial});
  useEffect(()=>{
    const saved=cached(url),abort=new AbortController();let active=true;
    if(!url){setState({url,data:null,error:'',loading:false});return;}
    if(saved){setState({url,data:saved.data as T,error:'',loading:false});return;}
    setState({url,data:null,error:'',loading:true});
    request(url,abort.signal).then(data=>{if(active)setState({url,data:data as T,error:'',loading:false});}).catch(error=>{if(active&&error.name!=='AbortError')setState({url,data:null,error:error.message,loading:false});});
    return()=>{active=false;abort.abort();};
  },[url]);
  // Read the new key synchronously: a cargo change never paints the previous cargo.
  if(state.url!==url){const saved=cached(url);return {data:saved?.data as T||null,error:'',loading:!!url&&!saved};}
  return state;
}
export const num=(value:unknown)=>value==null?'Indisponível':Number(value).toLocaleString('pt-BR');
export const pct=(value:unknown)=>value==null?'Indisponível':`${Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
