import type { SaveFile } from '../engine/serialize';
import type { Check } from '../labs/types';

/** Authoring only: never imported by the application or added to the Labs catalog. */
export interface ExerciseDraft {
  id: string;
  contentVersion: number;
  status: 'draft';
  category: 'ipv4' | 'routing' | 'dhcp' | 'dns-http' | 'firewall';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  student: {
    title: string;
    description: string;
    learningObjectives: { id: string; text: string }[];
    initialTopology: SaveFile;
    task: string;
    requirements: { id: string; objectiveIds: string[]; text: string; evidence: 'final' | 'historical' }[];
  };
  review: {
    assessments: Assessment[];
    reference: ReferenceSolution;
    alternatives: { description: string; rationale: string }[];
    rejectionCases: string[];
    limitations: string[];
  };
}

/** Exercises never interpret editable display names as equipment identities. */
export type ExerciseCheck = Check & { resolveBy: 'id' };

export type Assessment = {
  id: string;
  requirementId: string;
} & (
  | { kind: 'engine'; check: ExerciseCheck }
  | { kind: 'manual'; procedure: string; reason: string }
);

export interface ReferenceSolution {
  explanation: string;
  /** Permanent target configuration; transient DHCP leases are acquired below. */
  topology: SaveFile;
  commands: { device: string; line: string }[];
}
