// nftables front-end: parses a curated subset of real nft syntax into the
// shared firewall IR. Anything outside the subset errors loudly (ADR 0003).
import type { IpDevice } from '../engine/ipdevice';
import type {
  CtStateName,
  FilterHook,
  NatAction,
  NatHook,
  PortRange,
  RuleMatch,
  Verdict,
} from '../engine/firewall';
import { listRuleset } from '../engine/firewall-fmt';
import { parseCidr, parseIp } from '../engine/ip';

type Out = (s: string) => void;

const SUBSET_HINT =
  'Supported nft subset: list ruleset [-a] · flush ruleset · add table ip filter|nat ·\n' +
  'add chain ip <table> <name> { type filter|nat hook <hook> priority <n> ; [policy accept|drop ;] } ·\n' +
  'add|insert rule ip <table> <chain> [matches] accept|drop|reject|masquerade|snat to <ip>|dnat to <ip>[:port] ·\n' +
  'delete rule ip <table> <chain> handle <n>\n' +
  'Matches: ip saddr/daddr <cidr>, tcp|udp sport/dport <port|a-b>, icmp type <echo-request|echo-reply>,\n' +
  'ct state <list>, iifname/oifname "<if>"\n';

const CT_STATES: CtStateName[] = ['new', 'established', 'related', 'invalid'];
const FILTER_HOOKS: FilterHook[] = ['input', 'forward', 'output'];
const NAT_HOOKS: NatHook[] = ['prerouting', 'postrouting'];

function lex(raw: string): string[] {
  return raw
    .replace(/['"]/g, '')
    .replace(/([{};,])/g, ' $1 ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parsePort(tok: string): PortRange | null {
  const range = tok.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from >= 1 && to <= 65535 && from <= to) return { from, to };
    return null;
  }
  const p = Number(tok);
  if (Number.isInteger(p) && p >= 1 && p <= 65535) return { from: p, to: p };
  return null;
}

function parseNetToken(tok: string): { addr: number; prefix: number } | null {
  const cidr = parseCidr(tok);
  if (cidr) return cidr;
  const ip = parseIp(tok);
  if (ip !== null) return { addr: ip, prefix: 32 };
  return null;
}

class Parser {
  i = 0;
  constructor(public t: string[]) {}
  peek(): string | undefined {
    return this.t[this.i];
  }
  next(): string | undefined {
    return this.t[this.i++];
  }
  expect(tok: string): boolean {
    if (this.peek() === tok) {
      this.i++;
      return true;
    }
    return false;
  }
}

interface ParsedExpr {
  match: RuleMatch;
  verdict?: Verdict;
  nat?: NatAction;
  error?: string;
}

function parseExpressions(p: Parser): ParsedExpr {
  const match: RuleMatch = {};
  let verdict: Verdict | undefined;
  let nat: NatAction | undefined;

  while (p.peek() !== undefined) {
    const tok = p.next()!;
    if (tok === 'ip') {
      const what = p.next();
      if (what === 'saddr' || what === 'daddr') {
        const net = parseNetToken(p.next() ?? '');
        if (!net) return { match, error: `Error: syntax error, invalid address after "ip ${what}"` };
        if (what === 'saddr') match.srcNet = net;
        else match.dstNet = net;
      } else if (what === 'protocol') {
        const proto = p.next();
        if (proto !== 'tcp' && proto !== 'udp' && proto !== 'icmp')
          return { match, error: `Error: syntax error, unexpected protocol "${proto ?? ''}"` };
        match.proto = proto;
      } else {
        return { match, error: `Error: syntax error, unexpected "ip ${what ?? ''}"` };
      }
    } else if (tok === 'tcp' || tok === 'udp') {
      if (match.proto && match.proto !== tok) return { match, error: 'Error: conflicting protocols specified' };
      match.proto = tok;
      const what = p.next();
      if (what !== 'sport' && what !== 'dport')
        return { match, error: `Error: syntax error, unexpected "${tok} ${what ?? ''}"` };
      const port = parsePort(p.next() ?? '');
      if (!port) return { match, error: `Error: syntax error, invalid port after "${tok} ${what}"` };
      if (what === 'sport') match.sport = port;
      else match.dport = port;
    } else if (tok === 'icmp') {
      if (match.proto && match.proto !== 'icmp') return { match, error: 'Error: conflicting protocols specified' };
      match.proto = 'icmp';
      if (p.next() !== 'type') return { match, error: 'Error: syntax error after "icmp"' };
      const t = p.next();
      if (t !== 'echo-request' && t !== 'echo-reply')
        return { match, error: `netsim: icmp type "${t ?? ''}" not in phase-2 subset (echo-request, echo-reply)` };
      match.icmpType = t;
    } else if (tok === 'ct') {
      if (p.next() !== 'state') return { match, error: 'Error: syntax error after "ct"' };
      const states: CtStateName[] = [];
      const braced = p.expect('{');
      for (;;) {
        const s = p.peek();
        if (s === undefined) break;
        if (s === ',') {
          p.next();
          continue;
        }
        if (s === '}') {
          p.next();
          break;
        }
        if ((CT_STATES as string[]).includes(s)) {
          states.push(s as CtStateName);
          p.next();
          if (!braced && p.peek() !== ',') break;
          continue;
        }
        break;
      }
      if (!states.length) return { match, error: 'Error: syntax error, expected ct states' };
      match.ctStates = states;
    } else if (tok === 'iifname' || tok === 'oifname') {
      const name = p.next();
      if (!name) return { match, error: `Error: syntax error, expected interface after "${tok}"` };
      if (tok === 'iifname') match.iif = name;
      else match.oif = name;
    } else if (tok === 'counter') {
      // accepted and ignored — counters are implicit in NetSim
    } else if (tok === 'accept' || tok === 'drop' || tok === 'reject') {
      verdict = tok;
      break;
    } else if (tok === 'masquerade') {
      nat = { type: 'masquerade' };
      break;
    } else if (tok === 'snat' || tok === 'dnat') {
      if (p.next() !== 'to') return { match, error: `Error: syntax error, expected "to" after "${tok}"` };
      const target = p.next() ?? '';
      if (tok === 'snat') {
        const addr = parseIp(target);
        if (addr === null) return { match, error: 'Error: syntax error, invalid snat address' };
        nat = { type: 'snat', addr };
      } else {
        const [ipPart, portPart] = target.split(':');
        const addr = parseIp(ipPart);
        if (addr === null) return { match, error: 'Error: syntax error, invalid dnat address' };
        const port = portPart !== undefined ? Number(portPart) : undefined;
        if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535))
          return { match, error: 'Error: syntax error, invalid dnat port' };
        nat = { type: 'dnat', addr, port };
      }
      break;
    } else {
      return { match, error: `Error: syntax error, unexpected "${tok}"` };
    }
  }
  if (p.peek() !== undefined) return { match, error: `Error: trailing tokens after verdict: "${p.peek()}"` };
  return { match, verdict, nat };
}

export function runNft(device: IpDevice, raw: string, out: Out): void {
  const fw = device.fw;
  const t = lex(raw);
  let handles = false;
  while (t[0] === '-a' || t[0] === '--handle') {
    handles = true;
    t.shift();
  }
  const cmd = t[0];

  if (cmd === 'list') {
    if (t[1] === 'ruleset') {
      out(listRuleset(fw, { handles }));
      return;
    }
    out(`netsim: "nft ${raw.trim()}" is not supported — use "nft list ruleset".\n`);
    return;
  }

  if (cmd === 'flush' && t[1] === 'ruleset') {
    fw.flush();
    return;
  }

  if (cmd === 'delete' && t[1] === 'rule') {
    const handle = Number(t[t.length - 1]);
    if (t[t.length - 2] !== 'handle' || !Number.isInteger(handle)) {
      out('Error: syntax error — delete rule ip <table> <chain> handle <n>\n');
      return;
    }
    if (!fw.deleteHandle(handle)) out('Error: Could not process rule: No such file or directory\n');
    return;
  }

  if (cmd === 'add' || cmd === 'insert' || cmd === 'create') {
    const obj = t[1];
    if (obj === 'table') {
      if (t[2] !== 'ip' || (t[3] !== 'filter' && t[3] !== 'nat')) {
        out(`netsim: only "ip filter" and "ip nat" tables are in the phase-2 subset.\n`);
        return;
      }
      fw.tables[t[3]] = true;
      return;
    }
    if (obj === 'chain') {
      addChain(device, t.slice(2), out);
      return;
    }
    if (obj === 'rule') {
      addRule(device, t.slice(2), cmd === 'insert', out);
      return;
    }
  }

  out(`netsim: "nft ${raw.trim()}" is not supported.\n${SUBSET_HINT}`);
}

function addChain(device: IpDevice, t: string[], out: Out): void {
  const fw = device.fw;
  if (t[0] !== 'ip') {
    out('netsim: only the "ip" family is in the phase-2 subset.\n');
    return;
  }
  const table = t[1];
  const name = t[2];
  if ((table !== 'filter' && table !== 'nat') || !name) {
    out('Error: syntax error — add chain ip <filter|nat> <name> { ... }\n');
    return;
  }
  if (!fw.tables[table]) {
    out('Error: Could not process rule: No such file or directory\n');
    return;
  }
  const p = new Parser(t.slice(3));
  if (!p.expect('{')) {
    out('netsim: regular (non-base) chains are not in the phase-2 subset — declare a hook block: { type ... hook ... priority 0 ; }\n');
    return;
  }
  let hook: string | undefined;
  let policy: 'accept' | 'drop' | undefined;
  let chainType: string | undefined;
  for (;;) {
    const tok = p.next();
    if (tok === undefined || tok === '}') break;
    if (tok === ';') continue;
    if (tok === 'type') chainType = p.next();
    else if (tok === 'hook') hook = p.next();
    else if (tok === 'priority') p.next();
    else if (tok === 'policy') {
      const pol = p.next();
      if (pol === 'accept' || pol === 'drop') policy = pol;
      else {
        out(`Error: syntax error, unexpected policy "${pol ?? ''}"\n`);
        return;
      }
    } else {
      out(`Error: syntax error, unexpected "${tok}"\n`);
      return;
    }
  }
  if (table === 'filter') {
    if (chainType !== 'filter' || !FILTER_HOOKS.includes(hook as FilterHook)) {
      out('Error: syntax error — filter chains need: type filter hook input|forward|output priority 0 ;\n');
      return;
    }
    fw.declareFilter(hook as FilterHook, name, policy);
  } else {
    if (chainType !== 'nat' || !NAT_HOOKS.includes(hook as NatHook)) {
      out('Error: syntax error — nat chains need: type nat hook prerouting|postrouting priority <n> ;\n');
      return;
    }
    if (policy === 'drop') {
      out('netsim: drop policies on nat chains are not in the phase-2 subset.\n');
      return;
    }
    fw.declareNat(hook as NatHook, name);
  }
}

function addRule(device: IpDevice, t: string[], atHead: boolean, out: Out): void {
  const fw = device.fw;
  if (t[0] !== 'ip') {
    out('netsim: only the "ip" family is in the phase-2 subset.\n');
    return;
  }
  const table = t[1];
  const chainName = t[2];
  if ((table !== 'filter' && table !== 'nat') || !chainName) {
    out('Error: syntax error — add rule ip <table> <chain> <expressions> <verdict>\n');
    return;
  }
  const slot = fw.tables[table] ? fw.chainByName(table, chainName) : null;
  if (!slot) {
    out('Error: Could not process rule: No such file or directory\n');
    return;
  }
  const parsed = parseExpressions(new Parser(t.slice(3)));
  if (parsed.error) {
    out(parsed.error + '\n' + SUBSET_HINT);
    return;
  }
  if (slot.kind === 'filter') {
    if (!parsed.verdict) {
      out(parsed.nat
        ? 'Error: nat actions (masquerade/snat/dnat) belong in nat chains, not filter chains.\n'
        : 'Error: rule needs a verdict: accept, drop or reject\n');
      return;
    }
    fw.addFilterRule(slot.hook, parsed.match, parsed.verdict, atHead);
    return;
  }
  if (!parsed.nat) {
    out('Error: nat chain rules need masquerade, snat to <ip>, or dnat to <ip>[:port]\n');
    return;
  }
  if (parsed.nat.type === 'dnat' && slot.hook !== 'prerouting') {
    out('Error: dnat is only valid in the prerouting hook\n');
    return;
  }
  if ((parsed.nat.type === 'masquerade' || parsed.nat.type === 'snat') && slot.hook !== 'postrouting') {
    out(`Error: ${parsed.nat.type} is only valid in the postrouting hook\n`);
    return;
  }
  fw.addNatRule(slot.hook, parsed.match, parsed.nat, atHead);
}
