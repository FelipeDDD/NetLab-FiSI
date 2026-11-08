import { capturePrintSnapshot, type PrintDevice, type PrintSnapshot } from './model';
import { staticRoutingDocument } from '../../tutorials/staticRoutingChapter';
import { alternativePathsDocument } from '../../tutorials/alternativePathsChapter';
import { restoreNetwork } from '../../engine/serialize';

/** Export-only fixtures: coordinates deliberately include cramped canvas spacing. */
export function geometryFixture(scene = 'four-routers'): PrintSnapshot {
  if (scene === 'chapter4' || scene === 'chapter5') {
    const doc = scene === 'chapter4' ? staticRoutingDocument() : alternativePathsDocument();
    return capturePrintSnapshot(restoreNetwork(doc.topology), { nodes: doc.topology.devices.map(d => ({ id: d.id, position: { x: d.x, y: d.y }, data: { kind: d.kind } })) }, '2026-11-06T12:00:00.000Z');
  }
  const devices: PrintDevice[] = [], links: PrintSnapshot['links'] = [];
  const add = (id: string, x: number, y: number, kind: PrintDevice['kind'] = 'router', name = id) => {
    devices.push({ id, name, kind, x, y, interfaces: [], routes: [], ipCapable: kind !== 'switch', ripEnabled: false, services: [], firewall: null });
  };
  const connect = (a: string, b: string) => {
    const from = devices.find(d => d.id === a)!, to = devices.find(d => d.id === b)!;
    const ai = `eth${from.interfaces.length}`, bi = `eth${to.interfaces.length}`;
    const address = (n: number) => `192.168.${links.length + 10}.${n}`;
    from.interfaces.push({ name: ai, address: from.kind === 'switch' ? null : address(1), prefix: 24, gateway: null, mode: 'static', up: true, operational: true, peer: { deviceId: b, iface: bi } });
    to.interfaces.push({ name: bi, address: to.kind === 'switch' ? null : address(2), prefix: 24, gateway: null, mode: 'static', up: true, operational: true, peer: { deviceId: a, iface: ai } });
    links.push({ id: `${a}-${b}`, a: [a, ai], b: [b, bi], medium: 'ethernet', color: '#256080' });
  };
  if (scene === 'four-routers') {
    for (const [i, id] of ['A', 'B', 'C'].entries()) {
      add(id, i * 190, 350); add(`SW-${id}`, i * 190, 170, 'switch'); add(`PC-${id}`, i * 190, 0, 'host');
    }
    add('D', 190, 600, 'router', 'Zentralrouter D');
    for (const id of ['A', 'B', 'C']) { connect(`PC-${id}`, `SW-${id}`); connect(`SW-${id}`, id); connect(id, 'D'); }
  } else if (scene === 'triangle') {
    add('A', 0, 0); add('B', 420, 0); add('C', 210, 330); connect('A', 'B'); connect('B', 'C'); connect('C', 'A');
  } else if (scene === 'long-names') {
    add('A', 0, 0, 'router', 'Zentralrouter Universität / Distribution Gebäude Nord mit sehr langem Namen');
    for (let i = 0; i < 6; i++) { add(`PC-${i}`, (i % 3 - 1) * 340, (i < 3 ? -1 : 1) * 360, 'host', `Computer-${i}-unbroken-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`); connect('A', `PC-${i}`); }
    devices[0].interfaces[0].name = 'ethernet-interface-with-a-very-long-name'; links[0].a[1] = devices[0].interfaces[0].name;
    devices[0].interfaces[0].gateway = '192.168.254.254';
  } else if (scene === 'obstacle') {
    add('A', 0, 0); add('B', 340, 0); add('C', 680, 0); connect('A', 'C');
  } else {
    const vertical = scene === 'vertical', close = scene === 'close', coincident = scene === 'coincident';
    for (let i = 0; i < 3; i++) add(['A', 'B', 'C'][i], vertical || coincident ? 0 : i * (close ? 25 : 300), coincident ? 0 : vertical ? i * 180 : close ? i * 12 : 0,
      scene === 'small-horizontal' ? (['host', 'switch', 'router'] as const)[i] : 'router');
    connect('A', 'B'); connect('B', 'C');
  }
  return { capturedAt: '2026-11-06T12:00:00.000Z', devices, links, areas: [] };
}

export const geometryScenes = ['four-routers', 'chapter4', 'chapter5', 'line', 'triangle', 'small-horizontal', 'vertical', 'close', 'coincident', 'long-names', 'obstacle'];
