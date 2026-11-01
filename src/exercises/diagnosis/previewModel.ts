/** Development-only adapter. No changes to frozen recipes or question contracts. */
import { generateDiagnosis, type GeneratedDiagnosis } from './generator';
import { generateBoundariesV2, type BoundaryDiagnosis, type BoundaryRecipe } from './boundariesV2';
import { generateBoundariesV3, isCompleteMaskInput, type BoundaryDiagnosisV3, type V3Recipe } from './boundariesV3';
import type { DiagnosisRecipe } from './generator';
import type { DiagnosisConcept, PilotQuestion } from './pilot';
import { randomPracticeSeed, retryPracticeSeed } from '../practice/seeds';

export type DiagnosisAnswer=PilotQuestion['answer'];
export type DiagnosisAnswers=Record<string,string>;
export type PreviewDiagnosis=GeneratedDiagnosis|BoundaryDiagnosis|BoundaryDiagnosisV3;
export type PreviewRecipe=DiagnosisRecipe|BoundaryRecipe|V3Recipe;
export function generatePreview(recipe:PreviewRecipe):PreviewDiagnosis {
  return recipe.version===3?generateBoundariesV3(recipe):recipe.version===2?generateBoundariesV2(recipe):generateDiagnosis(recipe);
}
export function initialDiagnosisAnswers(generated:PreviewDiagnosis):DiagnosisAnswers {
  return generated.recipe.version===3?{mask:'255.255.'}:{};
}
const binary=[{value:'yes',label:'yes'},{value:'no',label:'no'}] as const;
const open=[...binary,{value:'unknown',label:'unknown'}] as const;
// Contract, not the expected answer: determined reachability/cause questions still offer Unknown.
export function diagnosisOptions(concept:DiagnosisConcept) {
  return concept==='reachability'||concept==='cause'?open:binary;
}
type PromptQuestion={id:string;prompt:string;options:ReturnType<typeof diagnosisOptions>;input?:'mask'};
/** Student projection deliberately omits recipe ID, classified data, basis, answers and explanations. */
export function diagnosisPrompt(generated:PreviewDiagnosis) {
  const c=generated.case;
  if(generated.recipe.version===3) {
    const d=generated.data;
    if(d.kind!=='address')throw Error('ND02 address data required');
    return {title:c.title,scenario:'',evidence:[{id:'pc',text:`PC: ${d.pc}/${d.prefix}`},{id:'gateway',text:`Gateway: ${d.candidate}`}],
      questions:c.questions.map((q):PromptQuestion=>q.concept==='mask'?{id:q.id,prompt:q.prompt,input:'mask',options:binary}:{id:q.id,prompt:q.prompt,options:diagnosisOptions(q.concept)})};
  }
  if(generated.recipe.archetype==='ND02'&&generated.data.kind==='address') {
    const d=generated.data;
    return {title:'Gateway und Subnetz',scenario:'',
      evidence:[{id:'pc',text:`PC: ${d.pc}/${d.prefix}`},{id:'gateway',text:`Gateway: ${d.candidate}`}],
      questions:c.questions.map((q):PromptQuestion=>({id:q.id,prompt:q.id==='membership'
        ?'Gehört die Gateway-Adresse zum Subnetz des PCs?'
        :q.id==='gateway'?'Ist sie numerisch als Gateway eines anderen Routers geeignet?':q.prompt,options:q.concept==='mask'?binary:diagnosisOptions(q.concept)}))};
  }
  return {title:c.title,scenario:c.scenario,evidence:c.evidence.map(e=>({id:e.id,text:e.text})),
    questions:c.questions.map((q):PromptQuestion=>({id:q.id,prompt:q.prompt,options:q.concept==='mask'?binary:diagnosisOptions(q.concept)}))};
}
export function checkDiagnosis(generated:PreviewDiagnosis,answers:DiagnosisAnswers) {
  const missing=generated.case.questions.filter(q=>q.concept==='mask'?!isCompleteMaskInput(answers[q.id]):!diagnosisOptions(q.concept).some(o=>o.value===answers[q.id])).map(q=>q.id);
  if(missing.length)return {complete:false as const,missing};
  const fields=generated.case.questions.map(q=>({id:q.id,correct:(q.concept==='mask'?answers[q.id].trim():answers[q.id])===q.answer,answer:q.answer,explanation:q.explanation}));
  return {complete:true as const,missing:[],pass:fields.every(f=>f.correct),fields};
}
export function nextDiagnosis(current:GeneratedDiagnosis,seed?:string):GeneratedDiagnosis;
export function nextDiagnosis(current:BoundaryDiagnosis,seed?:string):BoundaryDiagnosis;
export function nextDiagnosis(current:BoundaryDiagnosisV3,seed?:string):BoundaryDiagnosisV3;
export function nextDiagnosis(current:PreviewDiagnosis,seed?:string):PreviewDiagnosis;
export function nextDiagnosis(current:PreviewDiagnosis,seed=randomPracticeSeed()):PreviewDiagnosis {
  const previous=JSON.stringify(diagnosisPrompt(current));
  for(let i=0;i<32;i++) {
    // Do not pin the resolved subrecipe: a new seed should select among all eligible recipes.
    const next=generatePreview({...current.recipe,recipe:undefined,seed:retryPracticeSeed(seed,i)});
    if(next.case.id!==current.case.id&&JSON.stringify(diagnosisPrompt(next))!==previous)return next;
  }
  throw Error('Keine neue Variante verfügbar');
}
