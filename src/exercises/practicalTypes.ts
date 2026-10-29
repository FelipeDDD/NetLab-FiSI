import type { StudentExercise } from './beta';
import type { Assessment } from './types';

export interface StructurePolicy {
  /** Only these permanent values may differ from the published initial topology. */
  editable: Record<string, { routes?: boolean; gatewayIfaces?: string[]; ipIfaces?: string[] }>;
}
export type PracticalCriterion = { id:string; requirementId:string; label:string; success:string; failure:string } & (
  | {kind:'engine'; check:Extract<Assessment,{kind:'engine'}>['check']}
  | {kind:'structure'; policy:StructurePolicy}
  | {kind:'route'; device:string; target:string; via:string|null; iface:string}
);
export interface PracticalExercise extends StudentExercise {
  pilot:true;
  difficulty:'beginner'|'intermediate'|'advanced';
  /** Qualitative discussion is not scored or silently accepted by the technical checker. */
  manualReview:string[];
}
