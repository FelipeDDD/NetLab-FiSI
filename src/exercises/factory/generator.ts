import { ipToString } from '../../engine/ip';
import type { ExerciseDraft } from '../types';
import { solve, type MathProblem } from './math';

export const GENERATOR_VERSION = 1;
export const FAMILIES = ['subnet', 'capacity', 'vlsm', 'overlap', 'membership'] as const;
const INSTRUCTIONS: Record<MathProblem['family'], string> = {
  subnet: 'Bestimmen Sie Netzadresse, Broadcast, Präfix, Dezimalmaske, ersten/letzten Host, Adressanzahl und nutzbare Hosts.',
  capacity: 'Wählen Sie das kleinste ausreichende Broadcast-Subnetz. Geben Sie Präfix, Dezimalmaske und nutzbare Hostanzahl an. Der Bedarf enthält bereits das Gateway.',
  vlsm: 'Planen Sie pro Bedarfs-ID das kleinste ausreichende Netz im Stammnetz. Hostzahlen enthalten Infrastruktur. Wachstum aufrunden; future-Bedarfe separat reservieren. Feste Reservierungen nicht belegen. Alle Zuordnungen müssen ausgerichtet und überlappungsfrei sein.',
  overlap: 'Geben Sie alle überlappenden Paare als 1-basierte Indexpaare i:j mit i<j an. Enthaltene und identische Netze überlappen; direkt benachbarte Netze nicht. Ohne Überschneidung ist pairs leer.',
  membership: 'Klassifizieren Sie jede Kandidaten-ID als host, network, broadcast oder outside. Zugehörigkeit allein bedeutet keine nutzbare Hostadresse.',
};
export type Recipe = { family: MathProblem['family']; difficulty: ExerciseDraft['difficulty']; seed?: string; version?: number };
/** Frozen v1 recipe: default seed is explicit and reproducible, never the wall clock. */
export function generate(recipe: Recipe) {
  const version = recipe.version ?? GENERATOR_VERSION, seed = recipe.seed ?? 'netlab-default';
  if (version !== 1 || typeof seed !== 'string' || !seed.length || seed.length > 256 || !FAMILIES.includes(recipe.family)) throw new Error('Ungültiges Generator-Rezept');
  const level = ['beginner', 'intermediate', 'advanced'].indexOf(recipe.difficulty);
  if (level < 0) throw new Error('Unbekannter Schwierigkeitsgrad');
  let state = 2166136261;
  for (const c of `${version}|${recipe.family}|${recipe.difficulty}|${seed}`) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  const next = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 2 ** 32 * n); };
  const base = 10 * 2 ** 24 + (16 + next(200)) * 65536 + next(64) * 1024;
  const prefix = [26 + next(3), 25 + next(6), 19 + next(12)][level];
  let problem: MathProblem;
  switch (recipe.family) {
    case 'subnet': problem = { family: 'subnet', ip: ipToString(base + 1 + next(255)), prefix }; break;
    case 'capacity': problem = { family: 'capacity', hosts: 1 + next([60, 500, 4000][level]) }; break;
    case 'vlsm': {
      const parentPrefix = [24, 23, 22][level], parentSize = 2 ** (32 - parentPrefix), start = Math.floor(base / parentSize) * parentSize;
      const largest = [100, 180, 220][level];
      problem = { family: 'vlsm', parent: `${ipToString(start)}/${parentPrefix}`,
        demands: [largest, 45, 20, 8].map((max, i) => ({ id: `dept-${i + 1}`, label: ['Büro', 'Technik', 'Lager', 'Reserve'][i],
          hosts: max - next(Math.floor(max / 4)), ...(i === 0 && level > 0 ? { growthPercent: 10 } : {}), ...(i === 3 ? { purpose: 'future' as const } : {}) })),
        reserved: level === 2 ? [`${ipToString(start + 512)}/25`] : [] };
      break;
    }
    case 'overlap': {
      const p = [26, 24, 22][level], size = 2 ** (32 - p), start = Math.floor(base / size) * size;
      // Sometimes disjoint; intermediate/advanced also include containment, not only equal networks.
      const nested = next(2) === 0;
      problem = { family: 'overlap', networks: [`${ipToString(start)}/${p}`,
        `${ipToString(start + (nested ? size / 2 : size))}/${p + 1}`, `${ipToString(start + size * 2)}/${p + 1}`,
        ...(level > 0 ? [`${ipToString(start + size * 2 + size / 4)}/${p + 2}`] : [])] };
      break;
    }
    case 'membership': {
      const size = 2 ** (32 - prefix), start = Math.floor(base / size) * size;
      problem = { family: 'membership', network: `${ipToString(start)}/${prefix}`, candidates:
        [start, start + 1, start + size - 2, start + size - 1, start + size, start - 1].map((ip, i) => ({ id: `ip-${i + 1}`, ip: ipToString(ip) })) };
      break;
    }
  }
  return { recipe: { ...recipe, seed, version }, instruction: INSTRUCTIONS[recipe.family], problem, reference: solve(problem) };
}
