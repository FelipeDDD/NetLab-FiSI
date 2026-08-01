# ADR 0004 — One internal firewall rule model; nftables-first, iptables second

**Status:** accepted (2026-08-01) — implementation lands in phase 2

## Context

The tool must teach firewalls (its differentiating feature, per the iNetwork lineage). Linux
has two rule languages: iptables (legacy, still dominant in course material) and nftables (the
modern default). Research found no browser-based nftables teaching tool exists at all.

## Decision

- A single internal rule representation (IR) drives packet evaluation, verdict explanation and
  config export.
- Two syntax front-ends compile to that IR: **nftables first** (modern, unserved niche),
  iptables second (compatibility with existing course material).
- Exporters emit both dialects from the same IR, so a lesson built in one syntax can be viewed
  in the other.
- Initial semantic scope: IPv4 filter (input/forward/output), `ct state` via a simple conntrack
  table, and NAT (masquerade/dnat). Defer IPv6, mangle/raw, sets/maps, marks, rate limiting.

## Consequences

- The verdict engine annotates every accept/drop/reject with the matching rule — the "explain"
  feature — independent of which syntax the user wrote.
- Dual dialect display doubles as a legacy→modern migration teaching aid.
- The IR must not encode iptables-specific or nftables-specific quirks; both parsers normalise.
