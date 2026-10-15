# ERP Barney — fatia vertical (Passo zero)

Plano, fases e ordem: página "FlowFoods Barney — ERP" no Notion. Este arquivo
só diz como ver a fatia funcionando e quais regras o código já trava.

## O que existe

| Peça | Onde |
|---|---|
| Parceiro Flow (tenant) e Insumo | `prisma/schema.prisma` (bloco ERP) + migration `20261015000000_erp_insumo` |
| Portão de tenant (`doParceiro`) | `src/lib/erp/tenant.ts` |
| Milésimos e centavos (texto → inteiro, arredondamento) | `src/lib/erp/unidades.ts` |
| Regra de cadastro | `src/lib/erp/insumos.ts` |
| Telas | `/rodolfo/erp` (parceiros) e `/rodolfo/erp/<slug>` (insumos) |

## Regras travadas

- **Multi-tenant.** Modelo de tenant só se lê/grava por `doParceiro(id)`, que
  amarra o parceiro em toda query e estoura se alguém apontar outro.
  `tests/erp-tenant-portao.test.ts` reprova `prisma.insumo` cru e acesso pela
  relação `insumos` fora do portão.
- **Inteiros.** Quantidade em milésimos da unidade base, dinheiro em centavos.
  O banco tem CHECK: quantidade > 0, preço >= 0.
- **Servidor decide.** O formulário manda texto; a conversão e o custo por
  unidade são calculados no servidor. A prévia na tela é só prévia.

## Ver funcionando (local, nunca produção)

```bash
# Postgres local com DATABASE_URL apontando para localhost no .env
npx prisma migrate deploy
npm run erp:seed-teste        # cria "Teste · Casa Alfa" e "Teste · Casa Beta"
npm run build && npm start    # entre em /rodolfo/login → menu ERP
```

## Provar o isolamento

```bash
ERP_DB_TESTE=postgresql://USUARIO:SENHA@localhost:5432/BANCO \
  npx vitest run tests/erp-isolamento.db.test.ts
```

Sem `ERP_DB_TESTE`, esse arquivo é pulado e a suíte padrão segue sem banco.
