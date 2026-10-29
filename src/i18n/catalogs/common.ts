const en = {
  language: 'Language', theme: 'UI theme', retry: 'Try again', close: 'Close', cancel: 'Cancel',
  home: 'Home', loading: 'Loading…', local: 'Stored in this browser',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = { language: 'Sprache', theme: 'UI Theme', retry: 'Erneut versuchen', close: 'Schließen', cancel: 'Abbrechen', home: 'Startseite', loading: 'Wird geladen…', local: 'In diesem Browser gespeichert' };
const ptBR: Messages = { language: 'Idioma', theme: 'Tema da interface', retry: 'Tentar novamente', close: 'Fechar', cancel: 'Cancelar', home: 'Início', loading: 'Carregando…', local: 'Salvo neste navegador' };
export default { en, de, 'pt-BR': ptBR };
