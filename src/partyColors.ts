import type {Row} from './types';
export const PARTY_COLORS:Record<string,string>={PL:'#313d8a',PT:'#ff3158',MDB:'#0e9e4f',PP:'#608fd3',REPUBLICANOS:'#1e666c',PSD:'#ef8700',UNIAO:'#24c7f3',PSB:'#eeda47',NOVO:'#ff6b00',PODE:'#19a63b',PSDB:'#009afa',PDT:'#ffa78e',REDE:'#7ccdd2','SEM PARTIDO':'#94a3b8'};
export const partyKey=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
// Federation membership and colors follow the reference supplied for deputies.
const FEDERATIONS=[
  {label:'BRASIL DA ESPERANÇA',parties:['PCDOB','PT','PV'],color:'#b5231a'},
  {label:'UNIÃO PROGRESSISTA',parties:['PP','UNIAO'],color:'#608fd3'},
  {label:'PSOL REDE',parties:['PSOL','REDE'],color:'#e451d2'},
  {label:'PSDB CIDADANIA',parties:['PSDB','CIDADANIA'],color:'#009afa'},
  {label:'RENOVAÇÃO SOLIDÁRIA',parties:['PRD','SOLIDARIEDADE'],color:'#008344'},
];
const DEPUTY_COLORS:Record<string,string>={...PARTY_COLORS,AVANTE:'#30adba',MISSAO:'#ffc21c'};
export function electoralGroup(winner:Row,cargo:string){
  if(Number(winner.empatados)>1)return {label:'Empate',color:'#94a3b8'};
  const party=partyKey(winner.partido),deputy=cargo==='6'||cargo==='7';
  const federation=deputy?FEDERATIONS.find(f=>f.parties.includes(party)):undefined;
  return federation?{label:federation.label,color:federation.color}:{label:String(winner.partido||'Partido indisponível'),color:(deputy?DEPUTY_COLORS:PARTY_COLORS)[party]||'#94a3b8'};
}
export function winnerColor(winner?:Row,cargo='1'){return winner?electoralGroup(winner,cargo).color:'#9daec3';}
export function winnerLabel(winner?:Row,cargo='1'){
  if(!winner)return 'Sem resultado nominal';
  if(Number(winner.empatados)>1)return 'Empate no primeiro lugar';
  const group=electoralGroup(winner,cargo);
  return `${winner.nome} · ${winner.partido}${group.label!==String(winner.partido)?` · ${group.label}`:''} · ${Number(winner.votos).toLocaleString('pt-BR')} votos`;
}
