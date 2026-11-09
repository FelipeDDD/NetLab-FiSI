import { expect, it } from 'vitest';
import { Network } from '../engine/network';
import { createDevice } from '../engine/factory';
import { disposeNetwork } from '../engine/networkLifecycle';
import { captureCreation } from '../topologyEdits';
import { emptyTopologyHistory, recordOperation } from '../topologyHistory';
import { canNameLanC } from './lanCPresentation';

function fixture() {
  const net = new Network(), pc = createDevice(net, 'host');
  const binding = { id: pc.id, mac: pc.interfaces[0].mac };
  const history = recordOperation(emptyTopologyHistory(), { type: 'create-device', label: 'Create PC', device: captureCreation(net, pc, { x: 1, y: 2 }, 0) });
  return { net, pc, binding, history };
}
it('recognizes a generated name by creation ID/MAC without mutating the device', () => {
  const f = fixture(); try {
    expect(f.pc.name).toBe('pc1'); expect(canNameLanC(f.net, f.history, f.binding)).toBe(true); expect(f.pc.name).toBe('pc1');
    expect(canNameLanC(f.net, f.history, { ...f.binding, mac: '00:00:00:00:00:00' })).toBe(false);
    expect(canNameLanC(f.net, f.history, { ...f.binding, id: 'another' })).toBe(false);
  } finally { disposeNetwork(f.net); }
});
it.each(['PC C', 'pc c', ' PC C '])('avoids an existing name collision with %s', name => {
  const f=fixture();try{createDevice(f.net,'router',{name});expect(canNameLanC(f.net,f.history,f.binding)).toBe(false);expect(f.pc.name).toBe('pc1');}finally{disposeNetwork(f.net);}
});
it.each(['Cliente', 'pc42'])('preserves a custom name %s, including one that resembles a generated name', name => {
  const f=fixture();try{f.pc.name=name;const history=recordOperation(f.history,{type:'rename-device',label:'Rename',deviceId:f.pc.id,before:'pc1',after:name});expect(canNameLanC(f.net,history,f.binding)).toBe(false);}finally{disposeNetwork(f.net);}
});
it('does not guess provenance after F5 or override an undone manual rename', () => {
  const f=fixture();try{
    expect(canNameLanC(f.net,emptyTopologyHistory(),f.binding)).toBe(false);
    const renamed=recordOperation(f.history,{type:'rename-device',label:'Rename',deviceId:f.pc.id,before:'pc1',after:'Custom'});
    expect(canNameLanC(f.net,{past:f.history.past,future:[renamed.past.at(-1)!]},f.binding)).toBe(false);
  }finally{disposeNetwork(f.net);}
});
