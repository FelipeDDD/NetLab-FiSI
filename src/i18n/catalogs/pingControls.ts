const en = {
  remember: 'Remember speed',
  chooseTarget: '{source} → Select target · Esc to cancel',
  drag: 'Move Ping-Animation', dragHint: 'Drag to move or use the arrow keys',
  close: 'Close ping controls', closeHint: 'Close controls · Animation continues',
  speed: 'Ping animation speed', speedValue: '{speed}× · ping display only', speedHint: 'Ping display only · Network time unchanged',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  remember: 'Geschwindigkeit merken',
  chooseTarget: '{source} → Ziel auswählen · Esc zum Abbrechen',
  drag: 'Ping-Animation verschieben', dragHint: 'Zum Verschieben ziehen oder Pfeiltasten verwenden',
  close: 'Ping-Steuerung schließen', closeHint: 'Steuerung schließen · Animation läuft weiter',
  speed: 'Geschwindigkeit der Ping-Animation', speedValue: '{speed}× · nur Ping-Darstellung', speedHint: 'Nur Ping-Darstellung · Netzwerkzeit unverändert',
};
const pt: Messages = {
  remember: 'Lembrar velocidade',
  chooseTarget: '{source} → Selecione o destino · Esc para cancelar',
  drag: 'Mover Ping-Animation', dragHint: 'Arraste para mover ou use as setas do teclado',
  close: 'Fechar controles do ping', closeHint: 'Fechar controles · A animação continua',
  speed: 'Velocidade da animação do ping', speedValue: '{speed}× · somente visualização do ping', speedHint: 'Somente visualização do ping · Tempo da rede inalterado',
};
export default { en, de, 'pt-BR': pt };
