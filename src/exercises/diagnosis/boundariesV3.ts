/** ND02 v3: usable host range + written mask. Frozen v2 supplies only address facts. */
import { generateBoundariesV2, type BoundaryRecipeId, type BoundaryDiagnosis } from './boundariesV2';
import type { DiagnosisDifficulty } from './generator';
import type { PilotQuestion } from './pilot';

export const V3_RECIPES = ['before-network','network','first-host','last-host','broadcast','after-broadcast','interior','zero-host','255-host'] as const;
export type V3RecipeId = typeof V3_RECIPES[number];
export interface V3Recipe { version:3; archetype:'ND02'; difficulty:DiagnosisDifficulty; seed:string; recipe?:V3RecipeId }
export interface MaskQuestion {
  id:'mask'; concept:'mask'; prompt:string; basis:readonly string[]; answer:string;
  explanation:{reasoning:string;alternatives?:never};
}
export interface BoundaryDiagnosisV3 {
  recipe:V3Recipe & {recipe:V3RecipeId};
  data:Omit<BoundaryDiagnosis['data'],'probe'|'role'> & {role:V3RecipeId};
  calculation:BoundaryDiagnosis['calculation'];
  case:Omit<BoundaryDiagnosis['case'],'contentVersion'|'questions'> & {contentVersion:3;questions:readonly (PilotQuestion|MaskQuestion)[]};
}
function random(key:string) {
  let state=2166136261;
  for(let i=0;i<key.length;i++)state=Math.imul(state^key.charCodeAt(i),16777619)>>>0;
  return (n:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/2**32*n);};
}
export function generateBoundariesV3(input:V3Recipe):BoundaryDiagnosisV3 {
  if(!input||input.version!==3||input.archetype!=='ND02'||!['beginner','intermediate','advanced'].includes(input.difficulty)||typeof input.seed!=='string'||!input.seed.trim()||input.seed.length>256)throw Error('Ungültiges ND02-v3-Rezept');
  const next=random(JSON.stringify(['nd02-selection',3,input.difficulty,input.seed]));
  const pool=next(10)<8?V3_RECIPES.slice(0,6):V3_RECIPES.slice(6,input.difficulty==='beginner'?7:9);
  const id=input.recipe??pool[next(pool.length)];
  if(!V3_RECIPES.includes(id)||(input.difficulty==='beginner'&&(id==='zero-host'||id==='255-host')))throw Error('Rezept passt nicht zur Schwierigkeit');
  // Reuse the immutable address algorithm; prefix the seed in an independent namespace.
  // Hashing keeps even 256-character external seeds within v2's input contract.
  const salt=random(JSON.stringify(['nd02-addresses',3,input.difficulty,input.seed,id]));
  const addressSeed=`nd02-v3-${salt(2**32).toString(16)}-${salt(2**32).toString(16)}`;
  const base=generateBoundariesV2({version:2,archetype:'ND02',difficulty:input.difficulty,seed:addressSeed,recipe:id as BoundaryRecipeId});
  const {pc,prefix,candidate}=base.data,f=base.calculation;
  const belongs=base.case.questions[0].answer==='yes';
  const usable=belongs&&candidate!==f.network&&candidate!==f.broadcast;
  const reason=candidate===f.network?'Die Gateway-Adresse ist die Netzadresse, keine nutzbare Hostadresse.':candidate===f.broadcast?'Die Gateway-Adresse ist die Broadcastadresse, keine nutzbare Hostadresse.':!belongs?'Die Gateway-Adresse liegt außerhalb dieses Subnetzes.':`Die Gateway-Adresse liegt im nutzbaren Hostbereich.${id==='zero-host'||id==='255-host'?' .0 oder .255 allein bestimmen nicht die Rolle einer IPv4-Adresse.':''}`;
  const bits=Array.from({length:4},(_,i)=>Math.max(0,Math.min(8,prefix-i*8)));
  const reasoning=`/${prefix} bedeutet ${prefix} gesetzte Netzbits: ${bits.join(' + ')} Bits in den vier Oktetten. Daraus folgt ${f.mask}.`;
  return {recipe:{version:3,archetype:'ND02',difficulty:input.difficulty,seed:input.seed,recipe:id},data:{kind:'address',pc,prefix,candidate,role:id},calculation:f,
    case:{id:JSON.stringify(['nd02-boundaries',3,input.difficulty,input.seed,id]),archetype:'ND02',contentVersion:3,title:'Gateway und Subnetz',scenario:'',evidence:[{id:'addresses',kind:'configuration',text:`PC: ${pc}/${prefix}; Gateway: ${candidate}`}],questions:[
      {id:'membership',concept:'membership',prompt:'Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?',basis:['addresses'],answer:belongs?'yes':'no',explanation:{reasoning:`${candidate} liegt ${belongs?'innerhalb':'außerhalb'} des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.`}},
      {id:'host',concept:'gateway-address',prompt:'Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?',basis:['addresses'],answer:usable?'yes':'no',explanation:{reasoning:reason}},
      {id:'mask',concept:'mask',prompt:'Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?',basis:['addresses'],answer:f.mask,explanation:{reasoning}},
    ]}};
}
/** A complete dotted-decimal response; malformed/unfinished input must not disclose answers. */
export function isCompleteMaskInput(value:string|undefined):boolean {
  if(typeof value!=='string'||! /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value.trim()))return false;
  return value.trim().split('.').every(v=>Number(v)<=255);
}
