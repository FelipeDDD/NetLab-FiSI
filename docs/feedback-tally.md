# Feedback com Tally

Crie e publique um único formulário no Tally Free. Use apenas estes campos:

| Campo | Tipo | Obrigatório |
| --- | --- | --- |
| Nome | Texto curto | Não |
| E-mail | E-mail | Não |
| Motivo | Escolha única com Problema, Sugestão e Outro | Sim |
| Mensagem | Texto longo | Sim |
| Captura de tela | Upload de um arquivo | Não |

No upload, configure **Allowed files** para PNG, JPG/JPEG e WebP e **Max file size** para 10 MB. O bloco oferece seleção de arquivo e arraste. Inclua uma nota curta no formulário informando que o Tally processa o feedback. [Configuração de uploads](https://tally.so/help/file-uploads)

Em **Customize**, escolha **Dark**. A personalização gratuita de cores permite aproximar fundo, texto e destaque do Graphite Dark. Em **Settings → Email notifications**, ative **Self email notifications** para o endereço do proprietário. A imagem aparece no e-mail como link. [Temas do Tally](https://tally.so/help/customize-your-form) · [Notificações por e-mail](https://tally.so/help/self-email-notifications)

## Ativar no NetLab

1. Copie o identificador depois de `/r/` no link público do formulário.
2. Defina `VITE_TALLY_FEEDBACK_FORM_ID` em `.env.local` para desenvolvimento ou nas variáveis de build do ambiente de publicação. Reinicie o Vite ou gere um novo build.
3. Clique em **Feedback** na barra superior e envie uma mensagem de teste com uma imagem. Confirme a resposta no Tally e a chegada da notificação.

O botão só aparece com um identificador configurado. O script oficial carrega ao clicar. O NetLab protege URLs com parâmetros ou fragmentos antes de abrir o widget, que encaminharia parâmetros automaticamente. Os campos e o sucesso do envio pertencem ao Tally. [Popup oficial e parâmetros de URL](https://tally.so/help/popup-forms)
