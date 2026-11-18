import type { Network } from '../engine/network';
import { IpDevice, type SocketControl } from '../engine/ipdevice';
import { ipToString } from '../engine/ip';
import type { Check } from './types';

type NatHttpCheck = Extract<Check, { type: 'nat-http' }>;

export function checkNatHttp(
  net: Network,
  check: NatHttpCheck,
  find: (reference: string) => IpDevice | null,
  done: (pass: boolean, detail: string) => void,
  isActive: () => boolean,
): void {
  const router = find(check.router), server = find(check.toDevice);
  const wan = router?.getInterface(check.outIface);
  const external = server?.interfaces.find(iface => iface.up && iface.ip)?.ip?.addr;
  const web = server?.httpServer;
  if (!router || !router.forwarding || !wan?.up || !wan.link?.operational || !wan.ip ||
      !server || external === undefined || !web?.enabled || !web.body.includes(check.contains)) {
    return done(false, 'Confira o enlace externo, o encaminhamento e o serviço HTTP.');
  }
  if (router.lookupRoute(external)?.ifaceName !== wan.name) {
    return done(false, 'Confira a interface de saída do Router para o servidor.');
  }

  const clients = [check.from, ...(check.peer ? [check.peer] : [])].map(find);
  const addresses = clients.map(client => {
    const route = client?.lookupRoute(external);
    return route ? client?.getInterface(route.ifaceName)?.ip?.addr : undefined;
  });
  if (clients.some(client => !client) || addresses.some(addr => addr === undefined) ||
      new Set(addresses).size !== clients.length || addresses.includes(wan.ip.addr)) {
    return done(false, 'Confira os endereços e gateways dos PCs.');
  }
  if (check.expect === 'untranslated' && server.lookupRoute(addresses[0]!)) {
    return done(false, 'O servidor externo deve continuar sem rota para a LAN.');
  }

  const wanAddress = wan.ip.addr;
  const oldEntries = new Set(router.ct.list(net.now));
  const translatedPorts = new Set<number>();
  let remaining = clients.length;
  let failure: string | undefined;
  const complete = (error?: string) => {
    failure ??= error;
    if (--remaining === 0) done(!failure, failure ??
      (check.expect === 'untranslated' ? 'A origem privada saiu sem tradução e não recebeu resposta.' :
        clients.length === 2 ? 'Os dois PCs receberam HTTP usando portas externas distintas.' :
          'PC recebeu HTTP após a tradução de origem.'));
  };
  // Issue both requests on this scheduler tick. Each callback belongs to its own socket.
  clients.forEach((client, i) => {
    const control: SocketControl = {};
    const error = client!.httpGet(external, web.port, '/', ipToString(external), 4000, result => {
      if (!isActive()) return;
      const entry = router.ct.list(net.now).find(({ orig }) =>
        orig.proto === 'tcp' && orig.srcIp === addresses[i] && orig.srcPort === control.localPort &&
        orig.dstIp === external && orig.dstPort === web.port);
      if (!entry || oldEntries.has(entry) || entry.trans.dstIp !== external || entry.trans.dstPort !== web.port) {
        return complete('O Router não registrou uma nova conexão para o servidor.');
      }
      if (check.expect === 'untranslated') {
        return complete(!result.ok && result.error === 'timeout' &&
          entry.trans.srcIp === entry.orig.srcIp && entry.trans.srcPort === entry.orig.srcPort
          ? undefined : 'Era esperado que o PC saísse com a origem privada e ficasse sem resposta.');
      }
      if (entry.trans.srcIp !== wanAddress || entry.state !== 'established' ||
          !result.ok || result.status !== 200 || !result.body.includes(check.contains)) {
        return complete('Confira se o PC recebeu a página pela conexão traduzida.');
      }
      if (translatedPorts.has(entry.trans.srcPort)) return complete('As conexões precisam de portas externas distintas.');
      translatedPorts.add(entry.trans.srcPort);
      complete();
    }, undefined, control);
    if (error) complete(error);
  });
}
