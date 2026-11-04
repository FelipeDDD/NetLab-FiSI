const en = {
  added: 'Reference pinned ({count}/2). Help stays open to select another section.',
  pin: 'Pin reference', close: 'Close reference',
  move: 'Drag to move; use arrow keys when focused.',
  duplicate: 'This reference is already open.', limit: 'Two references are already open. Close one first.',
};
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  added: 'Referenz angeheftet ({count}/2). Die Hilfe bleibt für eine weitere Auswahl geöffnet.',
  pin: 'Anheften', close: 'Referenz schließen',
  move: 'Zum Verschieben ziehen; bei Tastaturfokus die Pfeiltasten verwenden.',
  duplicate: 'Diese Referenz ist bereits geöffnet.', limit: 'Zwei Referenzen sind bereits geöffnet. Schließen Sie zuerst eine davon.',
};
const ptBR: Messages = {
  added: 'Referência fixada ({count}/2). A ajuda continua aberta para selecionar outra seção.',
  pin: 'Fixar referência', close: 'Fechar referência',
  move: 'Arraste para mover; use as setas quando o cabeçalho estiver em foco.',
  duplicate: 'Esta referência já está aberta.', limit: 'Duas referências já estão abertas. Feche uma primeiro.',
};
export default { en, de, 'pt-BR': ptBR };
