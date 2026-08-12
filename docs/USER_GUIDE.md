# NetSim user guide

NetSim is a network simulator that runs entirely in your browser. Build a
network by dragging devices onto the canvas and cabling them together, open a
terminal on any device and configure it with **real Linux commands**, and
watch packets travel between them. Nothing to install; nothing is sent to a
server.

Live app: <https://netsim.borck.education/>

> In-app, the `help` command in any terminal lists the supported commands.
> This guide is the bigger picture: the interface, the workflow, and what the
> tool does and doesn't simulate.

## The interface

- **Toolbar** (top): New, Demo, Labs ▾ (labs + example networks), Import,
  Export ▾, Share link, Help; on the right, the simulation clock with
  Pause and a speed selector.
- **Device palette** (left): drag Host, Server, Switch, Router, Firewall or
  Wi-Fi AP onto the canvas — or click to drop one in.
- **Canvas** (centre): your network. Drag between the dots on two devices to
  cable them. Packets animate along the links, colour-coded by protocol
  (amber ARP, blue ICMP, green TCP, purple UDP); a red ring flashes where a
  firewall drops a packet.
- **Inspector** (right, when a device is selected): rename, interfaces and
  addresses, routing/ARP/MAC/conntrack tables, firewall ruleset and log, and
  service editors (DHCP/DNS/web, VLANs, SSID, RIP).
- **Terminal dock** (bottom): double-click a host/router/server/firewall to
  open its terminal. Multiple terminals live in tabs.

## Building a network

1. Drag devices out, or click **Demo** for a ready-made one.
2. Cable them: drag from a dot on one device to a dot on another.
3. Give them addresses — either in the Inspector's interface fields, or in a
   terminal with `ip addr add 192.168.1.10/24 dev eth0`. Both run the same
   engine code.
4. Add routes (`ip route add default via ...`), turn on services, write
   firewall rules — then test with `ping`, `traceroute`, `nc`, `dig`, `curl`.

Hosts have one interface; routers and firewalls have four; switches and APs
have eight ports. A firewall is a router that already has nftables base
chains declared.

## Commands (the supported subset)

NetSim implements a **curated subset of genuine syntax** and errors clearly
on anything outside it — it never silently fakes a command. Highlights:

- **Addressing / routing:** `ip addr`, `ip link`, `ip route`, `ip neigh`,
  `arp`, `sysctl net.ipv4.ip_forward`
- **Reachability:** `ping`, `traceroute`
- **Firewall:** `nft ...` and `iptables ...` — two front-ends onto one
  ruleset, so a rule added with either shows up in both `nft list ruleset`
  and `iptables -S`. Plus `conntrack -L`, `ss`.
- **Services:** `dhclient` (DHCP), `dig` (DNS), `curl` (HTTP), `nc` (port
  testing and listeners)

Run `help` in any terminal for the exact list, and see
[the design doc](DESIGN.md) for the deliberate scope boundaries (IPv4 filter
+ NAT, RIP for dynamic routing, etc.).

## Labs and examples

The **Labs ▾** menu holds guided, auto-graded labs and a couple of example
networks to explore. See [LABS.md](LABS.md) for the catalogue. In a lab, the
panel on the canvas gives you steps, objectives (click **Check objectives**
to grade — you'll see the grader's probe packets), quizzes, and **Export
attempt for submission**.

## Saving, sharing, exporting

- **Autosave:** your work is saved in the browser automatically.
- **Import / Export → Topology (.json):** save a network to a file or hand
  one out.
- **Share link:** copies a URL with the whole topology encoded in it — good
  for handing a scenario to students, no file needed.
- **Export ▾** also produces: a **device config bundle** (real `setup.sh`,
  `nftables.conf`, `dnsmasq.conf` per device), **containerlab** and
  **docker-compose** files to run the design for real, **SVG/PNG** diagrams,
  and a printable **HTML report**.

## What NetSim does and doesn't simulate

It **does**: L2 switching with VLANs, ARP, IPv4 routing (static + RIP), ICMP,
a TCP handshake, UDP, DHCP, DNS (A records), HTTP, stateful firewalling with
NAT, and connection tracking — all as discrete packet events you can watch
and step through.

It **doesn't** (by design, for now): IPv6, OSPF/BGP, 802.1Q trunking, TLS,
real application payloads, or performance/bandwidth modelling. It is a
teaching and design tool, not a packet-accurate emulator — for that, use the
containerlab export and run the design on real kernels.

## Troubleshooting

- **A command is rejected as unsupported.** That's deliberate — check `help`
  for the supported form. NetSim won't pretend to run syntax it doesn't model.
- **A ping/curl hangs then times out.** Something is dropping it silently —
  check routes (`ip route`), the default gateway, and any firewall in the
  path (open its Inspector; the firewall log names the rule that dropped it).
- **DHCP finds no server / DNS won't resolve.** Confirm the server has the
  service enabled (Inspector) and that no firewall is dropping udp/67 or
  udp/53 between client and server.
- **The canvas is empty on load / something looks stuck.** Use **New** for a
  clean slate or **Demo** for a known-good network; both reset cleanly.
