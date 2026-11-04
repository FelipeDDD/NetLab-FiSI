const en={
 open:'Restart chapter',title:'Restart chapter?',description:'Progress in this chapter will be reset and its initial configuration restored. Earlier chapters will be preserved.',
 confirm:'Confirm',cancel:'Cancel',missing:'This attempt has no complete, reliable checkpoint. Its current data will be preserved.',
 conflict:'The configuration or attempt changed and cannot be restored safely. Nothing was partially reset.',
 later:'A later chapter already exists in this draft. Start a separate attempt to preserve that work.',
 storage:'Restart could not be completed. Keep/export the local copy and try again, or reload the stored session.',
 newAttempt:'Start a separate attempt',newInfo:'Keeps this draft. Chapters 1/2 start a new tutorial series; Chapter 3 uses its direct start.',
};
type Messages=Record<keyof typeof en,string>;
const de:Messages={
 open:'Kapitel neu starten',title:'Kapitel neu starten?',description:'Der Fortschritt dieses Kapitels wird zurückgesetzt und die Ausgangskonfiguration wiederhergestellt. Frühere Kapitel bleiben erhalten.',
 confirm:'Bestätigen',cancel:'Abbrechen',missing:'Für diesen Versuch fehlt ein vollständiger, verlässlicher Checkpoint. Die vorhandenen Daten bleiben erhalten.',
 conflict:'Konfiguration oder Versuch wurden geändert und lassen sich nicht sicher wiederherstellen. Es wurde kein Teilreset ausgeführt.',
 later:'In diesem Entwurf besteht bereits ein späteres Kapitel. Ein separater Versuch erhält diese Arbeit.',
 storage:'Der Neustart konnte nicht abgeschlossen werden. Lokale Kopie behalten/exportieren und erneut versuchen oder die gespeicherte Sitzung neu laden.',
 newAttempt:'Separaten Versuch starten',newInfo:'Dieser Entwurf bleibt erhalten. Kapitel 1/2 beginnen eine neue Tutorialreihe; Kapitel 3 nutzt den Direktstart.',
};
const ptBR:Messages={
 open:'Reiniciar capítulo',title:'Reiniciar capítulo?',description:'O progresso deste capítulo será zerado e sua configuração inicial restaurada. Os capítulos anteriores serão preservados.',
 confirm:'Confirmar',cancel:'Cancelar',missing:'Esta tentativa não possui um checkpoint completo e confiável. Os dados atuais serão preservados.',
 conflict:'A configuração ou tentativa mudou e não pode ser restaurada com segurança. Nenhum reset parcial foi executado.',
 later:'Este rascunho já possui um capítulo posterior. Inicie uma tentativa separada para preservar esse trabalho.',
 storage:'Não foi possível concluir o reinício. Preserve/exporte a cópia local e tente novamente ou recarregue a sessão salva.',
 newAttempt:'Iniciar tentativa separada',newInfo:'Preserva este rascunho. Capítulos 1/2 iniciam uma nova sequência de tutoriais; o Capítulo 3 usa o início direto.',
};
export default {en,de,'pt-BR':ptBR};
