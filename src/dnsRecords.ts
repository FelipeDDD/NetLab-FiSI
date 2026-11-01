import { parseIp } from './engine/ip';

type DnsRecordResult = { records: Map<string, number>; error?: never } | { error: string; records?: never };
// Parse the complete draft before the caller mutates records, history or autosave.
export function parseDnsRecords(text: string): DnsRecordResult {
  const records = new Map<string, number>();
  const lines = text.split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const tokens = line.split(/\s+/), ip = parseIp(tokens[0]);
    const name = tokens[1]?.toLowerCase();
    const labels = name?.replace(/\.$/, '').split('.');
    if (tokens.length !== 2 || ip === null || !name || name.replace(/\.$/, '').length > 253 || !labels?.every(label =>
      label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
      return { error: `DNS: Zeile ${index + 1} ist ungültig. Pro Zeile genau eine IPv4-Adresse und einen Hostnamen eingeben (<IP> <Name>). Vorhandene Einträge bleiben unverändert.` };
    }
    if (records.has(name) && records.get(name) !== ip) {
      return { error: `DNS: Zeile ${index + 1} enthält einen widersprüchlichen Eintrag für ${name}. Vorhandene Einträge bleiben unverändert.` };
    }
    records.set(name, ip);
  }
  return { records };
}
