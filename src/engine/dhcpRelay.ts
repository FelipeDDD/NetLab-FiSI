import type { IpDevice, DhcpServerConfig } from './ipdevice';
import { networkOf, broadcastOf } from './ip';
import type { DhcpApp, Ipv4Packet } from './types';

export interface RelaySettings { enabled: boolean; server: number }
export interface RemotePoolSettings {
  enabled: boolean; network: number; prefix: number; rangeStart: number; rangeEnd: number;
  router: number | null; dns: number | null;
}
export type RemotePool = RemotePoolSettings & { leases: Map<string, number> };
export const unicastAddress = (n: number) => Number.isInteger(n) && n >= 0x01000000 && n < 0xe0000000 && (n >>> 24) !== 127;
export function validRemotePool(c: RemotePoolSettings): boolean {
  if (!Number.isInteger(c.prefix) || c.prefix < 0 || c.prefix > 30 || !Number.isInteger(c.network) || networkOf(c.network,c.prefix)!==c.network) return false;
  const end=broadcastOf(c.network,c.prefix);
  return unicastAddress(c.rangeStart)&&unicastAddress(c.rangeEnd)&&c.rangeStart<=c.rangeEnd&&c.rangeStart>c.network&&c.rangeEnd<end&&
    (c.router===null||(unicastAddress(c.router)&&c.router>c.network&&c.router<end))&&
    (c.dns===null||unicastAddress(c.dns))&&![c.router,c.dns].some(ip=>ip!==null&&ip>=c.rangeStart&&ip<=c.rangeEnd);
}
export function remotePoolsConflict(d: IpDevice, pool: RemotePoolSettings, id: string): boolean {
  if (!pool.enabled) return false;
  return [...d.dhcpRemotePools].some(([key,c])=>key!==id&&c.enabled&&networkOf(c.network,Math.min(c.prefix,pool.prefix))===networkOf(pool.network,Math.min(c.prefix,pool.prefix))) ||
    d.configuredDhcpPools().some(([,c])=>c.enabled&&pool.rangeStart<=c.rangeEnd&&c.rangeStart<=pool.rangeEnd);
}
type Pending = { iface: string; address: number; server: number; mac: string; until: number; link: unknown };
const pending = new WeakMap<IpDevice, Map<string,Pending>>();
type Offer = { ip:number; xid:number; relay:number; until:number };
const offers = new WeakMap<DhcpServerConfig | RemotePool,Map<string,Offer>>();
const key=(a:DhcpApp)=>`${a.xid}:${a.clientMac}:${a.giaddr??0}`;
/** Called only after INPUT validation. All outgoing packets use ordinary wire paths. */
export function receiveRelayedDhcp(d:IpDevice,pkt:Ipv4Packet,iif?:string):void {
  const udp=pkt.l4;if(udp.kind!=='udp'||udp.dstPort!==67||udp.app?.kind!=='dhcp')return;
  const app=udp.app, giaddr=app.giaddr??0, hops=app.hops??0;
  if(!Number.isInteger(hops)||hops<0||hops>16)return;
  let transactions=pending.get(d);if(!transactions){transactions=new Map();pending.set(d,transactions);}
  for(const [id,t] of transactions)if(t.until<=d.network.now)transactions.delete(id);
  if(app.op==='offer'||app.op==='ack'){
    if(udp.srcPort!==67)return;
    const t=transactions.get(key(app));if(!t||t.server!==pkt.src||app.serverIp!==t.server)return;
    const iface=d.getInterface(t.iface),cfg=d.dhcpRelays.get(t.iface);
    if(!cfg?.enabled||cfg.server!==t.server||!iface?.up||iface.link!==t.link||iface.ip?.addr!==t.address||!iface.link?.operational)return;
    d.sendBroadcastUdp(iface,pkt.src,67,68,app);return;
  }
  if(!['discover','request','release'].includes(app.op))return;
  if(giaddr===0){
    if(d.kind!=='router'||udp.srcPort!==68||!iif||hops>=4)return;
    const cfg=d.dhcpRelays.get(iif),iface=d.getInterface(iif);
    if(!cfg?.enabled||!unicastAddress(cfg.server)||!iface?.up||!iface.ip||!unicastAddress(iface.ip.addr)||iface.ip.addr<=networkOf(iface.ip.addr,iface.ip.prefix)||iface.ip.addr>=broadcastOf(iface.ip.addr,iface.ip.prefix)||!iface.link?.operational||d.hasIp(cfg.server))return;
    const forwarded={...app,giaddr:iface.ip.addr,hops:hops+1};
    if(transactions.size>=512&&!transactions.has(key(forwarded)))return;
    transactions.set(key(forwarded),{iface:iif,address:iface.ip.addr,server:cfg.server,mac:app.clientMac,until:d.network.now+30000,link:iface.link});
    d.sendL4(cfg.server,{kind:'udp',srcPort:67,dstPort:67,app:forwarded},{srcOverride:iface.ip.addr});return;
  }
  // Only the server processes relayed requests. Never re-relay a foreign giaddr.
  if(udp.srcPort!==67||!unicastAddress(giaddr)||!d.dhcpServerEnabled||!d.hasIp(pkt.dst))return;
  const matches=[...d.dhcpRemotePools].filter(([id,c])=>c.enabled&&validRemotePool(c)&&!remotePoolsConflict(d,c,id)&&networkOf(giaddr,c.prefix)===c.network);
  if(matches.length!==1)return;
  const [,cfg]=matches[0];if(giaddr<=cfg.network||giaddr>=broadcastOf(cfg.network,cfg.prefix))return;
  if(app.serverIp!==undefined&&app.serverIp!==pkt.dst)return;
  if(app.op==='release'){if(app.yourIp===cfg.leases.get(app.clientMac))cfg.leases.delete(app.clientMac);return;}
  let reservations=offers.get(cfg);if(!reservations){reservations=new Map();offers.set(cfg,reservations);}
  for(const [mac,o]of reservations)if(o.until<=d.network.now||o.ip<cfg.rangeStart||o.ip>cfg.rangeEnd)reservations.delete(mac);
  const available=(ip:number)=>ip>=cfg.rangeStart&&ip<=cfg.rangeEnd&&!d.hasIp(ip)&&ip!==giaddr&&
    ![...cfg.leases].some(([mac,a])=>mac!==app.clientMac&&a===ip)&&![...reservations!.entries()].some(([mac,o])=>mac!==app.clientMac&&o.ip===ip);
  const send=(op:'offer'|'ack',ip:number)=>d.sendL4(giaddr,{kind:'udp',srcPort:67,dstPort:67,app:{...app,op,yourIp:ip,prefix:cfg.prefix,router:cfg.router,dns:cfg.dns,serverIp:pkt.dst}},{srcOverride:pkt.dst});
  if(app.op==='discover'){
    let ip=cfg.leases.get(app.clientMac)??reservations.get(app.clientMac)?.ip;
    if(ip===undefined||!available(ip)){ip=cfg.rangeStart;while(ip<=cfg.rangeEnd&&!available(ip))ip++;}
    if(ip>cfg.rangeEnd)return;
    reservations.set(app.clientMac,{ip,xid:app.xid,relay:giaddr,until:d.network.now+30000});send('offer',ip);
  }else if(app.op==='request'&&app.yourIp!==undefined){
    const offer=reservations.get(app.clientMac);
    if(!offer||offer.xid!==app.xid||offer.relay!==giaddr||offer.ip!==app.yourIp||!available(offer.ip))return;
    cfg.leases.set(app.clientMac,offer.ip);reservations.delete(app.clientMac);send('ack',offer.ip);
  }
}
