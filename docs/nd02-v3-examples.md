# ND02 v3 — Review und reproduzierbare Beispiele

Nur Entwicklungs-Preview. Die neue Standardversion fragt nach Zugehörigkeit, nutzbarem Hostbereich und der vollständigen Subnetzmaske. Keine Aussagen über Routerbetrieb oder Konnektivität. Der Kandidat ist nie die eigene PC-IP. v1/v2 bleiben unverändert wählbar.

Das Maskenfeld startet mit `255.255.`. Erst drei vollständig eingegebene Antworten erlauben die gemeinsame Korrektur; ungültige/unvollständige Oktette verraten keine Lösung. Vollständige falsche Masken (auch nicht zusammenhängende) werden als falsch bewertet. Bearbeiten verwirft das gesamte Feedback.

Audit: 1.000 Seeds je Schwierigkeit mit unabhängigem BigInt-Orakel.

| Schwierigkeit | Grenzfälle / 1.000 | Zugehörigkeit Ja/Nein | Hostadresse Ja/Nein |
|---|---:|---:|---:|
| Einstieg | 817 | 715/285 | 441/559 |
| Mittel | 805 | 738/262 | 455/545 |
| Fortgeschritten | 802 | 738/262 | 440/560 |

SHA-256 der neun vollständigen Beispiele: `4c421e005543d0362614f101556aab29f6c028fa2856199982a96af8e42d192c`.

## 1. Einstieg — before-network

Seed: `nd02-v3-review-5` · ND02 v3 · /24

**Gateway und Subnetz**

- PC: 10.46.225.102/24
- Gateway: 10.46.224.255

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Nein**
   10.46.224.255 liegt außerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Nein**
   Die Gateway-Adresse liegt außerhalb dieses Subnetzes.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.255.0**
   /24 bedeutet 24 gesetzte Netzbits: 8 + 8 + 8 + 0 Bits in den vier Oktetten. Daraus folgt 255.255.255.0.

**Rechenweg:** Maske 255.255.255.0; 256 Adressen. Netzadresse 10.46.225.0; Broadcastadresse 10.46.225.255; Hostbereich 10.46.225.1–10.46.225.254.

## 2. Einstieg — network

Seed: `nd02-v3-review-38` · ND02 v3 · /25

**Gateway und Subnetz**

- PC: 10.61.101.194/25
- Gateway: 10.61.101.128

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.61.101.128 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Nein**
   Die Gateway-Adresse ist die Netzadresse, keine nutzbare Hostadresse.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.255.128**
   /25 bedeutet 25 gesetzte Netzbits: 8 + 8 + 8 + 1 Bits in den vier Oktetten. Daraus folgt 255.255.255.128.

**Rechenweg:** Maske 255.255.255.128; 128 Adressen. Netzadresse 10.61.101.128; Broadcastadresse 10.61.101.255; Hostbereich 10.61.101.129–10.61.101.254.

## 3. Einstieg — first-host

Seed: `nd02-v3-review-10` · ND02 v3 · /26

**Gateway und Subnetz**

- PC: 10.56.94.35/26
- Gateway: 10.56.94.1

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.56.94.1 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Die Gateway-Adresse liegt im nutzbaren Hostbereich.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.255.192**
   /26 bedeutet 26 gesetzte Netzbits: 8 + 8 + 8 + 2 Bits in den vier Oktetten. Daraus folgt 255.255.255.192.

**Rechenweg:** Maske 255.255.255.192; 64 Adressen. Netzadresse 10.56.94.0; Broadcastadresse 10.56.94.63; Hostbereich 10.56.94.1–10.56.94.62.

## 4. Mittel — last-host

Seed: `nd02-v3-review-18` · ND02 v3 · /27

**Gateway und Subnetz**

- PC: 10.80.226.17/27
- Gateway: 10.80.226.30

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.80.226.30 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Die Gateway-Adresse liegt im nutzbaren Hostbereich.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.255.224**
   /27 bedeutet 27 gesetzte Netzbits: 8 + 8 + 8 + 3 Bits in den vier Oktetten. Daraus folgt 255.255.255.224.

**Rechenweg:** Maske 255.255.255.224; 32 Adressen. Netzadresse 10.80.226.0; Broadcastadresse 10.80.226.31; Hostbereich 10.80.226.1–10.80.226.30.

## 5. Mittel — broadcast

Seed: `nd02-v3-review-41` · ND02 v3 · /28

**Gateway und Subnetz**

- PC: 10.80.93.187/28
- Gateway: 10.80.93.191

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.80.93.191 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Nein**
   Die Gateway-Adresse ist die Broadcastadresse, keine nutzbare Hostadresse.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.255.240**
   /28 bedeutet 28 gesetzte Netzbits: 8 + 8 + 8 + 4 Bits in den vier Oktetten. Daraus folgt 255.255.255.240.

**Rechenweg:** Maske 255.255.255.240; 16 Adressen. Netzadresse 10.80.93.176; Broadcastadresse 10.80.93.191; Hostbereich 10.80.93.177–10.80.93.190.

## 6. Mittel — after-broadcast

Seed: `nd02-v3-review-5` · ND02 v3 · /23

**Gateway und Subnetz**

- PC: 10.85.203.81/23
- Gateway: 10.85.204.0

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Nein**
   10.85.204.0 liegt außerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Nein**
   Die Gateway-Adresse liegt außerhalb dieses Subnetzes.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.254.0**
   /23 bedeutet 23 gesetzte Netzbits: 8 + 8 + 7 + 0 Bits in den vier Oktetten. Daraus folgt 255.255.254.0.

**Rechenweg:** Maske 255.255.254.0; 512 Adressen. Netzadresse 10.85.202.0; Broadcastadresse 10.85.203.255; Hostbereich 10.85.202.1–10.85.203.254.

## 7. Fortgeschritten — interior

Seed: `nd02-v3-review-5` · ND02 v3 · /21

**Gateway und Subnetz**

- PC: 10.77.188.184/21
- Gateway: 10.77.190.237

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.77.190.237 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Die Gateway-Adresse liegt im nutzbaren Hostbereich.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.248.0**
   /21 bedeutet 21 gesetzte Netzbits: 8 + 8 + 5 + 0 Bits in den vier Oktetten. Daraus folgt 255.255.248.0.

**Rechenweg:** Maske 255.255.248.0; 2048 Adressen. Netzadresse 10.77.184.0; Broadcastadresse 10.77.191.255; Hostbereich 10.77.184.1–10.77.191.254.

## 8. Fortgeschritten — zero-host

Seed: `nd02-v3-review-7` · ND02 v3 · /22

**Gateway und Subnetz**

- PC: 10.59.223.25/22
- Gateway: 10.59.221.0

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.59.221.0 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Die Gateway-Adresse liegt im nutzbaren Hostbereich. .0 oder .255 allein bestimmen nicht die Rolle einer IPv4-Adresse.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.252.0**
   /22 bedeutet 22 gesetzte Netzbits: 8 + 8 + 6 + 0 Bits in den vier Oktetten. Daraus folgt 255.255.252.0.

**Rechenweg:** Maske 255.255.252.0; 1024 Adressen. Netzadresse 10.59.220.0; Broadcastadresse 10.59.223.255; Hostbereich 10.59.220.1–10.59.223.254.

## 9. Fortgeschritten — 255-host

Seed: `nd02-v3-review-27` · ND02 v3 · /23

**Gateway und Subnetz**

- PC: 10.158.71.102/23
- Gateway: 10.158.70.255

1. **Liegt die Gateway-Adresse rechnerisch im Subnetz des PCs?** — **Ja**
   10.158.70.255 liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.

2. **Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?** — **Ja**
   Die Gateway-Adresse liegt im nutzbaren Hostbereich. .0 oder .255 allein bestimmen nicht die Rolle einer IPv4-Adresse.

3. **Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?** — **255.255.254.0**
   /23 bedeutet 23 gesetzte Netzbits: 8 + 8 + 7 + 0 Bits in den vier Oktetten. Daraus folgt 255.255.254.0.

**Rechenweg:** Maske 255.255.254.0; 512 Adressen. Netzadresse 10.158.70.0; Broadcastadresse 10.158.71.255; Hostbereich 10.158.70.1–10.158.71.254.
