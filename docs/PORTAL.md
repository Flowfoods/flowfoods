# Portal do cliente — formulário inicial

Link único por cliente em `consultoriaflowfoods.com.br/portal/<código>`. O
cliente responde, marca NÃO TENHO / NÃO SEI / AGORA NÃO, anexa arquivos e
envia. O Rodolfo acompanha em `/rodolfo/portal`.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Conteúdo do Valentin's (25 itens, 26 perguntas, textos) | `src/lib/portal/questionarios/valentins.json`, cópia byte a byte do Drive |
| Tela do cliente | `src/app/portal/[token]/` |
| Painel | `src/app/rodolfo/portal/` |
| Autosave, upload, envio | `src/app/api/portal/[token]/{salvar,arquivo,finalizar}` |
| Regras (progresso, disco, aviso) | `src/lib/portal/` |
| Tabelas | `PortalCliente`, `PortalResposta`, `PortalArquivo` (migration `20260925000000_portal_cliente`) |
| Arquivos enviados | `/data/portal/<código>/<bloco>/<AAAAMMDD-HHmmss>-<nome>`, no volume `portal-uploads` |

Blocos no disco: `A`…`E` para arquivos e acessos, `P1`…`P6` para os áudios
das perguntas.

O conteúdo **não se edita no código**. O teste `tests/portal.test.ts` fixa o
hash do JSON. Mudou o questionário? Chega um JSON novo do Rodolfo, e o hash
do teste muda junto.

## O que o cliente vê

- Abertura (instrução e marcações), as duas partes, fechamento, assinatura e
  tagline, tudo do JSON
- Cada item: campo de texto, anexar arquivo, e as três marcações
- Cada pergunta: "Gravar áudio" pelo microfone, com prévia para ouvir antes de
  enviar (teto de 10 min). Sem microfone ou permissão, avisa e sobra o anexar
- Salva sozinho ~1 s depois da última tecla, ao sair do campo e ao fechar a aba
- Cada cartão mostra o próprio estado: "Salvando…", "Salvo" (some sozinho) ou
  "Não salvou. Tentando de novo…"
- Barra fixa no pé: quantos faltam e o botão Enviar, ao alcance do polegar
- Pode enviar com itens em branco: a tela avisa quantos, e o que ficou em
  branco vira item do diagnóstico
- Limite de 50 MB por arquivo, conferido no navegador e no servidor

## O `.md` de contexto

No painel, "Baixar contexto (.md)" gera `contexto-<slug>-<data>.md` com tudo
que o cliente respondeu, marcou e enviou: ausências primeiro (cada uma vira
item do plano), depois item a item com texto em citação e arquivos com caminho
no VPS (áudio marcado para transcrever), e a lista de pendentes. Vai para
`clientes/<slug>/` no repositório; regras em `clientes/README.md`.

## O que acontece no Enviar

1. Grava a data de envio
2. Manda para o `RODOLFO_WHATSAPP`, pela Evolution, um resumo com recebidos,
   marcados e pendentes, mais o link do painel
3. Se a Evolution falhar, o painel mostra o erro em "Aviso no WhatsApp"

Usa `EVOLUTION_NOTIFY_INSTANCE` se existir, senão `EVOLUTION_INSTANCE`. Não
passa pelos tetos da prospecção e não é suprimido quando a instância é o seu
próprio número: nesse caso a mensagem aparece no chat "Você".

## Painel

- `/rodolfo/portal`: um cartão por cliente, com o link para copiar e a contagem
- `/rodolfo/portal/<id>`: item a item, com texto, marcação e arquivos para baixar
- **Apagar respostas e arquivos**: limpa o teste no banco e no disco e mantém o
  cadastro e o link

## Novo cliente

Por enquanto, um JSON novo em `questionarios/` e uma linha no banco:

```sql
INSERT INTO "PortalCliente" (id, nome, slug, token, questionario)
VALUES ('portal_<slug>', '<Nome>', '<slug>', replace(gen_random_uuid()::text, '-', ''), '<chave-do-json>');
```

## Dokploy

O portal sobe junto com o site. Não é aplicação separada. O passo a passo é o
do `docs/DEPLOY_DOKPLOY.md` (caminho curto, Docker Compose), mais isto:

| Variável no painel | Valor |
|---|---|
| `EVOLUTION_API_URL` | endereço da sua Evolution |
| `EVOLUTION_API_KEY` | chave da Evolution |
| `EVOLUTION_INSTANCE` | nome da instância conectada |
| `RODOLFO_WHATSAPP` | já vem `5521996416060` |

O volume `portal-uploads` é criado sozinho pelo compose. Não precisa mexer em
limite de upload: o Traefik do Dokploy não tem teto de corpo por padrão, e o
limite de 50 MB é o próprio app que aplica.
