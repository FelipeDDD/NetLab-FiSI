# Interner Netzwerk-Katalog — 32 Entwürfe

Generiert mit `node scripts/validate-network-factory.mjs --catalog`. Quelle: `src/exercises/factory/`. Nicht veröffentlicht, keine offiziellen IHK-Aufgaben. Lösungen sind nur für Autoren/Review bestimmt.

Rechenaufgaben: reine strukturierte Korrektur ohne UI. Praktische Aufgaben: existierender Engine-Vertrag, zusätzlich genannte manuelle Grenzen beachten. Eine Prüfung des Diagnosewegs wird nicht behauptet.

## factory-a01-service-netz — Servicebüro: Grenzen eines /26-Netzes

Gruppe A · beginner · subnetting · Version 1 · draft

Ein Service-PC hat 192.168.14.77/26. Die Dokumentation enthält nur diese Adresse; der neue Adressplan darf nicht vom letzten Oktett allein auf ein /24 schließen.

**Auftrag**

Berechnen Sie Netzadresse, Broadcast, Präfix, Dezimalmaske, ersten/letzten nutzbaren Host sowie Gesamtzahl der Adressen und nutzbaren Hosts. Es gelten normale IPv4-Broadcast-Subnetze; Netz- und Broadcastadresse sind nicht als Host nutzbar.

**Lernziele**

- Die /26-Netzgrenzen bestimmen.
- Adressanzahl und nutzbare Hosts unterscheiden.

**Pflichtanforderungen**

- r1: Die /26-Netzgrenzen bestimmen.
- r2: Adressanzahl und nutzbare Hosts unterscheiden.

**Ausgangsdaten**

```json
{
  "family": "subnet",
  "ip": "192.168.14.77",
  "prefix": 26
}
```

**Referenzantwort**

```json
{
  "network": "192.168.14.64",
  "broadcast": "192.168.14.127",
  "prefix": 26,
  "mask": "255.255.255.192",
  "first": "192.168.14.65",
  "last": "192.168.14.126",
  "addresses": 64,
  "hosts": 62
}
```

**Erklärung**

64er-Blöcke beginnen bei .0, .64, .128 und .192. .77 liegt im Block .64–.127; nutzbar sind .65–.126. 64 Adressen ergeben 62 Hosts, Maske 255.255.255.192.

**Zulässige Alternativen**

- Binäres AND oder Blockgrößenrechnung sind gleichwertig. Der Rechenweg ist frei; die fachlichen Ergebnisse bleiben eindeutig.

**Falsche Antworten / Ablehnung**

- 192.168.14.0 als Netzadresse: fälschlich /24 angenommen.
- 64 Hosts: Netz und Broadcast mitgezählt.

**Typische Fehler**

- Vermeiden: 192.168.14.0 als Netzadresse: fälschlich /24 angenommen.
- Vermeiden: 64 Hosts: Netz und Broadcast mitgezählt.

**Korrekturzuordnung**

- math-1 → r1: Die /26-Netzgrenzen bestimmen.
- math-2 → r2: Adressanzahl und nutzbare Hosts unterscheiden.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-a02-werkstatt-hostbereich — Werkstatt: DHCP-Bereich vorprüfen

Gruppe A · beginner · subnetting · Version 1 · draft

Der Controller einer Werkstatt verwendet 172.20.5.94/27. Vor dem Einrichten von DHCP müssen die Grenzen des gesamten nutzbaren Hostbereichs bekannt sein; keine DHCP-Konfiguration ist abzugeben.

**Auftrag**

Berechnen Sie Netzadresse, Broadcast, Präfix, Dezimalmaske, ersten/letzten nutzbaren Host sowie Gesamtzahl der Adressen und nutzbaren Hosts. Es gelten normale IPv4-Broadcast-Subnetze; Netz- und Broadcastadresse sind nicht als Host nutzbar.

**Lernziele**

- Ersten und letzten Host aus dem Netz ableiten.
- Broadcast am Blockende erkennen.

**Pflichtanforderungen**

- r1: Ersten und letzten Host aus dem Netz ableiten.
- r2: Broadcast am Blockende erkennen.

**Ausgangsdaten**

```json
{
  "family": "subnet",
  "ip": "172.20.5.94",
  "prefix": 27
}
```

**Referenzantwort**

```json
{
  "network": "172.20.5.64",
  "broadcast": "172.20.5.95",
  "prefix": 27,
  "mask": "255.255.255.224",
  "first": "172.20.5.65",
  "last": "172.20.5.94",
  "addresses": 32,
  "hosts": 30
}
```

**Erklärung**

Der 32er-Block reicht von .64 bis .95. .94 ist bereits der letzte nutzbare Host, nicht der Broadcast. Hostbereich .65–.94, 30 Hosts, Maske 255.255.255.224.

**Zulässige Alternativen**

- Eine Adresse im oberen Bereich ändert die Grenzen des zugehörigen Netzes nicht. Der Rechenweg ist frei; die fachlichen Ergebnisse bleiben eindeutig.

**Falsche Antworten / Ablehnung**

- .95 als letzter Host: Broadcast zugewiesen.
- .94 als Broadcast: letzten Host ausgeschlossen.

**Typische Fehler**

- Vermeiden: .95 als letzter Host: Broadcast zugewiesen.
- Vermeiden: .94 als Broadcast: letzten Host ausgeschlossen.

**Korrekturzuordnung**

- math-1 → r1: Ersten und letzten Host aus dem Netz ableiten.
- math-2 → r2: Broadcast am Blockende erkennen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-a03-sensor-maske — Sensorzelle: Dezimalmaske übersetzen

Gruppe A · intermediate · subnetting · Version 1 · draft

Ein Wartungsblatt nennt 10.44.8.174 mit Maske 255.255.255.240, aber keinen CIDR-Präfix. Leiten Sie den Präfix aus den Maskenbits her und vervollständigen Sie den Adressplan.

**Auftrag**

Berechnen Sie Netzadresse, Broadcast, Präfix, Dezimalmaske, ersten/letzten nutzbaren Host sowie Gesamtzahl der Adressen und nutzbaren Hosts. Es gelten normale IPv4-Broadcast-Subnetze; Netz- und Broadcastadresse sind nicht als Host nutzbar.

**Lernziele**

- Maske und CIDR korrekt ineinander übersetzen.
- Grenzen eines 16er-Blocks bestimmen.

**Pflichtanforderungen**

- r1: Maske und CIDR korrekt ineinander übersetzen.
- r2: Grenzen eines 16er-Blocks bestimmen.

**Ausgangsdaten**

```json
{
  "family": "subnet",
  "ip": "10.44.8.174",
  "givenMask": "255.255.255.240"
}
```

**Referenzantwort**

```json
{
  "network": "10.44.8.160",
  "broadcast": "10.44.8.175",
  "prefix": 28,
  "mask": "255.255.255.240",
  "first": "10.44.8.161",
  "last": "10.44.8.174",
  "addresses": 16,
  "hosts": 14
}
```

**Erklärung**

240 entspricht 11110000: vier zusätzliche Netzbits nach /24 ergeben /28. Netz .160, Broadcast .175, Hosts .161–.174, 16 Adressen und 14 nutzbare Hosts.

**Zulässige Alternativen**

- Bitzählung und Tabelle zusammenhängender Masken führen zum selben Präfix. Der Rechenweg ist frei; die fachlichen Ergebnisse bleiben eindeutig.

**Falsche Antworten / Ablehnung**

- /27: ein Maskenbit zu wenig.
- .174–.189 als Bereich: nicht an einer 16er-Grenze begonnen.

**Typische Fehler**

- Vermeiden: /27: ein Maskenbit zu wenig.
- Vermeiden: .174–.189 als Bereich: nicht an einer 16er-Grenze begonnen.

**Korrekturzuordnung**

- math-1 → r1: Maske und CIDR korrekt ineinander übersetzen.
- math-2 → r2: Grenzen eines 16er-Blocks bestimmen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-a04-kassen-kapazitaet — Kasseninsel: sechs statt acht Hosts

Gruppe A · intermediate · subnetting · Version 1 · draft

Eine Kasseninsel benötigt vier Kassen, einen Drucker und ein Gateway. Das zugewiesene Netz enthält 192.168.90.202/29. Prüfen Sie die Kapazität anhand aller acht Ergebnisfelder; die sechs Geräte benötigen insgesamt sechs IPs.

**Auftrag**

Berechnen Sie Netzadresse, Broadcast, Präfix, Dezimalmaske, ersten/letzten nutzbaren Host sowie Gesamtzahl der Adressen und nutzbaren Hosts. Es gelten normale IPv4-Broadcast-Subnetze; Netz- und Broadcastadresse sind nicht als Host nutzbar.

**Lernziele**

- Ein /29 mit sechs benötigten Hostadressen vergleichen.
- Netz- und Broadcastadresse von Geräteadressen abgrenzen.

**Pflichtanforderungen**

- r1: Ein /29 mit sechs benötigten Hostadressen vergleichen.
- r2: Netz- und Broadcastadresse von Geräteadressen abgrenzen.

**Ausgangsdaten**

```json
{
  "family": "subnet",
  "ip": "192.168.90.202",
  "prefix": 29
}
```

**Referenzantwort**

```json
{
  "network": "192.168.90.200",
  "broadcast": "192.168.90.207",
  "prefix": 29,
  "mask": "255.255.255.248",
  "first": "192.168.90.201",
  "last": "192.168.90.206",
  "addresses": 8,
  "hosts": 6
}
```

**Erklärung**

Netz .200, Broadcast .207, Hosts .201–.206. 8−2=6 nutzbare Adressen: es passt exakt, aber es bleibt keine zusätzliche Hostreserve.

**Zulässige Alternativen**

- Jede bijektive Zuordnung der sechs Geräte auf .201–.206 wäre gültig; hier wird nur gerechnet. Der Rechenweg ist frei; die fachlichen Ergebnisse bleiben eindeutig.

**Falsche Antworten / Ablehnung**

- Acht Geräte passen: reservierte Endpunkte mitgezählt.
- /30 reicht für sechs Geräte: nur zwei Hosts nutzbar.

**Typische Fehler**

- Vermeiden: Acht Geräte passen: reservierte Endpunkte mitgezählt.
- Vermeiden: /30 reicht für sechs Geräte: nur zwei Hosts nutzbar.

**Korrekturzuordnung**

- math-1 → r1: Ein /29 mit sechs benötigten Hostadressen vergleichen.
- math-2 → r2: Netz- und Broadcastadresse von Geräteadressen abgrenzen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-a05-campus-oktett — Campus: Subnetz über Oktettgrenzen

Gruppe A · advanced · subnetting · Version 1 · draft

Ein Campusgerät meldet 172.19.7.211/22. Ein Kollege trägt irrtümlich 172.19.7.0 als Netz ein. Ermitteln Sie die vollständigen Grenzen über mehrere dritte Oktette.

**Auftrag**

Berechnen Sie Netzadresse, Broadcast, Präfix, Dezimalmaske, ersten/letzten nutzbaren Host sowie Gesamtzahl der Adressen und nutzbaren Hosts. Es gelten normale IPv4-Broadcast-Subnetze; Netz- und Broadcastadresse sind nicht als Host nutzbar.

**Lernziele**

- Netzbildung im dritten Oktett beherrschen.
- Hostbereich über eine Oktettgrenze berechnen.

**Pflichtanforderungen**

- r1: Netzbildung im dritten Oktett beherrschen.
- r2: Hostbereich über eine Oktettgrenze berechnen.

**Ausgangsdaten**

```json
{
  "family": "subnet",
  "ip": "172.19.7.211",
  "prefix": 22
}
```

**Referenzantwort**

```json
{
  "network": "172.19.4.0",
  "broadcast": "172.19.7.255",
  "prefix": 22,
  "mask": "255.255.252.0",
  "first": "172.19.4.1",
  "last": "172.19.7.254",
  "addresses": 1024,
  "hosts": 1022
}
```

**Erklärung**

Maske 255.255.252.0 bedeutet Viererblöcke im dritten Oktett. Netz 172.19.4.0, Broadcast 172.19.7.255, Hosts 172.19.4.1–172.19.7.254; 1024 Adressen, 1022 Hosts.

**Zulässige Alternativen**

- 32-Bit-AND vermeidet die fehlerhafte Beschränkung auf das letzte Oktett. Der Rechenweg ist frei; die fachlichen Ergebnisse bleiben eindeutig.

**Falsche Antworten / Ablehnung**

- 172.19.7.0/22: keine ausgerichtete Netzadresse.
- 254 Hosts: mit /24 verwechselt.

**Typische Fehler**

- Vermeiden: 172.19.7.0/22: keine ausgerichtete Netzadresse.
- Vermeiden: 254 Hosts: mit /24 verwechselt.

**Korrekturzuordnung**

- math-1 → r1: Netzbildung im dritten Oktett beherrschen.
- math-2 → r2: Hostbereich über eine Oktettgrenze berechnen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-a06-dmz-zugehoerigkeit — DMZ: Mitgliedschaft ist nicht Nutzbarkeit

Gruppe A · intermediate · subnetting · Version 1 · draft

Eine DMZ verwendet 192.168.60.96/27. Prüfen Sie die Kandidaten vor einer Geräteinstallation, einschließlich der beiden reservierten Grenzen.

**Auftrag**

Ordnen Sie jede Kandidaten-ID einer Klasse zu: host (nutzbarer Host), network (Netzadresse), broadcast oder outside (außerhalb). Netz- und Broadcastadresse gehören mathematisch zum Netz, dürfen hier aber keinem Host zugewiesen werden.

**Lernziele**

- Adressen innerhalb und außerhalb eines Subnetzes unterscheiden.
- Netz/Broadcast nicht als nutzbare Hosts einstufen.

**Pflichtanforderungen**

- r1: Adressen innerhalb und außerhalb eines Subnetzes unterscheiden.
- r2: Netz/Broadcast nicht als nutzbare Hosts einstufen.

**Ausgangsdaten**

```json
{
  "family": "membership",
  "network": "192.168.60.96/27",
  "candidates": [
    {
      "id": "k1",
      "ip": "192.168.60.95"
    },
    {
      "id": "k2",
      "ip": "192.168.60.96"
    },
    {
      "id": "k3",
      "ip": "192.168.60.97"
    },
    {
      "id": "k4",
      "ip": "192.168.60.126"
    },
    {
      "id": "k5",
      "ip": "192.168.60.127"
    },
    {
      "id": "k6",
      "ip": "192.168.60.128"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "k1": "outside",
  "k2": "network",
  "k3": "host",
  "k4": "host",
  "k5": "broadcast",
  "k6": "outside"
}
```

**Erklärung**

k1 und k6 liegen außerhalb. k2 ist die Netzadresse, k5 der Broadcast. Nur k3 und k4 sind nutzbare Hostadressen. Ein gemeinsames erstes bis drittes Oktett genügt bei /27 nicht.

**Zulässige Alternativen**

- Eine Intervallprüfung oder maskierter Adressvergleich plus Grenzprüfung ist zulässig. Der Rechenweg ist frei; die fachlichen Ergebnisse bleiben eindeutig.

**Falsche Antworten / Ablehnung**

- Alle Kandidaten gehören zu /27: nur die ersten drei Oktette verglichen.
- k2 als host: Netzadresse ist kein Geräteplatz.

**Typische Fehler**

- Vermeiden: Alle Kandidaten gehören zu /27: nur die ersten drei Oktette verglichen.
- Vermeiden: k2 als host: Netzadresse ist kein Geräteplatz.

**Korrekturzuordnung**

- math-1 → r1: Adressen innerhalb und außerhalb eines Subnetzes unterscheiden.
- math-2 → r2: Netz/Broadcast nicht als nutzbare Hosts einstufen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-b01-buero — Bürohaus: einen /24-Block sparsam verteilen

Gruppe B · intermediate · vlsm · Version 1 · draft

Vier Abteilungen teilen 10.50.10.0/24. Die Zahlen enthalten alle Infrastrukturadressen. Freie Restbereiche dürfen unzugeordnet bleiben.

**Auftrag**

Erstellen Sie einen vollständigen VLSM-Plan. Alle Hostzahlen umfassen bereits Gateways, Drucker und Infrastruktur. Wenden Sie Wachstum je Bedarf an und runden Sie auf ganze Hosts auf. Verwenden Sie pro Bedarf das kleinste ausreichende Broadcast-Subnetz. Feste Reservierungen bleiben unverändert; future-Bedarfe werden als freie Netze für später eingeplant. Geben Sie je Bedarfs-ID eine Netzadresse mit CIDR an.

**Lernziele**

- Passende Präfixe für ungleiche Bedarfe wählen.
- Nicht überlappende Netze innerhalb /24 planen.

**Pflichtanforderungen**

- r1: Passende Präfixe für ungleiche Bedarfe wählen.
- r2: Nicht überlappende Netze innerhalb /24 planen.

**Ausgangsdaten**

```json
{
  "family": "vlsm",
  "parent": "10.50.10.0/24",
  "reserved": [],
  "demands": [
    {
      "id": "office",
      "label": "Büro",
      "hosts": 100
    },
    {
      "id": "support",
      "label": "Support",
      "hosts": 50
    },
    {
      "id": "lab",
      "label": "Labor",
      "hosts": 20
    },
    {
      "id": "print",
      "label": "Druckbereich",
      "hosts": 10
    }
  ]
}
```

**Referenzantwort**

```json
[
  {
    "id": "office",
    "cidr": "10.50.10.0/25"
  },
  {
    "id": "support",
    "cidr": "10.50.10.128/26"
  },
  {
    "id": "lab",
    "cidr": "10.50.10.192/27"
  },
  {
    "id": "print",
    "cidr": "10.50.10.224/28"
  }
]
```

**Erklärung**

100/50/20/10 Hosts benötigen /25, /26, /27, /28. Größte Netze zuerst belegen 128+64+32+16=240 Adressen; 16 bleiben frei. Ein /24 je Abteilung verletzt die Vorgabe.

**Zulässige Alternativen**

- Andere Reihenfolgen und freie Restpositionen sind zulässig, sofern jedes Netz minimal groß bleibt. Der Korrektor prüft Bedingungen statt einer bestimmten Reihenfolge oder Netzadresse.

**Falsche Antworten / Ablehnung**

- Vier /26-Netze: Büro hat nur 62 Plätze.
- Startadressen ohne Blockausrichtung.

**Typische Fehler**

- Vermeiden: Vier /26-Netze: Büro hat nur 62 Plätze.
- Vermeiden: Startadressen ohne Blockausrichtung.

**Korrekturzuordnung**

- math-1 → r1: Passende Präfixe für ungleiche Bedarfe wählen.
- math-2 → r2: Nicht überlappende Netze innerhalb /24 planen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- Kein Routing-, VLAN- oder DHCP-Nachweis durch einen rechnerisch gültigen Plan.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-b02-schule — Schule: Wachstum und zukünftigen Trakt trennen

Gruppe B · advanced · vlsm · Version 1 · draft

Die Schule besitzt 10.51.0.0/22. Unterricht wächst von 200 Endpunkten um 25 %. Für den zukünftigen Trakt werden zusätzlich 100 Hostplätze reserviert; diese Reserve darf nicht mit dem Unterrichtswachstum verrechnet werden.

**Auftrag**

Erstellen Sie einen vollständigen VLSM-Plan. Alle Hostzahlen umfassen bereits Gateways, Drucker und Infrastruktur. Wenden Sie Wachstum je Bedarf an und runden Sie auf ganze Hosts auf. Verwenden Sie pro Bedarf das kleinste ausreichende Broadcast-Subnetz. Feste Reservierungen bleiben unverändert; future-Bedarfe werden als freie Netze für später eingeplant. Geben Sie je Bedarfs-ID eine Netzadresse mit CIDR an.

**Lernziele**

- Wachstum auf Hostzahlen anwenden und getrennte Reserve planen.
- VLSM über mehrere /24-Bereiche durchführen.

**Pflichtanforderungen**

- r1: Wachstum auf Hostzahlen anwenden und getrennte Reserve planen.
- r2: VLSM über mehrere /24-Bereiche durchführen.

**Ausgangsdaten**

```json
{
  "family": "vlsm",
  "parent": "10.51.0.0/22",
  "reserved": [],
  "demands": [
    {
      "id": "class",
      "label": "Unterricht",
      "hosts": 200,
      "growthPercent": 25
    },
    {
      "id": "admin",
      "label": "Verwaltung",
      "hosts": 100
    },
    {
      "id": "lab",
      "label": "Labore",
      "hosts": 60
    },
    {
      "id": "infra",
      "label": "Infrastruktur",
      "hosts": 25
    },
    {
      "id": "future",
      "label": "Neuer Trakt",
      "hosts": 100,
      "purpose": "future"
    }
  ]
}
```

**Referenzantwort**

```json
[
  {
    "id": "class",
    "cidr": "10.51.0.0/24"
  },
  {
    "id": "admin",
    "cidr": "10.51.1.0/25"
  },
  {
    "id": "future",
    "cidr": "10.51.1.128/25"
  },
  {
    "id": "lab",
    "cidr": "10.51.2.0/26"
  },
  {
    "id": "infra",
    "cidr": "10.51.2.64/27"
  }
]
```

**Erklärung**

Unterricht: ceil(200×1,25)=250, also /24. Verwaltung und Trakt je /25, Labore /26, Infrastruktur /27. Insgesamt 608 Adressen; das /22 bietet 1024.

**Zulässige Alternativen**

- Der zukünftige Trakt darf an jeder freien ausgerichteten Stelle liegen; die Präfixgröße bleibt /25. Der Korrektor prüft Bedingungen statt einer bestimmten Reihenfolge oder Netzadresse.

**Falsche Antworten / Ablehnung**

- Unterricht /25: Wachstum passt nicht.
- Neuer Trakt im Unterrichtsnetz: Reserve doppelt verwendet.

**Typische Fehler**

- Vermeiden: Unterricht /25: Wachstum passt nicht.
- Vermeiden: Neuer Trakt im Unterrichtsnetz: Reserve doppelt verwendet.

**Korrekturzuordnung**

- math-1 → r1: Wachstum auf Hostzahlen anwenden und getrennte Reserve planen.
- math-2 → r2: VLSM über mehrere /24-Bereiche durchführen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- Kein Routing-, VLAN- oder DHCP-Nachweis durch einen rechnerisch gültigen Plan.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-b03-lager — Lager: Altanlage als feste Sperrfläche

Gruppe B · advanced · vlsm · Version 1 · draft

10.52.7.0/24 steht zur Verfügung. Die laufende Fördertechnik belegt unveränderlich 10.52.7.0/26. Neue Scanner, Versand und Verwaltung sollen ohne Umnummerierung der Altanlage hinzukommen.

**Auftrag**

Erstellen Sie einen vollständigen VLSM-Plan. Alle Hostzahlen umfassen bereits Gateways, Drucker und Infrastruktur. Wenden Sie Wachstum je Bedarf an und runden Sie auf ganze Hosts auf. Verwenden Sie pro Bedarf das kleinste ausreichende Broadcast-Subnetz. Feste Reservierungen bleiben unverändert; future-Bedarfe werden als freie Netze für später eingeplant. Geben Sie je Bedarfs-ID eine Netzadresse mit CIDR an.

**Lernziele**

- Feste Reservierung unverändert lassen.
- Neue minimale Subnetze kollisionsfrei anordnen.

**Pflichtanforderungen**

- r1: Feste Reservierung unverändert lassen.
- r2: Neue minimale Subnetze kollisionsfrei anordnen.

**Ausgangsdaten**

```json
{
  "family": "vlsm",
  "parent": "10.52.7.0/24",
  "reserved": [
    "10.52.7.0/26"
  ],
  "demands": [
    {
      "id": "scan",
      "label": "Scanner",
      "hosts": 58
    },
    {
      "id": "ship",
      "label": "Versand",
      "hosts": 26
    },
    {
      "id": "admin",
      "label": "Verwaltung",
      "hosts": 12
    }
  ]
}
```

**Referenzantwort**

```json
[
  {
    "id": "scan",
    "cidr": "10.52.7.64/26"
  },
  {
    "id": "ship",
    "cidr": "10.52.7.128/27"
  },
  {
    "id": "admin",
    "cidr": "10.52.7.160/28"
  }
]
```

**Erklärung**

Neue Netze benötigen /26, /27, /28. Eine Lösung beginnt mit Scannern bei .64/26, Versand .128/27, Verwaltung .160/28. Die Altanlage blockiert .0–.63 vollständig.

**Zulässige Alternativen**

- Freie Netze oberhalb der Altanlage können anders verteilt werden, solange die Grenzen stimmen. Der Korrektor prüft Bedingungen statt einer bestimmten Reihenfolge oder Netzadresse.

**Falsche Antworten / Ablehnung**

- Scanner .0/26: Altanlage überschrieben.
- Verwaltung .150/28: keine Netzadresse.

**Typische Fehler**

- Vermeiden: Scanner .0/26: Altanlage überschrieben.
- Vermeiden: Verwaltung .150/28: keine Netzadresse.

**Korrekturzuordnung**

- math-1 → r1: Feste Reservierung unverändert lassen.
- math-2 → r2: Neue minimale Subnetze kollisionsfrei anordnen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- Kein Routing-, VLAN- oder DHCP-Nachweis durch einen rechnerisch gültigen Plan.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-b04-filiale — Filiale: ein /26 exakt ausnutzen

Gruppe B · advanced · vlsm · Version 1 · draft

Eine kleine Filiale erhält 10.53.9.0/26. Neben Endgeräten müssen zwei getrennte Router-Transitnetze mit jeweils zwei Hostadressen geplant werden. Für diese Aufgabe gelten /30-Broadcast-Netze, nicht RFC-3021-/31.

**Auftrag**

Erstellen Sie einen vollständigen VLSM-Plan. Alle Hostzahlen umfassen bereits Gateways, Drucker und Infrastruktur. Wenden Sie Wachstum je Bedarf an und runden Sie auf ganze Hosts auf. Verwenden Sie pro Bedarf das kleinste ausreichende Broadcast-Subnetz. Feste Reservierungen bleiben unverändert; future-Bedarfe werden als freie Netze für später eingeplant. Geben Sie je Bedarfs-ID eine Netzadresse mit CIDR an.

**Lernziele**

- Kleine Transitnetze von LAN-Bedarfen unterscheiden.
- Kapazität des gesamten Stammnetzes einhalten.

**Pflichtanforderungen**

- r1: Kleine Transitnetze von LAN-Bedarfen unterscheiden.
- r2: Kapazität des gesamten Stammnetzes einhalten.

**Ausgangsdaten**

```json
{
  "family": "vlsm",
  "parent": "10.53.9.0/26",
  "reserved": [],
  "demands": [
    {
      "id": "sales",
      "label": "Verkauf",
      "hosts": 22
    },
    {
      "id": "office",
      "label": "Büro",
      "hosts": 10
    },
    {
      "id": "infra",
      "label": "Infrastruktur",
      "hosts": 5
    },
    {
      "id": "wan-a",
      "label": "Transit A",
      "hosts": 2
    },
    {
      "id": "wan-b",
      "label": "Transit B",
      "hosts": 2
    }
  ]
}
```

**Referenzantwort**

```json
[
  {
    "id": "sales",
    "cidr": "10.53.9.0/27"
  },
  {
    "id": "office",
    "cidr": "10.53.9.32/28"
  },
  {
    "id": "infra",
    "cidr": "10.53.9.48/29"
  },
  {
    "id": "wan-a",
    "cidr": "10.53.9.56/30"
  },
  {
    "id": "wan-b",
    "cidr": "10.53.9.60/30"
  }
]
```

**Erklärung**

/27 + /28 + /29 + /30 + /30 benötigen 32+16+8+4+4=64 Adressen. Der gesamte /26-Block wird belegt; jede unnötig größere Zuteilung macht den Plan unmöglich.

**Zulässige Alternativen**

- Insbesondere die beiden /30-Netze dürfen ihre Plätze tauschen. Der Korrektor prüft Bedingungen statt einer bestimmten Reihenfolge oder Netzadresse.

**Falsche Antworten / Ablehnung**

- Transit /31: andere Hostkonvention als vereinbart.
- Verkauf /26: kein Platz für die restlichen Bereiche.

**Typische Fehler**

- Vermeiden: Transit /31: andere Hostkonvention als vereinbart.
- Vermeiden: Verkauf /26: kein Platz für die restlichen Bereiche.

**Korrekturzuordnung**

- math-1 → r1: Kleine Transitnetze von LAN-Bedarfen unterscheiden.
- math-2 → r2: Kapazität des gesamten Stammnetzes einhalten.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- Kein Routing-, VLAN- oder DHCP-Nachweis durch einen rechnerisch gültigen Plan.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-b05-atelier — Atelier: Wachstum ohne pauschale Verdopplung

Gruppe B · intermediate · vlsm · Version 1 · draft

Ein Planungsbüro besitzt 10.54.12.0/24. Design wächst um 50 %, die anderen Bereiche nicht. Für ein noch nicht eröffnetes Studio wird ein eigenes Netz für 30 Hosts reserviert.

**Auftrag**

Erstellen Sie einen vollständigen VLSM-Plan. Alle Hostzahlen umfassen bereits Gateways, Drucker und Infrastruktur. Wenden Sie Wachstum je Bedarf an und runden Sie auf ganze Hosts auf. Verwenden Sie pro Bedarf das kleinste ausreichende Broadcast-Subnetz. Feste Reservierungen bleiben unverändert; future-Bedarfe werden als freie Netze für später eingeplant. Geben Sie je Bedarfs-ID eine Netzadresse mit CIDR an.

**Lernziele**

- Wachstum nur auf den genannten Bereich anwenden.
- Bedarf genau an einer Hostgrenze beurteilen.

**Pflichtanforderungen**

- r1: Wachstum nur auf den genannten Bereich anwenden.
- r2: Bedarf genau an einer Hostgrenze beurteilen.

**Ausgangsdaten**

```json
{
  "family": "vlsm",
  "parent": "10.54.12.0/24",
  "reserved": [],
  "demands": [
    {
      "id": "design",
      "label": "Design",
      "hosts": 70,
      "growthPercent": 50
    },
    {
      "id": "office",
      "label": "Büro",
      "hosts": 28
    },
    {
      "id": "plot",
      "label": "Plotter",
      "hosts": 12
    },
    {
      "id": "studio",
      "label": "Späteres Studio",
      "hosts": 30,
      "purpose": "future"
    }
  ]
}
```

**Referenzantwort**

```json
[
  {
    "id": "design",
    "cidr": "10.54.12.0/25"
  },
  {
    "id": "studio",
    "cidr": "10.54.12.128/27"
  },
  {
    "id": "office",
    "cidr": "10.54.12.160/27"
  },
  {
    "id": "plot",
    "cidr": "10.54.12.192/28"
  }
]
```

**Erklärung**

Design benötigt 105 Hosts und /25. Büro und Studio passen jeweils in /27 mit 30 Hosts, Plotter in /28. 208 Adressen werden belegt, 48 bleiben frei.

**Zulässige Alternativen**

- Büro und Studio können ihre /27-Positionen tauschen; die Reserve bleibt eigenständig. Der Korrektor prüft Bedingungen statt einer bestimmten Reihenfolge oder Netzadresse.

**Falsche Antworten / Ablehnung**

- Studio /28: nur 14 Hosts.
- Design /24: unnötige Verdopplung statt minimaler Kapazität.

**Typische Fehler**

- Vermeiden: Studio /28: nur 14 Hosts.
- Vermeiden: Design /24: unnötige Verdopplung statt minimaler Kapazität.

**Korrekturzuordnung**

- math-1 → r1: Wachstum nur auf den genannten Bereich anwenden.
- math-2 → r2: Bedarf genau an einer Hostgrenze beurteilen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- Kein Routing-, VLAN- oder DHCP-Nachweis durch einen rechnerisch gültigen Plan.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-b06-fusion — Firmenfusion: fragmentierten Adressraum nutzen

Gruppe B · advanced · vlsm · Version 1 · draft

Im Netz 10.55.4.0/24 bleiben zwei Bestandsbereiche unverändert: .64/26 und .192/27. Drei neue Teams müssen in den verbleibenden Lücken untergebracht werden; die Summe freier Adressen allein beweist noch keine passende Ausrichtung.

**Auftrag**

Erstellen Sie einen vollständigen VLSM-Plan. Alle Hostzahlen umfassen bereits Gateways, Drucker und Infrastruktur. Wenden Sie Wachstum je Bedarf an und runden Sie auf ganze Hosts auf. Verwenden Sie pro Bedarf das kleinste ausreichende Broadcast-Subnetz. Feste Reservierungen bleiben unverändert; future-Bedarfe werden als freie Netze für später eingeplant. Geben Sie je Bedarfs-ID eine Netzadresse mit CIDR an.

**Lernziele**

- Fragmentierte freie Intervalle auf Blockgrößen prüfen.
- Überlappungen mit Bestandsnetzen ausschließen.

**Pflichtanforderungen**

- r1: Fragmentierte freie Intervalle auf Blockgrößen prüfen.
- r2: Überlappungen mit Bestandsnetzen ausschließen.

**Ausgangsdaten**

```json
{
  "family": "vlsm",
  "parent": "10.55.4.0/24",
  "reserved": [
    "10.55.4.64/26",
    "10.55.4.192/27"
  ],
  "demands": [
    {
      "id": "dev",
      "label": "Entwicklung",
      "hosts": 50
    },
    {
      "id": "qa",
      "label": "Qualität",
      "hosts": 20
    },
    {
      "id": "ops",
      "label": "Betrieb",
      "hosts": 12
    }
  ]
}
```

**Referenzantwort**

```json
[
  {
    "id": "dev",
    "cidr": "10.55.4.0/26"
  },
  {
    "id": "qa",
    "cidr": "10.55.4.128/27"
  },
  {
    "id": "ops",
    "cidr": "10.55.4.160/28"
  }
]
```

**Erklärung**

Entwicklung passt nach .0/26, Qualität nach .128/27, Betrieb nach .160/28. Die festen Netze sind keine Antworten des Schülers, sondern gesperrte Intervalle. Andere freie /27- und /28-Plätze können ebenfalls funktionieren.

**Zulässige Alternativen**

- Qualität kann z. B. .224/27 verwenden; Betrieb bleibt .160/28. Keine feste Zuordnung zu einer Musteradresse erforderlich. Der Korrektor prüft Bedingungen statt einer bestimmten Reihenfolge oder Netzadresse.

**Falsche Antworten / Ablehnung**

- Entwicklung .128/25: zu groß und überlappt .192/27.
- Qualität .80/27: liegt in der Altanlage und ist nicht ausgerichtet.

**Typische Fehler**

- Vermeiden: Entwicklung .128/25: zu groß und überlappt .192/27.
- Vermeiden: Qualität .80/27: liegt in der Altanlage und ist nicht ausgerichtet.

**Korrekturzuordnung**

- math-1 → r1: Fragmentierte freie Intervalle auf Blockgrößen prüfen.
- math-2 → r2: Überlappungen mit Bestandsnetzen ausschließen.

**Grenzen**

- Interner Entwurf: noch keine Eingabemaske oder Veröffentlichung in Übungen.
- Der reine Korrektor bewertet die vollständige strukturierte Antwort, keine Freitextbegründung und keine Teilpunkte.
- Kein Routing-, VLAN- oder DHCP-Nachweis durch einen rechnerisch gültigen Plan.
- /31-Punkt-zu-Punkt und /32-Hostrouten gehören nicht zur Hostkonvention dieser Rechenaufgaben.

## factory-c01-maskenfehler — Werkstatt: Ping funktioniert, Maske ist trotzdem falsch

Gruppe C · beginner · ipv4 · Version 1 · draft

Empfang, Werkbank und Archiv hängen am selben Switch. Empfang hat irrtümlich /24; alle aktuellen Nachbarn liegen dennoch im vorgesehenen /26. Ein erfolgreicher Ping allein ist hier kein korrekter Abnahmetest.

**Auftrag**

Behalten Sie alle IPv4-Adressen bei und korrigieren Sie nur Empfang auf /26. Werkbank bleibt 192.168.71.80/26, Archiv 192.168.71.65/26. Es wird kein Gateway benötigt. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- IPv4-Adressierung und Subnetzgrenzen korrekt anwenden.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Behalten Sie alle IPv4-Adressen bei und korrigieren Sie nur Empfang auf /26. Werkbank bleibt 192.168.71.80/26, Archiv 192.168.71.65/26. Es wird kein Gateway benötigt.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 192.168.71.70/24 | false | — |
| client-b | Werkbank | host | eth0: 192.168.71.80/26 | false | — |
| archive | Archiv | server | eth0: 192.168.71.65/26 | false | — |
| access | Zugang | switch | — | false | — |

**Verkabelung**

- line-1: client-a/eth0 ↔ access/eth0
- line-2: client-b/eth0 ↔ access/eth1
- line-3: archive/eth0 ↔ access/eth2

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 192.168.71.70/26 | false | — |
| client-b | Werkbank | host | eth0: 192.168.71.80/26 | false | — |
| archive | Archiv | server | eth0: 192.168.71.65/26 | false | — |
| access | Zugang | switch | — | false | — |

**Erklärung**

192.168.71.64/26 reicht von .64 bis .127. .70, .80 und .65 sind nutzbar. /24 kann lokale Pings erlauben, verletzt aber den Adressplan und würde andere Bereiche fälschlich als lokal behandeln.

**Zulässige Alternativen**

- Maske 255.255.255.192 oder CIDR /26 eingeben. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- Nur Ping testen und /24 beibehalten.
- Die IP ändern, obwohl nur die Maske fehlerhaft ist.

**Typische Fehler**

- Typischer Fehler: Nur Ping testen und /24 beibehalten.
- Typischer Fehler: Die IP ändern, obwohl nur die Maske fehlerhaft ist.

**Korrekturzuordnung**

- ip-client-a-eth0 → config: ENGINE {"type":"iface-ip","device":"client-a","iface":"eth0","cidr":"192.168.71.70/26","resolveBy":"id"}
- ip-client-b-eth0 → config: ENGINE {"type":"iface-ip","device":"client-b","iface":"eth0","cidr":"192.168.71.80/26","resolveBy":"id"}
- ip-archive-eth0 → config: ENGINE {"type":"iface-ip","device":"archive","iface":"eth0","cidr":"192.168.71.65/26","resolveBy":"id"}
- ping-client-a-client-b → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"client-b","expect":"success","resolveBy":"id"}
- ping-client-a-archive → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-client-b-client-a → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-client-b-archive → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-archive-client-a → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-archive-client-b → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-b","expect":"success","resolveBy":"id"}

**Grenzen**

- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-c02-neue-arbeitsplaetze — Labor: zwei Arbeitsplätze im knappen /28 installieren

Gruppe C · intermediate · ipv4 · Version 1 · draft

Zwei neue Rechner sind bereits verkabelt, aber noch unadressiert. Das Archiv ist unter 10.61.2.162/28 fest eingerichtet. Kein DHCP-Server und kein Router sind erforderlich.

**Auftrag**

Wählen Sie zwei unterschiedliche freie Hostadressen in 10.61.2.160/28. Archiv bleibt 10.61.2.162/28. Keine Netz-/Broadcastadresse und keine doppelte Adresse verwenden. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- IPv4-Adressierung und Subnetzgrenzen korrekt anwenden.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Wählen Sie zwei unterschiedliche freie Hostadressen in 10.61.2.160/28. Archiv bleibt 10.61.2.162/28. Keine Netz-/Broadcastadresse und keine doppelte Adresse verwenden.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | — | false | — |
| client-b | Werkbank | host | — | false | — |
| archive | Archiv | server | eth0: 10.61.2.162/28 | false | — |
| access | Zugang | switch | — | false | — |

**Verkabelung**

- line-1: client-a/eth0 ↔ access/eth0
- line-2: client-b/eth0 ↔ access/eth1
- line-3: archive/eth0 ↔ access/eth2

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 10.61.2.165/28 | false | — |
| client-b | Werkbank | host | eth0: 10.61.2.166/28 | false | — |
| archive | Archiv | server | eth0: 10.61.2.162/28 | false | — |
| access | Zugang | switch | — | false | — |

**Erklärung**

Der Hostbereich ist .161–.174, .162 ist belegt. .165 und .166 sind eine Lösung, .170 und .171 ebenfalls. Die Connected-Route genügt für lokale Kommunikation.

**Zulässige Alternativen**

- Empfang .170/28 und Werkbank .171/28, Archiv unverändert. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- .175 als Host: Broadcast.
- Beide Rechner .165: Adresskonflikt.

**Typische Fehler**

- Typischer Fehler: .175 als Host: Broadcast.
- Typischer Fehler: Beide Rechner .165: Adresskonflikt.

**Korrekturzuordnung**

- ip-archive → config: ENGINE {"type":"iface-ip","device":"archive","iface":"eth0","cidr":"10.61.2.162/28","resolveBy":"id"}
- ip-client-a → config: ENGINE {"type":"iface-ip","device":"client-a","iface":"eth0","inSubnet":"10.61.2.160/28","resolveBy":"id"}
- ip-client-b → config: ENGINE {"type":"iface-ip","device":"client-b","iface":"eth0","inSubnet":"10.61.2.160/28","resolveBy":"id"}
- unique-hosts → config: MANUELL: Alle Geräteadressen auf Eindeutigkeit und Hostbereich .161–.174 prüfen; Archivadresse reservieren. iface-ip prüft Netz/Präfix, aber nicht Eindeutigkeit und reservierte Endpunkte. Ein Ping kann bei einem Konflikt trotzdem gelingen.
- ping-client-a-client-b → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"client-b","expect":"success","resolveBy":"id"}
- ping-client-a-archive → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-client-b-client-a → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-client-b-archive → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-archive-client-a → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-archive-client-b → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-b","expect":"success","resolveBy":"id"}

**Grenzen**

- Vollständige Freigabe benötigt die verpflichtende manuelle Hostgültigkeits-/Eindeutigkeitsprüfung; keine vorgetäuschte Vollautomatik.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-c03-falsches-netz — Reparaturplatz: gleiches drittes Oktett, anderes Netz

Gruppe C · intermediate · ipv4 · Version 1 · draft

Empfang wurde aus einer anderen Abteilung übernommen und hat noch .100/27. Kabel und Switch sind in Ordnung. Werkbank und Archiv befinden sich im Bereich .64–.95.

**Auftrag**

Setzen Sie Empfang gemäß Adressplan auf 172.26.8.80/27. Werkbank bleibt 172.26.8.82/27, Archiv 172.26.8.65/27. Keine Route als Ersatz für die richtige lokale Adressierung hinzufügen. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- IPv4-Adressierung und Subnetzgrenzen korrekt anwenden.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Setzen Sie Empfang gemäß Adressplan auf 172.26.8.80/27. Werkbank bleibt 172.26.8.82/27, Archiv 172.26.8.65/27. Keine Route als Ersatz für die richtige lokale Adressierung hinzufügen.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 172.26.8.100/27 | false | — |
| client-b | Werkbank | host | eth0: 172.26.8.82/27 | false | — |
| archive | Archiv | server | eth0: 172.26.8.65/27 | false | — |
| access | Zugang | switch | — | false | — |

**Verkabelung**

- line-1: client-a/eth0 ↔ access/eth0
- line-2: client-b/eth0 ↔ access/eth1
- line-3: archive/eth0 ↔ access/eth2

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 172.26.8.80/27 | false | — |
| client-b | Werkbank | host | eth0: 172.26.8.82/27 | false | — |
| archive | Archiv | server | eth0: 172.26.8.65/27 | false | — |
| access | Zugang | switch | — | false | — |

**Erklärung**

.100/27 gehört zu .96/27, nicht .64/27. .80/27 korrigiert die Netzzuordnung. /24 würde nur die Segmentierung verschleiern.

**Zulässige Alternativen**

- IPv4-Felder im Inspector oder unterstützte ip-adress-Befehle führen zur gleichen Endkonfiguration. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- Präfix auf /24 erweitern.
- Ein erfundenes Gateway konfigurieren, statt den Adressplan umzusetzen.

**Typische Fehler**

- Typischer Fehler: Präfix auf /24 erweitern.
- Typischer Fehler: Ein erfundenes Gateway konfigurieren, statt den Adressplan umzusetzen.

**Korrekturzuordnung**

- ip-client-a-eth0 → config: ENGINE {"type":"iface-ip","device":"client-a","iface":"eth0","cidr":"172.26.8.80/27","resolveBy":"id"}
- ip-client-b-eth0 → config: ENGINE {"type":"iface-ip","device":"client-b","iface":"eth0","cidr":"172.26.8.82/27","resolveBy":"id"}
- ip-archive-eth0 → config: ENGINE {"type":"iface-ip","device":"archive","iface":"eth0","cidr":"172.26.8.65/27","resolveBy":"id"}
- ping-client-a-client-b → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"client-b","expect":"success","resolveBy":"id"}
- ping-client-a-archive → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-client-b-client-a → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-client-b-archive → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-archive-client-a → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-archive-client-b → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-b","expect":"success","resolveBy":"id"}

**Grenzen**

- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-c04-adresskonflikt — Umzug: zwei Rechner mit derselben IPv4-Adresse

Gruppe C · intermediate · ipv4 · Version 1 · draft

Nach einem Umzug besitzen Empfang und Werkbank beide 10.62.5.2/29. Wechselnde ARP-Zuordnung oder Antworten eines Nachbarn sind kein Beweis für zwei korrekt adressierte Rechner.

**Auftrag**

Archiv bleibt 10.62.5.1/29. Geben Sie Empfang und Werkbank unterschiedliche freie Hostadressen im Netz 10.62.5.0/29; mindestens eine der doppelten .2-Adressen muss geändert werden. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- IPv4-Adressierung und Subnetzgrenzen korrekt anwenden.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Archiv bleibt 10.62.5.1/29. Geben Sie Empfang und Werkbank unterschiedliche freie Hostadressen im Netz 10.62.5.0/29; mindestens eine der doppelten .2-Adressen muss geändert werden.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 10.62.5.2/29 | false | — |
| client-b | Werkbank (umgezogen) | host | eth0: 10.62.5.2/29 | false | — |
| archive | Archiv | server | eth0: 10.62.5.1/29 | false | — |
| access | Zugang | switch | — | false | — |

**Verkabelung**

- line-1: client-a/eth0 ↔ access/eth0
- line-2: client-b/eth0 ↔ access/eth1
- line-3: archive/eth0 ↔ access/eth2

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Empfang | host | eth0: 10.62.5.2/29 | false | — |
| client-b | Werkbank (umgezogen) | host | eth0: 10.62.5.3/29 | false | — |
| archive | Archiv | server | eth0: 10.62.5.1/29 | false | — |
| access | Zugang | switch | — | false | — |

**Erklärung**

Werkbank .3 beseitigt den Konflikt bei unverändertem Empfang .2. Auch .4 und .5 wären gültig. ARP-Cache-Löschen allein ändert keine doppelte Konfiguration.

**Zulässige Alternativen**

- Empfang .4/29 und Werkbank .5/29, Archiv .1/29. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- Nur ARP-Einträge löschen.
- Erfolgreichen Ping auf die eigene doppelte Adresse als Lösung werten.

**Typische Fehler**

- Typischer Fehler: Nur ARP-Einträge löschen.
- Typischer Fehler: Erfolgreichen Ping auf die eigene doppelte Adresse als Lösung werten.

**Korrekturzuordnung**

- ip-archive → config: ENGINE {"type":"iface-ip","device":"archive","iface":"eth0","cidr":"10.62.5.1/29","resolveBy":"id"}
- ip-client-a → config: ENGINE {"type":"iface-ip","device":"client-a","iface":"eth0","inSubnet":"10.62.5.0/29","resolveBy":"id"}
- ip-client-b → config: ENGINE {"type":"iface-ip","device":"client-b","iface":"eth0","inSubnet":"10.62.5.0/29","resolveBy":"id"}
- unique-hosts → config: MANUELL: Alle Geräteadressen auf Eindeutigkeit und Hostbereich .1–.6 prüfen; Archivadresse reservieren. iface-ip prüft Netz/Präfix, aber nicht Eindeutigkeit und reservierte Endpunkte. Ein Ping kann bei einem Konflikt trotzdem gelingen.
- ping-client-a-client-b → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"client-b","expect":"success","resolveBy":"id"}
- ping-client-a-archive → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-client-b-client-a → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-client-b-archive → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-archive-client-a → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-archive-client-b → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-b","expect":"success","resolveBy":"id"}

**Grenzen**

- Konfliktfreiheit wird verpflichtend manuell kontrolliert; die vorhandenen Ping-/Subnetzprüfer reichen allein nicht.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-d01-default-gateway — Büro: lokales Netz erreichbar, Archiv nicht

Gruppe D · beginner · routing · Version 1 · draft

Der Büro-PC verwendet .30 als Default Gateway, dort existiert aber kein Router. Archiv und Router sind bereits korrekt konfiguriert. Der Router kennt beide Netze direkt.

**Auftrag**

Behalten Sie alle IPv4-Adressen und Präfixe bei. Korrigieren Sie das Default Gateway von Büro auf 10.70.1.1; Archiv behält 10.70.2.1. IP-Forwarding bleibt aktiv. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- Hin- und Rückweg einschließlich Gateway und Weiterleitung herstellen.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Behalten Sie alle IPv4-Adressen und Präfixe bei. Korrigieren Sie das Default Gateway von Büro auf 10.70.1.1; Archiv behält 10.70.2.1. IP-Forwarding bleibt aktiv.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| office | Büro | host | eth0: 10.70.1.10/27 | false | 0.0.0.0/0 via 10.70.1.30 dev eth0 |
| gateway | Standortrouter | router | eth0: 10.70.1.1/27; eth1: 10.70.2.1/28 | true | — |
| archive | Archiv | server | eth0: 10.70.2.2/28 | false | 0.0.0.0/0 via 10.70.2.1 dev eth0 |

**Verkabelung**

- line-1: office/eth0 ↔ gateway/eth0
- line-2: archive/eth0 ↔ gateway/eth1

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| office | Büro | host | eth0: 10.70.1.10/27 | false | 0.0.0.0/0 via 10.70.1.1 dev eth0 |
| gateway | Standortrouter | router | eth0: 10.70.1.1/27; eth1: 10.70.2.1/28 | true | — |
| archive | Archiv | server | eth0: 10.70.2.2/28 | false | 0.0.0.0/0 via 10.70.2.1 dev eth0 |

**Erklärung**

Ein Gateway muss als Nachbar auf dem lokalen Segment erreichbar sein. Der Router besitzt .1 in beiden Netzen, mit unterschiedlichen vollständigen Adressen. Ein Gateway im Zielnetz ist für Büro kein direkter Nachbar.

**Zulässige Alternativen**

- Default Gateway über das IPv4-Formular oder als Route konfigurieren. Eine reine Zielroute ersetzt in dieser Aufgabe die ausdrücklich geforderte Standardroute nicht. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- 10.70.2.1 als Büro-Gateway: nicht lokal.
- Nur den Router anpingen statt das entfernte Archiv.

**Typische Fehler**

- Typischer Fehler: 10.70.2.1 als Büro-Gateway: nicht lokal.
- Typischer Fehler: Nur den Router anpingen statt das entfernte Archiv.

**Korrekturzuordnung**

- ip-office-eth0 → config: ENGINE {"type":"iface-ip","device":"office","iface":"eth0","cidr":"10.70.1.10/27","resolveBy":"id"}
- ip-gateway-eth0 → config: ENGINE {"type":"iface-ip","device":"gateway","iface":"eth0","cidr":"10.70.1.1/27","resolveBy":"id"}
- ip-gateway-eth1 → config: ENGINE {"type":"iface-ip","device":"gateway","iface":"eth1","cidr":"10.70.2.1/28","resolveBy":"id"}
- ip-archive-eth0 → config: ENGINE {"type":"iface-ip","device":"archive","iface":"eth0","cidr":"10.70.2.2/28","resolveBy":"id"}
- gateway-office → config: ENGINE {"type":"default-route","device":"office","via":"10.70.1.1","resolveBy":"id"}
- gateway-archive → config: ENGINE {"type":"default-route","device":"archive","via":"10.70.2.1","resolveBy":"id"}
- forward → config: ENGINE {"type":"forwarding","device":"gateway","expect":true,"resolveBy":"id"}
- ping-office-archive → traffic: ENGINE {"type":"ping","from":"office","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-archive-office → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"office","expect":"success","resolveBy":"id"}

**Grenzen**

- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-d02-statische-routen — Zwei Standorte: Ziel- und Rückroute ergänzen

Gruppe D · intermediate · routing · Version 1 · draft

Büro und Lager besitzen korrekte Default Gateways. West und Ost sind per /30 verbunden, kennen aber nur ihre direkt angeschlossenen Netze. Es gibt keinen weiteren Uplink.

**Auftrag**

Behalten Sie alle Adressen und aktives Forwarding bei. Ergänzen Sie auf West und Ost passende Routen, sodass Büro und Lager kommunizieren. Spezifische Routen sind empfohlen; funktional gleichwertige Default-Routen sind in dieser abgeschlossenen Topologie erlaubt. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- Hin- und Rückweg einschließlich Gateway und Weiterleitung herstellen.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Behalten Sie alle Adressen und aktives Forwarding bei. Ergänzen Sie auf West und Ost passende Routen, sodass Büro und Lager kommunizieren. Spezifische Routen sind empfohlen; funktional gleichwertige Default-Routen sind in dieser abgeschlossenen Topologie erlaubt.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| office | Büro | host | eth0: 10.72.1.10/26 | false | 0.0.0.0/0 via 10.72.1.1 dev eth0 |
| west | West | router | eth0: 10.72.1.1/26; eth1: 10.72.254.1/30 | true | — |
| east | Ost | router | eth0: 10.72.254.2/30; eth1: 10.72.2.1/27 | true | — |
| warehouse | Lager | server | eth0: 10.72.2.10/27 | false | 0.0.0.0/0 via 10.72.2.1 dev eth0 |

**Verkabelung**

- line-1: office/eth0 ↔ west/eth0
- line-2: west/eth1 ↔ east/eth0
- line-3: east/eth1 ↔ warehouse/eth0

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| office | Büro | host | eth0: 10.72.1.10/26 | false | 0.0.0.0/0 via 10.72.1.1 dev eth0 |
| west | West | router | eth0: 10.72.1.1/26; eth1: 10.72.254.1/30 | true | 10.72.2.0/27 via 10.72.254.2 dev eth1 |
| east | Ost | router | eth0: 10.72.254.2/30; eth1: 10.72.2.1/27 | true | 10.72.1.0/26 via 10.72.254.1 dev eth0 |
| warehouse | Lager | server | eth0: 10.72.2.10/27 | false | 0.0.0.0/0 via 10.72.2.1 dev eth0 |

**Erklärung**

West benötigt 10.72.2.0/27 via 10.72.254.2 dev eth1; Ost benötigt 10.72.1.0/26 via 10.72.254.1 dev eth0. Nur der Hinweg genügt nicht für Echo Replies. Connected-Routen schlagen zulässige Defaults für lokale Ziele.

**Zulässige Alternativen**

- Auf beiden Routern eine Default-Route zum Transitnachbarn statt der spezifischen LAN-Route; lokale Connected-Netze bleiben spezifischer. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- Nur West ergänzen: Rückweg fehlt.
- Next Hop mit eigener Transitadresse oder falscher Schnittstelle.

**Typische Fehler**

- Typischer Fehler: Nur West ergänzen: Rückweg fehlt.
- Typischer Fehler: Next Hop mit eigener Transitadresse oder falscher Schnittstelle.

**Korrekturzuordnung**

- ip-office-eth0 → config: ENGINE {"type":"iface-ip","device":"office","iface":"eth0","cidr":"10.72.1.10/26","resolveBy":"id"}
- ip-west-eth0 → config: ENGINE {"type":"iface-ip","device":"west","iface":"eth0","cidr":"10.72.1.1/26","resolveBy":"id"}
- ip-west-eth1 → config: ENGINE {"type":"iface-ip","device":"west","iface":"eth1","cidr":"10.72.254.1/30","resolveBy":"id"}
- ip-east-eth0 → config: ENGINE {"type":"iface-ip","device":"east","iface":"eth0","cidr":"10.72.254.2/30","resolveBy":"id"}
- ip-east-eth1 → config: ENGINE {"type":"iface-ip","device":"east","iface":"eth1","cidr":"10.72.2.1/27","resolveBy":"id"}
- ip-warehouse-eth0 → config: ENGINE {"type":"iface-ip","device":"warehouse","iface":"eth0","cidr":"10.72.2.10/27","resolveBy":"id"}
- forward-west → config: ENGINE {"type":"forwarding","device":"west","expect":true,"resolveBy":"id"}
- forward-east → config: ENGINE {"type":"forwarding","device":"east","expect":true,"resolveBy":"id"}
- ping-office-warehouse → traffic: ENGINE {"type":"ping","from":"office","toDevice":"warehouse","expect":"success","resolveBy":"id"}
- ping-warehouse-office → traffic: ENGINE {"type":"ping","from":"warehouse","toDevice":"office","expect":"success","resolveBy":"id"}

**Grenzen**

- Routing wird funktional geprüft, nicht durch Erzwingen einer bestimmten Routenliste. Verkehr zu nicht genannten Zielen wird nicht bewertet.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-d03-forwarding — Drei Segmente: Router erreichbar, Weiterleitung aus

Gruppe D · intermediate · routing · Version 1 · draft

Das dedizierte Firewall-Gerät hat permissive Ausgangsregeln und drei direkt angeschlossene Netze. Endgeräte erreichen ihre Gateway-Adresse, aber nicht die Nachbarsegmente. Es wurde IP-Forwarding deaktiviert.

**Auftrag**

Aktivieren Sie IP-Forwarding auf Segmentrouter. Behalten Sie Adressen, Gateways und die vorhandenen erlaubenden Firewall-Regeln bei. Büro, Labor und Dienst müssen miteinander kommunizieren. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- Hin- und Rückweg einschließlich Gateway und Weiterleitung herstellen.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Aktivieren Sie IP-Forwarding auf Segmentrouter. Behalten Sie Adressen, Gateways und die vorhandenen erlaubenden Firewall-Regeln bei. Büro, Labor und Dienst müssen miteinander kommunizieren.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| edge | Segmentrouter | firewall | eth0: 10.74.1.1/26; eth1: 10.74.2.1/27; eth2: 10.74.3.1/28 | false | — |
| office | Büro | host | eth0: 10.74.1.10/26 | false | 0.0.0.0/0 via 10.74.1.1 dev eth0 |
| lab | Labor | host | eth0: 10.74.2.10/27 | false | 0.0.0.0/0 via 10.74.2.1 dev eth0 |
| service | Dienst | server | eth0: 10.74.3.10/28 | false | 0.0.0.0/0 via 10.74.3.1 dev eth0 |

**Verkabelung**

- line-1: edge/eth0 ↔ office/eth0
- line-2: edge/eth1 ↔ lab/eth0
- line-3: edge/eth2 ↔ service/eth0

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| edge | Segmentrouter | firewall | eth0: 10.74.1.1/26; eth1: 10.74.2.1/27; eth2: 10.74.3.1/28 | true | — |
| office | Büro | host | eth0: 10.74.1.10/26 | false | 0.0.0.0/0 via 10.74.1.1 dev eth0 |
| lab | Labor | host | eth0: 10.74.2.10/27 | false | 0.0.0.0/0 via 10.74.2.1 dev eth0 |
| service | Dienst | server | eth0: 10.74.3.10/28 | false | 0.0.0.0/0 via 10.74.3.1 dev eth0 |

**Erklärung**

An das Gateway gerichtete Pakete werden lokal verarbeitet und benötigen kein IP-Forwarding. Weitergeleitete Pakete zwischen den drei Connected-Netzen benötigen es sehr wohl; zusätzliche statische Routen sind nicht erforderlich.

**Zulässige Alternativen**

- Forwarding-Schalter im Inspector oder unterstützte sysctl-Konfiguration verwenden. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- Nur Gateway-Ping als Abnahme nutzen.
- Firewall-Policies ändern, obwohl Forwarding fehlt.

**Typische Fehler**

- Typischer Fehler: Nur Gateway-Ping als Abnahme nutzen.
- Typischer Fehler: Firewall-Policies ändern, obwohl Forwarding fehlt.

**Korrekturzuordnung**

- ip-edge-eth0 → config: ENGINE {"type":"iface-ip","device":"edge","iface":"eth0","cidr":"10.74.1.1/26","resolveBy":"id"}
- ip-edge-eth1 → config: ENGINE {"type":"iface-ip","device":"edge","iface":"eth1","cidr":"10.74.2.1/27","resolveBy":"id"}
- ip-edge-eth2 → config: ENGINE {"type":"iface-ip","device":"edge","iface":"eth2","cidr":"10.74.3.1/28","resolveBy":"id"}
- ip-office-eth0 → config: ENGINE {"type":"iface-ip","device":"office","iface":"eth0","cidr":"10.74.1.10/26","resolveBy":"id"}
- ip-lab-eth0 → config: ENGINE {"type":"iface-ip","device":"lab","iface":"eth0","cidr":"10.74.2.10/27","resolveBy":"id"}
- ip-service-eth0 → config: ENGINE {"type":"iface-ip","device":"service","iface":"eth0","cidr":"10.74.3.10/28","resolveBy":"id"}
- forward-edge → config: ENGINE {"type":"forwarding","device":"edge","expect":true,"resolveBy":"id"}
- policy-input → config: ENGINE {"type":"fw-policy","device":"edge","hook":"input","policy":"accept","resolveBy":"id"}
- policy-forward → config: ENGINE {"type":"fw-policy","device":"edge","hook":"forward","policy":"accept","resolveBy":"id"}
- policy-output → config: ENGINE {"type":"fw-policy","device":"edge","hook":"output","policy":"accept","resolveBy":"id"}
- ping-office-lab → traffic: ENGINE {"type":"ping","from":"office","toDevice":"lab","expect":"success","resolveBy":"id"}
- ping-office-service → traffic: ENGINE {"type":"ping","from":"office","toDevice":"service","expect":"success","resolveBy":"id"}
- ping-lab-office → traffic: ENGINE {"type":"ping","from":"lab","toDevice":"office","expect":"success","resolveBy":"id"}
- ping-lab-service → traffic: ENGINE {"type":"ping","from":"lab","toDevice":"service","expect":"success","resolveBy":"id"}
- ping-service-office → traffic: ENGINE {"type":"ping","from":"service","toDevice":"office","expect":"success","resolveBy":"id"}
- ping-service-lab → traffic: ENGINE {"type":"ping","from":"service","toDevice":"lab","expect":"success","resolveBy":"id"}

**Grenzen**

- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-d04-rueckweg-hostroute — Selektiver Ausfall: alte /32-Route schlägt korrekten Default

Gruppe D · advanced · routing · Version 1 · draft

Büro B erreicht das Archiv, Büro A nicht. Auf Ost ist eine alte Hostroute für Büro A über den nicht vorhandenen Nachbarn 10.76.254.6 gespeichert. Der Default über West ist korrekt, wird für dieses Ziel aber nicht gewählt.

**Auftrag**

Behalten Sie sämtliche IPv4-Adressen und aktives Forwarding auf West/Ost bei. Reparieren Sie die Route zu Büro A auf Ost; sowohl Büro A als auch Büro B müssen das Archiv erreichen. Entfernen oder korrigieren Sie die veraltete Hostroute. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Lernziele**

- Hin- und Rückweg einschließlich Gateway und Weiterleitung herstellen.
- Konfiguration und tatsächliche Ende-zu-Ende-Kommunikation getrennt prüfen.

**Pflichtanforderungen**

- config: Behalten Sie sämtliche IPv4-Adressen und aktives Forwarding auf West/Ost bei. Reparieren Sie die Route zu Büro A auf Ost; sowohl Büro A als auch Büro B müssen das Archiv erreichen. Entfernen oder korrigieren Sie die veraltete Hostroute.
- traffic: Alle angegebenen Endgeräte erreichen sich gegenseitig; Erfolg eines einzelnen Pings genügt nicht.

**Ausgangsdaten**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Büro A | host | eth0: 10.76.1.10/27 | false | 0.0.0.0/0 via 10.76.1.1 dev eth0 |
| client-b | Büro B | host | eth0: 10.76.1.11/27 | false | 0.0.0.0/0 via 10.76.1.1 dev eth0 |
| access | Zugang | switch | — | false | — |
| west | West | router | eth0: 10.76.1.1/27; eth1: 10.76.254.1/29 | true | 10.76.2.0/28 via 10.76.254.2 dev eth1 |
| east | Ost | router | eth0: 10.76.254.2/29; eth1: 10.76.2.1/28 | true | 0.0.0.0/0 via 10.76.254.1 dev eth0; 10.76.1.10/32 via 10.76.254.6 dev eth0 |
| archive | Archiv | server | eth0: 10.76.2.2/28 | false | 0.0.0.0/0 via 10.76.2.1 dev eth0 |

**Verkabelung**

- line-1: client-a/eth0 ↔ access/eth0
- line-2: client-b/eth0 ↔ access/eth1
- line-3: access/eth2 ↔ west/eth0
- line-4: west/eth1 ↔ east/eth0
- line-5: east/eth1 ↔ archive/eth0

**Referenzkonfiguration**

| Stabile ID | Anzeigename | Typ | IPv4 | Forwarding | Statische Routen |
|---|---|---|---|---|---|
| client-a | Büro A | host | eth0: 10.76.1.10/27 | false | 0.0.0.0/0 via 10.76.1.1 dev eth0 |
| client-b | Büro B | host | eth0: 10.76.1.11/27 | false | 0.0.0.0/0 via 10.76.1.1 dev eth0 |
| access | Zugang | switch | — | false | — |
| west | West | router | eth0: 10.76.1.1/27; eth1: 10.76.254.1/29 | true | 10.76.2.0/28 via 10.76.254.2 dev eth1 |
| east | Ost | router | eth0: 10.76.254.2/29; eth1: 10.76.2.1/28 | true | 0.0.0.0/0 via 10.76.254.1 dev eth0 |
| archive | Archiv | server | eth0: 10.76.2.2/28 | false | 0.0.0.0/0 via 10.76.2.1 dev eth0 |

**Erklärung**

/32 ist spezifischer als /0. Deshalb läuft der Rückweg zu .10 in eine Sackgasse, während .11 funktioniert. Löschen der Hostroute lässt den richtigen Default greifen. Ein zusätzlicher /27-Eintrag allein überstimmt die falsche /32 nicht.

**Zulässige Alternativen**

- Hostroute 10.76.1.10/32 auf den korrekten Next Hop 10.76.254.1 ändern. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.
- Falsche /32 entfernen und eine spezifische 10.76.1.0/27-Route über West verwenden. Gleichwertige Endkonfigurationen sind unabhängig vom Eingabeweg zulässig.

**Falsche Antworten / Ablehnung**

- Nur eine richtige /27 neben der falschen /32 ergänzen.
- Büro A umadressieren, statt den Rückweg zu reparieren.

**Typische Fehler**

- Typischer Fehler: Nur eine richtige /27 neben der falschen /32 ergänzen.
- Typischer Fehler: Büro A umadressieren, statt den Rückweg zu reparieren.

**Korrekturzuordnung**

- ip-client-a-eth0 → config: ENGINE {"type":"iface-ip","device":"client-a","iface":"eth0","cidr":"10.76.1.10/27","resolveBy":"id"}
- ip-client-b-eth0 → config: ENGINE {"type":"iface-ip","device":"client-b","iface":"eth0","cidr":"10.76.1.11/27","resolveBy":"id"}
- ip-west-eth0 → config: ENGINE {"type":"iface-ip","device":"west","iface":"eth0","cidr":"10.76.1.1/27","resolveBy":"id"}
- ip-west-eth1 → config: ENGINE {"type":"iface-ip","device":"west","iface":"eth1","cidr":"10.76.254.1/29","resolveBy":"id"}
- ip-east-eth0 → config: ENGINE {"type":"iface-ip","device":"east","iface":"eth0","cidr":"10.76.254.2/29","resolveBy":"id"}
- ip-east-eth1 → config: ENGINE {"type":"iface-ip","device":"east","iface":"eth1","cidr":"10.76.2.1/28","resolveBy":"id"}
- ip-archive-eth0 → config: ENGINE {"type":"iface-ip","device":"archive","iface":"eth0","cidr":"10.76.2.2/28","resolveBy":"id"}
- forward-west → config: ENGINE {"type":"forwarding","device":"west","expect":true,"resolveBy":"id"}
- forward-east → config: ENGINE {"type":"forwarding","device":"east","expect":true,"resolveBy":"id"}
- ping-client-a-client-b → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"client-b","expect":"success","resolveBy":"id"}
- ping-client-a-archive → traffic: ENGINE {"type":"ping","from":"client-a","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-client-b-client-a → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-client-b-archive → traffic: ENGINE {"type":"ping","from":"client-b","toDevice":"archive","expect":"success","resolveBy":"id"}
- ping-archive-client-a → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-a","expect":"success","resolveBy":"id"}
- ping-archive-client-b → traffic: ENGINE {"type":"ping","from":"archive","toDevice":"client-b","expect":"success","resolveBy":"id"}

**Grenzen**

- Ein Ping benötigt Hin- und Rückweg. Sein Fehlschlag allein lokalisiert keinen Fehler; die Erklärung muss mit Routingtabelle und Paketbeobachtung erarbeitet werden.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e01-cidr — Unterschiedliche Oktette

Gruppe E · beginner · subnetting · Version 1 · draft

Zwei Arbeitsplätze hängen am selben Switch in VLAN 1. Ein Kollege vermutet einen Fehler, weil sich die dritten Oktette unterscheiden.

**Auftrag**

Berechnen Sie das gemeinsame Netz und den Hostbereich. Entscheiden Sie, ob für den direkten Austausch ein Router benötigt wird. Ändern Sie eine korrekte Konfiguration nicht. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.10.50/23",
      "b": "192.168.11.60/23",
      "layer2": "same",
      "routedPath": "absent"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.10.0",
        "broadcast": "192.168.11.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "192.168.10.1",
        "last": "192.168.11.254",
        "addresses": 512,
        "hosts": 510
      },
      "b": {
        "network": "192.168.10.0",
        "broadcast": "192.168.11.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "192.168.10.1",
        "last": "192.168.11.254",
        "addresses": 512,
        "hosts": 510
      },
      "localA": true,
      "localB": true,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "possible",
      "diagnosis": "none"
    }
  ]
}
```

**Erklärung**

Die beiden IP-Adressen gehören trotz unterschiedlicher dritter Oktette zum selben /23-Netz. Die Blockgröße im dritten Oktett beträgt 2; das Netz beginnt bei 10 und endet bei 11.

fall: A: 192.168.10.0/23, Maske 255.255.254.0, Broadcast 192.168.11.255; B: 192.168.10.0/23, Maske 255.255.254.0, Broadcast 192.168.11.255. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Unter den ausdrücklich genannten Bedingungen ist der Austausch möglich. Ein Ping allein beweist keine fehlerfreie Gesamtkonfiguration.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Dritte Oktette vergleichen statt die Maske anzuwenden.
- Eine unnötige Umadressierung auf /24 verlangen.

**Typische Fehler**

- Dritte Oktette vergleichen statt die Maske anzuwenden.
- Eine unnötige Umadressierung auf /24 verlangen.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- 255.255.254.0: Welche beiden dritten Oktette umfasst der Block ab 10?

**Ausführbare Praxisbeilage**

ID: factory-e01-praxis. Nichts umkonfigurieren: beide Adressen und /23 erhalten. Kommunikation in beiden Richtungen nachweisen. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (PC A, host): eth0=192.168.10.50/23; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/23; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {}; Forwarding: false; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ sw/eth0
- line-2: b/eth0 ↔ sw/eth1

**Praxis-Referenzzustand**

- a (PC A, host): eth0=192.168.10.50/23; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/23; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {}; Forwarding: false; Routen: []

192.168.10.0/23 umfasst auch 192.168.11.x. Beide Switchports gehören standardmäßig VLAN 1 an.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"192.168.10.50/23","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"192.168.11.60/23","resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e02-cidr — Das Gateway sieht falsch aus

Gruppe E · beginner · subnetting · Version 1 · draft

Ein PC hat 192.168.99.60/16 und das Gateway 192.168.9.1. Ein Zielgerät ist mit 192.168.9.20/16 dokumentiert. Kabel, VLAN und Betriebszustand des Routers wurden nicht überprüft.

**Auftrag**

Prüfen Sie rechnerisch die Gateway-Zugehörigkeit. Trennen Sie diese Aussage von der tatsächlichen Erreichbarkeit des Zielgeräts oder externer Netze. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.99.60/16",
      "b": "192.168.9.20/16",
      "layer2": "unknown",
      "routedPath": "unknown",
      "gatewayA": "192.168.9.1"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.0.0",
        "broadcast": "192.168.255.255",
        "prefix": 16,
        "mask": "255.255.0.0",
        "first": "192.168.0.1",
        "last": "192.168.255.254",
        "addresses": 65536,
        "hosts": 65534
      },
      "b": {
        "network": "192.168.0.0",
        "broadcast": "192.168.255.255",
        "prefix": 16,
        "mask": "255.255.0.0",
        "first": "192.168.0.1",
        "last": "192.168.255.254",
        "addresses": 65536,
        "hosts": 65534
      },
      "localA": true,
      "localB": true,
      "gatewayA": "in-subnet",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "undetermined",
      "diagnosis": "unknown"
    }
  ]
}
```

**Erklärung**

192.168.0.0/16 enthält sowohl 192.168.99.60 als auch 192.168.9.1. Das Gateway ist eine nutzbare lokale Adresse. Ob dort ein Router antwortet und externe Ziele erreichbar sind, ist nicht eindeutig bestimmbar.

fall: A: 192.168.0.0/16, Maske 255.255.0.0, Broadcast 192.168.255.255; B: 192.168.0.0/16, Maske 255.255.0.0, Broadcast 192.168.255.255. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Nicht eindeutig bestimmbar: IP-Zugehörigkeit und ein lokales Gateway beweisen weder Layer-2-Verbindung noch Routing, Forwarding, Filter und Rückweg.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Das Gateway allein wegen des dritten Oktetts als ungültig einstufen.
- Aus der Gateway-Adresse eine vorhandene Internetverbindung ableiten.

**Typische Fehler**

- Das Gateway allein wegen des dritten Oktetts als ungültig einstufen.
- Aus der Gateway-Adresse eine vorhandene Internetverbindung ableiten.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Rechen-/Konzeptaufgabe ohne ausführbare Praxisbeilage.

**Optionale Hinweise**

- Erst AND mit 255.255.0.0, danach die fehlenden Layer-2-/Routingangaben benennen.

## factory-e03-cidr — Die versteckte Subnetzgrenze

Gruppe E · intermediate · subnetting · Version 1 · draft

Drei unabhängige Arbeitsplatzpaare sind jeweils direkt im selben VLAN verbunden. Gateways oder zusätzliche Routen existieren nicht. Die Adressen liegen scheinbar dicht beieinander.

**Auftrag**

Untersuchen Sie jeden Grenzfall einzeln. Nennen Sie beide Netzadressen und erklären Sie, warum räumliche oder numerische Nähe nicht genügt. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "grenze-23",
      "a": "172.20.11.250/23",
      "b": "172.20.12.5/23",
      "layer2": "same",
      "routedPath": "absent"
    },
    {
      "id": "grenze-22",
      "a": "172.20.7.250/22",
      "b": "172.20.8.5/22",
      "layer2": "same",
      "routedPath": "absent"
    },
    {
      "id": "grenze-20",
      "a": "172.20.15.250/20",
      "b": "172.20.16.5/20",
      "layer2": "same",
      "routedPath": "absent"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "grenze-23",
      "a": {
        "network": "172.20.10.0",
        "broadcast": "172.20.11.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "172.20.10.1",
        "last": "172.20.11.254",
        "addresses": 512,
        "hosts": 510
      },
      "b": {
        "network": "172.20.12.0",
        "broadcast": "172.20.13.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "172.20.12.1",
        "last": "172.20.13.254",
        "addresses": 512,
        "hosts": 510
      },
      "localA": false,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "subnet-boundary"
    },
    {
      "id": "grenze-22",
      "a": {
        "network": "172.20.4.0",
        "broadcast": "172.20.7.255",
        "prefix": 22,
        "mask": "255.255.252.0",
        "first": "172.20.4.1",
        "last": "172.20.7.254",
        "addresses": 1024,
        "hosts": 1022
      },
      "b": {
        "network": "172.20.8.0",
        "broadcast": "172.20.11.255",
        "prefix": 22,
        "mask": "255.255.252.0",
        "first": "172.20.8.1",
        "last": "172.20.11.254",
        "addresses": 1024,
        "hosts": 1022
      },
      "localA": false,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "subnet-boundary"
    },
    {
      "id": "grenze-20",
      "a": {
        "network": "172.20.0.0",
        "broadcast": "172.20.15.255",
        "prefix": 20,
        "mask": "255.255.240.0",
        "first": "172.20.0.1",
        "last": "172.20.15.254",
        "addresses": 4096,
        "hosts": 4094
      },
      "b": {
        "network": "172.20.16.0",
        "broadcast": "172.20.31.255",
        "prefix": 20,
        "mask": "255.255.240.0",
        "first": "172.20.16.1",
        "last": "172.20.31.254",
        "addresses": 4096,
        "hosts": 4094
      },
      "localA": false,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "subnet-boundary"
    }
  ]
}
```

**Erklärung**

Die Blockgrößen im dritten Oktett betragen 2, 4 und 16. Jedes Paar überschreitet genau eine solche Grenze; die gemeinsame Layer-2-Verbindung ersetzt keine Route.

grenze-23: A: 172.20.10.0/23, Maske 255.255.254.0, Broadcast 172.20.11.255; B: 172.20.12.0/23, Maske 255.255.254.0, Broadcast 172.20.13.255. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.

grenze-22: A: 172.20.4.0/22, Maske 255.255.252.0, Broadcast 172.20.7.255; B: 172.20.8.0/22, Maske 255.255.252.0, Broadcast 172.20.11.255. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.

grenze-20: A: 172.20.0.0/20, Maske 255.255.240.0, Broadcast 172.20.15.255; B: 172.20.16.0/20, Maske 255.255.240.0, Broadcast 172.20.31.255. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Jedes benachbarte dritte Oktett als gemeinsam interpretieren.
- Die Broadcastadresse des ersten Netzes zum zweiten Netz rechnen.

**Typische Fehler**

- Jedes benachbarte dritte Oktett als gemeinsam interpretieren.
- Die Broadcastadresse des ersten Netzes zum zweiten Netz rechnen.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Rechen-/Konzeptaufgabe ohne ausführbare Praxisbeilage.

**Optionale Hinweise**

- Ermitteln Sie zuerst den ganzzahligen Blockanfang, dann den letzten Wert des Blocks.

## factory-e04-cidr — Gleiches drittes Oktett, anderes Netz

Gruppe E · beginner · subnetting · Version 1 · draft

Drei unabhängige Testpaare verwenden 192.168.5.x. Jedes Paar hängt im selben VLAN, ohne Router und ohne Zusatzrouten.

**Auftrag**

Bestimmen Sie bei /25, /26 und /27 die Grenze im vierten Oktett. Erklären Sie den Unterschied zwischen demselben dritten Oktett und demselben Subnetz. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "grenze-25",
      "a": "192.168.5.126/25",
      "b": "192.168.5.129/25",
      "layer2": "same",
      "routedPath": "absent"
    },
    {
      "id": "grenze-26",
      "a": "192.168.5.62/26",
      "b": "192.168.5.65/26",
      "layer2": "same",
      "routedPath": "absent"
    },
    {
      "id": "grenze-27",
      "a": "192.168.5.30/27",
      "b": "192.168.5.33/27",
      "layer2": "same",
      "routedPath": "absent"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "grenze-25",
      "a": {
        "network": "192.168.5.0",
        "broadcast": "192.168.5.127",
        "prefix": 25,
        "mask": "255.255.255.128",
        "first": "192.168.5.1",
        "last": "192.168.5.126",
        "addresses": 128,
        "hosts": 126
      },
      "b": {
        "network": "192.168.5.128",
        "broadcast": "192.168.5.255",
        "prefix": 25,
        "mask": "255.255.255.128",
        "first": "192.168.5.129",
        "last": "192.168.5.254",
        "addresses": 128,
        "hosts": 126
      },
      "localA": false,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "subnet-boundary"
    },
    {
      "id": "grenze-26",
      "a": {
        "network": "192.168.5.0",
        "broadcast": "192.168.5.63",
        "prefix": 26,
        "mask": "255.255.255.192",
        "first": "192.168.5.1",
        "last": "192.168.5.62",
        "addresses": 64,
        "hosts": 62
      },
      "b": {
        "network": "192.168.5.64",
        "broadcast": "192.168.5.127",
        "prefix": 26,
        "mask": "255.255.255.192",
        "first": "192.168.5.65",
        "last": "192.168.5.126",
        "addresses": 64,
        "hosts": 62
      },
      "localA": false,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "subnet-boundary"
    },
    {
      "id": "grenze-27",
      "a": {
        "network": "192.168.5.0",
        "broadcast": "192.168.5.31",
        "prefix": 27,
        "mask": "255.255.255.224",
        "first": "192.168.5.1",
        "last": "192.168.5.30",
        "addresses": 32,
        "hosts": 30
      },
      "b": {
        "network": "192.168.5.32",
        "broadcast": "192.168.5.63",
        "prefix": 27,
        "mask": "255.255.255.224",
        "first": "192.168.5.33",
        "last": "192.168.5.62",
        "addresses": 32,
        "hosts": 30
      },
      "localA": false,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "subnet-boundary"
    }
  ]
}
```

**Erklärung**

Die Grenzen liegen bei Vielfachen von 128, 64 und 32 im vierten Oktett. Alle Hostadressen sind einzeln nutzbar, liegen pro Paar jedoch in verschiedenen Netzen.

grenze-25: A: 192.168.5.0/25, Maske 255.255.255.128, Broadcast 192.168.5.127; B: 192.168.5.128/25, Maske 255.255.255.128, Broadcast 192.168.5.255. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.

grenze-26: A: 192.168.5.0/26, Maske 255.255.255.192, Broadcast 192.168.5.63; B: 192.168.5.64/26, Maske 255.255.255.192, Broadcast 192.168.5.127. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.

grenze-27: A: 192.168.5.0/27, Maske 255.255.255.224, Broadcast 192.168.5.31; B: 192.168.5.32/27, Maske 255.255.255.224, Broadcast 192.168.5.63. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Die Grenze des Subnetzes wird überschritten. Ohne nutzbaren gerouteten Hin- und Rückweg reicht das Kabel nicht aus.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- 192.168.5.x ungeprüft mit /24 gleichsetzen.
- Eine gültige Hostadresse mit einem erreichbaren Ziel verwechseln.

**Typische Fehler**

- 192.168.5.x ungeprüft mit /24 gleichsetzen.
- Eine gültige Hostadresse mit einem erreichbaren Ziel verwechseln.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Rechen-/Konzeptaufgabe ohne ausführbare Praxisbeilage.

**Optionale Hinweise**

- Berechnen Sie 256 minus den letzten Maskenwert.

## factory-e05-cidr — Die falsche Reparatur

Gruppe E · intermediate · subnetting · Version 1 · draft

A und B haben /23. Am Switch gehört A zu VLAN 10 und B zu VLAN 20. Es gibt keine Verbindung oder Weiterleitung zwischen den VLANs. Der Auftrag erlaubt B in das gemeinsame VLAN 10 aufzunehmen.

**Auftrag**

Bewerten Sie den Vorschlag, beide Masken auf /16 zu ändern. Benennen Sie die tatsächlich notwendige Änderung, ohne die gültigen Hostadressen zu verwerfen. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.10.50/23",
      "b": "192.168.11.60/23",
      "layer2": "separate",
      "routedPath": "absent"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.10.0",
        "broadcast": "192.168.11.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "192.168.10.1",
        "last": "192.168.11.254",
        "addresses": 512,
        "hosts": 510
      },
      "b": {
        "network": "192.168.10.0",
        "broadcast": "192.168.11.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "192.168.10.1",
        "last": "192.168.11.254",
        "addresses": 512,
        "hosts": 510
      },
      "localA": true,
      "localB": true,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "vlan"
    }
  ]
}
```

**Erklärung**

Beide Hosts senden bereits lokale ARP-Anfragen. Diese bleiben in ihrem VLAN. In dieser Aufgabe ist ausschließlich der Access-Port von B auf VLAN 10 umzustellen; größere Masken sind keine VLAN-Reparatur.

fall: A: 192.168.10.0/23, Maske 255.255.254.0, Broadcast 192.168.11.255; B: 192.168.10.0/23, Maske 255.255.254.0, Broadcast 192.168.11.255. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Die IP-Zugehörigkeit überbrückt keine getrennten Layer-2-Segmente. Eine größere Maske repariert keine VLAN-Trennung.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- /16 als Ersatz für Layer-2-Verbindung verwenden.
- Den Switch durch einen Hub ersetzen oder die gesamte VLAN-Konfiguration löschen.

**Typische Fehler**

- /16 als Ersatz für Layer-2-Verbindung verwenden.
- Den Switch durch einen Hub ersetzen oder die gesamte VLAN-Konfiguration löschen.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- Welcher Broadcast-Bereich transportiert die ARP-Anfrage?

**Ausführbare Praxisbeilage**

ID: factory-e05-praxis. IPv4 und Kabel beibehalten. Ausschließlich sw/eth1 von VLAN 20 in das vorgegebene VLAN 10 ändern. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (PC A, host): eth0=192.168.10.50/23; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/23; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {"eth0":10,"eth1":20}; Forwarding: false; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ sw/eth0
- line-2: b/eth0 ↔ sw/eth1

**Praxis-Referenzzustand**

- a (PC A, host): eth0=192.168.10.50/23; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/23; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {"eth0":10,"eth1":10}; Forwarding: false; Routen: []

A hängt an sw/eth0 in VLAN 10, B an sw/eth1 in VLAN 20. Ohne Router zwischen diesen VLANs wird ARP nicht übermittelt. Eine breitere Maske kann das nicht ändern.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"192.168.10.50/23","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"192.168.11.60/23","resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e06-cidr — Es funktioniert trotzdem!

Gruppe E · beginner · subnetting · Version 1 · draft

192.168.10.50/16 und 192.168.11.60/16 hängen in VLAN 1 am selben Switch. Beide Interfaces sind UP. Ein Mitarbeiter möchte die vermeintlich falschen Adressen korrigieren.

**Auftrag**

Weisen Sie nach, dass für diesen direkten Austausch keine Reparatur notwendig ist. Beschreiben Sie ARP und die Grenzen eines erfolgreichen Ping-Nachweises. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.10.50/16",
      "b": "192.168.11.60/16",
      "layer2": "same",
      "routedPath": "absent"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.0.0",
        "broadcast": "192.168.255.255",
        "prefix": 16,
        "mask": "255.255.0.0",
        "first": "192.168.0.1",
        "last": "192.168.255.254",
        "addresses": 65536,
        "hosts": 65534
      },
      "b": {
        "network": "192.168.0.0",
        "broadcast": "192.168.255.255",
        "prefix": 16,
        "mask": "255.255.0.0",
        "first": "192.168.0.1",
        "last": "192.168.255.254",
        "addresses": 65536,
        "hosts": 65534
      },
      "localA": true,
      "localB": true,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "possible",
      "diagnosis": "none"
    }
  ]
}
```

**Erklärung**

Das gemeinsame Netz ist 192.168.0.0/16. ARP ermittelt die MAC des anderen Endgeräts direkt. Dies sagt nichts über DNS, externe Netze oder die Zweckmäßigkeit eines großen Broadcast-Bereichs aus.

fall: A: 192.168.0.0/16, Maske 255.255.0.0, Broadcast 192.168.255.255; B: 192.168.0.0/16, Maske 255.255.0.0, Broadcast 192.168.255.255. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Unter den ausdrücklich genannten Bedingungen ist der Austausch möglich. Ein Ping allein beweist keine fehlerfreie Gesamtkonfiguration.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Eine Änderung erzwingen, nur weil die Konfiguration ungewöhnlich aussieht.
- Mit einem Ping alle Dienste als korrekt abhaken.

**Typische Fehler**

- Eine Änderung erzwingen, nur weil die Konfiguration ungewöhnlich aussieht.
- Mit einem Ping alle Dienste als korrekt abhaken.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- Nicht jeder Diagnoseauftrag enthält einen Defekt.

**Ausführbare Praxisbeilage**

ID: factory-e06-praxis. Keine Änderung erforderlich. /16-Adressen und VLAN 1 erhalten und beide Richtungen prüfen. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (PC A, host): eth0=192.168.10.50/16; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/16; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {}; Forwarding: false; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ sw/eth0
- line-2: b/eth0 ↔ sw/eth1

**Praxis-Referenzzustand**

- a (PC A, host): eth0=192.168.10.50/16; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/16; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {}; Forwarding: false; Routen: []

Beide Adressen sind gültige Hosts in 192.168.0.0/16; im gemeinsamen VLAN antwortet der Nachbar direkt auf ARP.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"192.168.10.50/16","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"192.168.11.60/16","resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e07-cidr — Unterschiedliche Subnetzmasken

Gruppe E · intermediate · subnetting · Version 1 · draft

A nutzt 192.168.10.50/23, B 192.168.11.60/24. Beide hängen im selben VLAN. Es gibt weder Gateway noch Zusatzrouten; vorgesehen ist das gemeinsame /23.

**Auftrag**

Analysieren Sie die lokale Entscheidung aus beiden Blickrichtungen. Unterscheiden Sie die Zustellung einer Anfrage vom nötigen Rückweg. Korrigieren Sie nur Bs Maske. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.10.50/23",
      "b": "192.168.11.60/24",
      "layer2": "same",
      "routedPath": "absent"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.10.0",
        "broadcast": "192.168.11.255",
        "prefix": 23,
        "mask": "255.255.254.0",
        "first": "192.168.10.1",
        "last": "192.168.11.254",
        "addresses": 512,
        "hosts": 510
      },
      "b": {
        "network": "192.168.11.0",
        "broadcast": "192.168.11.255",
        "prefix": 24,
        "mask": "255.255.255.0",
        "first": "192.168.11.1",
        "last": "192.168.11.254",
        "addresses": 256,
        "hosts": 254
      },
      "localA": true,
      "localB": false,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "asymmetric"
    }
  ]
}
```

**Erklärung**

A fragt per ARP nach B. B hält A für entfernt und hat keinen Next Hop. Unterschiedliche Masken sind nicht grundsätzlich verboten; hier fehlt jedoch der Rückweg. B mit /23 stellt den vorgesehenen gemeinsamen Bereich her.

fall: A: 192.168.10.0/23, Maske 255.255.254.0, Broadcast 192.168.11.255; B: 192.168.11.0/24, Maske 255.255.255.0, Broadcast 192.168.11.255. A behandelt B lokal (ARP für B), B behandelt A als entfernt (Gateway nötig). Die Endgeräte entscheiden unterschiedlich über lokale Zustellung. Ein fehlender Next Hop oder Rückweg verhindert den vollständigen Austausch.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Nur As Sicht prüfen.
- Behaupten, unterschiedliche Masken verhinderten ausnahmslos jeden Verkehr.

**Typische Fehler**

- Nur As Sicht prüfen.
- Behaupten, unterschiedliche Masken verhinderten ausnahmslos jeden Verkehr.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- Wenden Sie die Maske des sendenden Hosts an, nicht die Maske des Ziels.

**Ausführbare Praxisbeilage**

ID: factory-e07-praxis. A und beide Hostadressen beibehalten. B auf das vorgegebene gemeinsame /23 korrigieren. Kein Router ist vorhanden. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (PC A, host): eth0=192.168.10.50/23; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/24; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {}; Forwarding: false; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ sw/eth0
- line-2: b/eth0 ↔ sw/eth1

**Praxis-Referenzzustand**

- a (PC A, host): eth0=192.168.10.50/23; VLANs: {}; Forwarding: false; Routen: []
- b (PC B, host): eth0=192.168.11.60/23; VLANs: {}; Forwarding: false; Routen: []
- sw (Zugang, switch): ohne IPv4; VLANs: {}; Forwarding: false; Routen: []

A hält B für lokal, B hält A für entfernt. Ohne Gateway scheitert der Rückweg. Die Referenz vereinheitlicht die Maske auf /23.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"192.168.10.50/23","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"192.168.11.60/23","resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e08-cidr — Der Gateway-Irrtum

Gruppe E · intermediate · subnetting · Version 1 · draft

Büro und Archiv sind über einen Router verbunden. Der Router hat 192.168.10.1/24 und 192.168.11.1/24, Forwarding und Rückweg funktionieren. Büro verwendet fälschlich .254 als Gateway; dort gibt es kein Gerät.

**Auftrag**

Unterscheiden Sie gültige Host-/Maskenwerte vom falschen Next Hop. Reparieren Sie den Gateway-Eintrag, ohne die beiden getrennten /24-Netze umzubauen. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.10.50/24",
      "b": "192.168.11.60/24",
      "layer2": "separate",
      "routedPath": "working",
      "gatewayA": "192.168.10.254",
      "routerA": "192.168.10.1",
      "gatewayB": "192.168.11.1",
      "routerB": "192.168.11.1"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.10.0",
        "broadcast": "192.168.10.255",
        "prefix": 24,
        "mask": "255.255.255.0",
        "first": "192.168.10.1",
        "last": "192.168.10.254",
        "addresses": 256,
        "hosts": 254
      },
      "b": {
        "network": "192.168.11.0",
        "broadcast": "192.168.11.255",
        "prefix": 24,
        "mask": "255.255.255.0",
        "first": "192.168.11.1",
        "last": "192.168.11.254",
        "addresses": 256,
        "hosts": 254
      },
      "localA": false,
      "localB": false,
      "gatewayA": "in-subnet",
      "gatewayB": "in-subnet",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "gateway"
    }
  ]
}
```

**Erklärung**

Die .254 ist rechnerisch lokal und nutzbar, aber kein vorhandener Router. Die mathematische Konfiguration ist gültig; ihre betriebliche Zuordnung ist falsch. .1 ist der dokumentierte Next Hop.

fall: A: 192.168.10.0/24, Maske 255.255.255.0, Broadcast 192.168.10.255; B: 192.168.11.0/24, Maske 255.255.255.0, Broadcast 192.168.11.255. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Der konfigurierte Next Hop liegt außerhalb des lokalen Hostbereichs oder entspricht nicht dem dokumentierten Router.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Eine lokale Adresse automatisch als funktionierendes Gateway akzeptieren.
- PC und Archiv in ein gemeinsames /16 ummaskieren.

**Typische Fehler**

- Eine lokale Adresse automatisch als funktionierendes Gateway akzeptieren.
- PC und Archiv in ein gemeinsames /16 ummaskieren.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- Vergleichen Sie die konfigurierte Gateway-Adresse mit dem tatsächlichen Routerinterface.

**Ausführbare Praxisbeilage**

ID: factory-e08-praxis. Alle IPv4-Werte erhalten. Nur den Next Hop von A auf den dokumentierten Router 192.168.10.1 korrigieren. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (Büro, host): eth0=192.168.10.50/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.10.254","dev":"eth0"}]
- b (Archiv, server): eth0=192.168.11.60/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.11.1","dev":"eth0"}]
- r (Router, router): eth0=192.168.10.1/24, eth1=192.168.11.1/24; VLANs: {}; Forwarding: true; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ r/eth0
- line-2: b/eth0 ↔ r/eth1

**Praxis-Referenzzustand**

- a (Büro, host): eth0=192.168.10.50/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.10.1","dev":"eth0"}]
- b (Archiv, server): eth0=192.168.11.60/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.11.1","dev":"eth0"}]
- r (Router, router): eth0=192.168.10.1/24, eth1=192.168.11.1/24; VLANs: {}; Forwarding: true; Routen: []

Die Adresse .254 ist ein nutzbarer Host des lokalen /24, aber dort existiert kein Router. Mathematisch lokal ist nicht gleich funktionsfähig.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"192.168.10.50/24","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"192.168.11.60/24","resolveBy":"id"}
- ip-r-eth0: ENGINE {"type":"iface-ip","device":"r","iface":"eth0","cidr":"192.168.10.1/24","resolveBy":"id"}
- ip-r-eth1: ENGINE {"type":"iface-ip","device":"r","iface":"eth1","cidr":"192.168.11.1/24","resolveBy":"id"}
- forward-r: ENGINE {"type":"forwarding","device":"r","expect":true,"resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e09-cidr — Zu großes Netzwerk

Gruppe E · advanced · subnetting · Version 1 · draft

Der Router verbindet 192.168.10.0/24 und 192.168.11.0/24. Beide Gateways, Forwarding, Filter und Rückweg sind korrekt. Büro verwendet versehentlich /16; Proxy-ARP ist nicht vorhanden.

**Auftrag**

Erklären Sie, warum das korrekte Gateway von Büro für dieses Ziel trotzdem nicht verwendet wird. Stellen Sie nur das vorgesehene Büro-/24 wieder her. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "fall",
      "a": "192.168.10.50/16",
      "b": "192.168.11.60/24",
      "layer2": "separate",
      "routedPath": "working",
      "gatewayA": "192.168.10.1",
      "routerA": "192.168.10.1",
      "gatewayB": "192.168.11.1",
      "routerB": "192.168.11.1"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "fall",
      "a": {
        "network": "192.168.0.0",
        "broadcast": "192.168.255.255",
        "prefix": 16,
        "mask": "255.255.0.0",
        "first": "192.168.0.1",
        "last": "192.168.255.254",
        "addresses": 65536,
        "hosts": 65534
      },
      "b": {
        "network": "192.168.11.0",
        "broadcast": "192.168.11.255",
        "prefix": 24,
        "mask": "255.255.255.0",
        "first": "192.168.11.1",
        "last": "192.168.11.254",
        "addresses": 256,
        "hosts": 254
      },
      "localA": true,
      "localB": false,
      "gatewayA": "in-subnet",
      "gatewayB": "in-subnet",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "remote-arp"
    }
  ]
}
```

**Erklärung**

Die Connected-Route des Clients umfasst mit /16 das Archiv. Deshalb wird dessen MAC auf dem Bürosegment gesucht statt die MAC des Routers. Die Maske ändert eine lokale Routingentscheidung, nicht die Routerkonfiguration.

fall: A: 192.168.0.0/16, Maske 255.255.0.0, Broadcast 192.168.255.255; B: 192.168.11.0/24, Maske 255.255.255.0, Broadcast 192.168.11.255. A behandelt B lokal (ARP für B), B behandelt A als entfernt (Gateway nötig). Mindestens ein Client hält das entfernte Ziel für lokal und sendet ARP im falschen Segment. Der Router wird für dieses Ziel umgangen.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Das Gateway erneut setzen, obwohl es schon korrekt ist.
- Router-Forwarding ändern, ohne die lokale ARP-Entscheidung zu prüfen.

**Typische Fehler**

- Das Gateway erneut setzen, obwohl es schon korrekt ist.
- Router-Forwarding ändern, ohne die lokale ARP-Entscheidung zu prüfen.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- Welche Route gewinnt für 192.168.11.60: Connected /16 oder Default /0?

**Ausführbare Praxisbeilage**

ID: factory-e09-praxis. Nur A von /16 auf das dokumentierte Büro-Präfix /24 korrigieren. Hostadresse, Gateway, Router und Archiv unverändert lassen. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (Büro, host): eth0=192.168.10.50/16; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.10.1","dev":"eth0"}]
- b (Archiv, server): eth0=192.168.11.60/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.11.1","dev":"eth0"}]
- r (Router, router): eth0=192.168.10.1/24, eth1=192.168.11.1/24; VLANs: {}; Forwarding: true; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ r/eth0
- line-2: b/eth0 ↔ r/eth1

**Praxis-Referenzzustand**

- a (Büro, host): eth0=192.168.10.50/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.10.1","dev":"eth0"}]
- b (Archiv, server): eth0=192.168.11.60/24; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"192.168.11.1","dev":"eth0"}]
- r (Router, router): eth0=192.168.10.1/24, eth1=192.168.11.1/24; VLANs: {}; Forwarding: true; Routen: []

Der Router trennt 192.168.10.0/24 und 192.168.11.0/24. A verwendet zunächst /16 und fragt nach dem entfernten Archiv per ARP auf dem Bürosegment. Es gibt kein Proxy-ARP.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"192.168.10.50/24","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"192.168.11.60/24","resolveBy":"id"}
- ip-r-eth0: ENGINE {"type":"iface-ip","device":"r","iface":"eth0","cidr":"192.168.10.1/24","resolveBy":"id"}
- ip-r-eth1: ENGINE {"type":"iface-ip","device":"r","iface":"eth1","cidr":"192.168.11.1/24","resolveBy":"id"}
- forward-r: ENGINE {"type":"forwarding","device":"r","expect":true,"resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.

## factory-e10-cidr — Korrekt oder Fehler?

Gruppe E · advanced · subnetting · Version 1 · draft

Vier unabhängige Tickets müssen getrennt bewertet werden. Alle ausdrücklich angegebenen Layer-2- und Routinginformationen gelten nur für das jeweilige Ticket.

**Auftrag**

Klassifizieren Sie rechnerische Konfiguration und Erreichbarkeit getrennt: gültig/ungültig sowie möglich/nicht möglich/nicht eindeutig bestimmbar. Eine fehlerhafte Default-Route muss lokalen Verkehr nicht verhindern. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "korrekt",
      "a": "10.40.0.2/28",
      "b": "10.40.0.3/28",
      "layer2": "same",
      "routedPath": "absent"
    },
    {
      "id": "broadcast",
      "a": "10.40.0.15/28",
      "b": "10.40.0.3/28",
      "layer2": "same",
      "routedPath": "absent"
    },
    {
      "id": "unbekannt",
      "a": "10.40.1.2/26",
      "b": "10.40.1.3/26",
      "layer2": "unknown",
      "routedPath": "unknown",
      "gatewayA": "10.40.1.1"
    },
    {
      "id": "lokal-trotz-gateway",
      "a": "10.40.2.2/27",
      "b": "10.40.2.3/27",
      "layer2": "same",
      "routedPath": "absent",
      "gatewayA": "10.40.3.1"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "korrekt",
      "a": {
        "network": "10.40.0.0",
        "broadcast": "10.40.0.15",
        "prefix": 28,
        "mask": "255.255.255.240",
        "first": "10.40.0.1",
        "last": "10.40.0.14",
        "addresses": 16,
        "hosts": 14
      },
      "b": {
        "network": "10.40.0.0",
        "broadcast": "10.40.0.15",
        "prefix": 28,
        "mask": "255.255.255.240",
        "first": "10.40.0.1",
        "last": "10.40.0.14",
        "addresses": 16,
        "hosts": 14
      },
      "localA": true,
      "localB": true,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "possible",
      "diagnosis": "none"
    },
    {
      "id": "broadcast",
      "a": {
        "network": "10.40.0.0",
        "broadcast": "10.40.0.15",
        "prefix": 28,
        "mask": "255.255.255.240",
        "first": "10.40.0.1",
        "last": "10.40.0.14",
        "addresses": 16,
        "hosts": 14
      },
      "b": {
        "network": "10.40.0.0",
        "broadcast": "10.40.0.15",
        "prefix": 28,
        "mask": "255.255.255.240",
        "first": "10.40.0.1",
        "last": "10.40.0.14",
        "addresses": 16,
        "hosts": 14
      },
      "localA": true,
      "localB": true,
      "gatewayA": "absent",
      "gatewayB": "absent",
      "configuration": "invalid",
      "connectivity": "blocked",
      "diagnosis": "invalid-host"
    },
    {
      "id": "unbekannt",
      "a": {
        "network": "10.40.1.0",
        "broadcast": "10.40.1.63",
        "prefix": 26,
        "mask": "255.255.255.192",
        "first": "10.40.1.1",
        "last": "10.40.1.62",
        "addresses": 64,
        "hosts": 62
      },
      "b": {
        "network": "10.40.1.0",
        "broadcast": "10.40.1.63",
        "prefix": 26,
        "mask": "255.255.255.192",
        "first": "10.40.1.1",
        "last": "10.40.1.62",
        "addresses": 64,
        "hosts": 62
      },
      "localA": true,
      "localB": true,
      "gatewayA": "in-subnet",
      "gatewayB": "absent",
      "configuration": "valid",
      "connectivity": "undetermined",
      "diagnosis": "unknown"
    },
    {
      "id": "lokal-trotz-gateway",
      "a": {
        "network": "10.40.2.0",
        "broadcast": "10.40.2.31",
        "prefix": 27,
        "mask": "255.255.255.224",
        "first": "10.40.2.1",
        "last": "10.40.2.30",
        "addresses": 32,
        "hosts": 30
      },
      "b": {
        "network": "10.40.2.0",
        "broadcast": "10.40.2.31",
        "prefix": 27,
        "mask": "255.255.255.224",
        "first": "10.40.2.1",
        "last": "10.40.2.30",
        "addresses": 32,
        "hosts": 30
      },
      "localA": true,
      "localB": true,
      "gatewayA": "outside",
      "gatewayB": "absent",
      "configuration": "invalid",
      "connectivity": "possible",
      "diagnosis": "none"
    }
  ]
}
```

**Erklärung**

Ticket korrekt: gültig und lokal möglich. Ticket broadcast: .15 ist kein Host. Ticket unbekannt: numerisch gültig, Verbindung nicht belegt. Ticket lokal-trotz-gateway: Gateway ungültig, der direkte lokale Austausch bleibt unter den angegebenen Bedingungen möglich.

korrekt: A: 10.40.0.0/28, Maske 255.255.255.240, Broadcast 10.40.0.15; B: 10.40.0.0/28, Maske 255.255.255.240, Broadcast 10.40.0.15. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Unter den ausdrücklich genannten Bedingungen ist der Austausch möglich. Ein Ping allein beweist keine fehlerfreie Gesamtkonfiguration.

broadcast: A: 10.40.0.0/28, Maske 255.255.255.240, Broadcast 10.40.0.15; B: 10.40.0.0/28, Maske 255.255.255.240, Broadcast 10.40.0.15. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Netz-/Broadcastadresse oder doppelte Hostadresse: zunächst die Adressvergabe korrigieren.

unbekannt: A: 10.40.1.0/26, Maske 255.255.255.192, Broadcast 10.40.1.63; B: 10.40.1.0/26, Maske 255.255.255.192, Broadcast 10.40.1.63. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Nicht eindeutig bestimmbar: IP-Zugehörigkeit und ein lokales Gateway beweisen weder Layer-2-Verbindung noch Routing, Forwarding, Filter und Rückweg.

lokal-trotz-gateway: A: 10.40.2.0/27, Maske 255.255.255.224, Broadcast 10.40.2.31; B: 10.40.2.0/27, Maske 255.255.255.224, Broadcast 10.40.2.31. A behandelt B lokal (ARP für B), B behandelt A lokal (ARP für A). Unter den ausdrücklich genannten Bedingungen ist der Austausch möglich. Ein Ping allein beweist keine fehlerfreie Gesamtkonfiguration.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- „Nicht eindeutig bestimmbar“ mit „ungültig“ gleichsetzen.
- Aus erfolgreichem lokalem Ping auf ein korrektes Gateway schließen.

**Typische Fehler**

- „Nicht eindeutig bestimmbar“ mit „ungültig“ gleichsetzen.
- Aus erfolgreichem lokalem Ping auf ein korrektes Gateway schließen.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Rechen-/Konzeptaufgabe ohne ausführbare Praxisbeilage.

**Optionale Hinweise**

- Führen Sie zwei getrennte Urteilsspalten statt einer einzigen Ampel.

## factory-e11-cidr — Mehrere gültige Lösungen

Gruppe E · intermediate · subnetting · Version 1 · draft

Für einen isolierten Schulungsbereich sind mindestens 30 nutzbare IPv4-Adressen innerhalb 10.80.4.0/24 erforderlich. Der Auftrag erlaubt /25 oder /26 und verlangt ausdrücklich keine minimale Netzgröße.

**Auftrag**

Wählen Sie ein ausgerichtetes Subnetz und geben Sie zwei unterschiedliche nutzbare Hostadressen darin an. Reservierte Adressen oder weitere Bereiche existieren in diesem Auftrag nicht. Eine Aussage über externe Erreichbarkeit ist nicht verlangt.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Mehrere gültige Adresspläne anhand expliziter Bedingungen statt einer Musterlösung bewerten.

**Pflichtanforderungen**

- calculation: Alle Planungsbedingungen erfüllen, nicht eine feste Musteradresse kopieren.
- diagnosis: Zwei gültige eindeutige Hosts wählen; numerische Planung nicht mit Konnektivität verwechseln.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "plan",
  "parent": "10.80.4.0/24",
  "hosts": 30,
  "allowedPrefixes": [
    25,
    26
  ]
}
```

**Referenzantwort**

```json
{
  "cidr": "10.80.4.0/26",
  "addresses": [
    "10.80.4.1",
    "10.80.4.2"
  ]
}
```

**Erklärung**

Sowohl /25 mit 126 Hosts als auch /26 mit 62 Hosts erfüllt den Auftrag. Jeder passende ausgerichtete Block innerhalb des Stammnetzes ist zulässig. Die zwei Beispielhosts müssen unterschiedlich sein und dürfen weder Netz noch Broadcast sein.

**Zulässige Alternativen**

- Andere erlaubte Präfixe, Blöcke und Hostadressen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Nur die Referenzadresse akzeptieren.
- /27 wählen, obwohl die Auswahl hier ausdrücklich /25 oder /26 lautet.
- Eine außerhalb des Stammnetzes liegende Alternative akzeptieren.

**Typische Fehler**

- Nur die Referenzadresse akzeptieren.
- /27 wählen, obwohl die Auswahl hier ausdrücklich /25 oder /26 lautet.
- Eine außerhalb des Stammnetzes liegende Alternative akzeptieren.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Rechen-/Konzeptaufgabe ohne ausführbare Praxisbeilage.

**Optionale Hinweise**

- Prüfen Sie Anforderungen, nicht die Ähnlichkeit zu einer Musterlösung.

## factory-e12-cidr — Diagnose einer Firmennetzstruktur

Gruppe E · advanced · subnetting · Version 1 · draft

Büro, Lager und Archiv hängen an drei getrennten Interfaces der Zentrale. Soll: Büro 10.60.0.0/22, Lager 10.60.4.0/25, Archiv 10.60.4.128/26. Routeradressen sind .0.1, .4.1 und .4.129. Forwarding ist aktiv, Filter erlauben den Verkehr. Nur Büro-Präfix und Lager-Gateway sind zur Änderung freigegeben.

**Auftrag**

Prüfen Sie Büro→Archiv, Lager→Archiv und die irreführende Behauptung, Lager und Archiv seien wegen 10.60.4.x lokal. Beheben Sie beide unabhängigen Fehler, erhalten Sie die korrekten Teile und prüfen Sie alle drei Endgeräte gegenseitig. Annahmen: Interfaces UP, keine Hostfilter, kein Proxy-ARP/NAT, keine zusätzlichen Routen. „working“ bezeichnet ausschließlich einen dokumentierten vollständigen Routerpfad inklusive Rückweg; er repariert keine falsche Cliententscheidung. „configuration“ bewertet numerische Host-/Gateway-Gültigkeit, nicht deren betriebliche Zuordnung. Dokumentieren Sie Netz, Broadcast, Maske, Hostbereich und Kapazität sowie lokale Entscheidungen beider Seiten.

**Lernziele**

- IPv4-Grenzen anhand der tatsächlichen Maske statt des Adressbildes bestimmen.
- Rechnerische Gültigkeit, lokale Zustellung und belegte Erreichbarkeit getrennt begründen; fehlende Informationen benennen.

**Pflichtanforderungen**

- calculation: Subnetzdaten beider Seiten exakt berechnen.
- diagnosis: Lokale Entscheidungen, Gateway-Status, numerische Gültigkeit und Erreichbarkeitsnachweis getrennt klassifizieren.

**Ausgangsdaten**

```json
{
  "family": "cidr",
  "mode": "diagnosis",
  "cases": [
    {
      "id": "buero-archiv",
      "a": "10.60.0.10/16",
      "b": "10.60.4.130/26",
      "layer2": "separate",
      "routedPath": "working",
      "gatewayA": "10.60.0.1",
      "routerA": "10.60.0.1",
      "gatewayB": "10.60.4.129",
      "routerB": "10.60.4.129"
    },
    {
      "id": "lager-archiv",
      "a": "10.60.4.10/25",
      "b": "10.60.4.130/26",
      "layer2": "separate",
      "routedPath": "working",
      "gatewayA": "10.60.4.126",
      "routerA": "10.60.4.1",
      "gatewayB": "10.60.4.129",
      "routerB": "10.60.4.129"
    }
  ]
}
```

**Referenzantwort**

```json
{
  "rows": [
    {
      "id": "buero-archiv",
      "a": {
        "network": "10.60.0.0",
        "broadcast": "10.60.255.255",
        "prefix": 16,
        "mask": "255.255.0.0",
        "first": "10.60.0.1",
        "last": "10.60.255.254",
        "addresses": 65536,
        "hosts": 65534
      },
      "b": {
        "network": "10.60.4.128",
        "broadcast": "10.60.4.191",
        "prefix": 26,
        "mask": "255.255.255.192",
        "first": "10.60.4.129",
        "last": "10.60.4.190",
        "addresses": 64,
        "hosts": 62
      },
      "localA": true,
      "localB": false,
      "gatewayA": "in-subnet",
      "gatewayB": "in-subnet",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "remote-arp"
    },
    {
      "id": "lager-archiv",
      "a": {
        "network": "10.60.4.0",
        "broadcast": "10.60.4.127",
        "prefix": 25,
        "mask": "255.255.255.128",
        "first": "10.60.4.1",
        "last": "10.60.4.126",
        "addresses": 128,
        "hosts": 126
      },
      "b": {
        "network": "10.60.4.128",
        "broadcast": "10.60.4.191",
        "prefix": 26,
        "mask": "255.255.255.192",
        "first": "10.60.4.129",
        "last": "10.60.4.190",
        "addresses": 64,
        "hosts": 62
      },
      "localA": false,
      "localB": false,
      "gatewayA": "in-subnet",
      "gatewayB": "in-subnet",
      "configuration": "valid",
      "connectivity": "blocked",
      "diagnosis": "gateway"
    }
  ]
}
```

**Erklärung**

Büro-/16 verursacht falsches lokales ARP; das vorgesehene /22 endet bei 10.60.3.255. Lager-/25 endet bei 10.60.4.127, Archiv-/26 beginnt bei .128. Lagers .126 ist zwar lokal, aber unbesetzt. Büro auf /22 und Lager-Gateway auf .4.1 korrigieren; Archiv bleibt unverändert.

buero-archiv: A: 10.60.0.0/16, Maske 255.255.0.0, Broadcast 10.60.255.255; B: 10.60.4.128/26, Maske 255.255.255.192, Broadcast 10.60.4.191. A behandelt B lokal (ARP für B), B behandelt A als entfernt (Gateway nötig). Mindestens ein Client hält das entfernte Ziel für lokal und sendet ARP im falschen Segment. Der Router wird für dieses Ziel umgangen.

lager-archiv: A: 10.60.4.0/25, Maske 255.255.255.128, Broadcast 10.60.4.127; B: 10.60.4.128/26, Maske 255.255.255.192, Broadcast 10.60.4.191. A behandelt B als entfernt (Gateway nötig), B behandelt A als entfernt (Gateway nötig). Der konfigurierte Next Hop liegt außerhalb des lokalen Hostbereichs oder entspricht nicht dem dokumentierten Router.

**Zulässige Alternativen**

- Äquivalente strukturierte Antworten: Zeilenreihenfolge beliebig, Präfix als Zahl oder /Notation, Maske als Dezimalmaske oder /Präfix; deutsche Klassifikationen. Die mathematischen Aussagen und ausdrücklich dokumentierten Bedingungen müssen unverändert bleiben.

**Falsche Antworten / Ablehnung**

- Alle Netze auf /16 erweitern.
- Nur einen Fehler beheben und einen einzigen Ping als Abnahme verwenden.
- Archiv ändern, obwohl es korrekt konfiguriert ist.

**Typische Fehler**

- Alle Netze auf /16 erweitern.
- Nur einen Fehler beheben und einen einzigen Ping als Abnahme verwenden.
- Archiv ändern, obwohl es korrekt konfiguriert ist.

**Korrekturzuordnung**

- numeric → calculation: Automatisch: vollständige strukturierte Netz-/Hostdaten bzw. erfüllte Planungsbedingungen.
- reasoning → diagnosis: Automatisch: strukturierte Klassifikation bzw. gültige Hostwahl. Die Qualität einer frei formulierten Begründung muss manuell geprüft werden.

**Grenzen**

- Interner Entwurf; nicht in Übungen veröffentlicht. Keine automatische Bewertung freier Texte oder des Diagnosewegs.
- Das Rechenmodell ist auf statische Broadcast-IPv4-Netze /0 bis /30 begrenzt. Kein Proxy-ARP, NAT, Policy-Routing, Hostfilter oder zusätzliche Hostrouten. Bei unbekannter Layer 2 oder unbewiesenem Routerpfad wird keine Erreichbarkeit erfunden.
- Separate Praxisbeilage: echte Engine-Proben, zusätzliche manuelle Kriterien verpflichtend.

**Optionale Hinweise**

- Erstellen Sie pro Quellgerät eine Tabelle aus Connected-Netz, Next Hop und Rückweg.

**Ausführbare Praxisbeilage**

ID: factory-e12-praxis. A auf das dokumentierte Büro-/22 korrigieren. Lagers Next Hop auf 10.60.4.1 korrigieren. Archiv, Router, Kabel und Hostadressen erhalten. Alle drei Endgeräte müssen sich gegenseitig erreichen. Prüfen Sie die geforderten Endgeräte gegenseitig per ICMP. Nutzen Sie Inspector oder unterstützte Terminalbefehle; kein bestimmter Befehl ist vorgeschrieben. Geräte, Kabel und nicht genannte Vorgaben bleiben erhalten.

**Praxis-Ausgangszustand**

- a (Büro, host): eth0=10.60.0.10/16; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"10.60.0.1","dev":"eth0"}]
- b (Lager, host): eth0=10.60.4.10/25; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"10.60.4.126","dev":"eth0"}]
- c (Archiv, server): eth0=10.60.4.130/26; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"10.60.4.129","dev":"eth0"}]
- r (Zentrale, router): eth0=10.60.0.1/22, eth1=10.60.4.1/25, eth2=10.60.4.129/26; VLANs: {}; Forwarding: true; Routen: []

**Kabel (bleiben erhalten)**

- line-1: a/eth0 ↔ r/eth0
- line-2: b/eth0 ↔ r/eth1
- line-3: c/eth0 ↔ r/eth2

**Praxis-Referenzzustand**

- a (Büro, host): eth0=10.60.0.10/22; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"10.60.0.1","dev":"eth0"}]
- b (Lager, host): eth0=10.60.4.10/25; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"10.60.4.1","dev":"eth0"}]
- c (Archiv, server): eth0=10.60.4.130/26; VLANs: {}; Forwarding: false; Routen: [{"dest":"0.0.0.0/0","via":"10.60.4.129","dev":"eth0"}]
- r (Zentrale, router): eth0=10.60.0.1/22, eth1=10.60.4.1/25, eth2=10.60.4.129/26; VLANs: {}; Forwarding: true; Routen: []

Büro: 10.60.0.0/22, Lager: 10.60.4.0/25, Archiv: 10.60.4.128/26. A umgeht durch /16 den Router; Lager verwendet einen unbesetzten lokalen Next Hop .126. Archiv ist korrekt. Kein Umbau der drei Connected-Netze ist notwendig.

**Praxis-Prüfungen**

- ip-a-eth0: ENGINE {"type":"iface-ip","device":"a","iface":"eth0","cidr":"10.60.0.10/22","resolveBy":"id"}
- ip-b-eth0: ENGINE {"type":"iface-ip","device":"b","iface":"eth0","cidr":"10.60.4.10/25","resolveBy":"id"}
- ip-c-eth0: ENGINE {"type":"iface-ip","device":"c","iface":"eth0","cidr":"10.60.4.130/26","resolveBy":"id"}
- ip-r-eth0: ENGINE {"type":"iface-ip","device":"r","iface":"eth0","cidr":"10.60.0.1/22","resolveBy":"id"}
- ip-r-eth1: ENGINE {"type":"iface-ip","device":"r","iface":"eth1","cidr":"10.60.4.1/25","resolveBy":"id"}
- ip-r-eth2: ENGINE {"type":"iface-ip","device":"r","iface":"eth2","cidr":"10.60.4.129/26","resolveBy":"id"}
- forward-r: ENGINE {"type":"forwarding","device":"r","expect":true,"resolveBy":"id"}
- preservation: MANUELL: Vergleichen Sie Kabel, VLANs, nicht freigegebene Adressen und Routen mit Ausgangszustand und Auftrag. Lassen Sie die ARP-/Routingentscheidung erklären. Ping und IPv4-Prüfer beweisen weder VLAN-Vorgaben noch den Diagnoseweg.
- ping-a-b: ENGINE {"type":"ping","from":"a","toDevice":"b","expect":"success","resolveBy":"id"}
- ping-a-c: ENGINE {"type":"ping","from":"a","toDevice":"c","expect":"success","resolveBy":"id"}
- ping-b-a: ENGINE {"type":"ping","from":"b","toDevice":"a","expect":"success","resolveBy":"id"}
- ping-b-c: ENGINE {"type":"ping","from":"b","toDevice":"c","expect":"success","resolveBy":"id"}
- ping-c-a: ENGINE {"type":"ping","from":"c","toDevice":"a","expect":"success","resolveBy":"id"}
- ping-c-b: ENGINE {"type":"ping","from":"c","toDevice":"b","expect":"success","resolveBy":"id"}

**Praxis-Alternativen und Grenzen**

- Jeder Eingabeweg mit den geforderten Endwerten ist zulässig. Bei Routingaufgaben sind funktional gleichwertige Zielrouten statt Default-Routen erlaubt, sofern alle geforderten Ziele erreichbar bleiben.

- Automatisch: vorgegebene IPv4-Werte, Router-Forwarding und bidirektionale ICMP-Proben. Manuell: Layer-2-Erhalt, Diagnose und ausschließlich erlaubte Änderungen. Kein neuer VLAN-Prüfer.
- Interner Entwurf, nicht im Menü veröffentlicht. Aktive Prüfungen senden echte ICMP-Pakete in der isolierten Simulation.
- Die bestehenden Prüfer belegen Endzustand und Stichproben-Kommunikation, weder den Diagnoseweg noch die Unverändertheit aller Kabel, VLANs und zusätzlicher Konfigurationen. Vor Veröffentlichung ist dafür eine Topologie-Schutzregel oder manuelle Kontrolle erforderlich.
