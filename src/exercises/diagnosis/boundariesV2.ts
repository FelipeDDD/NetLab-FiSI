/** ND02 v2 authoring prototype. Independent namespace; v1 remains frozen. */
import { facts } from '../factory/math';
import type { DiagnosisDifficulty } from './generator';
import type { DiagnosisPilotCase, PilotQuestion } from './pilot';

export const BOUNDARY_RECIPES = ['before-network','network','first-host','last-host','broadcast','after-broadcast','interior','self','zero-host','255-host'] as const;
export type BoundaryRecipeId = typeof BOUNDARY_RECIPES[number];
export const BOUNDARY_PREFIXES = {beginner:[24,25,26],intermediate:[23,24,25,26,27,28],advanced:[21,22,23,26,27,28]} as const;
export interface BoundaryRecipe {version:2;archetype:'ND02';difficulty:DiagnosisDifficulty;seed:string;recipe?:BoundaryRecipeId}
export interface BoundaryDiagnosis {
  recipe:BoundaryRecipe & {recipe:BoundaryRecipeId};
  data:{kind:'address';pc:string;prefix:number;candidate:string;role:BoundaryRecipeId;probe:{kind:'network'|'broadcast'|'first'|'last'|'next'|'membership';address:string}};
  calculation:ReturnType<typeof facts>;
  case:Omit<DiagnosisPilotCase,'contentVersion'> & {contentVersion:2};
}
function random(key:string) {
  let state=2166136261;
  for(let i=0;i<key.length;i++)state=Math.imul(state^key.charCodeAt(i),16777619)>>>0;
  return (n:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/2**32*n);};
}
function dot(n:number) {
  if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)throw Error('IPv4-Grenze überschritten');
  return [24,16,8,0].map(s=>(n>>>s)&255).join('.');
}
const yn=(v:boolean)=>v?'yes' as const:'no' as const;
function question(id:string,concept:PilotQuestion['concept'],prompt:string,answer:boolean,reasoning:string):PilotQuestion {
  return {id,concept,prompt,answer:yn(answer),basis:['addresses'],explanation:{reasoning}};
}
export function generateBoundariesV2(input:BoundaryRecipe):BoundaryDiagnosis {
  if(!input||input.version!==2||input.archetype!=='ND02'||!Object.hasOwn(BOUNDARY_PREFIXES,input.difficulty)||typeof input.seed!=='string'||!input.seed.trim()||input.seed.length>256)throw Error('Ungültiges ND02-v2-Rezept');
  const select=random(JSON.stringify(['nd02-boundaries-selection',2,input.difficulty,input.seed]));
  // 80% six calculated boundary positions; 20% interior hosts (including own IP).
  const pool=select(10)<8?BOUNDARY_RECIPES.slice(0,6):BOUNDARY_RECIPES.slice(6,input.difficulty==='beginner'?8:10);
  const id=input.recipe??pool[select(pool.length)];
  if(!BOUNDARY_RECIPES.includes(id)||(input.difficulty==='beginner'&&(id==='zero-host'||id==='255-host')))throw Error('Rezept passt nicht zur Schwierigkeit');
  const recipe={...input,recipe:id},key=JSON.stringify(['nd02-boundaries',2,input.difficulty,input.seed,id]),next=random(key);
  const prefixes=BOUNDARY_PREFIXES[input.difficulty].filter(p=>!['zero-host','255-host'].includes(id)||p<24);
  const prefix=prefixes[next(prefixes.length)],size=2**(32-prefix);
  // Private unicast blocks, with both adjacent subnets inside IPv4 and 10/8.
  const raw=10*2**24+(32+next(128))*65536+next(65536),network=Math.floor(raw/size)*size,broadcast=network+size-1;
  let pc=network+2+next(size-4),candidate:number;
  switch(id) {
    case 'before-network':candidate=network-1;break;
    case 'network':candidate=network;break;
    case 'first-host':candidate=network+1;break;
    case 'last-host':candidate=broadcast-1;break;
    case 'broadcast':candidate=broadcast;break;
    case 'after-broadcast':candidate=broadcast+1;break;
    case 'self':candidate=pc;break;
    case 'zero-host':candidate=network+256*(1+next(size/256-1));break;
    case '255-host':candidate=network+255+256*next(size/256-1);break;
    default:candidate=network+2+next(size-4);
  }
  if(id!=='self'&&pc===candidate)pc=pc===broadcast-2?network+2:pc+1;
  const candidateIp=dot(candidate),pcIp=dot(pc),calculation=facts(`${pcIp}/${prefix}`);
  const belongs=candidate>=network&&candidate<=broadcast,usable=candidate>network&&candidate<broadcast&&candidate!==pc;
  const reason=candidate===network?'Die Gateway-Adresse ist die Netzadresse, keine Hostadresse.':candidate===broadcast?'Die Gateway-Adresse ist die Broadcastadresse, keine Hostadresse.':candidate===pc?'Die Gateway-Adresse ist bereits die IP des PCs und kann keinen anderen Router bezeichnen.':!belongs?'Die Gateway-Adresse liegt außerhalb des lokalen Subnetzes.':`Die Adresse liegt im Hostbereich und unterscheidet sich von der PC-IP.${id==='zero-host'||id==='255-host'?' Das letzte Oktett allein bestimmt weder Netz noch Broadcast.':''}`;
  const kinds=['network','broadcast','first','last','next','membership'] as const,kind=kinds[next(kinds.length)],truth=next(2)===1;
  const expected={network,broadcast,first:network+1,last:broadcast-1,next:broadcast+1};
  const probe=kind==='membership'?(truth?network+next(size):next(2)?network-1:broadcast+1)
    :truth?expected[kind]:kind==='network'?network+1:kind==='broadcast'?broadcast-1:kind==='first'?network:kind==='last'?broadcast:network;
  const address=dot(probe),names={network:'die Netzadresse dieses Subnetzes',broadcast:'die Broadcastadresse dieses Subnetzes',first:'die erste nutzbare Hostadresse dieses Subnetzes',last:'die letzte nutzbare Hostadresse dieses Subnetzes',next:'die Netzadresse des nächsten gleich großen Subnetzes'};
  const prompt=kind==='membership'?`Gehört ${address} zum Subnetz des PCs?`:`Ist ${address} ${names[kind]}?`;
  const explanation=kind==='membership'?`${address} liegt ${truth?'innerhalb':'außerhalb'} des Blocks ${dot(network)}–${dot(broadcast)}.`:`${truth?'Richtig':'Nein'}: ${names[kind][0].toUpperCase()+names[kind].slice(1)} ist ${dot(expected[kind])}.`;
  const questions=[
    question('membership','membership','Gehört die Gateway-Adresse zum Subnetz des PCs?',belongs,`${candidateIp} liegt ${belongs?'innerhalb':'außerhalb'} des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.`),
    question('gateway','gateway-address','Ist sie numerisch als Gateway eines anderen Routers geeignet?',usable,reason),
    question('boundary','membership',prompt,truth,explanation),
  ];
  return {recipe,data:{kind:'address',pc:pcIp,prefix,candidate:candidateIp,role:id,probe:{kind,address}},calculation,
    case:{id:key,archetype:'ND02',contentVersion:2,title:'Gateway und Subnetz',scenario:'',evidence:[{id:'addresses',kind:'configuration',text:`PC: ${pcIp}/${prefix}; Gateway: ${candidateIp}`}],questions}};
}
