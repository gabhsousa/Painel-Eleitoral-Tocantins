import {useEffect,useRef} from 'react';
import L from 'leaflet';
import type {FeatureCollection,Polygon,MultiPolygon} from 'geojson';
import {winnerColor,winnerLabel} from './partyColors';
import type {Row,MapLocal} from './types';
import 'leaflet/dist/leaflet.css';

type Props={geometry:FeatureCollection<Polygon|MultiPolygon>;municipio:string;winners:Row[];locations:MapLocal[];selectedLocal:string;onMunicipio:(code:string)=>void;onLocal:(local:MapLocal)=>void};
const key=(l:MapLocal)=>`${l.municipio_codigo}/${l.zona}/${l.local_codigo}`;
const pinSvg='<svg viewBox="0 0 30 36" aria-hidden="true"><path d="M15 2C8 2 3 7 3 14c0 9 12 20 12 20s12-11 12-20C27 7 22 2 15 2Z" fill="currentColor" stroke="white" stroke-width="2.5"/><circle cx="15" cy="14" r="4" fill="white"/></svg>';
// Leaflet also culls entire offscreen polygons even with noClip enabled.
// Keep all 139 boundaries available while the SVG is transformed in flight.
class CompleteBoundary extends L.Polygon {
  declare _rings:L.Point[][];
  declare _parts:L.Point[][];
  _clipPoints(){this._parts=this._rings;}
}
export function ElectionMap({geometry,municipio,winners,locations,selectedLocal,onMunicipio,onLocal}:Props) {
  const element=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),regions=useRef<L.FeatureGroup|null>(null),pins=useRef<L.LayerGroup|null>(null),callbacks=useRef({onMunicipio,onLocal}),selection=useRef(municipio);
  const winnerLookup=useRef(new Map<string,Row>());
  winnerLookup.current=new Map(winners.map(w=>[String(w.municipio_codigo),w]));
  callbacks.current={onMunicipio,onLocal};selection.current=municipio;
  useEffect(()=>{
    if(!element.current)return;
    const instance=L.map(element.current,{zoomControl:false,attributionControl:true,minZoom:5,maxZoom:17,zoomSnap:.1,zoomDelta:.5,scrollWheelZoom:true});map.current=instance;
    L.control.zoom({position:'topright',zoomInTitle:'Aproximar mapa',zoomOutTitle:'Afastar mapa'}).addTo(instance);
    instance.attributionControl.setPrefix(false);instance.attributionControl.addAttribution('<a href="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3" target="_blank" rel="noopener">Limites: IBGE</a> · Locais: TSE');
    // Keep complete boundaries during zoom-out: clipping to the city viewport
    // turns the SVG into a shrinking rectangle until Leaflet redraws it.
    const renderer=L.svg({padding:.5});
    const base=L.featureGroup();
    for(const feature of geometry.features){
      const latlngs=L.GeoJSON.coordsToLatLngs(feature.geometry.coordinates,feature.geometry.type==='Polygon'?1:2);
      const layer=new CompleteBoundary(latlngs,{renderer,noClip:true,smoothFactor:1.5,color:'#f9fbf6',weight:1.2,fillColor:'#b5c9b3',fillOpacity:1}) as CompleteBoundary & {feature:typeof feature};
      layer.feature=feature;
      const code=String(feature.properties?.municipio_codigo),name=String(feature.properties?.nome_ibge);
      const tooltip=document.createElement('span');tooltip.textContent=name;
      layer.bindTooltip(tooltip,{sticky:true,className:'city-tooltip',direction:'top'});
      layer.on({click:()=>callbacks.current.onMunicipio(code),mouseover:()=>layer.setStyle({weight:3,color:'#203d31',fillOpacity:1}),mouseout:()=>layer.setStyle({fillColor:winnerColor(winnerLookup.current.get(code)),color:selection.current===code?'#203d31':'#f9fbf6',weight:selection.current===code?3:1.2,fillOpacity:selection.current&&selection.current!==code?.42:1})});
      layer.on('add',()=>{const path=(layer as L.Path).getElement();if(path){path.setAttribute('tabindex','0');path.setAttribute('role','button');path.setAttribute('aria-label',`Selecionar município ${name}`);path.addEventListener('keydown',e=>{const event=e as KeyboardEvent;if(event.key==='Enter'||event.key===' '){event.preventDefault();callbacks.current.onMunicipio(code);}});}});
      base.addLayer(layer);
    }
    base.addTo(instance);regions.current=base;
    pins.current=L.layerGroup().addTo(instance);
    const bounds=base.getBounds();instance.fitBounds(bounds,{padding:[40,35]});instance.setMaxBounds(bounds.pad(.7));
    const observer=new ResizeObserver(()=>{
      instance.invalidateSize({pan:false});
      let activeBounds:L.LatLngBounds|undefined;
      base.eachLayer(layer=>{const polygon=layer as L.Polygon & {feature:{properties:{municipio_codigo:string}}};if(String(polygon.feature.properties.municipio_codigo)===selection.current)activeBounds=polygon.getBounds();});
      instance.fitBounds(activeBounds||base.getBounds(),{padding:[45,45],maxZoom:13,animate:false});
    });observer.observe(element.current);
    return()=>{observer.disconnect();instance.remove();map.current=null;regions.current=null;pins.current=null;};
  },[geometry]);
  useEffect(()=>{
    const instance=map.current,base=regions.current;if(!instance||!base)return;
    let target:L.LatLngBounds|undefined;
    base.eachLayer(layer=>{const polygon=layer as L.Polygon & {feature:{properties:{municipio_codigo:string}}};const active=String(polygon.feature.properties.municipio_codigo)===municipio;polygon.setStyle({color:active?'#244e3e':'#f9fbf6',weight:active?2:1.2,fillColor:winnerColor(winnerLookup.current.get(String(polygon.feature.properties.municipio_codigo))),fillOpacity:municipio && !active ? .42 : 1});if(active){target=polygon.getBounds();polygon.bringToFront();}});
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    instance.stop();
    if(reduced)instance.fitBounds(target||base.getBounds(),{padding:[45,45],maxZoom:13});
    else instance.flyToBounds(target||base.getBounds(),{padding:[45,45],maxZoom:13,duration:.65});
  },[municipio,geometry]);
  useEffect(()=>{
    regions.current?.eachLayer(layer=>{
      const polygon=layer as L.Polygon & {feature:{properties:{municipio_codigo:string;nome_ibge:string}}};
      const code=String(polygon.feature.properties.municipio_codigo),active=code===municipio,winner=winnerLookup.current.get(code);
      polygon.setStyle({fillColor:winnerColor(winner),fillOpacity:municipio&&!active?.42:1});
      const label=document.createElement('span');label.textContent=`${polygon.feature.properties.nome_ibge} · ${winnerLabel(winner)}`;
      polygon.setTooltipContent(label);
      polygon.getElement()?.setAttribute('aria-label',`Selecionar município ${label.textContent}`);
    });
  },[winners,municipio,geometry]);
  useEffect(()=>{
    const group=pins.current;if(!group)return;group.clearLayers();
    const clusters=new Map<string,MapLocal[]>();
    for(const l of locations){if(l.latitude==null||l.longitude==null)continue;const position=`${l.latitude}/${l.longitude}`;clusters.set(position,[...(clusters.get(position)||[]),l]);}
    for(const values of clusters.values()){
      const first=values[0],active=values.some(l=>key(l)===selectedLocal);
      const icon=L.divIcon({className:`voting-pin${active?' selected':''}${values.some(l=>l.status==='Coordenadas fora do limite municipal')?' unverified':''}`,html:pinSvg+(values.length>1?`<span class="pin-count">${values.length}</span>`:''),iconSize:[30,36],iconAnchor:[15,34],tooltipAnchor:[0,-32]});
      const marker=L.marker([first.latitude!,first.longitude!],{icon,title:values.length>1?`${values.length} locais neste ponto`:String(first.local_nome),keyboard:true,zIndexOffset:active?1000:0});
      const label=document.createElement('span');label.textContent=values.length>1?`${values.length} locais de votação neste ponto`:String(first.local_nome);marker.bindTooltip(label,{direction:'top',className:'city-tooltip'});
      if(values.length===1)marker.on('click',()=>callbacks.current.onLocal(first));
      else {const list=document.createElement('div');list.className='shared-location';for(const l of values){const button=document.createElement('button');button.textContent=`${l.local_nome} · Zona ${l.zona} · ${l.local_codigo}`;button.onclick=()=>{callbacks.current.onLocal(l);marker.closePopup();};list.appendChild(button);}marker.bindPopup(list);}
      marker.addTo(group);
    }
  },[locations,selectedLocal,geometry]);
  return <div ref={element} className="election-map" aria-label="Mapa interativo dos municípios do Tocantins"/>;
}
