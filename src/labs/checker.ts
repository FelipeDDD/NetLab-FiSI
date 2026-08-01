// Runs lab objectives against the live simulation. Passive checks read
// engine state; active checks (ping/tcp/dns/http) send real packets and
// wait on the virtual clock, so students watch the grader's traffic.
import type { Network } from '../engine/network';
import { IpDevice } from '../engine/ipdevice';
import { cidrToString, ipToString, networkOf, parseCidr, parseIp, type U32 } from '../engine/ip';
import type { Check, Objective } from './types';

export interface CheckResult {
  id: string;
  pass: boolean;
  detail: string;
}

const PING_TIMEOUT_MS = 3500;
const TCP_TIMEOUT_MS = 3000;
const HTTP_TIMEOUT_MS = 4000;

function findDevice(net: Network, name: string): IpDevice | null {
  for (const d of net.devices.values()) {
    if (d.name === name && d instanceof IpDevice) return d;
  }
  return null;
}

function targetAddr(net: Network, toDevice?: string, toAddr?: string): U32 | null {
  if (toAddr) return parseIp(toAddr);
  if (toDevice) {
    const d = findDevice(net, toDevice);
    const iface = d?.interfaces.find((i) => i.ip);
    return iface?.ip?.addr ?? null;
  }
  return null;
}

function runOne(net: Network, check: Check, done: (pass: boolean, detail: string) => void): void {
  switch (check.type) {
    case 'iface-ip': {
      const d = findDevice(net, check.device);
      const iface = d?.getInterface(check.iface);
      if (!d || !iface) return done(false, `no device/interface ${check.device}/${check.iface}`);
      if (!iface.ip) return done(false, `${check.iface} has no address yet`);
      const got = cidrToString(iface.ip.addr, iface.ip.prefix);
      if (check.cidr) return done(got === check.cidr, `${check.iface} is ${got}`);
      if (check.inSubnet) {
        const net_ = parseCidr(check.inSubnet);
        if (!net_) return done(false, 'bad subnet in lab definition');
        const ok =
          networkOf(iface.ip.addr, net_.prefix) === networkOf(net_.addr, net_.prefix) &&
          iface.ip.prefix === net_.prefix;
        return done(ok, `${check.iface} is ${got}`);
      }
      return done(true, `${check.iface} is ${got}`);
    }
    case 'default-route': {
      const d = findDevice(net, check.device);
      if (!d) return done(false, `no device ${check.device}`);
      const def = d.routes().find((r) => r.prefix === 0);
      if (!def) return done(false, 'no default route');
      if (check.via) {
        const via = parseIp(check.via);
        return done(
          def.via === via,
          `default via ${def.via !== null ? ipToString(def.via) : '(direct)'}`,
        );
      }
      return done(true, 'default route present');
    }
    case 'forwarding': {
      const d = findDevice(net, check.device);
      if (!d) return done(false, `no device ${check.device}`);
      return done(d.forwarding === check.expect, `ip_forward = ${d.forwarding ? 1 : 0}`);
    }
    case 'fw-policy': {
      const d = findDevice(net, check.device);
      if (!d) return done(false, `no device ${check.device}`);
      const chain = d.fw.filter[check.hook];
      if (!chain.declared) return done(false, `${check.hook} chain not declared`);
      return done(chain.policy === check.policy, `${check.hook} policy is ${chain.policy}`);
    }
    case 'ping': {
      const from = findDevice(net, check.from);
      if (!from) return done(false, `no device ${check.from}`);
      const target = targetAddr(net, check.toDevice, check.toAddr);
      if (target === null) return done(false, 'target has no address');
      const wantSuccess = check.expect === 'success';
      const id = from.allocIcmpId();
      let finished = false;
      const finish = (gotReply: boolean, note: string) => {
        if (finished) return;
        finished = true;
        from.offIcmp(id);
        done(gotReply === wantSuccess, note);
      };
      from.onIcmp(id, (ev) => {
        if (ev.type === 'reply') finish(true, `reply from ${ipToString(ev.from)}`);
        else if (ev.type === 'unreachable') finish(false, `unreachable (from ${ipToString(ev.from)})`);
        else if (ev.type === 'send-error') finish(false, ev.message);
      });
      const err = from.sendEcho(target, id, 1);
      if (err) return finish(false, err);
      net.scheduler.schedule(PING_TIMEOUT_MS, () => finish(false, 'no reply (timed out)'));
      return;
    }
    case 'tcp': {
      const from = findDevice(net, check.from);
      if (!from) return done(false, `no device ${check.from}`);
      const target = targetAddr(net, check.toDevice, check.toAddr);
      if (target === null) return done(false, 'target has no address');
      const err = from.connectTcp(target, check.port, TCP_TIMEOUT_MS, (r) => {
        const observed = r === 'open' ? 'open' : r === 'refused' ? 'refused' : 'filtered';
        done(observed === check.expect, `port ${check.port} is ${observed}`);
      });
      if (err) done(check.expect === 'filtered', err);
      return;
    }
    case 'dns': {
      const from = findDevice(net, check.from);
      if (!from) return done(false, `no device ${check.from}`);
      if (from.nameserver === null) return done(false, 'no nameserver configured');
      from.resolveDns(check.name, from.nameserver, (r) => {
        if (typeof r === 'number') {
          if (check.expect !== 'resolves') return done(false, `resolved to ${ipToString(r)}`);
          if (check.addr) return done(ipToString(r) === check.addr, `resolved to ${ipToString(r)}`);
          return done(true, `resolved to ${ipToString(r)}`);
        }
        if (r === null) return done(check.expect === 'nxdomain', 'NXDOMAIN');
        return done(false, `lookup failed (${r})`);
      });
      return;
    }
    case 'http': {
      const from = findDevice(net, check.from);
      if (!from) return done(false, `no device ${check.from}`);
      let rest = check.url.startsWith('http://') ? check.url.slice(7) : check.url;
      const slash = rest.indexOf('/');
      const hostPort = slash < 0 ? rest : rest.slice(0, slash);
      const path = slash < 0 ? '/' : rest.slice(slash);
      const colon = hostPort.indexOf(':');
      const host = colon < 0 ? hostPort : hostPort.slice(0, colon);
      const port = colon < 0 ? 80 : Number(hostPort.slice(colon + 1));
      const wantOk = check.expect === 'ok';
      const withIp = (ip: U32) => {
        const err = from.httpGet(ip, port, path, host, HTTP_TIMEOUT_MS, (r) => {
          if (r.ok) {
            if (!wantOk) return done(false, `got HTTP ${r.status}`);
            if (check.contains && !r.body.includes(check.contains))
              return done(false, 'page is missing the expected content');
            return done(true, `HTTP ${r.status} ${r.reason}`);
          }
          return done(!wantOk, `fetch failed (${r.error})`);
        });
        if (err) done(!wantOk, err);
      };
      const literal = parseIp(host);
      if (literal !== null) return withIp(literal);
      if (from.nameserver === null) return done(!wantOk, 'cannot resolve host (no nameserver)');
      from.resolveDns(host, from.nameserver, (r) => {
        if (typeof r === 'number') withIp(r);
        else done(!wantOk, `cannot resolve ${host}`);
      });
      return;
    }
  }
}

// Sequential so the probe traffic reads clearly on the canvas.
export function runChecks(
  net: Network,
  objectives: Objective[],
  onResult: (r: CheckResult) => void,
  onDone: () => void,
): void {
  let i = 0;
  const next = () => {
    if (i >= objectives.length) {
      onDone();
      return;
    }
    const obj = objectives[i++];
    runOne(net, obj.check, (pass, detail) => {
      onResult({ id: obj.id, pass, detail });
      net.scheduler.schedule(150, next);
    });
  };
  next();
}
