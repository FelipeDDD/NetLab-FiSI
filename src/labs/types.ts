// The lab format: a starting topology (the SaveFile part) plus ordered steps
// with machine-checkable objectives and quiz questions. Objectives are
// expressed as observable network facts — the checker probes the live
// simulation with real packets, so "grading" is visible on the canvas.

export type Check =
  | { type: 'iface-ip'; device: string; iface: string; cidr?: string; inSubnet?: string }
  | { type: 'default-route'; device: string; via?: string }
  | { type: 'forwarding'; device: string; expect: boolean }
  | { type: 'fw-policy'; device: string; hook: 'input' | 'forward' | 'output'; policy: 'accept' | 'drop' }
  | { type: 'ping'; from: string; toDevice?: string; toAddr?: string; expect: 'success' | 'fail' }
  | {
      type: 'tcp';
      from: string;
      toDevice?: string;
      toAddr?: string;
      port: number;
      expect: 'open' | 'refused' | 'filtered';
    }
  | { type: 'dns'; from: string; name: string; expect: 'resolves' | 'nxdomain'; addr?: string }
  | { type: 'http'; from: string; url: string; expect: 'ok' | 'fail'; contains?: string };

export interface Objective {
  id: string;
  label: string;
  check: Check;
}

export interface QuizQ {
  q: string;
  options: string[];
  answer: number;
}

export interface LabStep {
  title: string;
  body: string; // plain text; `backticks` render as code
  objectives: Objective[];
  quiz?: QuizQ[];
}

export interface LabDef {
  id: string;
  title: string;
  blurb: string;
  steps: LabStep[];
}

export interface LabProgress {
  step: number;
  results: Record<string, { pass: boolean; detail: string }>;
  quiz: Record<string, number>;
}
