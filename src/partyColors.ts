import type {Row} from './types';
export const PARTY_COLORS:Record<string,string>={PL:'#313d8a',PT:'#ff3158',MDB:'#0e9e4f',PP:'#608fd3',REPUBLICANOS:'#1e666c',PSD:'#ef8700',UNIAO:'#24c7f3',PSB:'#eeda47',NOVO:'#ff6b00',PODE:'#19a63b',PSDB:'#009afa',PDT:'#ffa78e',REDE:'#7ccdd2','SEM PARTIDO':'#94a3b8'};
export const partyKey=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export function winnerColor(winner?:Row){return !winner?'#b5c9b3':Number(winner.empatados)>1?'#94a3b8':PARTY_COLORS[partyKey(winner.partido)]||'#94a3b8';}
export function winnerLabel(winner?:Row){return !winner?'Sem resultado nominal':Number(winner.empatados)>1?'Empate no primeiro lugar':`${winner.nome} · ${winner.partido} · ${Number(winner.votos).toLocaleString('pt-BR')} votos`;}
