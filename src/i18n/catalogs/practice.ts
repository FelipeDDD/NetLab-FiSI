const en = {
  title:'Calculation practice (Beta)',open:'Practice subnetting & CIDR',close:'Close practice',loading:'Loading practice…',
  temporary:'Answers stay during this visit only. Reloading clears them. Existing network exercise progress is unchanged.',
  category:'Category',difficulty:'Difficulty',beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced',seed:'Seed',
  reproduce:'Open this seed',another:'Another variant',check:'Check answer',reveal:'Show solution',solution:'One valid solution',
  yes:'Yes',no:'No',unknown:'Not enough information',choose:'Choose an answer',correct:'Correct',incorrect:'Incorrect',missing:'Please answer this field.',
  passed:'All answers are correct.',review:'Review the marked fields.',details:'Explanation',assisted:'Solution viewed · assisted attempt',
  invalidSeed:'Use a seed with 1–256 characters.',contentLanguage:'Tasks and explanations are in German.',
} as const;
type Messages=Record<keyof typeof en,string>;
const de:Messages={
  title:'Rechenpraxis (Beta)',open:'Subnetting & CIDR üben',close:'Rechenpraxis schließen',loading:'Rechenpraxis wird geladen…',
  temporary:'Antworten bleiben nur während dieses Besuchs erhalten. Neuladen löscht sie. Bestehender Netzwerk-Übungsfortschritt bleibt unverändert.',
  category:'Kategorie',difficulty:'Schwierigkeit',beginner:'Einstieg',intermediate:'Mittel',advanced:'Fortgeschritten',seed:'Seed',
  reproduce:'Diese Seed öffnen',another:'Andere Variante',check:'Antwort prüfen',reveal:'Lösung anzeigen',solution:'Eine gültige Lösung',
  yes:'Ja',no:'Nein',unknown:'Nicht eindeutig bestimmbar',choose:'Antwort auswählen',correct:'Richtig',incorrect:'Nicht richtig',missing:'Bitte dieses Feld beantworten.',
  passed:'Alle Antworten sind richtig.',review:'Bitte die markierten Felder prüfen.',details:'Erklärung',assisted:'Lösung angesehen · unterstützter Versuch',
  invalidSeed:'Seed mit 1–256 Zeichen verwenden.',contentLanguage:'Aufgaben und Erklärungen sind auf Deutsch.',
};
const ptBR:Messages={
  title:'Prática de cálculo (Beta)',open:'Praticar subnetting e CIDR',close:'Fechar prática',loading:'Carregando prática…',
  temporary:'As respostas duram apenas nesta visita. Atualizar a página as apaga. O progresso dos exercícios de rede permanece intacto.',
  category:'Categoria',difficulty:'Dificuldade',beginner:'Inicial',intermediate:'Intermediária',advanced:'Avançada',seed:'Seed',
  reproduce:'Abrir esta seed',another:'Outra variante',check:'Verificar resposta',reveal:'Mostrar solução',solution:'Uma solução válida',
  yes:'Sim',no:'Não',unknown:'Informações insuficientes',choose:'Selecione uma resposta',correct:'Correto',incorrect:'Incorreto',missing:'Responda este campo.',
  passed:'Todas as respostas estão corretas.',review:'Revise os campos indicados.',details:'Explicação',assisted:'Solução consultada · tentativa assistida',
  invalidSeed:'Use uma seed de 1–256 caracteres.',contentLanguage:'Enunciados e explicações estão em alemão.',
};
export default {en,de,'pt-BR':ptBR};
