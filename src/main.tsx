import React,{useCallback,useEffect,useId,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {FeatureCollection,Polygon,MultiPolygon} from 'geojson';
import {ElectionMap} from './ElectionMap';
import {useData,prefetchData,num,pct} from './useData';
import type {Row,MapLocal,MapLocations} from './types';
import './style.css';
import {electoralGroup} from './partyColors';

const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const localKey=(l:MapLocal)=>`${l.municipio_codigo}/${l.zona}/${l.local_codigo}`;
const emptyLocations:MapLocal[]=[];
function App(){
  const [theme,setTheme]=useState<'light'|'dark'>(()=>{try{const saved=localStorage.getItem('eleitoral-theme');if(saved==='light'||saved==='dark')return saved;}catch{}return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';});
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('eleitoral-theme',theme);}catch{}},[theme]);
  const [municipio,setMunicipio]=useState(''),[cargo,setCargo]=useState('1'),[search,setSearch]=useState(''),[selected,setSelected]=useState<MapLocal|null>(null),[retry,setRetry]=useState(0),[votePage,setVotePage]=useState(1);
  const geometry=useData<FeatureCollection<Polygon|MultiPolygon>>('/maps/tocantins.geojson');
  const cargos=useData<Row[]>('/api/cargos');
  const eleicao=String(cargos.data?.find(c=>String(c.cargo_codigo)===cargo)?.eleicao_codigo||(cargo==='1'?'6257':'6259'));
  const params=new URLSearchParams({ano:'2026',turno:'1',cargo,eleicao,pagina:String(retry+1),...(municipio?{municipio}:{})});
  const winners=useData<Row[]>(`/api/mapa/vencedores?ano=2026&turno=1&cargo=${cargo}&eleicao=${eleicao}&pagina=${retry+1}`);
  useEffect(()=>{
    if(!cargos.data||!winners.data)return;
    const offices=cargos.data;
    let active=true;
    void(async()=>{for(const office of offices){if(!active)break;const code=String(office.cargo_codigo);if(code===cargo)continue;try{await prefetchData(`/api/mapa/vencedores?ano=2026&turno=1&cargo=${code}&eleicao=${office.eleicao_codigo}&pagina=${retry+1}`);}catch{}}})();
    return()=>{active=false;};
  },[cargos.data,winners.data,cargo,retry]);
  const summary=useData<Row>(`/api/resumo?${params}`);
  const points=useData<MapLocations>(municipio?`/api/mapa/locais?${params}`:null);
  const detailParams=selected?new URLSearchParams({ano:'2026',turno:'1',cargo,eleicao,municipio:String(selected.municipio_codigo),zona:String(selected.zona)}):null;
  const detail=useData<{local:Row|null;secoes:Row[]}>(selected?`/api/locais/${selected.local_codigo}?${detailParams}`:null);
  const votes=useData<Row[]>(selected?`/api/votos?${detailParams}&local=${selected.local_codigo}&pagina=${votePage}&limite=20`:null);
  const chooseMunicipio=useCallback((code:string)=>{setMunicipio(code);setSelected(null);setSearch('');setVotePage(1);},[]);
  const chooseLocal=useCallback((local:MapLocal)=>{setSelected(local);setVotePage(1);},[]);
  const cities=(geometry.data?.features||[]).map(f=>({code:String(f.properties?.municipio_codigo),name:String(f.properties?.nome_ibge),ibge:String(f.properties?.codarea)})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const city=cities.find(c=>c.code===municipio);
  const locais=points.data?.items||emptyLocations;
  const filtered=locais.filter(l=>normalize(`${l.local_nome} ${l.bairro} ${l.local_codigo} ${l.zona}`).includes(normalize(search)));
  const visibleCities=cities.filter(c=>normalize(c.name).includes(normalize(search)));
  const s=summary.data;
  return <main className="dashboard">
    <header className="app-header"><a className="brand" href="/" aria-label="Consulta Eleitoral Tocantins">TO<span>●</span><div>CONSULTA ELEITORAL</div></a><div className="header-context"><span className="live-dot"/> Dados do TSE <span className="election-badge">2026 · 1º turno</span><button className="theme-toggle" aria-label={theme==='light'?'Ativar modo escuro':'Ativar modo claro'} title={theme==='light'?'Modo escuro':'Modo claro'} aria-pressed={theme==='dark'} onClick={()=>setTheme(t=>t==='light'?'dark':'light')}>{theme==='light'?'☾':'☀'}</button></div></header>
    <div className="workspace">
      <aside className="sidebar" aria-label="Dados e navegação eleitoral">
        <div className="sidebar-top"><p className="eyebrow">MAPA ELEITORAL</p><h1>{city?.name||'Tocantins'}</h1>{municipio&&<p className="subtitle">Município TSE {municipio} · IBGE {city?.ibge}</p>}<label className="cargo-label">Cargo<select value={cargo} onChange={e=>{setCargo(e.target.value);setSelected(null);setVotePage(1);}}>{(cargos.data||[{cargo_codigo:'1',cargo:'Presidente'}]).map(c=><option key={String(c.cargo_codigo)} value={String(c.cargo_codigo)}>{c.cargo}</option>)}</select></label></div>
        <div className="sidebar-content">
          {selected?<>
            <button className="back-button" onClick={()=>setSelected(null)}>← Locais de {city?.name}</button>
            <p className="eyebrow">LOCAL DE VOTAÇÃO</p><h2 className="local-title">{selected.local_nome}</h2><p className="address">{selected.endereco}<br/>{selected.bairro}</p><div className="local-codes">Zona {selected.zona} <span>·</span> Cadastro {selected.local_codigo}</div>
            <LoadState loading={detail.loading} error={detail.error}/>
            {detail.data?.local&&<Metrics data={detail.data.local}/>}
            <p className="data-note">{selected.status!=='Coordenadas do cadastro'&&<>{selected.status}. Posição original do cadastro TSE.<br/></>}{selected.aptos==null?'Sem BU individual neste local. Resultados consolidados na seção principal, quando vinculada.':Number(selected.divergencias)>0?'Há códigos divergentes entre BU e cadastro. Consulte as seções abaixo.':'Resultados vinculados às seções do cadastro.'}</p>
            <h3>Seções e boletins</h3>{detail.data?.secoes.map(sec=><div className="section-card" key={String(sec.secao)}><strong>Seção {sec.secao}</strong><span>{sec.status}</span><small>BU {sec.local_codigo_bu||'indisponível'} · Cadastro da principal {sec.local_codigo_principal||'indisponível'}</small>{sec.tipo_secao==='Agregada'&&<small>Principal: {sec.secao_bu} · {sec.local_nome_principal}</small>}{sec.situacao_local==='Codigo divergente'&&<small className="warning-text">Código divergente: prédio efetivo não comprovado.</small>}</div>)}
            <h3>Votação do local</h3><p className="data-note">Percentuais sobre todos os votos dos BUs próprios deste local, incluindo branco, nulo e legenda.</p><LoadState loading={votes.loading} error={votes.error}/>{votes.data?.length===0&&<p className="data-note">Sem votos de BU próprio para este recorte.</p>}{votes.data?.map((v,i)=><div className="vote-item" key={i}><div><strong>{v.tipo_codigo==='2'?'Branco':v.tipo_codigo==='3'?'Nulo':v.nome&&v.nome!=='#NULO#'?v.nome:'Nome indisponível'}</strong><small>{v.tipo_voto}{v.partido&&v.partido!=='#NULO#'?` · ${v.partido}`:''}</small></div><div><strong>{num(v.votos)}</strong><small>{pct(v.percentual)}</small></div></div>)}
            {Number(votes.data?.[0]?.total_resultados||0)>20&&<div className="vote-pagination"><button className="outline-button" disabled={votePage===1||votes.loading} onClick={()=>setVotePage(p=>p-1)}>Anterior</button><span>Página {votePage}</span><button className="outline-button" disabled={votePage*20>=Number(votes.data?.[0]?.total_resultados||0)||votes.loading} onClick={()=>setVotePage(p=>p+1)}>Próxima</button></div>}
            <p className="data-note">Não somar novamente os totais das seções agregadas. Votos de senador podem incluir múltiplas escolhas por eleitor.</p>
          </>:<>
            <LoadState loading={summary.loading} error={summary.error}/>{s&&<Metrics data={s}/>}
            {(summary.error||points.error)&&<button className="outline-button" onClick={()=>setRetry(r=>r+1)}>Tentar novamente</button>}
            <Results municipio={municipio} cityName={city?.name} cargo={cargo} eleicao={eleicao} cargoName={String(cargos.data?.find(c=>String(c.cargo_codigo)===cargo)?.cargo||'Presidente')}/>
            {municipio&&<div className="explore-heading"><h2>{municipio?'Locais de votação':'Explore os municípios'}</h2><span>{municipio?num(points.data?.total):cities.length}</span></div>}
            <Dropdown title="Explore os municípios" count={cities.length} enabled={!municipio} expandWhen={search} visibleContent={!municipio?<label className="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label={municipio?'Buscar local de votação':'Buscar município'} placeholder={municipio?'Buscar local ou código…':'Buscar município…'} value={search} onChange={e=>setSearch(e.target.value)}/></label>:undefined}>
            {municipio&&<label className="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label={municipio?'Buscar local de votação':'Buscar município'} placeholder={municipio?'Buscar local ou código…':'Buscar município…'} value={search} onChange={e=>setSearch(e.target.value)}/></label>}
            {municipio?<><LoadState loading={points.loading} error={points.error}/><div className="location-list">{filtered.map(l=><button className="location-button" key={localKey(l)} onClick={()=>chooseLocal(l)}><span className={`location-dot${l.latitude==null?' unavailable':''}`}/><div><strong>{l.local_nome}</strong><small>Zona {l.zona} · Local {l.local_codigo}</small><small>{l.status!=='Coordenadas do cadastro'?l.status:Number(l.divergencias)>0?'Código do BU divergente':l.aptos==null?'Sem BU individual':`${num(l.secoes_cadastradas)} seções cadastradas`}</small></div><span className="chevron">›</span></button>)}</div>{points.data&&filtered.length===0&&<p className="data-note">Nenhum local encontrado.</p>}</>:<><p className="list-caption">Clique no mapa ou selecione uma cidade.</p><div className="city-list">{visibleCities.map(c=><button key={c.code} onClick={()=>chooseMunicipio(c.code)}><span>{c.name}</span><span className="chevron">↗</span></button>)}</div>{geometry.data&&visibleCities.length===0&&<p className="data-note">Nenhum município encontrado.</p>}</>}
            </Dropdown>
          </>}
        </div>
        <div className="sidebar-footer">TSE · Boletins de urna e cadastro de locais</div>
      </aside>
      <section className="map-stage" aria-label="Exploração geográfica">
        {geometry.data&&<ElectionMap geometry={geometry.data} winners={winners.data||[]} cargo={cargo} theme={theme} municipio={municipio} locations={locais} selectedLocal={selected?localKey(selected):''} onMunicipio={chooseMunicipio} onLocal={chooseLocal}/>}
        {(geometry.loading||geometry.error)&&<div className="map-loading"><LoadState loading={geometry.loading} error={geometry.error}/></div>}
        <div className="map-breadcrumb"><span>TOCANTINS</span>{city&&<><span className="crumb-divider">/</span><strong>{city.name}</strong></>}</div>
        {municipio?<button className="reset-map" onClick={()=>chooseMunicipio('')}>↖ Ver todo o Tocantins</button>:<div className="map-instruction"><span className="instruction-icon">↗</span><div><strong>Comece pelo mapa</strong><span>Clique em um município para aproximar.</span></div></div>}
        <div className="map-bottom"><div className="map-caption">{municipio?points.loading?'Carregando locais…':points.error?'Locais indisponíveis':`${points.data?.mapeados??0} locais no mapa`:'139 municípios mapeados'}</div></div>
      </section>
    </div>
  </main>;
}
function Dropdown({title,count,enabled=true,onOpen,expandWhen,visibleContent,children}:{title:string;count?:number;enabled?:boolean;onOpen?:()=>void;expandWhen?:string;visibleContent?:React.ReactNode;children:React.ReactNode}){
  const [open,setOpen]=useState(false);
  const panelId=useId();
  useEffect(()=>{if(expandWhen?.trim())setOpen(true);},[expandWhen]);
  if(!enabled)return <>{children}</>;
  return <section className={`results-menu${open?' is-open':''}`}>
    <button type="button" className="results-toggle" aria-label={title} aria-expanded={open} aria-controls={panelId} onClick={()=>{if(!open)onOpen?.();setOpen(value=>!value);}}><span>{title}</span><span className="dropdown-controls">{count!==undefined&&<span className="dropdown-count">{count}</span>}<svg className="results-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></button>
    {visibleContent&&<div className="dropdown-visible">{visibleContent}</div>}
    <div className="results-collapse" id={panelId} aria-hidden={!open} inert={!open}><div className="results-clip"><div className="results-body">{children}</div></div></div>
  </section>;
}
function Results({municipio,cityName,cargo,eleicao,cargoName}:{municipio:string;cityName?:string;cargo:string;eleicao:string;cargoName:string}){
  const [activated,setActivated]=useState(false),[page,setPage]=useState(1);
  useEffect(()=>setPage(1),[municipio,cargo,eleicao]);
  const params=new URLSearchParams({ano:'2026',turno:'1',cargo,eleicao,pagina:String(page),limite:'10',...(municipio?{municipio}:{})});
  const results=useData<Row[]>(activated?`/api/votos?${params}`:null);
  const total=Number(results.data?.[0]?.total_resultados||0);
  return <Dropdown title="Resultados" onOpen={()=>setActivated(true)}>
      <p className="results-scope">{cityName||'Tocantins'} · 1º turno</p>
      <p className="results-office">{cargoName}</p>
      <p className="data-note">Votos do {municipio?'município':'estado'}. Percentuais incluem votos brancos, nulos e de legenda.</p>
      <LoadState loading={results.loading} error={results.error}/>
      {!results.loading&&!results.error&&results.data?.length===0&&<p className="data-note">Sem resultados para este cargo.</p>}
      {!results.loading&&!results.error&&results.data?.map(v=>{
        const nominal=String(v.tipo_codigo)==='1',group=electoralGroup(v,cargo);
        const name=String(v.tipo_codigo)==='2'?'Branco':String(v.tipo_codigo)==='3'?'Nulo':String(v.tipo_codigo)==='4'?`Legenda · ${v.partido}`:v.nome&&v.nome!=='#NULO#'?String(v.nome):'Nome indisponível';
        return <div className="result-card" key={`${v.tipo_codigo}/${v.numero}`}>
          <div className="result-heading"><strong>{name}</strong><span>{pct(v.percentual)}</span></div>
          <div className="result-meta"><span>{nominal?`${v.numero} · ${group.label}`:String(v.tipo_voto)}</span><strong>{num(v.votos)} votos</strong></div>
          <div className="result-bar" aria-hidden="true"><i style={{width:`${Math.max(0,Math.min(100,Number(v.percentual)||0))}%`,background:nominal||String(v.tipo_codigo)==='4'?group.color:'var(--muted)'}}/></div>
        </div>;
      })}
      {total>10&&<div className="vote-pagination"><button className="outline-button" aria-label="Resultados anteriores" disabled={page===1||results.loading} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page} / {Math.ceil(total/10)}</span><button className="outline-button" aria-label="Próximos resultados" disabled={page*10>=total||results.loading} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>}
  </Dropdown>;
}
function Metrics({data}:{data:Row}) {return <div className="metrics">{[['Eleitores aptos',num(data.aptos)],['Comparecimento',num(data.comparecimento)],['Abstenções',num(data.abstencoes)],['Taxa de abstenção',pct(data.percentual_abstencao)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;}
function LoadState({loading,error}:{loading:boolean;error:string}){return loading?<p className="load-state" role="status">Consultando dados…</p>:error?<p className="load-state error" role="alert">{error}</p>:null;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
