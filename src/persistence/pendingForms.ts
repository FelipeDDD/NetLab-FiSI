/** Volatile checks only: no field values are stored, exported or serialized. */
const checks = new Set<() => boolean>();
export function registerPendingForm(check: () => boolean): () => void {
  checks.add(check); return () => { checks.delete(check); };
}
export function hasPendingForms(): boolean { return [...checks].some(check => check()); }
