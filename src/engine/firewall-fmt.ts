// Renders the firewall IR back out as genuine nftables and iptables text.
// Both listings come from the same model, so a rule added with `iptables`
// shows up in `nft list ruleset` and vice versa.
import type {
  FilterHook,
  FilterRule,
  FirewallModel,
  NatHook,
  NatRule,
  PortRange,
  RuleMatch,
} from './firewall';
import { cidrToString, ipToString } from './ip';

function portText(r: PortRange): string {
  return r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`;
}

export function matchToNft(m: RuleMatch): string {
  const parts: string[] = [];
  if (m.iif) parts.push(`iifname "${m.iif}"`);
  if (m.oif) parts.push(`oifname "${m.oif}"`);
  if (m.srcNet)
    parts.push(`ip saddr ${m.srcNet.prefix === 32 ? ipToString(m.srcNet.addr) : cidrToString(m.srcNet.addr, m.srcNet.prefix)}`);
  if (m.dstNet)
    parts.push(`ip daddr ${m.dstNet.prefix === 32 ? ipToString(m.dstNet.addr) : cidrToString(m.dstNet.addr, m.dstNet.prefix)}`);
  if (m.icmpType) parts.push(`icmp type ${m.icmpType}`);
  if (m.sport) parts.push(`${m.proto ?? 'tcp'} sport ${portText(m.sport)}`);
  if (m.dport) parts.push(`${m.proto ?? 'tcp'} dport ${portText(m.dport)}`);
  if (m.proto && !m.sport && !m.dport && !m.icmpType) parts.push(`ip protocol ${m.proto}`);
  if (m.ctStates) parts.push(`ct state ${m.ctStates.join(',')}`);
  return parts.join(' ');
}

export function filterRuleText(r: FilterRule): string {
  const m = matchToNft(r.match);
  return m ? `${m} ${r.verdict}` : r.verdict;
}

export function natRuleText(r: NatRule): string {
  const m = matchToNft(r.match);
  const a = r.action;
  const action =
    a.type === 'masquerade'
      ? 'masquerade'
      : a.type === 'snat'
        ? `snat to ${ipToString(a.addr)}`
        : `dnat to ${ipToString(a.addr)}${a.port !== undefined ? `:${a.port}` : ''}`;
  return m ? `${m} ${action}` : action;
}

const FILTER_PRIO: Record<FilterHook, string> = { input: '0', forward: '0', output: '0' };
const NAT_PRIO: Record<NatHook, string> = { prerouting: '-100', postrouting: '100' };

export function listRuleset(fw: FirewallModel, opts: { handles?: boolean } = {}): string {
  let s = '';
  const h = (handle: number) => (opts.handles ? ` # handle ${handle}` : '');
  if (fw.tables.filter) {
    s += 'table ip filter {\n';
    for (const hook of ['input', 'forward', 'output'] as FilterHook[]) {
      const c = fw.filter[hook];
      if (!c.declared) continue;
      s += `\tchain ${c.name} {\n`;
      s += `\t\ttype filter hook ${hook} priority ${FILTER_PRIO[hook]}; policy ${c.policy};\n`;
      for (const r of c.rules) s += `\t\t${filterRuleText(r)}${h(r.handle)}\n`;
      s += '\t}\n';
    }
    s += '}\n';
  }
  if (fw.tables.nat) {
    s += 'table ip nat {\n';
    for (const hook of ['prerouting', 'postrouting'] as NatHook[]) {
      const c = fw.nat[hook];
      if (!c.declared) continue;
      s += `\tchain ${c.name} {\n`;
      s += `\t\ttype nat hook ${hook} priority ${NAT_PRIO[hook]};\n`;
      for (const r of c.rules) s += `\t\t${natRuleText(r)}${h(r.handle)}\n`;
      s += '\t}\n';
    }
    s += '}\n';
  }
  return s || '(empty ruleset — try: nft add table ip filter)\n';
}

// ---------- iptables rendering ----------

export const IPT_CHAIN: Record<FilterHook | NatHook, string> = {
  input: 'INPUT',
  forward: 'FORWARD',
  output: 'OUTPUT',
  prerouting: 'PREROUTING',
  postrouting: 'POSTROUTING',
};

export function matchToIptables(m: RuleMatch): string {
  const parts: string[] = [];
  if (m.srcNet) parts.push(`-s ${cidrToString(m.srcNet.addr, m.srcNet.prefix)}`);
  if (m.dstNet) parts.push(`-d ${cidrToString(m.dstNet.addr, m.dstNet.prefix)}`);
  if (m.iif) parts.push(`-i ${m.iif}`);
  if (m.oif) parts.push(`-o ${m.oif}`);
  if (m.proto) parts.push(`-p ${m.proto}`);
  if (m.icmpType) parts.push(`--icmp-type ${m.icmpType}`);
  if (m.sport) parts.push(`--sport ${m.sport.from === m.sport.to ? m.sport.from : `${m.sport.from}:${m.sport.to}`}`);
  if (m.dport) parts.push(`--dport ${m.dport.from === m.dport.to ? m.dport.from : `${m.dport.from}:${m.dport.to}`}`);
  if (m.ctStates) parts.push(`-m conntrack --ctstate ${m.ctStates.map((s) => s.toUpperCase()).join(',')}`);
  return parts.join(' ');
}

function iptTarget(r: FilterRule): string {
  return r.verdict.toUpperCase();
}

function iptNatTarget(r: NatRule): string {
  const a = r.action;
  if (a.type === 'masquerade') return 'MASQUERADE';
  if (a.type === 'snat') return `SNAT --to-source ${ipToString(a.addr)}`;
  return `DNAT --to-destination ${ipToString(a.addr)}${a.port !== undefined ? `:${a.port}` : ''}`;
}

export function iptablesSave(fw: FirewallModel, table: 'filter' | 'nat'): string {
  let s = '';
  if (table === 'filter') {
    if (!fw.tables.filter) return 'iptables: table filter is empty (no chains declared yet).\n';
    for (const hook of ['input', 'forward', 'output'] as FilterHook[]) {
      const c = fw.filter[hook];
      if (c.declared) s += `-P ${IPT_CHAIN[hook]} ${c.policy.toUpperCase()}\n`;
    }
    for (const hook of ['input', 'forward', 'output'] as FilterHook[]) {
      const c = fw.filter[hook];
      if (!c.declared) continue;
      for (const r of c.rules) {
        const m = matchToIptables(r.match);
        s += `-A ${IPT_CHAIN[hook]}${m ? ' ' + m : ''} -j ${iptTarget(r)}\n`;
      }
    }
  } else {
    if (!fw.tables.nat) return 'iptables: table nat is empty (no chains declared yet).\n';
    for (const hook of ['prerouting', 'postrouting'] as NatHook[]) {
      const c = fw.nat[hook];
      if (c.declared) s += `-P ${IPT_CHAIN[hook]} ACCEPT\n`;
    }
    for (const hook of ['prerouting', 'postrouting'] as NatHook[]) {
      const c = fw.nat[hook];
      if (!c.declared) continue;
      for (const r of c.rules) {
        const m = matchToIptables(r.match);
        s += `-A ${IPT_CHAIN[hook]}${m ? ' ' + m : ''} -j ${iptNatTarget(r)}\n`;
      }
    }
  }
  return s;
}

export function iptablesListing(
  fw: FirewallModel,
  table: 'filter' | 'nat',
  opts: { lineNumbers?: boolean } = {},
): string {
  let s = '';
  const renderFilter = (hook: FilterHook) => {
    const c = fw.filter[hook];
    if (!c.declared) return;
    s += `Chain ${IPT_CHAIN[hook]} (policy ${c.policy.toUpperCase()})\n`;
    s += (opts.lineNumbers ? 'num  ' : '') + 'target     prot  source               destination\n';
    c.rules.forEach((r, i) => {
      const num = opts.lineNumbers ? `${i + 1}`.padEnd(5) : '';
      const src = r.match.srcNet ? cidrToString(r.match.srcNet.addr, r.match.srcNet.prefix) : 'anywhere';
      const dst = r.match.dstNet ? cidrToString(r.match.dstNet.addr, r.match.dstNet.prefix) : 'anywhere';
      const extras: string[] = [];
      if (r.match.dport) extras.push(`dpt:${iptPortText(r.match.dport)}`);
      if (r.match.sport) extras.push(`spt:${iptPortText(r.match.sport)}`);
      if (r.match.ctStates) extras.push(`ctstate ${r.match.ctStates.map((x) => x.toUpperCase()).join(',')}`);
      if (r.match.icmpType) extras.push(r.match.icmpType);
      s += `${num}${iptTarget(r).padEnd(11)}${(r.match.proto ?? 'all').padEnd(6)}${src.padEnd(21)}${dst.padEnd(21)}${extras.join(' ')}\n`;
    });
    s += '\n';
  };
  const renderNat = (hook: NatHook) => {
    const c = fw.nat[hook];
    if (!c.declared) return;
    s += `Chain ${IPT_CHAIN[hook]} (policy ACCEPT)\n`;
    s += (opts.lineNumbers ? 'num  ' : '') + 'target     prot  source               destination\n';
    c.rules.forEach((r, i) => {
      const num = opts.lineNumbers ? `${i + 1}`.padEnd(5) : '';
      const src = r.match.srcNet ? cidrToString(r.match.srcNet.addr, r.match.srcNet.prefix) : 'anywhere';
      const dst = r.match.dstNet ? cidrToString(r.match.dstNet.addr, r.match.dstNet.prefix) : 'anywhere';
      s += `${num}${iptNatTarget(r).split(' ')[0].padEnd(11)}${(r.match.proto ?? 'all').padEnd(6)}${src.padEnd(21)}${dst.padEnd(21)}${iptNatTarget(r).split(' ').slice(1).join(' ')}\n`;
    });
    s += '\n';
  };
  if (table === 'filter') {
    if (!fw.tables.filter) {
      // Match real behaviour loosely: an untouched table lists empty built-ins.
      return 'Chain INPUT (policy ACCEPT)\nChain FORWARD (policy ACCEPT)\nChain OUTPUT (policy ACCEPT)\n';
    }
    (['input', 'forward', 'output'] as FilterHook[]).forEach(renderFilter);
  } else {
    if (!fw.tables.nat) return 'Chain PREROUTING (policy ACCEPT)\nChain POSTROUTING (policy ACCEPT)\n';
    (['prerouting', 'postrouting'] as NatHook[]).forEach(renderNat);
  }
  return s;
}

function iptPortText(r: PortRange): string {
  return r.from === r.to ? `${r.from}` : `${r.from}:${r.to}`;
}
