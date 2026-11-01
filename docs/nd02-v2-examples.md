# ND02 v2 — Zehn reproduzierbare Review-Beispiele

Nur Entwicklungs-Preview. Automatische Rezeptauswahl mit den angegebenen Seeds; keine Änderung an v1. Antworten und Rechenweg werden in der UI erst nach gemeinsamer Abgabe sichtbar.

Die zweite Frage beurteilt nur die numerische Eignung eines anderen lokalen Routers, nicht dessen tatsächlichen Betrieb. Alle Beispiele verwenden gewöhnliche IPv4-Broadcast-Subnetze.

Audit: 1.000 Seeds je Schwierigkeit, BigInt-Orakel unabhängig von den produktiven IPv4-Helfern.

| Schwierigkeit | Grenzfälle / 1.000 | Frage 1 Ja/Nein | Frage 2 Ja/Nein | Frage 3 Ja/Nein |
|---|---:|---:|---:|---:|
| Einstieg | 803 | 716/284 | 338/662 | 513/487 |
| Mittel | 804 | 742/258 | 425/575 | 514/486 |
| Fortgeschritten | 797 | 754/246 | 422/578 | 504/496 |

SHA-256 der zehn vollständigen Ergebnisse: `406532d03f451ce812eb61244ef65626dfd50a5e794d16d1a6abf23dc83dc764`.

## 1. Einstieg — before-network

Seed: `nd02-v2-review-1` · ND02 v2 · /24

**Gateway und Subnetz**

- PC: 10.119.72.25/24
- Gateway: 10.119.71.255

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Nein**
   10.119.71.255 liegt außerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Nein**
   Die Gateway-Adresse liegt außerhalb des lokalen Subnetzes.

3. **Ist 10.119.72.254 die Broadcastadresse dieses Subnetzes?** — **Nein**
   Nein: Die Broadcastadresse dieses Subnetzes ist 10.119.72.255.

**Rechenweg:** Maske 255.255.255.0; 256 Adressen. Netzadresse 10.119.72.0; Broadcastadresse 10.119.72.255; Hostbereich 10.119.72.1–10.119.72.254.

## 2. Einstieg — network

Seed: `nd02-v2-review-2` · ND02 v2 · /25

**Gateway und Subnetz**

- PC: 10.115.202.94/25
- Gateway: 10.115.202.0

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.115.202.0 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Nein**
   Die Gateway-Adresse ist die Netzadresse, keine Hostadresse.

3. **Ist 10.115.202.127 die Broadcastadresse dieses Subnetzes?** — **Ja**
   Richtig: Die Broadcastadresse dieses Subnetzes ist 10.115.202.127.

**Rechenweg:** Maske 255.255.255.128; 128 Adressen. Netzadresse 10.115.202.0; Broadcastadresse 10.115.202.127; Hostbereich 10.115.202.1–10.115.202.126.

## 3. Einstieg — first-host

Seed: `nd02-v2-review-29` · ND02 v2 · /26

**Gateway und Subnetz**

- PC: 10.37.177.237/26
- Gateway: 10.37.177.193

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.37.177.193 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Ja**
   Die Adresse liegt im Hostbereich und unterscheidet sich von der PC-IP.

3. **Ist 10.37.177.254 die letzte nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Richtig: Die letzte nutzbare Hostadresse dieses Subnetzes ist 10.37.177.254.

**Rechenweg:** Maske 255.255.255.192; 64 Adressen. Netzadresse 10.37.177.192; Broadcastadresse 10.37.177.255; Hostbereich 10.37.177.193–10.37.177.254.

## 4. Mittel — last-host

Seed: `nd02-v2-review-43` · ND02 v2 · /27

**Gateway und Subnetz**

- PC: 10.69.150.68/27
- Gateway: 10.69.150.94

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.69.150.94 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Ja**
   Die Adresse liegt im Hostbereich und unterscheidet sich von der PC-IP.

3. **Ist 10.69.150.96 die Netzadresse des nächsten gleich großen Subnetzes?** — **Ja**
   Richtig: Die Netzadresse des nächsten gleich großen Subnetzes ist 10.69.150.96.

**Rechenweg:** Maske 255.255.255.224; 32 Adressen. Netzadresse 10.69.150.64; Broadcastadresse 10.69.150.95; Hostbereich 10.69.150.65–10.69.150.94.

## 5. Mittel — broadcast

Seed: `nd02-v2-review-4` · ND02 v2 · /28

**Gateway und Subnetz**

- PC: 10.108.77.138/28
- Gateway: 10.108.77.143

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.108.77.143 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Nein**
   Die Gateway-Adresse ist die Broadcastadresse, keine Hostadresse.

3. **Ist 10.108.77.142 die Broadcastadresse dieses Subnetzes?** — **Nein**
   Nein: Die Broadcastadresse dieses Subnetzes ist 10.108.77.143.

**Rechenweg:** Maske 255.255.255.240; 16 Adressen. Netzadresse 10.108.77.128; Broadcastadresse 10.108.77.143; Hostbereich 10.108.77.129–10.108.77.142.

## 6. Mittel — after-broadcast

Seed: `nd02-v2-review-39` · ND02 v2 · /23

**Gateway und Subnetz**

- PC: 10.77.88.61/23
- Gateway: 10.77.90.0

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Nein**
   10.77.90.0 liegt außerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Nein**
   Die Gateway-Adresse liegt außerhalb des lokalen Subnetzes.

3. **Ist 10.77.88.1 die Netzadresse dieses Subnetzes?** — **Nein**
   Nein: Die Netzadresse dieses Subnetzes ist 10.77.88.0.

**Rechenweg:** Maske 255.255.254.0; 512 Adressen. Netzadresse 10.77.88.0; Broadcastadresse 10.77.89.255; Hostbereich 10.77.88.1–10.77.89.254.

## 7. Mittel — interior

Seed: `nd02-v2-review-116` · ND02 v2 · /24

**Gateway und Subnetz**

- PC: 10.51.34.193/24
- Gateway: 10.51.34.172

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.51.34.172 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Ja**
   Die Adresse liegt im Hostbereich und unterscheidet sich von der PC-IP.

3. **Ist 10.51.34.1 die erste nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Richtig: Die erste nutzbare Hostadresse dieses Subnetzes ist 10.51.34.1.

**Rechenweg:** Maske 255.255.255.0; 256 Adressen. Netzadresse 10.51.34.0; Broadcastadresse 10.51.34.255; Hostbereich 10.51.34.1–10.51.34.254.

## 8. Fortgeschritten — self

Seed: `nd02-v2-review-112` · ND02 v2 · /21

**Gateway und Subnetz**

- PC: 10.136.137.11/21
- Gateway: 10.136.137.11

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.136.137.11 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Nein**
   Die Gateway-Adresse ist bereits die IP des PCs und kann keinen anderen Router bezeichnen.

3. **Ist 10.136.136.0 die Netzadresse dieses Subnetzes?** — **Ja**
   Richtig: Die Netzadresse dieses Subnetzes ist 10.136.136.0.

**Rechenweg:** Maske 255.255.248.0; 2048 Adressen. Netzadresse 10.136.136.0; Broadcastadresse 10.136.143.255; Hostbereich 10.136.136.1–10.136.143.254.

## 9. Fortgeschritten — zero-host

Seed: `nd02-v2-review-10` · ND02 v2 · /22

**Gateway und Subnetz**

- PC: 10.125.49.161/22
- Gateway: 10.125.49.0

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.125.49.0 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Ja**
   Die Adresse liegt im Hostbereich und unterscheidet sich von der PC-IP. Das letzte Oktett allein bestimmt weder Netz noch Broadcast.

3. **Ist 10.125.51.254 die Broadcastadresse dieses Subnetzes?** — **Nein**
   Nein: Die Broadcastadresse dieses Subnetzes ist 10.125.51.255.

**Rechenweg:** Maske 255.255.252.0; 1024 Adressen. Netzadresse 10.125.48.0; Broadcastadresse 10.125.51.255; Hostbereich 10.125.48.1–10.125.51.254.

## 10. Fortgeschritten — 255-host

Seed: `nd02-v2-review-0` · ND02 v2 · /23

**Gateway und Subnetz**

- PC: 10.69.163.42/23
- Gateway: 10.69.162.255

1. **Gehört die Gateway-Adresse zum Subnetz des PCs?** — **Ja**
   10.69.162.255 liegt innerhalb des Blocks; Netz- und Broadcastadresse zählen beim mathematischen Vergleich mit.

2. **Ist sie numerisch als Gateway eines anderen Routers geeignet?** — **Ja**
   Die Adresse liegt im Hostbereich und unterscheidet sich von der PC-IP. Das letzte Oktett allein bestimmt weder Netz noch Broadcast.

3. **Ist 10.69.162.1 die Netzadresse dieses Subnetzes?** — **Nein**
   Nein: Die Netzadresse dieses Subnetzes ist 10.69.162.0.

**Rechenweg:** Maske 255.255.254.0; 512 Adressen. Netzadresse 10.69.162.0; Broadcastadresse 10.69.163.255; Hostbereich 10.69.162.1–10.69.163.254.
