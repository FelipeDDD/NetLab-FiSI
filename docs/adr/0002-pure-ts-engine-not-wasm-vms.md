# ADR 0002 — Pure TypeScript simulation engine, not WebAssembly Linux VMs

**Status:** accepted (2026-08-01)

## Context

Real Linux VMs can run in the browser: v86 boots Alpine with genuine iptables and even offers an
in-browser virtual ethernet switch between instances; WebVM/CheerpX is faster but commercially
licensed (academic deployments need a license). We evaluated building on these.

Each VM costs roughly 64–512 MB RAM and 5–30 s boot. A classroom topology of 8+ devices on a
student Chromebook is not feasible, iOS Safari historically lacks the needed JIT, and — decisive
for a teaching tool — a real kernel cannot explain *why* it dropped a packet.

## Decision

The core engine is a deterministic discrete-event simulator written in plain TypeScript
(`src/engine/`), framework-free and unit-tested. Every frame/packet is an inspectable event on
a virtual clock, giving packet animation, timeline control, "explain this verdict", and
auto-gradable lab objectives for free.

A v86-based "real VM" node type may be added later as an *optional* advanced feature; it must
never be required by core lessons.

## Consequences

- Instant startup, dozens of devices, works on any browser including tablets.
- Protocol behaviour is only as correct as our implementation — mitigated by the engine test
  suite and by ADR 0003's syntax-honesty rules.
- Unsupported features must fail loudly rather than approximate (see ADR 0003).
