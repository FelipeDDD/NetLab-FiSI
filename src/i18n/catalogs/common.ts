const en = {
  language: 'Language', retry: 'Try again', close: 'Close', cancel: 'Cancel',
  home: 'Home', loading: 'Loading…',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = { language: 'Sprache', retry: 'Erneut versuchen', close: 'Schließen', cancel: 'Abbrechen', home: 'Startseite', loading: 'Wird geladen…', };
const ptBR: Messages = { language: 'Idioma', retry: 'Tentar novamente', close: 'Fechar', cancel: 'Cancelar', home: 'Início', loading: 'Carregando…', };
export default { en, de, 'pt-BR': ptBR };
