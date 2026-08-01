// iptables front-end over the same firewall IR as the nft command. Rules
// added here appear in `nft list ruleset` and vice versa — one model, two
// dialects (ADR 0004).
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
import { matchesRuleEquality } from './iptables-util';
import { iptablesListing, iptablesSave } from '../engine/firewall-fmt';
import { parseCidr, parseIp } from '../engine/ip';

type Out = (s: string) => void;

const SUBSET_HINT =
  'Supported iptables subset: -t filter|nat, -A/-I/-D <chain>, -F [chain], -P <chain> ACCEPT|DROP,\n' +
  '-L [--line-numbers], -S, matches: -s/-d <cidr>, -i/-o <if>, -p tcp|udp|icmp, --sport/--dport <p[:p]>,\n' +
  '--icmp-type <type>, -m conntrack --ctstate <LIST> (also -m state --state),\n' +
  'targets: ACCEPT DROP REJECT MASQUERADE SNAT --to-source <ip>, DNAT --to-destination <ip>[:port]\n';

const FILTER_CHAINS: Record<string, FilterHook> = { INPUT: 'input', FORWARD: 'forward', OUTPUT: 'output' };
const NAT_CHAINS: Record<string, NatHook> = { PREROUTING: 'prerouting', POSTROUTING: 'postrouting' };

function parseIptPort(tok: string): PortRange | null {
  const range = tok.match(/^(\d+):(\d+)$/);
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

function parseNet(tok: string): { addr: number; prefix: number } | null {
  const cidr = parseCidr(tok);
  if (cidr) return cidr;
  const ip = parseIp(tok);
  if (ip !== null) return { addr: ip, prefix: 32 };
  return null;
}

const ICMP_TYPES: Record<string, 'echo-request' | 'echo-reply'> = {
  'echo-request': 'echo-request',
  '8': 'echo-request',
  'echo-reply': 'echo-reply',
  '0': 'echo-reply',
};

export function runIptables(device: IpDevice, args: string[], out: Out): void {
  const fw = device.fw;
  let table: 'filter' | 'nat' = 'filter';
  let op: { type: 'append' | 'insert' | 'delete'; chain: string } | null = null;
  let deleteNum: number | null = null;
  let flushChain: string | null | undefined;
  let policyOp: { chain: string; target: string } | null = null;
  let list = false;
  let save = false;
  let lineNumbers = false;
  const match: RuleMatch = {};
  let target: string | null = null;
  let natTo: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case '-t': {
        const tname = next();
        if (tname !== 'filter' && tname !== 'nat') {
          out(`iptables: table "${tname ?? ''}" is not in the phase-2 subset (filter, nat).\n`);
          return;
        }
        table = tname;
        break;
      }
      case '-A':
        op = { type: 'append', chain: next() ?? '' };
        break;
      case '-I':
        op = { type: 'insert', chain: next() ?? '' };
        // optional rulenum: only position 1 is supported
        if (/^\d+$/.test(args[i + 1] ?? '')) {
          if (args[++i] !== '1') {
            out('netsim: -I with a rule number other than 1 is not in the phase-2 subset.\n');
            return;
          }
        }
        break;
      case '-D': {
        op = { type: 'delete', chain: next() ?? '' };
        if (/^\d+$/.test(args[i + 1] ?? '')) deleteNum = Number(args[++i]);
        break;
      }
      case '-F':
        flushChain = /^[A-Z]+$/.test(args[i + 1] ?? '') ? args[++i] : null;
        break;
      case '-P':
        policyOp = { chain: next() ?? '', target: next() ?? '' };
        break;
      case '-L':
        list = true;
        break;
      case '-S':
        save = true;
        break;
      case '--line-numbers':
        lineNumbers = true;
        break;
      case '-n':
      case '-v':
        break;
      case '-s': {
        const net = parseNet(next() ?? '');
        if (!net) {
          out('iptables: bad source address\n');
          return;
        }
        match.srcNet = net;
        break;
      }
      case '-d': {
        const net = parseNet(next() ?? '');
        if (!net) {
          out('iptables: bad destination address\n');
          return;
        }
        match.dstNet = net;
        break;
      }
      case '-i':
        match.iif = next();
        break;
      case '-o':
        match.oif = next();
        break;
      case '-p': {
        const proto = next();
        if (proto !== 'tcp' && proto !== 'udp' && proto !== 'icmp') {
          out(`iptables: protocol "${proto ?? ''}" is not in the phase-2 subset (tcp, udp, icmp).\n`);
          return;
        }
        match.proto = proto;
        break;
      }
      case '--dport':
      case '--sport': {
        if (match.proto !== 'tcp' && match.proto !== 'udp') {
          out(`iptables: unknown option "${a}" — specify -p tcp or -p udp first, like real iptables.\n`);
          return;
        }
        const port = parseIptPort(next() ?? '');
        if (!port) {
          out('iptables: invalid port/service\n');
          return;
        }
        if (a === '--dport') match.dport = port;
        else match.sport = port;
        break;
      }
      case '--icmp-type': {
        if (match.proto !== 'icmp') {
          out('iptables: unknown option "--icmp-type" — specify -p icmp first.\n');
          return;
        }
        const t = ICMP_TYPES[next() ?? ''];
        if (!t) {
          out('netsim: only echo-request (8) and echo-reply (0) icmp types are in the phase-2 subset.\n');
          return;
        }
        match.icmpType = t;
        break;
      }
      case '-m': {
        const mod = next();
        if (mod !== 'conntrack' && mod !== 'state') {
          out(`netsim: match extension "-m ${mod ?? ''}" is not in the phase-2 subset (conntrack, state).\n`);
          return;
        }
        break;
      }
      case '--ctstate':
      case '--state': {
        const states: CtStateName[] = [];
        for (const s of (next() ?? '').split(',')) {
          const lower = s.toLowerCase() as CtStateName;
          if (!['new', 'established', 'related', 'invalid'].includes(lower)) {
            out(`iptables: unknown state "${s}"\n`);
            return;
          }
          states.push(lower);
        }
        if (!states.length) {
          out('iptables: --ctstate needs at least one state\n');
          return;
        }
        match.ctStates = states;
        break;
      }
      case '-j':
        target = next() ?? null;
        break;
      case '--to-destination':
      case '--to-source':
        natTo = next() ?? null;
        break;
      case '--reject-with':
        next(); // accepted, ignored: we always reject with icmp-port-unreachable
        break;
      default:
        out(`netsim: iptables option "${a}" is not supported.\n${SUBSET_HINT}`);
        return;
    }
  }

  fw.ensureIptablesTable(table);

  if (save) {
    out(iptablesSave(fw, table));
    return;
  }
  if (list) {
    out(iptablesListing(fw, table, { lineNumbers }));
    return;
  }
  if (policyOp) {
    const hook = FILTER_CHAINS[policyOp.chain];
    if (table !== 'filter' || !hook) {
      out('iptables: policies are supported on filter INPUT/FORWARD/OUTPUT only.\n');
      return;
    }
    const pol = policyOp.target.toLowerCase();
    if (pol !== 'accept' && pol !== 'drop') {
      out('iptables: Bad policy name. Run `iptables -h\' or iptables-restore -h\' for more information.\n');
      return;
    }
    fw.filter[hook].policy = pol;
    return;
  }
  if (flushChain !== undefined) {
    if (table === 'filter') {
      const hooks = flushChain ? [FILTER_CHAINS[flushChain]] : (Object.values(FILTER_CHAINS) as FilterHook[]);
      if (hooks.some((h) => !h)) {
        out('iptables: No chain/target/match by that name.\n');
        return;
      }
      for (const h of hooks) fw.filter[h as FilterHook].rules = [];
    } else {
      const hooks = flushChain ? [NAT_CHAINS[flushChain]] : (Object.values(NAT_CHAINS) as NatHook[]);
      if (hooks.some((h) => !h)) {
        out('iptables: No chain/target/match by that name.\n');
        return;
      }
      for (const h of hooks) fw.nat[h as NatHook].rules = [];
    }
    return;
  }

  if (!op) {
    out(`netsim: nothing to do — give one of -A/-I/-D/-F/-P/-L/-S.\n${SUBSET_HINT}`);
    return;
  }

  if (table === 'filter') {
    const hook = FILTER_CHAINS[op.chain];
    if (!hook) {
      out('iptables: No chain/target/match by that name.\n');
      return;
    }
    if (op.type === 'delete') {
      const rules = fw.filter[hook].rules;
      if (deleteNum !== null) {
        if (deleteNum < 1 || deleteNum > rules.length) {
          out('iptables: Index of deletion too big.\n');
          return;
        }
        rules.splice(deleteNum - 1, 1);
        return;
      }
      const verdict = (target ?? '').toLowerCase() as Verdict;
      const idx = rules.findIndex((r) => r.verdict === verdict && matchesRuleEquality(r.match, match));
      if (idx < 0) {
        out('iptables: Bad rule (does a matching rule exist in that chain?).\n');
        return;
      }
      rules.splice(idx, 1);
      return;
    }
    const verdict = (target ?? '').toLowerCase();
    if (verdict !== 'accept' && verdict !== 'drop' && verdict !== 'reject') {
      out(`iptables: filter target must be ACCEPT, DROP or REJECT (got "${target ?? ''}").\n`);
      return;
    }
    fw.addFilterRule(hook, match, verdict, op.type === 'insert');
    return;
  }

  // nat table
  const hook = NAT_CHAINS[op.chain];
  if (!hook) {
    out('iptables: No chain/target/match by that name.\n');
    return;
  }
  if (op.type === 'delete') {
    const rules = fw.nat[hook].rules;
    if (deleteNum === null || deleteNum < 1 || deleteNum > rules.length) {
      out('netsim: delete nat rules by number: iptables -t nat -D <chain> <num>\n');
      return;
    }
    rules.splice(deleteNum - 1, 1);
    return;
  }
  let action: NatAction;
  if (target === 'MASQUERADE') {
    if (hook !== 'postrouting') {
      out('iptables: MASQUERADE is only valid in POSTROUTING.\n');
      return;
    }
    action = { type: 'masquerade' };
  } else if (target === 'SNAT') {
    const addr = parseIp(natTo ?? '');
    if (hook !== 'postrouting' || addr === null) {
      out('iptables: SNAT needs POSTROUTING and --to-source <ip>.\n');
      return;
    }
    action = { type: 'snat', addr };
  } else if (target === 'DNAT') {
    const [ipPart, portPart] = (natTo ?? '').split(':');
    const addr = parseIp(ipPart ?? '');
    const port = portPart !== undefined ? Number(portPart) : undefined;
    if (hook !== 'prerouting' || addr === null || (port !== undefined && !Number.isInteger(port))) {
      out('iptables: DNAT needs PREROUTING and --to-destination <ip>[:port].\n');
      return;
    }
    action = { type: 'dnat', addr, port };
  } else {
    out(`iptables: nat target must be MASQUERADE, SNAT or DNAT (got "${target ?? ''}").\n`);
    return;
  }
  fw.addNatRule(hook, match, action, op.type === 'insert');
}
