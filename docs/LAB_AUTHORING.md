# Authoring labs for NetSim

A NetSim lab is a single JSON file: a starting topology plus a set of guided
steps whose objectives the app grades automatically by probing the live
simulation with real packets. This guide shows how to write one — no code,
no build step, and nothing to install for you or your students.

There are two ways to author, and most people use both:

1. **Build the topology in the app**, export it, then hand-edit the JSON to
   add the lab steps. This is the fast path — you get cabling and addressing
   right visually, then only write prose and objectives by hand.
2. **Write the whole file by hand** from the schema below, using the bundled
   labs (`src/labs/library.ts`) as worked examples.

## Quick start (recommended path)

1. Open NetSim, build the *starting* state you want students to begin from
   (leave unconfigured whatever they must configure).
2. **Export ▾ → Topology (.json)**. Open the downloaded file in any editor.
3. Add a top-level `"lab"` object (schema below) alongside `devices` and
   `links`.
4. Load it back with **Import** to test. Work the lab as a student would and
   click **Check objectives** — every objective you wrote should go green
   exactly when it should. Iterate.
5. Distribute the file: hand it out on the LMS, or load it and use
   **Share link** to get a URL with the whole lab encoded in it.

## File shape

```jsonc
{
  "app": "netsim",
  "version": 1,
  "devices": [ /* ...the starting topology... */ ],
  "links":   [ /* ...cabling... */ ],
  "lab": {
    "id": "my-lab",             // unique short slug
    "title": "Lab 6 — My topic",
    "blurb": "One line shown in the Labs menu.",
    "steps": [ /* one or more steps */ ]
  }
}
```

A **step** is:

```jsonc
{
  "title": "Assign addresses",
  "body": "Instructions. Wrap commands in `backticks` to render them as code.\nUse \\n for line breaks.",
  "objectives": [ /* machine-checked; see below */ ],
  "quiz": [ /* optional multiple-choice questions */ ]
}
```

An **objective** has a stable `id`, a student-facing `label`, and a `check`
the grader runs:

```jsonc
{ "id": "l6-ip", "label": "pc1 has an address in 192.168.1.0/24",
  "check": { "type": "iface-ip", "device": "pc1", "iface": "eth0", "inSubnet": "192.168.1.0/24" } }
```

A **quiz question**:

```jsonc
{ "q": "Which protocol resolves an IP to a MAC?",
  "options": ["DHCP", "ARP", "DNS", "ICMP"], "answer": 1 }   // answer is a 0-based index
```

## Check types

Checks are either **passive** (read device state) or **active** (send real
packets and watch the result — students see the grader's traffic animate).
Targets are named by `device` (uses that device's first addressed interface)
or by literal `toAddr` / address fields.

| `type` | Fields | Passes when |
|---|---|---|
| `iface-ip` | `device`, `iface`, one of `cidr` / `inSubnet` | interface has that exact address / an address in that subnet |
| `default-route` | `device`, optional `via` | a default route exists (via that gateway) |
| `forwarding` | `device`, `expect` (bool) | `net.ipv4.ip_forward` matches |
| `fw-policy` | `device`, `hook` (input/forward/output), `policy` (accept/drop) | that chain's policy matches |
| `ping` | `from`, `toDevice`/`toAddr`, `expect` (success/fail) | an ICMP echo does / doesn't get a reply |
| `tcp` | `from`, `toDevice`/`toAddr`, `port`, `expect` (open/refused/filtered) | a TCP connect gets SYN-ACK / RST / nothing |
| `dns` | `from`, `name`, `expect` (resolves/nxdomain), optional `addr` | the client's resolver returns / doesn't |
| `http` | `from`, `url`, `expect` (ok/fail), optional `contains` | an HTTP GET succeeds (and body contains text) |

The full TypeScript definition lives in `src/labs/types.ts` if you want the
authoritative list.

### Design tips for objectives

- **Prove the problem before fixing it.** In security labs, write step-1
  objectives that *pass* while the vulnerability exists (`expect: success` on
  an attack), so students confirm exposure before they harden. Lab 5
  (`harden-network`) and Lab 3 (`stateful-firewall`) both do this.
- **Use `filtered` vs `refused` deliberately.** `filtered` (silent drop) and
  `refused` (RST / ICMP port-unreachable) are different security outcomes —
  a good firewall lab checks for `filtered`.
- **Keep `id`s stable.** They key the student's saved progress and their
  exported attempt. Renaming an id resets that objective for everyone.
- **Order active checks by the story you want on the canvas.** The grader
  runs objectives in order, one probe at a time, so the animation reads as a
  narrative.

## Collecting and marking attempts

Students click **Export attempt for submission** in the lab panel. The file
they submit is a normal topology JSON with two extra keys: `labProgress`
(their step, per-objective pass/fail, and quiz answers) and the same `lab`
definition. To mark, **Import** the file — you land in their exact network at
their last step, and can re-run **Check objectives** yourself. The results in
the file reflect the moment they exported; re-checking regrades against the
submitted topology.

> Attempt files are plain JSON and trivially editable, so treat auto-grading
> as formative feedback, not a proctored exam.

## Contributing a lab to the bundled set

To ship a lab with NetSim itself (so it appears in the Labs menu for
everyone), add it to `src/labs/library.ts` following the existing pattern and
open a pull request. Please include a matching test in `src/labs/labs.test.ts`
that grades the lab in both its unsolved and solved states — that is how we
keep every bundled lab guaranteed-solvable. See
[CONTRIBUTING.md](../CONTRIBUTING.md).
