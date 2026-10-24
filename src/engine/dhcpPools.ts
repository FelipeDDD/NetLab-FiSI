import type { IpDevice, DhcpServerConfig } from './ipdevice';
import type { NetInterface } from './device';
import { broadcastOf, networkOf } from './ip';
export type PoolSettings = Omit<DhcpServerConfig, 'leases'>;
export type DhcpConfiguration = { legacy: PoolSettings | null; pools: Record<string, PoolSettings> };
export const poolSettings = (c: DhcpServerConfig): PoolSettings => ({enabled:c.enabled,rangeStart:c.rangeStart,rangeEnd:c.rangeEnd,router:c.router,dns:c.dns,...(c.interfaceName ? {interfaceName:c.interfaceName} : {})});
export const poolFits = (i: NetInterface, c: PoolSettings) => !!i.ip && networkOf(c.rangeStart,i.ip.prefix) === networkOf(i.ip.addr,i.ip.prefix) && networkOf(c.rangeEnd,i.ip.prefix) === networkOf(i.ip.addr,i.ip.prefix);
export function legacyPoolInterface(d: IpDevice): string | null {
  const c=d.dhcpServer; if (!c) return null;
  if (c.interfaceName) return d.getInterface(c.interfaceName) ? c.interfaceName : null;
  const matches=d.interfaces.filter(i=>poolFits(i,c));
  return matches.length===1 ? matches[0].name : null;
}
export function dhcpConfiguration(d: IpDevice): DhcpConfiguration {
  return {legacy:d.dhcpServer ? poolSettings(d.dhcpServer) : null,pools:Object.fromEntries([...d.dhcpPools].map(([n,c])=>[n,poolSettings(c)]))};
}
export function applyDhcpConfiguration(d: IpDevice, next: DhcpConfiguration): void {
  const update=(old:DhcpServerConfig|undefined|null,c:PoolSettings) => {
    const target=old ?? {...c,leases:new Map<string,number>()};
    delete target.interfaceName; Object.assign(target,c); return target;
  };
  d.dhcpServer=next.legacy ? update(d.dhcpServer,next.legacy) : null;
  for(const name of d.dhcpPools.keys()) if(!next.pools[name]) d.dhcpPools.delete(name);
  for(const [name,c] of Object.entries(next.pools)) d.dhcpPools.set(name,update(d.dhcpPools.get(name),c));
}
export function validateDhcpPool(d:IpDevice,name:string,c:PoolSettings,others: [string,PoolSettings][]=d.configuredDhcpPools()):string|null {
  const iface=d.getInterface(name);
  if(!iface?.ip) return 'Zuerst eine gültige IPv4-Adresse für diese Schnittstelle konfigurieren.';
  const {addr,prefix}=iface.ip, network=networkOf(addr,prefix), broadcast=broadcastOf(addr,prefix);
  const unicast=(ip:number) => Number.isInteger(ip) && ip>=0x01000000 && ip<0xe0000000 && (ip>>>24)!==127;
  if(prefix>30 || addr<=network || addr>=broadcast) return 'Das Subnetz bietet keinen gültigen DHCP-Adressbereich.';
  if(!unicast(c.rangeStart)||!unicast(c.rangeEnd)||c.rangeStart>c.rangeEnd) return 'Ungültiger Pool: Start muss vor Ende liegen.';
  if(!poolFits(iface,c)||c.rangeStart<=network||c.rangeEnd>=broadcast) return 'Der Pool muss im Hostbereich des IPv4-Subnetzes liegen.';
  if(d.interfaces.some(i=>i.ip && i.ip.addr>=c.rangeStart && i.ip.addr<=c.rangeEnd)) return 'Der Pool enthält eine eigene Schnittstellenadresse.';
  if(c.router!==null && (!unicast(c.router)||c.router<=network||c.router>=broadcast)) return 'Das Gateway muss eine Hostadresse im selben Subnetz sein.';
  if(c.dns!==null && !unicast(c.dns)) return 'Ungültige DNS-Adresse.';
  if([c.router,c.dns].some(ip=>ip!==null && ip>=c.rangeStart && ip<=c.rangeEnd)) return 'Gateway und DNS dürfen nicht im dynamischen Pool liegen.';
  if(c.enabled) for(const [other,pool] of others) {
    if(other===name||!pool.enabled) continue;
    const oi=d.getInterface(other);
    const overlap=c.rangeStart<=pool.rangeEnd && pool.rangeStart<=c.rangeEnd;
    const sharedSubnet=oi?.ip && networkOf(addr,Math.min(prefix,oi.ip.prefix))===networkOf(oi.ip.addr,Math.min(prefix,oi.ip.prefix));
    if(overlap||sharedSubnet) return `Konflikt mit ${other}: aktive DHCP-Pools müssen getrennte Subnetze verwenden.`;
  }
  return null;
}
export function defaultDhcpPool(iface:NetInterface):PoolSettings {
  const ip=iface.ip;
  const base=ip ? networkOf(ip.addr,ip.prefix) : 0;
  const end=ip ? broadcastOf(ip.addr,ip.prefix)-1 : 0;
  let start=Math.min(Math.max(base+100,ip ? Math.floor(ip.addr/256)*256+100 : 0),end),finish=Math.min(start+50,end);
  if(ip && start<=ip.addr && ip.addr<=finish) {
    if(ip.addr>base+1){start=base+1;finish=ip.addr-1;}else {start=ip.addr+1;finish=end;}
  }
  return {enabled:false,rangeStart:start,rangeEnd:finish,router:ip?.addr??null,dns:null};
}
