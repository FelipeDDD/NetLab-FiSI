/** Reviewed ND02 v3 presentation, shared by public practice and the dev preview. */
import {translateMessages,type Language} from '../../i18n';
const en={
  category:'Subnet boundaries',check:'Check all answers',incomplete:'Please answer every question first. Joint feedback remains hidden.',maskMissing:'Enter four complete octets (0–255).',keyLabel:'Correct answer',
  exerciseTitle:'Gateway and subnet',membership:'Does the gateway address lie {term} within the PC’s subnet?',term:'mathematically',host:'Is the gateway address a usable host address in this subnet?',mask:'Which subnet mask corresponds to the PC’s CIDR prefix?',
  memberInside:'{candidate} lies within the block. Network and broadcast addresses belong mathematically to the subnet.',memberOutside:'{candidate} lies outside the block. Network and broadcast addresses belong mathematically to the subnet.',
  hostNetwork:'The gateway address is the network address, not a usable host address.',hostBroadcast:'The gateway address is the broadcast address, not a usable host address.',hostOutside:'The gateway address lies outside this subnet.',hostUsable:'The gateway address lies within the usable host range.',hostOctet:'An ending of .0 or .255 alone does not determine an IPv4 address’s role.',
  maskReason:'/{prefix} means {prefix} set network bits: {bits} bits in the four octets. This gives {mask}.',
  calculation:'Calculation',addressCount:'{count} addresses',network:'Network address',broadcast:'Broadcast address',hostRange:'Host range',
} as const;
type Messages=Record<keyof typeof en,string>;
const de:Messages={
  category:'Subnetzgrenzen',check:'Alle Antworten prüfen',incomplete:'Bitte beantworten Sie zuerst alle Fragen. Die gemeinsame Auswertung bleibt verborgen.',maskMissing:'Bitte vier vollständige Oktette (0–255) eingeben.',keyLabel:'Richtige Antwort',
  exerciseTitle:'Gateway und Subnetz',membership:'Liegt die Gateway-Adresse {term} im Subnetz des PCs?',term:'rechnerisch',host:'Ist die Gateway-Adresse eine nutzbare Hostadresse dieses Subnetzes?',mask:'Welche Subnetzmaske entspricht dem CIDR-Präfix des PCs?',
  memberInside:'{candidate} liegt innerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.',memberOutside:'{candidate} liegt außerhalb des Blocks. Netz- und Broadcastadresse gehören mathematisch zum Subnetz.',
  hostNetwork:'Die Gateway-Adresse ist die Netzadresse, keine nutzbare Hostadresse.',hostBroadcast:'Die Gateway-Adresse ist die Broadcastadresse, keine nutzbare Hostadresse.',hostOutside:'Die Gateway-Adresse liegt außerhalb dieses Subnetzes.',hostUsable:'Die Gateway-Adresse liegt im nutzbaren Hostbereich.',hostOctet:'.0 oder .255 allein bestimmen nicht die Rolle einer IPv4-Adresse.',
  maskReason:'/{prefix} bedeutet {prefix} gesetzte Netzbits: {bits} Bits in den vier Oktetten. Daraus folgt {mask}.',calculation:'Rechenweg',addressCount:'{count} Adressen',network:'Netzadresse',broadcast:'Broadcastadresse',hostRange:'Hostbereich',
};
const pt:Messages={
  category:'Limites das sub-redes',check:'Verificar todas as respostas',incomplete:'Responda todas as perguntas primeiro. A correção conjunta permanece oculta.',maskMissing:'Digite os quatro octetos completos (0–255).',keyLabel:'Resposta correta',
  exerciseTitle:'Gateway e sub-rede',membership:'O endereço do gateway pertence {term} à sub-rede do PC?',term:'matematicamente',host:'O endereço do gateway é um endereço de host utilizável nesta sub-rede?',mask:'Qual máscara de sub-rede corresponde ao prefixo CIDR do PC?',
  memberInside:'{candidate} está dentro do bloco. Os endereços de rede e de broadcast pertencem matematicamente à sub-rede.',memberOutside:'{candidate} está fora do bloco. Os endereços de rede e de broadcast pertencem matematicamente à sub-rede.',
  hostNetwork:'O endereço do gateway é o endereço de rede, não um endereço de host utilizável.',hostBroadcast:'O endereço do gateway é o endereço de broadcast, não um endereço de host utilizável.',hostOutside:'O endereço do gateway está fora desta sub-rede.',hostUsable:'O endereço do gateway está no intervalo de hosts utilizáveis.',hostOctet:'Terminar em .0 ou .255, por si só, não determina a função de um endereço IPv4.',
  maskReason:'/{prefix} significa {prefix} bits de rede definidos como 1: {bits} bits nos quatro octetos. Isso resulta em {mask}.',calculation:'Cálculo',addressCount:'{count} endereços',network:'Endereço de rede',broadcast:'Endereço de broadcast',hostRange:'Intervalo de hosts',
};
export const nd02Messages={en,de,'pt-BR':pt};
export const nd02Text=(language:Language,key:keyof Messages,values?:Record<string,string|number>)=>translateMessages(nd02Messages,language,key,values);
