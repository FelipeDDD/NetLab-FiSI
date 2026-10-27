# Interface, cable and DHCP audit; network commands after restoration

Update: Router DHCP now has an independent global server switch and a narrow
Linux CLI equivalent. See [global-dhcp.md](global-dhcp.md). The findings below
describe the earlier interface audit; per-pool configuration and Link UP remain
independent of the new global flag.

Audit performed against disposable fixtures, native Chromium with a temporary
profile and `netlab-idb-test-*` databases. No real topology, browser profile,
localStorage or IndexedDB was inspected or changed. Earlier legibility work was
preserved. The findings describe the current implementation and reproducible
cases, not the history of the user's actual document.

## Confirmed interface/color behavior

The fixture has a four-interface Router, Switch, AP, two Ethernet PCs and one
wireless PC. Router `eth0` serves `192.168.1.0/24` through a VLAN-7 Switch.
The magenta AP uplink uses `r1/eth2`, with no IPv4. Disconnected `eth3` owns
`192.168.2.1/24` and its DHCP pool.

| Observation | Result and classification |
| --- | --- |
| Cable uses eth2; IPv4 belongs to eth3 | Confirmed document/engine/Inspector agreement, not an index swap. Structurally valid configuration, functionally incomplete if the AP should use the eth3 subnet. |
| eth2 omitted from canvas IP list | Intentional: `canvasNetwork()` lists configured IPv4 addresses, not every port. Its tooltip includes the unconfigured eth2. |
| eth3 appears without magenta cable color | Correct: `interfaceCableColor()` reads the actual interface link. A disconnected interface has no cable color; its stored address is dimmed. |
| Link aktiv with no IPv4 | Correct distinction between Ethernet operational state and Layer-3 addressing. |
| AP client cannot acquire from eth3 | Expected: DHCP chooses the pool by ingress interface, never by cable color or another interface's subnet. There is no automatic DHCP relay. |

Sources: `src/components/InterfaceConnection.tsx`, `src/canvasNetwork.ts`,
`src/cableAppearance.ts`, `src/engine/network.ts`, `src/engine/ipdevice.ts`.

`serializeNetwork()` saves each interface's name/MAC/IPv4/mode/options/admin
state and each link's explicit endpoint names. `restoreDevice()` looks up
interfaces by name; `restoreNetwork()` passes both saved names to `connect()`.
It does not pick another free port when the saved one is occupied/invalid.
Such links are rejected. VLANs remain keyed by port name.

Tests reversed router interface-array order, document device order and link
order. The four interface identities, addresses, MACs, VLANs and endpoints
remained exact. Native Chromium additionally confirmed legacy migration,
Save/Load, switching to a deliberately different control plan and back, and F5.
The injected legacy source remained byte-identical and migration was idempotent.

No interface reassignment bug was reproduced. Without the user's exported
document and an earlier snapshot, it is impossible to establish when/why their
eth2/eth3 configuration arose or attribute it to any author/tool.

If the intended AP network is `192.168.2.0/24`, its uplink must reach the
interface owning that IPv4 and pool. Reviewing the cable endpoint versus the
interface IPv4/pool configuration is the minimal manual next step. No such
repair was applied to real data or added to the application.

## DHCP timing, Pause and runtime reconstruction

`runDhclient()` sends at most three DISCOVER attempts, two simulated seconds
apart. While the Scheduler is paused there are no advancing timeouts, retries
or incoming deliveries. The first DISCOVER log can appear immediately because
command setup sends it before any Scheduler advancement.

The server probes an offered address with up to three ARP probes separated by
500 simulated ms, before sending OFFER. Link latency and address conflicts can
therefore cause legitimate DISCOVER retries. With two 250 ms links between
client and server, the control completed DORA at 3500 simulated ms after two
DISCOVERs. It retained the same transaction, then received OFFER/ACK normally.
VLAN isolation correctly blocked another fixture client. The misconfigured
eth2 AP segment received no Offer after all three attempts; the independent
eth0 LAN obtained its address normally.

Restoration preserves the last DHCP-mode IPv4, gateway and DNS as document
values. It does **not** restore client ownership (`dhcpLease`), in-progress
negotiations, server lease/offer maps, ARP/MAC caches or old scheduled events.
Opening a plan does not automatically run dhclient. Inspector explicitly
distinguishes stored values from an active lease. Server ARP probing prevented
a new client from reusing a restored, responsive client's stored address.

Existing limitation: actual lease expiration/automatic renewal is not simulated;
the Linux output's `renewal in 43200 seconds` does not install a renewal timer.
Do not interpret that text or a stored DHCP address as proof of an active lease.
Clarifying that message or implementing lease lifetime belongs in a separate
change; neither was altered during this audit. Configured services such as RIP
can create fresh timers on activation; the assertion of an empty queue here
applies to this fixture with RIP off.

## Implemented: automatic Run for active terminal commands

The runtime adapter marks restoration pause with `pauseReason: 'activation'`.
Toolbar Pause (the default `setPaused(true)`) marks `'manual'`; Run clears it.
Activation does not overwrite a manual Pause, including on plan switches.
The marker is transient UI state and is not serialized. A fresh F5/startup
creates the usual automatic activation pause again.

Active asynchronous command handles declare `needsScheduler`. The shared
terminal submission path calls one store policy only when a valid command
remains pending and requests that capability. The policy resumes Run only for
activation pause and only for the current live network/device.

Covered commands: Linux/Windows ping, dhclient / ipconfig `/renew`, traceroute /
tracert, dig / nslookup, curl and active nc. Read-only/local commands, invalid
commands and passive `nc -l` do not start Run. Commands that complete immediately
do not start it either. New asynchronous commands should opt in explicitly;
there is no command-name regex, terminal-profile-specific Run policy or queue
length heuristic.

Guided playback is independent. The gate does not change Live/Guided selection,
playback Pause, Step, Replay, animation durations, simulation speed, protocol
timers or Scheduler code. Opening a plan/terminal alone still never starts Run.
No interface, IP, pool, VLAN, cable color or persistence schema was changed by
this integration.

## Reproduction and evidence

```powershell
node node_modules/vitest/vitest.mjs run src/terminals.test.ts src/engine/interfaceIdentityAudit.test.ts src/engine/dhcpPools.test.ts src/engine/dhcpRoutingTrace.test.ts src/persistence/topologyDocument.test.ts src/commands/windows.test.ts src/commands/commands.test.ts
node scripts/test-interface-audit.mjs
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

The browser runner reuses the existing isolation harness and production
`mountWorkspaceApplication()`, including migration and the real xterm input
pipeline. `src/testing/interfaceAuditFixture.ts` constructs only new networks.
Raw evidence, exact before/after configuration, terminal output and two PNGs
are under `.playwright-mcp/reviews/raw/interface-dhcp-audit/`; all artifacts are
ignored by Git. No dependency, commit or push is involved.
