import type { Network } from './engine/network';

/** Transient navigation/view signals. Never part of a topology or saved session. */
export interface InspectorRoutingLocation { network: Network; deviceId: string }
let request: InspectorRoutingLocation | null = null;
let view: InspectorRoutingLocation | null = null;
const requests = new Set<() => void>(), views = new Set<() => void>();
export function consumeInspectorRoutingRequest(network: Network, deviceId: string) {
  if (request?.network !== network || request.deviceId !== deviceId) return false;
  request = null; return true;
}
export const inspectorRoutingView = () => view;
export function requestInspectorRouting(network: Network, deviceId: string) {
  request = { network, deviceId }; requests.forEach(fn => fn());
}
export function observeInspectorRoutingRequest(fn: () => void) { requests.add(fn); return () => { requests.delete(fn); }; }
export function observeInspectorRoutingView(fn: () => void) { views.add(fn); return () => { views.delete(fn); }; }
export function showInspectorRouting(location: InspectorRoutingLocation) {
  view = location; views.forEach(fn => fn());
  return () => { if (view === location) { view = null; views.forEach(fn => fn()); } };
}
