import {useEffect,useState} from 'react';
export function useData<T>(url:string|null) {
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{setData(null);setError('');if(!url){setLoading(false);return;}const abort=new AbortController();setLoading(true);
    fetch(url,{signal:abort.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.message||'Consulta indisponível.');return body;}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
  },[url]);return {data,error,loading};
}
export const num=(value:unknown)=>value==null?'Indisponível':Number(value).toLocaleString('pt-BR');
export const pct=(value:unknown)=>value==null?'Indisponível':`${Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
