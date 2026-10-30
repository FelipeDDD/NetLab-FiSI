/** Only new UI variants use this format; manual/reference/legacy seeds remain opaque strings. */
export function randomPracticeSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Bounded deterministic retry without appending an ever-growing suffix to the displayed seed. */
export function retryPracticeSeed(seed:string, attempt:number):string {
  if(attempt===0)return seed;
  let hash=2166136261;
  for(const char of `${seed}|retry|${attempt}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  return hash.toString(16).padStart(8,'0');
}
