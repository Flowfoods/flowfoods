# Contexto de execução — FlowFoods ERP

`project_id: flowfoods-erp` · `repository: Flowfoods/flowfoods`.
Entrada técnica, não nova fila. Prioridade e autorização pertencem ao plano privado vigente.

| Necessidade | Fonte mínima |
| --- | --- |
| Regras comuns | [AGENTS](../../AGENTS.md) |
| Seleção e próximo passo | [CURRENT gerado](CURRENT.md) |
| Identidade, revisão e lista permitida | [manifest](manifest.json) |
| Estado, escopo e aceite do piloto | [FT-FILTROS-UX](../work/FT-FILTROS-UX.md) |
| Invariantes e donos | [Fichas](../modules/fichas.md) |
| Procedimento de retomada | [flow-contexto](../../.agents/skills/flow-contexto/SKILL.md) |
| Preservação e compatibilidade | [preservação](preservation.md) |

Leitura progressiva: regras → CURRENT → entrega → módulo → arquivos/testes citados.
Não carregar monólitos por padrão. Dependência adicional requer motivo e caminho exato.
Revisões do manifest identificam recortes técnicos; seu hash não atesta autorização atual no Notion.
IDs/links privados ficam no pacote original vinculado ao alias `FT-FILTROS-UX`, fora deste repositório público.

`npm run ai:context -- --task FT-FILTROS-UX` só lê contexto local; não consulta Notion, testa ERP ou publica.
`npm run ai:generate` atualiza derivados; `npm run ai:check` confere integridade.
Evidências de retomada/revisão entram no registro da entrega quando executadas.
