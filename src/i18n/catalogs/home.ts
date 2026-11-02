const en = {
  labs: 'Browse Labs',
  about: 'An independent educational project for learning and exploring networks.',
  skip: 'Skip to content', footer: 'Built for curiosity. Designed for practice.',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  labs: 'Labs ansehen',
  about: 'Ein unabhängiges Bildungsprojekt zum Lernen und Erkunden von Netzwerken.',
  skip: 'Zum Inhalt springen', footer: 'Für Neugier gemacht. Zum Üben entwickelt.',
};
const ptBR: Messages = {
  labs: 'Conhecer os Labs',
  about: 'Um projeto educacional independente para aprender e explorar redes.',
  skip: 'Ir para o conteúdo', footer: 'Feito para explorar. Pensado para praticar.',
};
export default { en, de, 'pt-BR': ptBR };
