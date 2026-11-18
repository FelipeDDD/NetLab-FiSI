import { ServerDevice } from './engine/ipdevice';
import type { Network } from './engine/network';

export const SERVER_PRESETS = ['web', 'dns', 'dhcp'] as const;
export type ServerPreset = typeof SERVER_PRESETS[number];
export const isServerPreset = (value: unknown): value is ServerPreset => SERVER_PRESETS.some(p => p === value);
/** Creation settings only. All resulting data already belongs to Server v1. */
export function applyServerPreset(device: ServerDevice, preset: ServerPreset, label: string) {
 const used=new Set([...device.network.devices.values()].filter(d=>d!==device).map(d=>d.name));
 let n=1;while(used.has(`${label} ${n}`))n++;
 device.name=`${label} ${n}`;
 if(preset==='web')device.httpServer={enabled:true,port:80,body:`<html><body><h1>Hello from ${device.name}</h1></body></html>`};
 if(preset==='dns')device.dnsServer={enabled:true,records:new Map()};
 // DHCP deliberately has no pool until the student configures an interface.
}
let request:{network:Network;id:string}|null=null;
const listeners=new Set<()=>void>();
export function requestServerServices(network:Network,id:string){request={network,id};listeners.forEach(fn=>fn());}
export function observeServerServices(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function consumeServerServices(network:Network,id:string){if(request?.network!==network||request.id!==id)return false;request=null;return true;}
