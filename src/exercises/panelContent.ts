export interface ExercisePanelCheck {
  id: string;
  requirementId: string;
}

export interface ExercisePanelResult {
  pass: boolean;
}

export interface ExercisePanelRequirement {
  id: string;
}

export const EXERCISE_PANEL_INTRO: Record<string, string> = {
  'fisi-office-warehouse-routing': 'Büro und Lager liegen in getrennten Netzen; r1 verbindet beide. Richten Sie Hin- und Rückweg ein und aktivieren Sie IPv4-Forwarding. Behalten Sie alle vier vorgegebenen IP-Adressen und Präfixe bei; spezifische oder Default-Routen sind erlaubt, NAT ist nicht nötig.',
  'fisi-service-portal': 'Beim Serviceportal zeigen DNS-Eintrag und HTTP-Dienst auf falsche Einstellungen. Sorgen Sie dafür, dass portal.intern zu 10.63.5.80 auflöst und die Seite über Port 8080 den geforderten Text liefert. Behalten Sie die IPv4-Adressen bei; Zugriff nur per IP-Adresse genügt nicht.',
  'pilot-e06-v1': 'PC A und PC B nutzen unterschiedliche dritte Oktette, aber beide eine /16-Maske im selben LAN. Prüfen Sie die lokale Zustellung und die Erreichbarkeit in beide Richtungen. Die Konfiguration kann bereits stimmen; ändern Sie nur, was nötig ist, und erhalten Sie die Netzstruktur.',
  'pilot-e08-v1': 'Büro und Archiv liegen in getrennten /24-Netzen; Router und Archiv sind vorkonfiguriert. Stellen Sie die Kommunikation in beide Richtungen her. Ändern Sie nur die Routen oder das Gateway von Büro; IP-Adressen, Masken und übrige Konfiguration bleiben erhalten. Zielroute oder funktionierende Default-Route sind möglich.',
  'pilot-e09-v1': 'Der Router verbindet Büro (192.168.10.0/24) und Archiv (192.168.11.0/24); übrige Geräte und Wege sind eingerichtet. Stellen Sie die vorgesehene /24-Maske auf Büro ein und prüfen Sie die Kommunikation in beide Richtungen. Nur Büros Maske darf sich ändern; Adresse, Gateways, Routen und Netzaufbau bleiben erhalten.',
  'pilot-d02-v1': 'Verbinden Sie Büro und Lager durch statische Routen auf West und Ost. Testen Sie die Verbindung in beide Richtungen. Nur statische Routen dürfen geändert werden; Adressen, Masken, Interfacezustände und aktives Forwarding bleiben erhalten. Zielrouten und funktional gleichwertige Default-Routen sind zulässig.',
};

export function summarizeExerciseChecks(
  requirements: readonly ExercisePanelRequirement[],
  checks: readonly ExercisePanelCheck[],
  results: Readonly<Record<string, ExercisePanelResult>>,
) {
  let passed = 0;
  let checked = 0;
  for (const requirement of requirements) {
    const group = checks.filter(check => check.requirementId === requirement.id);
    const complete = group.length > 0 && group.every(check => results[check.id] !== undefined);
    if (complete) {
      checked++;
      if (group.every(check => results[check.id].pass)) passed++;
    }
  }
  return { passed, checked, total: requirements.length };
}
