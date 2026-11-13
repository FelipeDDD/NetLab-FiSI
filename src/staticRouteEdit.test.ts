import { afterEach, expect, it, vi } from 'vitest';
import { useStore } from './store';
import { sim } from './sim';
import { IpDevice } from './engine/ipdevice';
import { disposeNetwork } from './engine/networkLifecycle';
import { Shell } from './commands/shell';
import { planStaticRouteEdit, routeEditSignature } from './staticRouteEdit';
import { lpmDocument, LPM_IDS as I, lpmConditions } from './tutorials/lpmChapter';
vi.mock('./terminals',()=>({disposeAllSessions:vi.fn(),disposeSession:vi.fn(),getSession:vi.fn(),refreshSessionProfile:vi.fn()}));
afterEach(()=>{useStore.getState().flushAutosave();disposeNetwork(sim.net);vi.unstubAllGlobals();});
function fixture(){vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});useStore.getState().importJson(JSON.stringify(lpmDocument().topology));const d=sim.net.devices.get(I.r1) as IpDevice;return {d,edit:(original:typeof d.staticRoutes[number]|null,input:Parameters<typeof planStaticRouteEdit>[3],signature=routeEditSignature(d))=>useStore.getState().editStaticRoute(d.id,signature,original,input)};}
it('uses the engine array, CLI output, persistent document and Undo/Redo for real LPM decisions',()=>{
 const {d,edit}=fixture();const original=structuredClone(d.staticRoutes[1]);expect(edit(original,null)).toBeNull();expect(lpmConditions(sim.net).short).toBe(true);
 useStore.getState().undoTopology();expect(lpmConditions(sim.net).initial).toBe(true);useStore.getState().redoTopology();expect(lpmConditions(sim.net).short).toBe(true);
 expect(edit(null,{destination:'192.168.80.130/32',gateway:'10.6.12.2',iface:''})).toBeNull();expect(lpmConditions(sim.net).long).toBe(true);
 let text='';new Shell(d).exec('ip route show',{write:s=>{text+=s;}},()=>{});expect(text).toContain('192.168.80.130/32');
 const doc=useStore.getState().captureWorkspaceDocument();useStore.getState().importJson(JSON.stringify(doc.topology));expect(lpmConditions(sim.net).long).toBe(true);
});
it('changes the destination atomically, retains its position and refuses duplicates without deleting the old route',()=>{
 const {d,edit}=fixture();const before=structuredClone(d.staticRoutes),original=before[0];
 expect(edit(original,{destination:'192.168.80.128/25',gateway:'10.6.12.2',iface:'eth2'})).toBe('duplicate');expect(d.staticRoutes).toEqual(before);
 expect(edit(original,{destination:'192.168.90.0/24',gateway:'10.6.12.2',iface:'eth2'})).toBeNull();expect(d.staticRoutes[0].dest).not.toBe(original.dest);expect(d.staticRoutes[1]).toEqual(before[1]);
});
it.each([
 ['192.168.80.999/24','10.6.12.2','','cidr'],['192.168.80.0/33','10.6.12.2','','cidr'],['192.168.80.130/25','10.6.12.2','','hostBits'],['192.168.90.0/24','bad','','gateway'],['192.168.90.0/24','203.0.113.1','','gateway'],['192.168.90.0/24','10.6.12.2','eth99','iface'],['192.168.90.0/24','','','required']
])('refuses malformed or unsupported configuration %s', (destination,gateway,iface,error)=>{const {d,edit}=fixture(),before=structuredClone(d.staticRoutes);expect(edit(null,{destination,gateway,iface})).toBe(error);expect(d.staticRoutes).toEqual(before);});
it('protects stale edits, missing/non-static rows, legacy duplicates and replaced device instances',()=>{
 const {d,edit}=fixture();const signature=routeEditSignature(d),original=structuredClone(d.staticRoutes[0]);d.staticRoutes[0].via=1;expect(edit(original,null,signature)).toBe('stale');
 expect(edit(original,null)).toBe('missing');expect(edit(d.routes().find(r=>r.kind==='connected')!,null)).toBe('missing');
 d.staticRoutes.push(structuredClone(d.staticRoutes[0]));expect(edit(d.staticRoutes[0],null)).toBe('ambiguous');
 const old=routeEditSignature(d),doc=useStore.getState().captureWorkspaceDocument();useStore.getState().importJson(JSON.stringify(doc.topology));expect(useStore.getState().editStaticRoute(d.id,old,null,{destination:'0.0.0.0/0',gateway:'10.6.12.2',iface:''})).toBe('stale');
});
it('does not mutate live data while planning and supports default without editing interface gateways',()=>{
 const {d,edit}=fixture(),before=structuredClone(d.staticRoutes);expect(planStaticRouteEdit(d,routeEditSignature(d),null,{destination:'default',gateway:'10.6.12.2',iface:''})).toHaveProperty('routes');expect(d.staticRoutes).toEqual(before);
 expect(edit(null,{destination:'default',gateway:'10.6.12.2',iface:''})).toBeNull();const def=d.staticRoutes.at(-1)!;expect(def.prefix).toBe(0);expect(edit(def,{destination:'0.0.0.0/0',gateway:'10.6.15.2',iface:'eth1'})).toBeNull();expect(d.interfaces.every(i=>i.gateway===null)).toBe(true);
});
