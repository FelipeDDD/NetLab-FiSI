import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStore } from './store';
import { sim } from './sim';
import { ServerDevice, IpDevice } from './engine/ipdevice';
import { createDevice } from './engine/factory';
import { parseCidr, parseIp } from './engine/ip';
import { disposeNetwork } from './engine/networkLifecycle';
import { Shell } from './commands/shell';
import { SERVER_PRESETS, isServerPreset } from './serverPresets';
vi.mock('./terminals',()=>({disposeAllSessions:vi.fn(),disposeSession:vi.fn(),getSession:vi.fn(),refreshSessionProfile:vi.fn()}));
beforeEach(()=>{vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}});useStore.getState().importJson(JSON.stringify({app:'netsim',version:1,devices:[],links:[]}));});
afterEach(()=>{useStore.getState().flushAutosave();disposeNetwork(sim.net);vi.unstubAllGlobals();});
function add(preset?:typeof SERVER_PRESETS[number]){useStore.getState().addDeviceAt('server',{x:100,y:100},preset);return [...sim.net.devices.values()].at(-1) as ServerDevice;}
function run(d:IpDevice,line:string){let out='';let done=false;new Shell(d).exec(line,{write:s=>{out+=s;}},()=>{done=true;});sim.net.scheduler.advanceTo(sim.net.now+60000);expect(done).toBe(true);return out;}
const ip=(s:string)=>parseIp(s)!;
it('creates, deletes and restores modem identities/connections with history and JSON',()=>{
 const view=useStore.getState();view.addDeviceAt('modem',{x:100,y:200});const modem=[...sim.net.devices.values()].at(-1)!;const doc=view.captureWorkspaceDocument();view.undoTopology();expect(sim.net.devices.has(modem.id)).toBe(false);view.redoTopology();expect(view.captureWorkspaceDocument()).toEqual(doc);view.deleteDevice(modem.id);expect(sim.net.devices.has(modem.id)).toBe(false);view.undoTopology();expect(view.captureWorkspaceDocument()).toEqual(doc);view.importJson(JSON.stringify(doc.topology));expect(view.captureWorkspaceDocument()).toEqual(doc);
});
function client(server:ServerDevice){const pc=createDevice(sim.net,'host') as IpDevice;sim.net.connect(pc.id,server.id);server.interfaces[0].ip=parseCidr('192.168.44.2/24');pc.interfaces[0].ip=parseCidr('192.168.44.10/24');return pc;}
it('preserves generic Server, creates no addresses/pools and assigns distinct names without new device kinds',()=>{
 const generic=add();expect(generic.httpServer).toBeNull();expect(generic.dnsServer).toBeNull();
 const names=new Set<string>();for(const preset of SERVER_PRESETS)for(let i=0;i<3;i++){const d=add(preset);expect(d).toBeInstanceOf(ServerDevice);expect(d.kind).toBe('server');expect(d.interfaces.every(i=>!i.ip&&i.gateway===null)).toBe(true);expect(d.dhcpPools.size).toBe(0);expect(d.dhcpServiceEnabled).toBe(false);expect(names.has(d.name)).toBe(false);names.add(d.name);if(preset==='web')expect(d.httpServer?.enabled).toBe(true);if(preset==='dns')expect(d.dnsServer?.records.size).toBe(0);}
 expect(isServerPreset('router')).toBe(false);
});
it('serves HTTP through the simulated link after normal IPv4 configuration',()=>{
 const server=add('web');expect(server.interfaces[0].ip).toBeNull();const pc=client(server);expect(run(pc,'curl http://192.168.44.2/')).toContain(`Hello from ${server.name}`);
 expect(pc.arpTable.size).toBeGreaterThan(0);
});
it('combines independent HTTP, DNS and DHCP on a generic Server, preserving configuration and history',()=>{
 const server=add(),pc=client(server),view=useStore.getState();
 expect(server.httpServer).toBeNull();expect(server.dnsServer).toBeNull();expect(server.dhcpPools.size).toBe(0);
 view.toggleHttpServer(server.id);view.toggleDnsServer(server.id);
 expect(view.setDnsRecords(server.id,'192.168.44.2 web.test')).toBeNull();
 expect(view.setDhcpPool(server.id,'eth0',{enabled:true,rangeStart:ip('192.168.44.100'),rangeEnd:ip('192.168.44.110'),router:ip('192.168.44.2'),dns:ip('192.168.44.2')})).toBeNull();
 const document=view.captureWorkspaceDocument();view.undoTopology();expect(server.dhcpServiceEnabled).toBe(false);view.redoTopology();expect(server.dhcpServiceEnabled).toBe(true);
 pc.interfaces[0].ip=null;expect(run(pc,'dhclient eth0')).toContain('bound to 192.168.44.100');
 expect(run(pc,'dig web.test')).toContain('192.168.44.2');expect(run(pc,'curl http://192.168.44.2/')).toContain('Hello');
 view.toggleHttpServer(server.id);expect(server.httpServer?.enabled).toBe(false);expect(server.dnsServer?.enabled).toBe(true);expect(server.dhcpServiceEnabled).toBe(true);
 const other=add();expect(other.httpServer).toBeNull();expect(other.dnsServer).toBeNull();expect(other.dhcpServiceEnabled).toBe(false);
 view.importJson(JSON.stringify(document.topology));const restored=sim.net.devices.get(server.id) as ServerDevice;
 expect(restored.httpServer?.enabled).toBe(true);expect(restored.dnsServer?.records.get('web.test')).toBe(ip('192.168.44.2'));expect(restored.dhcpServiceEnabled).toBe(true);
});
it('resolves only configured DNS A records through the simulated link',()=>{
 const server=add('dns'),pc=client(server);pc.nameserver=ip('192.168.44.2');expect(server.dnsServer!.records.size).toBe(0);
 expect(useStore.getState().setDnsRecords(server.id,'192.168.44.80 web.test')).toBeNull();expect(run(pc,'dig web.test')).toContain('192.168.44.80');
});
it('does not offer DHCP before configuration and leases address, gateway and DNS from a validated interface pool',()=>{
 const server=add('dhcp'),pc=client(server);pc.interfaces[0].ip=null;
 expect(run(pc,'dhclient eth0')).toContain('No DHCPOFFERS');expect(server.dhcpServiceEnabled).toBe(false);
 expect(useStore.getState().setDhcpPool(server.id,'eth0',{enabled:true,rangeStart:ip('10.9.0.10'),rangeEnd:ip('10.9.0.20'),router:null,dns:null})).not.toBeNull();
 expect(server.dhcpServiceEnabled).toBe(false);
 expect(useStore.getState().setDhcpPool(server.id,'eth0',{enabled:true,rangeStart:ip('192.168.44.100'),rangeEnd:ip('192.168.44.110'),router:ip('192.168.44.1'),dns:ip('192.168.44.2')})).toBeNull();
 expect(run(pc,'dhclient eth0')).toContain('bound to 192.168.44.100');expect(pc.nameserver).toBe(ip('192.168.44.2'));expect(pc.lookupRoute(ip('8.8.8.8'))?.via).toBe(ip('192.168.44.1'));
});
it.each(SERVER_PRESETS)('captures %s in one creation operation, with Undo/Redo and old v1 JSON round-trip',preset=>{
 const server=add(preset),id=server.id;const before=useStore.getState().captureWorkspaceDocument();useStore.getState().undoTopology();expect(sim.net.devices.has(id)).toBe(false);useStore.getState().redoTopology();
 expect(useStore.getState().captureWorkspaceDocument()).toEqual(before);useStore.getState().importJson(JSON.stringify(before.topology));expect(useStore.getState().captureWorkspaceDocument()).toEqual(before);
 expect(sim.net.devices.get(id)).toBeInstanceOf(ServerDevice);
});
it('records Relay and remote pools in ordinary workspace history and JSON without changing other services',()=>{
 const server=add();useStore.getState().addDeviceAt('router',{x:300,y:100});const router=[...sim.net.devices.values()].at(-1) as IpDevice,view=useStore.getState();
 expect(view.setDhcpRelay(router.id,'eth0',{enabled:true,server:ip('192.168.20.10')})).toBe(true);const configured=view.captureWorkspaceDocument();view.undoTopology();expect(router.dhcpRelays.size).toBe(0);view.redoTopology();expect(view.captureWorkspaceDocument()).toEqual(configured);
 expect(view.setRemoteDhcpPool(server.id,'lan10',{enabled:true,network:ip('192.168.10.0'),prefix:24,rangeStart:ip('192.168.10.100'),rangeEnd:ip('192.168.10.150'),router:ip('192.168.10.1'),dns:ip('192.168.20.10')})).toBe(true);
 const document=view.captureWorkspaceDocument();view.undoTopology();expect(server.dhcpRemotePools.size).toBe(0);view.redoTopology();expect(view.captureWorkspaceDocument()).toEqual(document);view.importJson(JSON.stringify(document.topology));expect(view.captureWorkspaceDocument()).toEqual(document);
});
