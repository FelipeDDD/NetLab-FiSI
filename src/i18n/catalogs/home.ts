const en = {
  labs: 'Browse Labs',
  about: 'An independent educational project for learning and exploring networks. Simulated behavior, not a replacement for real hardware.',
  skip: 'Skip to content', footer: 'Built for curiosity. Designed for practice.',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  labs: 'Labs ansehen',
  about: 'Ein unabhängiges Bildungsprojekt zum Lernen und Erkunden von Netzwerken. Simuliertes Verhalten ersetzt keine echte Hardware.',
  skip: 'Zum Inhalt springen', footer: 'Für Neugier gemacht. Zum Üben entwickelt.',
};
const ptBR: Messages = {
  labs: 'Conhecer os Labs',
  about: 'Um projeto educacional independente para aprender e explorar redes. Comportamento simulado não substitui equipamentos reais.',
  skip: 'Ir para o conteúdo', footer: 'Feito para explorar. Pensado para praticar.',
};
export default { en, de, 'pt-BR': ptBR };
