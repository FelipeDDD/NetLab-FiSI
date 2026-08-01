// The firewall intermediate representation (IR). Both syntax front-ends —
// nftables and iptables — compile to this model, and both listings are
// regenerated from it (ADR 0004). Evaluation returns the matching rule so
// every verdict can be explained.
import type { Ipv4Packet } from './types';
import { cidrToString, networkOf, parseCidr, parseIp, ipToString, type U32 } from './ip';

export type Verdict = 'accept' | 'drop' | 'reject';
export type CtStateName = 'new' | 'established' | 'related' | 'invalid';
export type FilterHook = 'input' | 'forward' | 'output';
export type NatHook = 'prerouting' | 'postrouting';
export type Proto = 'tcp' | 'udp' | 'icmp';

export interface PortRange {
  from: number;
  to: number;
}

export interface RuleMatch {
  srcNet?: { addr: U32; prefix: number };
  dstNet?: { addr: U32; prefix: number };
  proto?: Proto;
  sport?: PortRange;
  dport?: PortRange;
  icmpType?: 'echo-request' | 'echo-reply';
  ctStates?: CtStateName[];
  iif?: string;
  oif?: string;
}

export type NatAction =
  | { type: 'masquerade' }
  | { type: 'snat'; addr: U32 }
  | { type: 'dnat'; addr: U32; port?: number };

export interface FilterRule {
  handle: number;
  match: RuleMatch;
  verdict: Verdict;
}

export interface NatRule {
  handle: number;
  match: RuleMatch;
  action: NatAction;
}

export interface FilterChain {
  declared: boolean;
  name: string;
  policy: 'accept' | 'drop';
  rules: FilterRule[];
}

export interface NatChain {
  declared: boolean;
  name: string;
  rules: NatRule[];
}

export interface EvalCtx {
  iif?: string;
  oif?: string;
  ctState: CtStateName;
}

export interface EvalResult {
  verdict: Verdict;
  rule: FilterRule | null;
  policy: boolean;
  filtered: boolean; // false when the hook chain is not declared at all
  hook: FilterHook;
}

function pktProto(pkt: Ipv4Packet): Proto {
  return pkt.l4.kind === 'icmp' ? 'icmp' : pkt.l4.kind;
}

function pktPorts(pkt: Ipv4Packet): { sport: number | null; dport: number | null } {
  const l4 = pkt.l4;
  if (l4.kind === 'tcp' || l4.kind === 'udp') return { sport: l4.srcPort, dport: l4.dstPort };
  return { sport: null, dport: null };
}

function inRange(p: number | null, r: PortRange): boolean {
  return p !== null && p >= r.from && p <= r.to;
}

export function matchesRule(m: RuleMatch, pkt: Ipv4Packet, ctx: EvalCtx): boolean {
  if (m.srcNet && networkOf(pkt.src, m.srcNet.prefix) !== networkOf(m.srcNet.addr, m.srcNet.prefix))
    return false;
  if (m.dstNet && networkOf(pkt.dst, m.dstNet.prefix) !== networkOf(m.dstNet.addr, m.dstNet.prefix))
    return false;
  if (m.proto && pktProto(pkt) !== m.proto) return false;
  const ports = pktPorts(pkt);
  if (m.sport && !inRange(ports.sport, m.sport)) return false;
  if (m.dport && !inRange(ports.dport, m.dport)) return false;
  if (m.icmpType) {
    if (pkt.l4.kind !== 'icmp' || pkt.l4.msg.type !== m.icmpType) return false;
  }
  if (m.ctStates && !m.ctStates.includes(ctx.ctState)) return false;
  if (m.iif && m.iif !== ctx.iif) return false;
  if (m.oif && m.oif !== ctx.oif) return false;
  return true;
}

function emptyFilterChain(name: string): FilterChain {
  return { declared: false, name, policy: 'accept', rules: [] };
}

function emptyNatChain(name: string): NatChain {
  return { declared: false, name, rules: [] };
}

export class FirewallModel {
  private handleSeq = 0;
  tables = { filter: false, nat: false };
  filter: Record<FilterHook, FilterChain> = {
    input: emptyFilterChain('input'),
    forward: emptyFilterChain('forward'),
    output: emptyFilterChain('output'),
  };
  nat: Record<NatHook, NatChain> = {
    prerouting: emptyNatChain('prerouting'),
    postrouting: emptyNatChain('postrouting'),
  };

  active(): boolean {
    return (
      Object.values(this.filter).some((c) => c.declared) ||
      Object.values(this.nat).some((c) => c.declared)
    );
  }

  declareFilter(hook: FilterHook, name: string, policy?: 'accept' | 'drop'): void {
    const c = this.filter[hook];
    c.declared = true;
    c.name = name;
    if (policy) c.policy = policy;
  }

  declareNat(hook: NatHook, name: string): void {
    const c = this.nat[hook];
    c.declared = true;
    c.name = name;
  }

  // Real iptables always has its built-in chains; the first iptables command
  // touching a table brings our model in line with that.
  ensureIptablesTable(table: 'filter' | 'nat'): void {
    this.tables[table] = true;
    if (table === 'filter') {
      for (const hook of ['input', 'forward', 'output'] as FilterHook[]) {
        if (!this.filter[hook].declared) this.declareFilter(hook, hook);
      }
    } else {
      for (const hook of ['prerouting', 'postrouting'] as NatHook[]) {
        if (!this.nat[hook].declared) this.declareNat(hook, hook);
      }
    }
  }

  chainByName(
    table: 'filter' | 'nat',
    name: string,
  ): { kind: 'filter'; hook: FilterHook } | { kind: 'nat'; hook: NatHook } | null {
    const lower = name.toLowerCase();
    if (table === 'filter') {
      for (const hook of Object.keys(this.filter) as FilterHook[]) {
        if (this.filter[hook].declared && this.filter[hook].name.toLowerCase() === lower)
          return { kind: 'filter', hook };
      }
    } else {
      for (const hook of Object.keys(this.nat) as NatHook[]) {
        if (this.nat[hook].declared && this.nat[hook].name.toLowerCase() === lower)
          return { kind: 'nat', hook };
      }
    }
    return null;
  }

  addFilterRule(hook: FilterHook, match: RuleMatch, verdict: Verdict, atHead = false): number {
    const rule: FilterRule = { handle: ++this.handleSeq, match, verdict };
    const rules = this.filter[hook].rules;
    if (atHead) rules.unshift(rule);
    else rules.push(rule);
    return rule.handle;
  }

  addNatRule(hook: NatHook, match: RuleMatch, action: NatAction, atHead = false): number {
    const rule: NatRule = { handle: ++this.handleSeq, match, action };
    const rules = this.nat[hook].rules;
    if (atHead) rules.unshift(rule);
    else rules.push(rule);
    return rule.handle;
  }

  deleteHandle(handle: number): boolean {
    for (const c of Object.values(this.filter)) {
      const i = c.rules.findIndex((r) => r.handle === handle);
      if (i >= 0) {
        c.rules.splice(i, 1);
        return true;
      }
    }
    for (const c of Object.values(this.nat)) {
      const i = c.rules.findIndex((r) => r.handle === handle);
      if (i >= 0) {
        c.rules.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  flush(): void {
    this.tables = { filter: false, nat: false };
    this.filter = {
      input: emptyFilterChain('input'),
      forward: emptyFilterChain('forward'),
      output: emptyFilterChain('output'),
    };
    this.nat = { prerouting: emptyNatChain('prerouting'), postrouting: emptyNatChain('postrouting') };
  }

  evaluate(hook: FilterHook, pkt: Ipv4Packet, ctx: EvalCtx): EvalResult {
    const c = this.filter[hook];
    if (!c.declared) return { verdict: 'accept', rule: null, policy: false, filtered: false, hook };
    for (const r of c.rules) {
      if (matchesRule(r.match, pkt, ctx)) return { verdict: r.verdict, rule: r, policy: false, filtered: true, hook };
    }
    return { verdict: c.policy, rule: null, policy: true, filtered: true, hook };
  }

  evalNat(hook: NatHook, pkt: Ipv4Packet, ctx: EvalCtx): NatRule | null {
    const c = this.nat[hook];
    if (!c.declared) return null;
    for (const r of c.rules) {
      if (matchesRule(r.match, pkt, ctx)) return r;
    }
    return null;
  }
}

// ---------- JSON persistence ----------

interface MatchJSON {
  src?: string;
  dst?: string;
  proto?: Proto;
  sport?: [number, number];
  dport?: [number, number];
  icmpType?: 'echo-request' | 'echo-reply';
  ct?: CtStateName[];
  iif?: string;
  oif?: string;
}

interface FilterRuleJSON {
  match: MatchJSON;
  verdict: Verdict;
}

interface NatRuleJSON {
  match: MatchJSON;
  action: { type: 'masquerade' } | { type: 'snat'; addr: string } | { type: 'dnat'; addr: string; port?: number };
}

export interface FirewallJSON {
  tables: { filter: boolean; nat: boolean };
  filter: Partial<Record<FilterHook, { name: string; policy: 'accept' | 'drop'; rules: FilterRuleJSON[] }>>;
  nat: Partial<Record<NatHook, { name: string; rules: NatRuleJSON[] }>>;
}

function matchToJSON(m: RuleMatch): MatchJSON {
  const j: MatchJSON = {};
  if (m.srcNet) j.src = cidrToString(m.srcNet.addr, m.srcNet.prefix);
  if (m.dstNet) j.dst = cidrToString(m.dstNet.addr, m.dstNet.prefix);
  if (m.proto) j.proto = m.proto;
  if (m.sport) j.sport = [m.sport.from, m.sport.to];
  if (m.dport) j.dport = [m.dport.from, m.dport.to];
  if (m.icmpType) j.icmpType = m.icmpType;
  if (m.ctStates) j.ct = m.ctStates;
  if (m.iif) j.iif = m.iif;
  if (m.oif) j.oif = m.oif;
  return j;
}

function matchFromJSON(j: MatchJSON): RuleMatch {
  const m: RuleMatch = {};
  if (j.src) {
    const c = parseCidr(j.src);
    if (c) m.srcNet = c;
  }
  if (j.dst) {
    const c = parseCidr(j.dst);
    if (c) m.dstNet = c;
  }
  if (j.proto) m.proto = j.proto;
  if (j.sport) m.sport = { from: j.sport[0], to: j.sport[1] };
  if (j.dport) m.dport = { from: j.dport[0], to: j.dport[1] };
  if (j.icmpType) m.icmpType = j.icmpType;
  if (j.ct) m.ctStates = j.ct;
  if (j.iif) m.iif = j.iif;
  if (j.oif) m.oif = j.oif;
  return m;
}

export function firewallToJSON(fw: FirewallModel): FirewallJSON | null {
  if (!fw.active() && !fw.tables.filter && !fw.tables.nat) return null;
  const j: FirewallJSON = { tables: { ...fw.tables }, filter: {}, nat: {} };
  for (const hook of Object.keys(fw.filter) as FilterHook[]) {
    const c = fw.filter[hook];
    if (!c.declared) continue;
    j.filter[hook] = {
      name: c.name,
      policy: c.policy,
      rules: c.rules.map((r) => ({ match: matchToJSON(r.match), verdict: r.verdict })),
    };
  }
  for (const hook of Object.keys(fw.nat) as NatHook[]) {
    const c = fw.nat[hook];
    if (!c.declared) continue;
    j.nat[hook] = {
      name: c.name,
      rules: c.rules.map((r) => ({
        match: matchToJSON(r.match),
        action:
          r.action.type === 'masquerade'
            ? { type: 'masquerade' as const }
            : r.action.type === 'snat'
              ? { type: 'snat' as const, addr: ipToString(r.action.addr) }
              : { type: 'dnat' as const, addr: ipToString(r.action.addr), port: r.action.port },
      })),
    };
  }
  return j;
}

export function firewallFromJSON(fw: FirewallModel, j: FirewallJSON): void {
  fw.flush();
  fw.tables = { filter: !!j.tables?.filter, nat: !!j.tables?.nat };
  for (const hook of Object.keys(j.filter ?? {}) as FilterHook[]) {
    const c = j.filter[hook];
    if (!c) continue;
    fw.declareFilter(hook, c.name, c.policy);
    for (const r of c.rules) fw.addFilterRule(hook, matchFromJSON(r.match), r.verdict);
  }
  for (const hook of Object.keys(j.nat ?? {}) as NatHook[]) {
    const c = j.nat[hook];
    if (!c) continue;
    fw.declareNat(hook, c.name);
    for (const r of c.rules) {
      const a = r.action;
      const action: NatAction =
        a.type === 'masquerade'
          ? { type: 'masquerade' }
          : a.type === 'snat'
            ? { type: 'snat', addr: parseIp(a.addr) ?? 0 }
            : { type: 'dnat', addr: parseIp(a.addr) ?? 0, port: a.port };
      fw.addNatRule(hook, matchFromJSON(r.match), action);
    }
  }
}
