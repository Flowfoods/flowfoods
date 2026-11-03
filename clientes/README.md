# Contexto dos clientes

Uma pasta por cliente, com o nome do `slug` do Portal (`clientes/valentins/`).
O `.md` de contexto é exportado do painel (`/rodolfo/portal/<cliente>` →
"Baixar contexto (.md)"), um por data, e é a base de qualquer sessão futura
sobre a casa: diagnóstico, plano de 90 dias, relatório mensal, material de
operação. **Enquanto o repositório for público, ele fica no Notion privado, não
aqui** (regra abaixo). Aqui ficam só os `README.md` de cada pasta.

Regras:

- Não editar o que o cliente escreveu. Transcrição de áudio entra como citação
  abaixo do item, com a data.
- Leitura do consultor (achados, hipóteses, prioridades) vai em arquivo à
  parte, `diagnostico-<data>.md`, nunca dentro do contexto.
- Dado do cliente (o sócio que contratou: respostas, números, diagnóstico) fica
  no VPS e no Notion privado. **O repositório `Flowfoods/flowfoods` está
  público** (conferido em 03/11/2026): enquanto for, nada do cliente entra
  aqui, nem contexto, nem diagnóstico, nem número, nem agregado.
- Dado pessoal de terceiros (clientes finais e funcionários do cliente) nunca
  entra no repositório, no Notion, no Google Drive, em e-mail, WhatsApp, chat
  ou sessão de IA, **nem bruto, nem pseudonimizado**: telefone que virou código
  continua sendo dado pessoal. Fora do local único só sai agregado, com no
  mínimo 5 pessoas por célula. O bruto segue a "Regra de custódia de dados
  pessoais de terceiros" (Notion). Decisão do conselho de Segurança/LGPD,
  02/11/2026.
- Em `clientes/` só entra `.md`. O `.gitignore` ignora o resto, e o CI acusa o
  que for forçado com `git add -f` (`tests/clientes-custodia.test.ts`). **O CI
  roda depois do push: num repositório público, quando ele fica vermelho o
  arquivo já vazou.** A guarda olha o tipo de arquivo, não o conteúdo.
