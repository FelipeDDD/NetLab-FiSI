const en = {
  title: 'Configure IPv4', open: 'Help: configure IPv4', back: 'Back to the editor',
  intro: 'An IPv4 address identifies an interface on a network. It consists of four numbers from 0 to 255, for example 192.168.10.10.',
  example: 'One configuration, three parts', ip: 'IP address', ipMeaning: 'An IP address is like a house number on a network. Other devices use it to send data to the correct destination. It must be unique within the same network.',
  mask: 'Subnet mask / CIDR', maskMeaning: 'The subnet mask separates network and host bits. /24 equals 255.255.255.0. The address 192.168.10.10/24 belongs to the network 192.168.10.0/24.',
  gateway: 'Gateway (optional)', gatewayMeaning: 'The next router for destinations outside the local subnet. It must be reachable on the local network. Local destinations need no gateway.',
  inspector: 'Using the Inspector', step1: 'Select a host, server or router on the canvas.', step2: 'Open Netzwerk → Interfaces · IPv4 and choose the interface, for example eth0. On routers, open Interfaces and expand the interface.', step3: 'For a static configuration, turn off automatic addressing (DHCP). Enter 192.168.10.10 and /24 (or 255.255.255.0).',
  linux: 'Using the Linux terminal', linuxIntro: 'Open the device terminal and check its interfaces:', netlabNote: 'Note about NetLab',
  linuxAdd: 'On an interface without an IPv4 address, this sets the address and mask:',
  linuxLimit: 'NetLab allows one IPv4 address per interface. ip address add only works when no address is set; change an existing address in the Inspector. Set the gateway separately.',
  windows: 'Using Windows CMD', windowsIntro: 'Display the current configuration:',
  windowsLimit: 'NetLab does not implement static IPv4 configuration through netsh. Set the address and mask in the Inspector.',
} as const;
type Messages = Record<keyof typeof en, string>;
const de: Messages = {
  title: 'IPv4 konfigurieren', open: 'Hilfe: IPv4 konfigurieren', back: 'Zurück zum Editor',
  intro: 'Eine IPv4-Adresse kennzeichnet eine Schnittstelle im Netzwerk. Sie besteht aus vier Zahlen von 0 bis 255, zum Beispiel 192.168.10.10.',
  example: 'Eine Konfiguration, drei Bestandteile', ip: 'IP-Adresse', ipMeaning: 'Eine IP-Adresse ist wie eine Hausnummer im Netzwerk. Andere Geräte nutzen sie, um Daten an das richtige Ziel zu senden. Im selben Netz muss sie eindeutig sein.',
  mask: 'Subnetzmaske / CIDR', maskMeaning: 'Die Subnetzmaske trennt Netz- und Hostanteil. /24 entspricht 255.255.255.0. Die Adresse 192.168.10.10/24 gehört zum Netz 192.168.10.0/24.',
  gateway: 'Gateway (optional)', gatewayMeaning: 'Der nächste Router für Ziele außerhalb des lokalen Subnetzes. Er muss im lokalen Netz erreichbar sein. Lokale Ziele benötigen keinen Gateway.',
  inspector: 'Über den Inspector', step1: 'Host, Server oder Router auf dem Canvas auswählen.', step2: 'Netzwerk → Interfaces · IPv4 öffnen und die Schnittstelle wählen, zum Beispiel eth0. Bei Routern: Interfaces öffnen und die Schnittstelle aufklappen.', step3: 'Für eine statische Konfiguration die automatische Adressvergabe (DHCP) ausschalten. 192.168.10.10 und /24 (oder 255.255.255.0) eintragen.',
  linux: 'Über das Linux-Terminal', linuxIntro: 'Terminal des Geräts öffnen und die Schnittstellen prüfen:', netlabNote: 'Hinweis zu NetLab',
  linuxAdd: 'Auf einer Schnittstelle ohne IPv4-Adresse setzt dieser Befehl Adresse und Maske:',
  linuxLimit: 'NetLab unterstützt eine IPv4-Adresse pro Schnittstelle. ip address add funktioniert nur, wenn noch keine Adresse gesetzt ist; vorhandene Adressen im Inspector ändern. Das Gateway separat einstellen.',
  windows: 'Über Windows CMD', windowsIntro: 'Aktuelle Konfiguration anzeigen:',
  windowsLimit: 'Eine statische IPv4-Konfiguration per netsh ist in NetLab nicht implementiert. Adresse und Maske im Inspector setzen.',
};
const ptBR: Messages = {
  title: 'Configurar IPv4', open: 'Ajuda: configurar IPv4', back: 'Voltar ao editor',
  intro: 'Um endereço IPv4 identifica uma interface na rede. Ele contém quatro números de 0 a 255, como 192.168.10.10.',
  example: 'Uma configuração, três partes', ip: 'Endereço IP', ipMeaning: 'Um endereço IP funciona como um número de casa na rede. Outros dispositivos usam esse endereço para enviar dados ao destino correto. Ele deve ser único na mesma rede.',
  mask: 'Máscara de sub-rede / CIDR', maskMeaning: 'A máscara separa a parte da rede e a do host. /24 equivale a 255.255.255.0. O endereço 192.168.10.10/24 pertence à rede 192.168.10.0/24.',
  gateway: 'Gateway (opcional)', gatewayMeaning: 'O próximo roteador para destinos fora da sub-rede local. Ele precisa estar acessível na rede local. Destinos locais não precisam de gateway.',
  inspector: 'Pelo Inspector', step1: 'Selecione um host, servidor ou roteador no canvas.', step2: 'Abra Netzwerk → Interfaces · IPv4 e escolha a interface, por exemplo eth0. Nos roteadores, abra Interfaces e expanda a interface.', step3: 'Para configurar um IP estático, desative a obtenção automática (DHCP). Preencha 192.168.10.10 e /24 (ou 255.255.255.0).',
  linux: 'Pelo terminal Linux', linuxIntro: 'Abra o terminal do dispositivo e confira as interfaces:', netlabNote: 'Nota sobre o NetLab',
  linuxAdd: 'Em uma interface sem IPv4, este comando define o endereço e a máscara:',
  linuxLimit: 'O NetLab aceita um IPv4 por interface. ip address add só funciona quando ainda não há endereço; altere um IP existente no Inspector. Configure o gateway separadamente.',
  windows: 'Pelo Windows CMD', windowsIntro: 'Consulte a configuração atual:',
  windowsLimit: 'O NetLab não implementa configuração de IPv4 estático por netsh. Defina o endereço e a máscara no Inspector.',
};
export default { en, de, 'pt-BR': ptBR };
