/** Development-only catalog: never registered in the public bundle. */
import {translateMessages,type Language} from '../../i18n';
import {nd02Messages} from './nd02Messages';
const en={...nd02Messages.en,
  title:'Network diagnosis · Preview',note:'Development only · Answers are not saved',legacyNote:'Development only · Tasks in German',theme:'Preview theme',reopen:'Open preview',recipe:'Reproducible recipe',version:'Version',v2:'v2 · Subnet boundaries',v3:'v3 · Hosts & subnet mask',
} as const;
type Messages=Record<keyof typeof en,string>;
const de:Messages={...nd02Messages.de,
  title:'Netzwerkdiagnose · Preview',note:'Nur Entwicklung · Antworten werden nicht gespeichert',legacyNote:'Nur Entwicklung · Aufgaben auf Deutsch',theme:'Vorschau-Thema',reopen:'Preview öffnen',recipe:'Reproduzierbare Rezeptdaten',version:'Version',v2:'v2 · Subnetzgrenzen',v3:'v3 · Hosts & Subnetzmaske',
};
const pt:Messages={...nd02Messages['pt-BR'],
  title:'Diagnóstico de rede · Preview',note:'Somente desenvolvimento · Respostas não são salvas',legacyNote:'Somente desenvolvimento · Enunciados em alemão',theme:'Tema do preview',reopen:'Abrir preview',recipe:'Receita reproduzível',version:'Versão',v2:'v2 · Limites das sub-redes',v3:'v3 · Hosts e máscara de sub-rede',
};
export const previewMessages={en,de,'pt-BR':pt};
export const previewText=(language:Language,key:keyof Messages,values?:Record<string,string|number>)=>translateMessages(previewMessages,language,key,values);
