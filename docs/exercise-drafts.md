# Independent exercise drafts / Übungsentwürfe

This is the **authoring source** for five German-language
FiSI-oriented proposals live in `src/exercises/drafts.ts`. They are not official IHK
questions and have not undergone external educational review. All remain `draft`.
The independent [Übungen Beta MVP](exercises-beta.md) exposes only routing and DNS/HTTP
through generated student/check projections. The other three remain internal drafts.
Existing Labs, IndexedDB schema, autosave and simulation code are unchanged.
Nothing imports this full collection into the running app. Reference solutions are author
material, not secret data; a future student UI must receive only `student`, never `review`.

## Existing resources reused

- `engine/factory.ts`: real device/interface defaults and unique MACs within each topology.
  Complete interface lists are serialized, including the eight initial switch ports.
- `engine/serialize.ts`, `validateSave.ts`: ordinary v1 topology documents, restoration
  and endpoint/media/occupied-port validation. No independent topology schema or database.
- `engine/dhcpPools.ts`: pool/subnet/gateway/conflict validation.
- `labs/types.ts`: existing `Check` union, imported as a type.
- `labs/checker.ts`: unmodified `runChecks` for IPv4, default routes, forwarding,
  firewall policy, ping, TCP, DNS and HTTP. Probes use real simulated traffic/time.
- `commands/shell.ts`: reference DHCP acquisition and firewall rule commands in tests.

The engine also provides WLAN bridging/association, interface DHCP pools, VLAN/MAC
learning and static routing, so later exercises can use these without new protocols.
Existing checkers do **not** directly prove WLAN association, VLAN isolation, DHCP
origin, MAC-table contents or arbitrary firewall-rule correctness. Such objectives
need an explicit manual criterion or a separately designed and tested verifier.

## Five proposals and actual coverage

| ID | Situation | Existing final-state probes | Remaining human criteria |
| --- | --- | --- | --- |
| `fisi-workshop-ipv4` | Two workshop clients join a fixed archive server in a /27 | Subnet/prefix, fixed server IP, six directional pings | Unique, non-reserved host addresses |
| `fisi-office-warehouse-routing` | /26 office and /27 warehouse; missing return routes and forwarding | Four fixed addresses, forwarding, two directional pings | None for the explicitly listed final requirements |
| `fisi-guest-dhcp-client` | Unconfigured service client; existing .10–.20 pool, gateway and DNS | Subnet, default gateway, ping and DNS | DHCP mode/lease/pool provenance, exact range/DNS, unchanged server config, historical DORA |
| `fisi-service-portal` | Wrong DNS record and disabled HTTP on port 8080 | Fixed addresses, DNS answer and HTTP content by hostname | None for the explicitly listed final requirements |
| `fisi-visitor-firewall` | Permit visitor HTTP only across a dedicated firewall | DROP policy, positive HTTP control, blocked TCP/22, TCP/2345 and ICMP | Rule scope/completeness, unchanged topology/listeners, historical pre-hardening success |

Routing and DNS/HTTP have automated coverage of their explicit final requirements
**within this simplified engine**, not an exhaustive proof for all possible networks.
The other three must not be marked fully approved from green automated probes alone.
Every exercise still requires human review before publication.

These differ from the current Labs: constrained /27 host selection, asymmetric
prefixes and alternative routes, standalone DHCP provenance, DNS/HTTP fault diagnosis
with a separate DNS server and nonstandard port, and a narrowly scoped visitor policy.

## Contract and assessment rules

`types.ts` defines stable IDs, positive `contentVersion`, category/difficulty and:

- `student`: title, description, learning objectives, initial topology, task,
  mandatory requirements. Requirements reference learning-objective IDs and declare
  `final` or `historical` evidence.
- `review`: assessments mapped to requirements, target reference topology plus
  optional runtime commands, alternative valid approaches, rejection cases and limitations.
- An `engine` assessment is exactly an existing `Check`; a `manual` assessment must
  explain both the review procedure and why automatic proof is unavailable.

Exercise checks require **`resolveBy: 'id'`**: `device`, `from` and `toDevice` always
contain stable internal device IDs. Topology endpoints and reference commands also
use device IDs. Editable display names can be translated, contain Unicode or be shared
by different devices without changing assessment identity. A missing ID fails; another
device with that display name never substitutes for it. Existing Labs omit `resolveBy`
and retain their legacy name lookup (`resolveBy: 'name'` is also supported explicitly).
DNS names, HTTP URLs and literal IP addresses retain their existing protocol meaning.
Interface names always refer to actual interfaces; visual canvas handles are not ports.

The reference topology describes one possible permanent target configuration; it is
not a list of required student actions. Tests restore it in isolation, then run any
listed commands. DHCP leases are acquired with `dhclient`, not fabricated in JSON.
Firewall rules are installed through the existing shell. Alternative command syntax,
Inspector configuration and functionally equivalent routing are allowed where stated.

Historical success is not a final-state check. For example, TCP/22 must be reachable
**before** hardening, then filtered afterwards. A future manual validation request
must evaluate those separately. This prototype does not store evidence or progress,
run continuous completion detection, or implement a public pass/fail controller.

## Development validation

From the repository root (use `node`; no new dependency or npm script needed):

```powershell
node scripts/validate-exercise-drafts.mjs
node node_modules/vitest/vitest.mjs run src/exercises/drafts.test.ts src/labs/labs.test.ts src/commands/services.test.ts src/commands/firewall.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
git diff --check
```

The validator checks collection/child IDs, required fields and enums, objective and
requirement references, existing checker types/arguments, IPv4/CIDR/network notation,
real device/interface/link references, complete port lists, route/VLAN/pool interfaces,
DHCP pool eligibility and restoration compatibility. Both initial and reference
topologies are checked. It accepts `unknown` and can validate parsed JSON in a future
import/generation pipeline. Error messages identify a draft and failing field.

It does **not** execute shell commands, prove reachability, validate educational
quality, guarantee global address uniqueness or prove universal firewall safety.
Partial initial configurations intentionally need not be reachable. Intentionally
malformed structures or invalid pools are rejected by this first authoring format;
future fault-injection exercises need an explicit, reviewed extension.

Tests separately execute the reference solutions on fresh networks, ensure initial
states do not already satisfy all final probes, exercise serializer round trips,
alternative addresses/routes and known incorrect configurations. All temporary
networks are disposed. No user's topology, browser storage, backup or stash is used.

Important checker limitations demonstrated by tests:

- A static client with the same address/route/DNS can pass the generic DHCP exercise
  probes. The mandatory manual lease/DORA checks cannot be skipped.
- Ping failure/TCP `filtered` can also mean no route, missing link or host down.
  The firewall exercise includes successful HTTP as a positive control, but still
  requires review of listeners and the ruleset. No heuristic claims to prove filtering.
- `iface-ip` subnet checks do not prove unique or usable host addresses.
- DHCP lease expiration/automatic renewal is not a supported learning objective yet.
- Active probes mutate temporary runtime caches and advance simulated time. Never
  run reference solutions on a student's active network to grade an attempt.

## Adding a sixth draft

1. Add a typed `ExerciseDraft` in `drafts.ts` (or a separate authoring file imported
   there); choose a unique `fisi-...` slug and `contentVersion: 1`, `status: 'draft'`.
2. Build a complete v1 initial topology with the existing factory/serializer. Describe
   its starting faults/configuration precisely. Do not attach `lab`/`labProgress`.
3. Add learner objectives and mandatory requirements with stable IDs and evidence scope.
4. Map every requirement to actual existing engine checks or an explicit manual review.
   Check arguments must reference real IP-capable device IDs/interfaces in both
   topologies and explicitly use `resolveBy: 'id'`.
5. Supply a target configuration, necessary runtime commands, justified alternatives,
   rejection cases and limitations. Do not require matching the reference command order.
6. Add it to `EXERCISE_DRAFTS`, update the intentional count assertion in the test,
   and add scenario-specific positive/negative/alternative regression cases. Run the
   validator and tests. Increment contentVersion for subsequent semantic changes.

## Future pipeline

AI proposal → structured document → structural/engine validation → isolated reference
simulation and counterexamples → technical and pedagogical human review → explicit
publication of a versioned learner projection.

The Beta UI now reuses the contract and existing checkers, without changing the Labs
catalog, and checks only on an explicit student action. It stores minimal local progress
in existing CAS metadata. Evidence storage, manual review workflow, game/DAA integration,
API generation and a general publication workflow remain future work. There is no
authentication, currency or backend.
