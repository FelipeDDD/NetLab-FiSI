import { LEGACY_AUTOSAVE_KEY, LEGACY_FINGERPRINT_ALGORITHM, type LegacyCaptured, type LegacyDiagnostic, type LegacyOriginal, type LegacySource } from './legacyTypes';

export type LegacyReadResult = { status: 'present'; original: LegacyOriginal } | { status: 'absent'; source: LegacySource } | { status: 'failed'; diagnostic: LegacyDiagnostic };

export function readLegacyAutosave(storage: Pick<Storage, 'getItem'>, origin: string): LegacyReadResult {
  if (typeof origin !== 'string' || !origin.trim()) return { status: 'failed', diagnostic: { code: 'invalid-input', message: 'An explicit source origin is required.' } };
  const source: LegacySource = { storage: 'localStorage', key: LEGACY_AUTOSAVE_KEY, origin };
  try {
    const rawText = storage.getItem(LEGACY_AUTOSAVE_KEY);
    if (rawText === null) return { status: 'absent', source };
    if (typeof rawText !== 'string') throw new Error('Storage returned a non-string value.');
    return { status: 'present', original: { source, rawText } };
  } catch (error) { return { status: 'failed', diagnostic: { code: 'read-failed', message: String(error) } }; }
}

function utf16Bytes(text: string, bom = false): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length * 2 + (bom ? 2 : 0));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  if (bom) { view.setUint16(0, 0xfeff, true); offset = 2; }
  for (let i = 0; i < text.length; i++) view.setUint16(offset + i * 2, text.charCodeAt(i), true);
  return bytes;
}

/** Exact JS code units, including isolated surrogates: TextEncoder alone would
 * collapse different malformed strings into the same replacement character. */
export async function fingerprintLegacyText(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 requires a secure context.');
  const digest = await crypto.subtle.digest('SHA-256', utf16Bytes(text));
  return LEGACY_FINGERPRINT_ALGORITHM + ':' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function identifyLegacySource(original: LegacyOriginal): Promise<LegacyCaptured> {
  const [sourceId, fingerprint] = await Promise.all([
    fingerprintLegacyText(JSON.stringify(original.source)), fingerprintLegacyText(original.rawText),
  ]);
  const prefix = 'legacy-autosave:v1:' + sourceId + ':' + fingerprint;
  return { ...original, fingerprint, archiveKey: prefix + ':raw', markerKey: prefix + ':migration' };
}

export interface LegacyRecoveryFile { filename: string; mimeType: string; encoding: 'utf-8' | 'utf-16le'; bytes: Uint8Array<ArrayBuffer> }

/** No browser download, database write or JSON parsing. A future UI can download
 * these bytes; malformed UTF-16 strings get an exact UTF-16LE recovery file. */
export function createLegacyRecoveryFile(rawText: string): LegacyRecoveryFile {
  // A round-trip detects isolated surrogates without requiring String.isWellFormed.
  const bytes = new TextEncoder().encode(rawText);
  if (new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) === rawText) return { filename: 'netlab-autosave-original.json', mimeType: 'application/json;charset=utf-8', encoding: 'utf-8', bytes };
  return { filename: 'netlab-autosave-original-utf16le.txt', mimeType: 'application/octet-stream', encoding: 'utf-16le', bytes: utf16Bytes(rawText, true) };
}

export function readLegacyRecoveryFile(file: Pick<LegacyRecoveryFile, 'encoding' | 'bytes'>): string {
  if (file.encoding === 'utf-8') return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes);
  if (file.encoding !== 'utf-16le' || file.bytes.length < 2 || file.bytes.length % 2 || file.bytes[0] !== 0xff || file.bytes[1] !== 0xfe) throw new Error('Invalid UTF-16LE recovery file.');
  const view = new DataView(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
  const chunks: string[] = [];
  for (let offset = 2; offset < file.bytes.length; offset += 8192) {
    const units: number[] = [];
    for (let i = offset; i < Math.min(offset + 8192, file.bytes.length); i += 2) units.push(view.getUint16(i, true));
    chunks.push(String.fromCharCode(...units));
  }
  return chunks.join('');
}
