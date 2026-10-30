const en = {
  version:'E02 version',version1:'v1 · Original membership',version2:'v2 · Membership & connectivity',
  title:'Calculation practice (Beta)',open:'Practice subnetting & CIDR',close:'Close practice',loading:'Loading practice…',
  temporary:'Answers stay during this visit only. Reloading clears them. Existing network exercise progress is unchanged.',
  category:'Category',difficulty:'Difficulty',beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced',seed:'Seed',
  reproduce:'Open this seed',another:'Another variant',check:'Check answer',reveal:'Show solution',solution:'One valid solution',
  yes:'Yes',no:'No',unknown:'Not enough information',correct:'Correct',incorrect:'Incorrect',missing:'Please answer this field.',
  passed:'All answers are correct.',review:'Review the marked fields.',details:'Explanation',assisted:'Solution viewed · assisted attempt',
  invalidSeed:'Use a seed with 1–256 characters.',contentLanguage:'Tasks and explanations are in German.',
  configuration:'Question settings',configure:'Configure',answers:'Your answers',next:'Next question (Space)',nextError:'A new variant could not be created. Your answers have been kept. Please try again.',moveCenter:'Center practice window',moveSide:'Move practice window to the side',
} as const;
type Messages=Record<keyof typeof en,string>;
const de:Messages={
  version:'E02-Version',version1:'v1 · Ursprüngliche Zugehörigkeit',version2:'v2 · Zugehörigkeit & Erreichbarkeit',
  title:'Rechenpraxis (Beta)',open:'Subnetting & CIDR üben',close:'Rechenpraxis schließen',loading:'Rechenpraxis wird geladen…',
  temporary:'Antworten bleiben nur während dieses Besuchs erhalten. Neuladen löscht sie. Bestehender Netzwerk-Übungsfortschritt bleibt unverändert.',
  category:'Kategorie',difficulty:'Schwierigkeit',beginner:'Einstieg',intermediate:'Mittel',advanced:'Fortgeschritten',seed:'Seed',
  reproduce:'Diese Seed öffnen',another:'Andere Variante',check:'Antwort prüfen',reveal:'Lösung anzeigen',solution:'Eine gültige Lösung',
  yes:'Ja',no:'Nein',unknown:'Nicht eindeutig bestimmbar',correct:'Richtig',incorrect:'Nicht richtig',missing:'Bitte dieses Feld beantworten.',
  passed:'Alle Antworten sind richtig.',review:'Bitte die markierten Felder prüfen.',details:'Erklärung',assisted:'Lösung angesehen · unterstützter Versuch',
  invalidSeed:'Seed mit 1–256 Zeichen verwenden.',contentLanguage:'Aufgaben und Erklärungen sind auf Deutsch.',
  configuration:'Aufgabeneinstellungen',configure:'Konfigurieren',answers:'Ihre Antworten',next:'Nächste Aufgabe (Leertaste)',nextError:'Eine neue Variante konnte nicht erstellt werden. Ihre Antworten bleiben erhalten. Bitte erneut versuchen.',moveCenter:'Rechenpraxis zentrieren',moveSide:'Rechenpraxis seitlich anzeigen',
};
const ptBR:Messages={
  version:'Versão E02',version1:'v1 · Pertencimento original',version2:'v2 · Pertencimento e conectividade',
  title:'Prática de cálculo (Beta)',open:'Praticar subnetting e CIDR',close:'Fechar prática',loading:'Carregando prática…',
  temporary:'As respostas duram apenas nesta visita. Atualizar a página as apaga. O progresso dos exercícios de rede permanece intacto.',
  category:'Categoria',difficulty:'Dificuldade',beginner:'Inicial',intermediate:'Intermediária',advanced:'Avançada',seed:'Seed',
  reproduce:'Abrir esta seed',another:'Outra variante',check:'Verificar resposta',reveal:'Mostrar solução',solution:'Uma solução válida',
  yes:'Sim',no:'Não',unknown:'Informações insuficientes',correct:'Correto',incorrect:'Incorreto',missing:'Responda este campo.',
  passed:'Todas as respostas estão corretas.',review:'Revise os campos indicados.',details:'Explicação',assisted:'Solução consultada · tentativa assistida',
  invalidSeed:'Use uma seed de 1–256 caracteres.',contentLanguage:'Enunciados e explicações estão em alemão.',
  configuration:'Configurações da questão',configure:'Configurar',answers:'Suas respostas',next:'Próxima questão (Espaço)',nextError:'Não foi possível criar outra variante. Suas respostas foram preservadas. Tente novamente.',moveCenter:'Centralizar a janela de prática',moveSide:'Posicionar a janela de prática na lateral',
};
export default {en,de,'pt-BR':ptBR};
