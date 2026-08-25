# Motor do Diagnóstico

Funções puras que transformam as respostas do formulário em **Leitura Inicial**:
scores → momento → módulos ranqueados → nível de oferta → o texto que o dono lê.

Nada aqui lê relógio, banco, rede ou `process.env`. É o que permite fixar dez
cenários em teste e confiar no resultado.

## Portão

```
npm test      # 146 testes
```

Os testes vieram junto com o motor de propósito. Motor de scoring sem teste não
"quebra" — ele passa a calcular o momento errado, e o erro só aparece na frente
do cliente, na call.

O que eles seguram, e por quê:

| Garantia | Por quê |
|---|---|
| Mesma entrada → mesma saída | O momento decide a proposta inteira |
| Precedência do momento | Quem sangra não recebe conversa de crescimento |
| Leitura ≤ 120 palavras em **toda** combinação | 390 de momento × módulo × dor, mais os 3.654 trios de sinais |
| Nenhum termo proibido (`%`, `R$`, `garant`, `gratuito`, `sem compromisso`) | O que chega ao dono é sinal, não promessa |
| O lint de copy acusa problema de verdade | Cinco testes quebram a config de propósito |
| Score digital `null` ≠ `0` | Casa de salão não pode cair em SOBREVIVÊNCIA por não ter app |
| Link do iFood tolerante | É opcional; exigir `https://` derrubava o envio na etapa 8 |

## De onde veio

Escrito em `Flowfoods/portal-bibi`, em `packages/flowfoods-diagnostico`, quando
esta sessão ainda não tinha escrita aqui. **Esta cópia é a canônica agora.** O
histórico da decisão, as pendências e o contrato de design estão em
`docs/DECISOES.md`, `docs/PENDENCIAS_RODOLFO.md` e `docs/DIAGNOSTICO-DESIGN.md`
naquele repositório.

## O que ainda não tem

Sem banco: nada é persistido. O lead chega ao Rodolfo pelo WhatsApp que o
próprio dono envia no fim — o botão abre o app com a mensagem pronta.

`ia/` e `agenda/` estão prontos e testados, mas **não ligados**: o
pré-diagnóstico precisa de `ANTHROPIC_API_KEY`, e a agenda precisa de banco.
`ia/gerar.ts` recebe o transporte por injeção; o README daquele diretório de
origem tem as cinco linhas que ligam o SDK.
