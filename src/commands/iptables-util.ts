import type { RuleMatch } from '../engine/firewall';

// Spec-based `iptables -D` compares the given match against stored rules.
export function matchesRuleEquality(a: RuleMatch, b: RuleMatch): boolean {
  const norm = (m: RuleMatch) =>
    JSON.stringify({
      s: m.srcNet ?? null,
      d: m.dstNet ?? null,
      p: m.proto ?? null,
      sp: m.sport ?? null,
      dp: m.dport ?? null,
      it: m.icmpType ?? null,
      ct: m.ctStates ? [...m.ctStates].sort() : null,
      i: m.iif ?? null,
      o: m.oif ?? null,
    });
  return norm(a) === norm(b);
}
