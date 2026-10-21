-- ERP 3.3 — A cozinha pega a tarefa: quem está fazendo o lote e desde quando; histórico e indicadores por pessoa.
-- Decisões 231 a 240.
--
-- ADITIVA: uma coluna nova em "OrdemProducao" (`responsavelDesde`), quatro CHECKs e dois índices. Nenhuma tabela nova:
-- portão (`MODELOS_DE_TENANT`), RLS e GRANT ficam como estão (o GRANT é da tabela inteira, então a coluna nova já vale
-- para o papel `erp_tenant`). As colunas `responsavelNomeSnapshot` (0.1) e `responsavelUsuarioId` (3.1) já existiam: a 3.3
-- passa a gravá-las quando a pessoa PEGA o lote (antes, só na conclusão). `responsavelId` (FK para `Colaborador`, 0.1)
-- continua sem uso: fica para quem não tem login (freelancer, fase tardia).
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: nenhum passo lê tabela de tenant. Os CHECKs
-- entram NOT VALID e logo se tenta o VALIDATE (só lê, não passa pela RLS); linha antiga que viole não reprova a migration,
-- deixa o CHECK NOT VALID e avisa (WARNING). Depois do deploy, `npm run erp:conferir-migracao` lista o que ficou pendente.
--
-- O gatilho `OrdemProducao_concluida_imutavel` (3.1) já cobre a coluna nova: o lote concluído ou cancelado não troca de
-- responsável (o `to_jsonb(NEW)` compara a linha inteira).

-- ------------------------------------------------------------ coluna
-- Desde quando o lote está com a pessoa que o pegou (ou para quem a gerência passou). Nulo = ninguém pegou (o lote da 3.1
-- concluído sem pegar guarda quem concluiu em `responsavel*`, sem hora de início).
ALTER TABLE "OrdemProducao" ADD COLUMN "responsavelDesde" TIMESTAMP(3);

-- ------------------------------------------------------------ índices
-- O histórico e os indicadores leem os lotes encerrados de uma loja num período (pela conclusão ou pelo cancelamento).
CREATE INDEX "OrdemProducao_parceiroId_lojaId_concluidaEm_idx" ON "OrdemProducao"("parceiroId", "lojaId", "concluidaEm");
CREATE INDEX "OrdemProducao_parceiroId_lojaId_canceladaEm_idx" ON "OrdemProducao"("parceiroId", "lojaId", "canceladaEm");

-- ------------------------------------------------------------ CHECKs (NOT VALID)
-- Quem pegou tem nome e pessoa (a credencial mora fora do tenant: texto, sem FK).
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_responsavel_com_pessoa"
  CHECK ("responsavelDesde" IS NULL OR ("responsavelUsuarioId" IS NOT NULL AND "responsavelNomeSnapshot" IS NOT NULL)) NOT VALID;
-- Pegar é começar: o lote planejado ainda não tem dono.
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_responsavel_so_em_producao"
  CHECK ("responsavelDesde" IS NULL OR "status" <> 'PLANEJADA') NOT VALID;
-- Ninguém conclui antes de pegar.
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_responsavel_antes_do_fim"
  CHECK ("responsavelDesde" IS NULL OR "concluidaEm" IS NULL OR "responsavelDesde" <= "concluidaEm") NOT VALID;
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_responsavel_nome_curto"
  CHECK ("responsavelNomeSnapshot" IS NULL OR char_length("responsavelNomeSnapshot") <= 120) NOT VALID;

-- ------------------------------------------------------------ validar o que já existe
DO $$
DECLARE
  alvo text;
BEGIN
  FOREACH alvo IN ARRAY ARRAY[
    'OrdemProducao_responsavel_com_pessoa',
    'OrdemProducao_responsavel_so_em_producao',
    'OrdemProducao_responsavel_antes_do_fim',
    'OrdemProducao_responsavel_nome_curto'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE "OrdemProducao" VALIDATE CONSTRAINT %I', alvo);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP 3.3: o CHECK % ficou NOT VALID (linha antiga em OrdemProducao, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo;
    END;
  END LOOP;
END $$;
