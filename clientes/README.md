# Contexto dos clientes

Uma pasta por cliente, com o nome do `slug` do Portal (`clientes/valentins/`).
Dentro, os `.md` de contexto exportados do painel (`/rodolfo/portal/<cliente>`
→ "Baixar contexto (.md)"), um por data:

```
clientes/valentins/contexto-valentins-2026-09-25.md
```

É a base de qualquer sessão futura sobre a casa: diagnóstico, plano de 90
dias, relatório mensal, material de operação. Antes de trabalhar num cliente,
leia o `.md` mais recente da pasta dele.

Regras:

- Não editar o que o cliente escreveu. Transcrição de áudio entra como citação
  abaixo do item, com a data.
- Leitura do consultor (achados, hipóteses, prioridades) vai em arquivo à
  parte, `diagnostico-<data>.md`, nunca dentro do contexto.
- Dado pessoal e financeiro do cliente fica só neste repositório privado e no
  VPS. Nada disso vai para chat, e-mail ou material público.
  **Atenção (conferido em 03/11/2026): o repositório `Flowfoods/flowfoods`
  está PÚBLICO no GitHub.** Enquanto ele não virar privado, nada do cliente
  entra aqui — nem contexto exportado, nem diagnóstico, nem número financeiro.
  Esses arquivos ficam no Notion (privado) até a decisão do Rodolfo.
  "Cliente" aqui é o sócio que contratou e responde o Portal, não a clientela
  dele (regra abaixo).
- Dado pessoal de terceiros (clientes finais e funcionários do cliente) nunca
  entra no repositório, no Notion, no Drive compartilhado nem em sessão de IA:
  base de clientes, programa de fidelidade, lista de funcionários com contato,
  CPF, telefone. Aqui entra só número agregado ou pseudonimizado (quantos
  clientes ativos, recorrência, ticket médio), escrito no `.md`. O arquivo
  bruto segue a "Regra de custódia de dados pessoais de terceiros" (Notion).
  Decisão do conselho de Segurança/LGPD, 02/11/2026.
- Por isso planilha, compactado e dump não entram em `clientes/` (csv, tsv,
  xls, xlsx, xlsm, xlsb, ods, numbers, zip, 7z, rar, gz, tgz, tar, sql). O
  `.gitignore` barra, e o CI recusa mesmo com `git add -f`
  (`tests/clientes-custodia.test.ts`). A guarda olha a extensão, não o
  conteúdo: ao exportar um `contexto-*.md`, confira que nenhuma resposta do
  sócio traz nome, telefone ou CPF de cliente final ou de funcionário.
