import { ipToString, parseCidr, parseIp } from './engine/ip';

export function ipv4WithoutPrefix(value: string): string | null {
  const text = value.trim();
  const ip = text.includes('/') ? parseCidr(text)?.addr : parseIp(text);
  return ip === null || ip === undefined ? null : ipToString(ip);
}

// Clipboard access can be unavailable (e.g. HTTP) or denied by the browser.
// Keep failure explicit so callers can offer native selection + Ctrl/Cmd+C.
export async function copyIpv4(value: string): Promise<boolean> {
  const ip = ipv4WithoutPrefix(value);
  if (ip === null) return false;
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(ip);
    return true;
  } catch {
    return false;
  }
}
