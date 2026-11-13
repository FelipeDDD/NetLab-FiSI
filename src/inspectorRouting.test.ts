import { expect, it } from 'vitest';
import { Network } from './engine/network';
import { consumeInspectorRoutingRequest, inspectorRoutingView, observeInspectorRoutingRequest, observeInspectorRoutingView, requestInspectorRouting, showInspectorRouting } from './inspectorRouting';

it('delivers one transient request only to the selected device in the same Network', () => {
  const network = new Network(), other = new Network(); let calls = 0;
  const release = observeInspectorRoutingRequest(() => calls++);
  requestInspectorRouting(network, 'r1'); expect(calls).toBe(1);
  expect(consumeInspectorRoutingRequest(other, 'r1')).toBe(false);
  expect(consumeInspectorRoutingRequest(network, 'r2')).toBe(false);
  expect(consumeInspectorRoutingRequest(network, 'r1')).toBe(true);
  expect(consumeInspectorRoutingRequest(network, 'r1')).toBe(false); release();
  expect(network.devices.size).toBe(0); expect(other.devices.size).toBe(0);
});
it('reports real visibility and prevents an older unmount from clearing a newer table', () => {
  const network = new Network(); let calls = 0;
  const release = observeInspectorRoutingView(() => calls++);
  const first = showInspectorRouting({ network, deviceId: 'r1' });
  const second = showInspectorRouting({ network, deviceId: 'r2' }); first();
  expect(inspectorRoutingView()?.deviceId).toBe('r2'); second();
  expect(inspectorRoutingView()).toBeNull(); expect(calls).toBe(3); release();
});
