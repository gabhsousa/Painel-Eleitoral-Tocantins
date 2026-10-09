import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

const geometry=JSON.parse(readFileSync(resolve('public/maps/tocantins.geojson'),'utf8')) as FeatureCollection<Polygon|MultiPolygon>;
const polygons=new Map(geometry.features.map(f=>[String(f.properties?.municipio_codigo),f]));
export function coordinateStatus(municipio:string,latitudes:(string|null)[],longitudes:(string|null)[]) {
  if(latitudes.length!==1||longitudes.length!==1)return {latitude:null,longitude:null,status:'Coordenadas conflitantes'};
  const parse=(s:string|null)=>s==null||s.trim()===''?NaN:Number(s.replace(',','.'));
  const lat=parse(latitudes[0]),lng=parse(longitudes[0]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||lat===-1||lng===-1||lat===0||lng===0)return {latitude:null,longitude:null,status:'Coordenadas indisponíveis'};
  const polygon=polygons.get(municipio);
  if(!polygon||!booleanPointInPolygon([lng,lat],polygon))return {latitude:lat,longitude:lng,status:'Coordenadas fora do limite municipal'};
  return {latitude:lat,longitude:lng,status:'Coordenadas do cadastro'};
}
