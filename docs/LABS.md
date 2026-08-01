# Bundled labs & example networks

Everything here loads from the **Labs ▾** menu in the toolbar. Labs are
guided and auto-graded; examples are just starting topologies to explore or
critique. Loading any of them replaces the current canvas (your work
autosaves, but export first if you want to keep it).

## Labs (guided, auto-graded)

Each lab has step-by-step instructions, objectives the app checks by sending
real packets, and short quizzes. Work through the steps, click **Check
objectives**, and export your attempt for submission when done.

### Lab 1 — Static addressing & ARP
Two hosts on a switch. Assign IPv4 addresses by hand, get them pinging, and
watch ARP resolve MAC addresses on the wire. Teaches: `ip addr`, subnets,
ARP, why the first ping is slow. *2 steps.*

### Lab 2 — Routing between networks
Two subnets joined by a router. Configure the router's interfaces and add
default routes on the hosts, then trace a packet across. Teaches: gateways,
`ip route`, default routes, TTL decrement, `traceroute`. *2 steps.*

### Lab 3 — Build a stateful firewall
A LAN, a firewall, and a host playing "the internet". Confirm the network is
wide open, switch to default-deny, then add a conntrack ruleset that lets the
LAN out and keeps the internet out. Teaches: `iptables`/`nft`, chain
policies, `ct state`, DROP vs REJECT, reading the firewall log. *3 steps.*

### Lab 4 — DHCP, DNS & the web
A blank machine plus DHCP, DNS and web servers. Run `dhclient`, watch the
four-packet exchange, then resolve a name and fetch a page. Teaches: DHCP
DORA, `dig`, `curl`, how the pieces chain together. *2 steps.*

### Lab 5 — Harden a vulnerable network
You inherit an open perimeter: the internet can ping the LAN and reach SSH.
Audit the exposure (objectives that confirm the holes), then write a ruleset
that keeps the public web server reachable, lets staff out, and silently
drops everything else. Teaches: threat modelling, least privilege,
`filtered` vs `refused`, business-constrained hardening. *2 steps.*

## Example networks (explore / critique)

Not graded — load them to read a design, run commands against it, or use as a
base for your own scenario.

### Segmented network (good practice)
LAN and a DMZ behind a stateful firewall: masquerade outbound, and only
tcp/80 published inbound via DNAT to the DMZ web server. A worked example of
the patterns Labs 3 and 5 build toward. Open `fw1` to read the ruleset; try
reaching the LAN from `inet1` (you can't) versus the web server (you can).

### Flat open network (what not to do)
One segment, server sitting beside the workstations, telnet and SSH exposed,
a router with no rules — the internet can reach everything. Good for a
"find every problem" critique, or as the raw material for a hardening
exercise of your own (it is close to Lab 5's starting point).

## Writing your own

See [LAB_AUTHORING.md](LAB_AUTHORING.md). The short version: build a topology
in the app, **Export → Topology (.json)**, add a `"lab"` block, and import it
back to test.
