-- Meta de CMV do iFood independente da configuração da taxa.
-- Antes, a existência da linha iFood significava taxa conhecida; ausência de linha significava desconhecida.
-- Preserva essa interpretação de TODAS as linhas existentes, inclusive zero explícito, sem reescrever valores,
-- versões, margens, metas, preços manuais, histórico ou fotografias. Não infere configuração a partir do valor 0.
-- Uma linha nova criada só pela meta informa taxaConfigurada=false; os zeros internos não são uma taxa conhecida.
-- DDL aditiva: a tabela já tem portão, RLS, GRANT e trigger de parceiro imutável.
ALTER TABLE "CanalConfig" ADD COLUMN "taxaConfigurada" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_taxa_pendente_coerente"
  CHECK ("taxaConfigurada" OR ("canal" = 'IFOOD' AND "taxaBp" = 0 AND "taxaPagamentoBp" = 0));

-- Rollout: aplicar a migration antes do app novo; só o app novo cria linhas com taxaConfigurada=false.
-- Rollback restrito: depois de existirem linhas pendentes, NÃO voltar ao leitor antigo nem remover a coluna:
-- ele interpretaria a existência da linha como taxa zero. Conservar migration e leitores compatíveis; não
-- apagar a meta, definir zero nem preencher taxa automaticamente para viabilizar rollback. Correção segue adiante.
