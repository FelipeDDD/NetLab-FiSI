import { parseCidr, parseIp, networkOf } from '../engine/ip';
import { CABLE_COLORS, isCableColor } from '../cableAppearance';
import { DEFAULT_TERMINAL_COLORS, hasTerminalColor } from '../terminalAppearance';
import { normalizeProjectDocument, isObject } from './projectDocument';
import type { LegacyInspection } from './legacyTypes';

/** Conservative migration boundary. Ordinary import intentionally normalizes
 * presentation; migration must detect discarded/changed source fields first. */
export function inspectLegacyTopology(rawText: string): LegacyInspection {
  let parsed: unknown;
  try { parsed = JSON.parse(rawText); }
  catch (error) { return { ok: false, diagnostic: { code: 'invalid-json', message: String(error) } }; }
  if (isObject(parsed) && (parsed.app !== 'netsim' || parsed.version !== 1)) return { ok: false, diagnostic: { code: 'unsupported-version', message: 'Only the known netsim v1 topology format can be migrated.' } };
  let document;
  try { document = normalizeProjectDocument({ schemaVersion: 1, topology: parsed }); }
  catch (error) { return { ok: false, diagnostic: { code: 'invalid-document', message: error instanceof Error ? error.message : String(error) } }; }
  try {
    const source = parsed as Record<string, unknown>;
    const devices = document.topology.devices;
    const empty = (v: unknown) => isObject(v) && Object.keys(v).length === 0;
    const missingDefault = (value: unknown, path: string[]): boolean => {
      if (path.length === 3 && path[0] === 'devices') {
        const field = path[2];
        if ((field === 'nameserver' && value === null) || (field === 'ripEnabled' && value === false)) return true;
        if (field === 'dhcpPools' && empty(value)) return true;
        if (field === 'vlans' && isObject(value) && Object.values(value).every(v => v === 1)) return true;
        if (field === 'services' && isObject(value) && Object.entries(value).every(([k, v]) => ['tcp', 'udp'].includes(k) && Array.isArray(v) && !v.length)) return true;
        if (field === 'firewall' && isObject(value) && Object.entries(value).every(([k, v]) =>
          k === 'tables' ? isObject(v) && Object.entries(v).every(([n, enabled]) => ['filter', 'nat'].includes(n) && enabled === false) : ['filter', 'nat'].includes(k) && empty(v))) return true;
      }
      if (path.length === 4 && path[0] === 'devices' && path[2] === 'vlans' && value === 1) return true;
      if (path.length === 2 && path[0] === 'ui') {
        if (path[1] === 'terminalLayoutMode' && value === 'free') return true;
        if (['terminalColors', 'cableColors'].includes(path[1]) && empty(value)) return true;
      }
      if (path.length === 3 && path[0] === 'ui' && path[1] === 'terminalColors') {
        const device = devices.find(d => d.id === path[2]);
        return !!device && hasTerminalColor(device.kind) && typeof value === 'string' && value.toLowerCase() === DEFAULT_TERMINAL_COLORS[device.kind];
      }
      return false;
    };
    const lost = (path: string[]): never => { throw new Error('Source field would be discarded or changed: ' + path.join(' / ')); };
    const compare = (original: unknown, canonical: unknown, path: string[]) => {
      if (path.length === 3 && path[0] === 'ui' && path[1] === 'cableColors' && isCableColor(original)) original = { mode: 'manual', color: CABLE_COLORS[original].value };
      if (original === canonical) return;
      if (typeof original === 'string' && typeof canonical === 'string') {
        if (/^#[\da-f]{6}$/i.test(original) && original.toLowerCase() === canonical.toLowerCase()) return;
        if (/^([\da-f]{2}:){5}[\da-f]{2}$/i.test(original) && original.toLowerCase() === canonical.toLowerCase()) return;
        const ip = parseIp(original), otherIp = parseIp(canonical);
        if (ip !== null && ip === otherIp) return;
        const cidr = parseCidr(original), otherCidr = parseCidr(canonical);
        if (cidr && otherCidr && cidr.prefix === otherCidr.prefix) {
          const route = path[0] === 'devices' && path[2] === 'routes' && path.at(-1) === 'dest';
          if ((route ? networkOf(cidr.addr, cidr.prefix) : cidr.addr) === otherCidr.addr) return;
        }
        lost(path);
      }
      if (Array.isArray(original) && Array.isArray(canonical)) {
        let list: unknown[] = original;
        const field = path.at(-1);
        if (field === 'devices' || field === 'links' || field === 'ifaces') {
          if (field !== 'ifaces' && original.length !== canonical.length) lost(path);
          const key = field === 'ifaces' ? 'name' : 'id';
          for (const item of original) {
            if (!isObject(item)) lost(path);
            const target = canonical.find(v => isObject(v) && v[key] === item[key]);
            if (!target) lost([...path, String(item[key])]);
            compare(item, target, [...path, String(item[key])]);
          }
          return;
        }
        if (path[2] === 'services' && ['tcp', 'udp'].includes(field!)) list = [...new Set(list)].sort((a, b) => Number(a) - Number(b));
        if (path[2] === 'dnsServer' && field === 'records') list = (list as [string, string][]).map(([name, address]) => [name.toLowerCase(), address]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
        if (list.length !== canonical.length) lost(path);
        list.forEach((v, i) => compare(v, canonical[i], [...path, String(i)]));
        return;
      }
      if (isObject(original) && isObject(canonical)) {
        for (const [key, value] of Object.entries(original)) {
          const next = [...path, key];
          if (!Object.hasOwn(canonical, key)) { if (!missingDefault(value, next)) lost(next); }
          else compare(value, canonical[key], next);
        }
        return;
      }
      lost(path);
    };
    compare(source, document.topology, []);
    return { ok: true, document };
  } catch (error) { return { ok: false, diagnostic: { code: 'lossy-document', message: error instanceof Error ? error.message : String(error) } }; }
}
