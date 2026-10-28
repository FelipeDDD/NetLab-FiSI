import type { ExerciseDraft } from '../types';
import type { MathProblem } from './math';

/** Authoring extension; published ExerciseDraft/runtime contracts remain unchanged. */
export interface CalculationDraft extends Pick<ExerciseDraft, 'id' | 'status' | 'contentVersion' | 'difficulty'> {
  format: 'calculation';
  group: 'A' | 'B';
  category: 'subnetting' | 'vlsm';
  student: Omit<ExerciseDraft['student'], 'initialTopology'> & { initialData: MathProblem };
  review: Pick<ExerciseDraft['review'], 'alternatives' | 'rejectionCases' | 'limitations'> & {
    reference: { answer: unknown; explanation: string };
    assessments: { id: string; requirementId: string; kind: 'math'; criterion: string }[];
    commonMistakes: string[];
  };
}
export interface NetworkDraft extends ExerciseDraft {
  format: 'network';
  group: 'C' | 'D';
  review: ExerciseDraft['review'] & { commonMistakes: string[] };
}
export type FactoryDraft = CalculationDraft | NetworkDraft;
