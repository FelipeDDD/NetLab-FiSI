import type { Network } from './engine/network';
import type { SavedDevice } from './engine/serialize';
import { serializeNetwork } from './engine/serialize';
import type { CreatedDevice, HistoryLink, Point } from './topologyHistory';
import { captureLink } from './topologyEdits';
import { placementBox, type PlacementBox } from './devicePlacement';
import type { VisualNode } from './deviceArtwork';
import type { CableAppearances } from './cableAppearance';

export interface DeviceClipboard {
  devices: SavedDevice[]; links: HistoryLink[]; boxes: PlacementBox[];
  colors: Record<string, string>; cableColors: CableAppearances;
}
export function captureDeviceClipboard(net: Network, nodes: VisualNode[], selected: string[], colors: Record<string,string>, cableColors: CableAppearances): DeviceClipboard | null {
  const ids = new Set(selected.filter(id => net.devices.has(id))), positions = Object.fromEntries(nodes.map(n=>[n.id,n.position]));
  if (!ids.size) return null;
  const devices = serializeNetwork(net, positions).devices.filter(d=>ids.has(d.id));
  const links = [...net.links.values()].filter(l=>ids.has(l.a.device.id)&&ids.has(l.b.device.id)).map(captureLink);
  return structuredClone({ devices, links, boxes: nodes.filter(n=>ids.has(n.id)).map(placementBox),
    colors: Object.fromEntries(Object.entries(colors).filter(([id])=>ids.has(id))),
    cableColors: Object.fromEntries(Object.entries(cableColors).filter(([id])=>links.some(l=>l.id===id))) });
}
/** Fresh identities, configuration only; no IP ownership, caches, sessions or grading metadata. */
export function prepareDevicePaste(net: Network, source: DeviceClipboard, offset: Point, index: number) {
  const sourceIds = new Set([...source.devices.map(d=>d.id),...source.links.map(l=>l.id)]);
  const nextId = (prefix: string) => { let id: string; do { id=net.allocId(prefix); } while(sourceIds.has(id)); return id; };
  const idMap = new Map(source.devices.map(d=>[d.id,nextId('dev-')]));
  const usedNames = new Set([...net.devices.values()].map(d=>d.name));
  const usedMacs = new Set([...net.devices.values()].flatMap(d=>d.interfaces.map(i=>i.mac.toLowerCase())));
  for(const d of source.devices) for(const i of d.ifaces) if(i.mac) usedMacs.add(i.mac.toLowerCase());
  const nextMac = () => { let mac: string; do { mac=net.nextMac(); } while(usedMacs.has(mac.toLowerCase())); usedMacs.add(mac.toLowerCase()); return mac; };
  const ports = new Map<string,string>();
  for (const l of source.links) if(l.medium==='wireless') ports.set(JSON.stringify(l.b),`wifi-${idMap.get(l.a[0])}`);
  const devices: CreatedDevice[] = source.devices.map((original, i)=>{
    const saved = structuredClone(original), oldId=saved.id;
    saved.id=idMap.get(oldId)!;
    const base=net.allocName(saved.kind), match=/^(.*?)(\d+)$/.exec(base); let name=base, n=Number(match?.[2]??1);
    while(usedNames.has(name)) name=match ? `${match[1]}${++n}` : `${base}-${++n}`;
    usedNames.add(name); saved.name=name; saved.x+=offset.x; saved.y+=offset.y;
    saved.ifaces=saved.ifaces.filter(p=>!(saved.kind==='ap'&&p.medium==='wireless')||ports.has(JSON.stringify([oldId,p.name]))).map(p=>({
      ...p, name:ports.get(JSON.stringify([oldId,p.name]))??p.name, mac:nextMac(), ip:null,
      ...(p.ipv4Mode ? { ipv4Mode:p.ipv4Mode==='dhcp'?'dhcp' as const:'unconfigured' as const, gateway:null, dns:null } : {})
    }));
    saved.routes=[]; delete saved.nameserver; delete saved.ripEnabled;
    if(saved.dhcpServer) saved.dhcpServer.enabled=false;
    if(saved.dhcpPools) for(const pool of Object.values(saved.dhcpPools)) pool.enabled=false;
    if(saved.vlans) saved.vlans=Object.fromEntries(Object.entries(saved.vlans).filter(([p])=>saved.ifaces.some(iface=>iface.name===(ports.get(JSON.stringify([oldId,p]))??p))).map(([p,v])=>[ports.get(JSON.stringify([oldId,p]))??p,v]));
    return {saved,macs:Object.fromEntries(saved.ifaces.map(p=>[p.name,p.mac!])),index:index+i};
  });
  const colors=Object.fromEntries(Object.entries(source.colors).map(([id,c])=>[idMap.get(id)!,c])), cableColors: CableAppearances={};
  const links=source.links.map(old=>{
    const id=nextId(old.medium==='wireless'?'wifi-':'link-');
    const link: HistoryLink={...old,id,a:[idMap.get(old.a[0])!,old.a[1]],b:[idMap.get(old.b[0])!,ports.get(JSON.stringify(old.b))??old.b[1]]};
    if(link.medium==='wireless') link.apMac=devices.find(d=>d.saved.id===link.b[0])!.macs[link.b[1]];
    if(source.cableColors[old.id]) cableColors[id]=structuredClone(source.cableColors[old.id]);
    return link;
  });
  return {devices,links,colors,cableColors};
}
