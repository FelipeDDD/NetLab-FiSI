import type { DeviceKind } from './engine/device';

// Existing canvas/category identity palette, shared by CSS, minimap and cables.
// Terminal colors are independent console preferences, not device identity.
const HOST = '#38bdf8';
export const DEVICE_COLORS: Readonly<Record<DeviceKind, string>> = {
  host: HOST, notebook: HOST, smartphone: HOST,
  switch: '#a78bfa', router: '#34d399', firewall: '#fb923c', server: '#2dd4bf', ap: '#f472b6',
};
export function applyDeviceColors(root: HTMLElement): void {
  for (const [kind, color] of Object.entries(DEVICE_COLORS)) root.style.setProperty(`--device-identity-${kind}`, color);
}
