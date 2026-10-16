-- ERP 0.5 — Onboarding: pedido de acesso (landing ou digitado), quadro do
-- nível 1 e ativação que cria o Parceiro Flow já ATIVO, com dono e convite.
--
-- Só ADITIVA: 3 enums e 3 tabelas novas, 1 gatilho, nenhuma tabela existente
-- muda (a ligação com o parceiro fica do lado do pedido, `parceiroCriadoId`).
-- Sem índice parcial: `migrate diff` fica vazio.
--
-- Estas tabelas ficam FORA do tenant de propósito (decisão 91): o pedido nasce
-- ANTES de existir parceiro, e spam nunca vira ParceiroFlow (que não se apaga,
-- pelo histórico com FK Restrict). Então:
--   - não entram na RLS nem recebem GRANT do papel `erp_tenant` (o bloco do fim
--     REVOGA, por garantia, qualquer privilégio herdado de default);
--   - só `src/lib/erp/pedidos.ts` e a ativação em `credenciais.ts` tocam nelas
--     (o prisma do portal recusa em runtime e o teste-guarda reprova o resto);
--   - o evento do pedido só se acrescenta (gatilho recusa UPDATE).
--
-- Segura para produção nos dois cenários da 0.2 (superusuário e dono
-- não-superusuário): CREATE TABLE/INDEX/FK/CHECK/TRIGGER só exigem ser dono do
-- schema, e o bloco condicional só mexe no papel se ele existir e quem roda puder.

-- CreateEnum
CREATE TYPE "PedidoParceiroStatus" AS ENUM ('NOVO', 'EM_CONVERSA', 'ATIVADO', 'RECUSADO');

-- CreateEnum
CREATE TYPE "PedidoOrigem" AS ENUM ('LANDING', 'MANUAL');

-- CreateEnum
CREATE TYPE "TentativaPedidoResultado" AS ENUM ('ACEITO', 'REENVIO', 'ARMADILHA', 'INVALIDO', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "PedidoParceiro" (
    "id" TEXT NOT NULL,
    "origem" "PedidoOrigem" NOT NULL,
    "nomeGrupo" TEXT NOT NULL,
    "responsavel" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "lojas" INTEGER NOT NULL,
    "marcas" INTEGER NOT NULL,
    "cidade" TEXT NOT NULL,
    "consentimentoEm" TIMESTAMP(3),
    "consentimentoVersao" TEXT,
    "status" "PedidoParceiroStatus" NOT NULL DEFAULT 'NOVO',
    "etapaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "reenvios" INTEGER NOT NULL DEFAULT 0,
    "motivoRecusa" TEXT,
    "parceiroCriadoId" TEXT,
    "anonimizadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoParceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoParceiroEvento" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "motivo" TEXT,
    "autorNome" TEXT NOT NULL,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoParceiroEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaPedidoParceiro" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "resultado" "TentativaPedidoResultado" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaPedidoParceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PedidoParceiro_parceiroCriadoId_key" ON "PedidoParceiro"("parceiroCriadoId");

-- CreateIndex
CREATE INDEX "PedidoParceiro_status_etapaDesde_idx" ON "PedidoParceiro"("status", "etapaDesde");

-- CreateIndex
CREATE INDEX "PedidoParceiro_email_idx" ON "PedidoParceiro"("email");

-- CreateIndex
CREATE INDEX "PedidoParceiro_whatsapp_idx" ON "PedidoParceiro"("whatsapp");

-- CreateIndex
CREATE INDEX "PedidoParceiro_criadoEm_idx" ON "PedidoParceiro"("criadoEm");

-- CreateIndex
CREATE INDEX "PedidoParceiroEvento_pedidoId_ocorridoEm_idx" ON "PedidoParceiroEvento"("pedidoId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "TentativaPedidoParceiro_ip_criadoEm_idx" ON "TentativaPedidoParceiro"("ip", "criadoEm");

-- CreateIndex
CREATE INDEX "TentativaPedidoParceiro_criadoEm_idx" ON "TentativaPedidoParceiro"("criadoEm");

-- AddForeignKey
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_parceiroCriadoId_fkey" FOREIGN KEY ("parceiroCriadoId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoParceiroEvento" ADD CONSTRAINT "PedidoParceiroEvento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoParceiro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Regras que o banco também segura.
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_lojas_faixa" CHECK ("lojas" BETWEEN 1 AND 200);
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_marcas_faixa" CHECK ("marcas" BETWEEN 1 AND 50);
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_email_minusculo" CHECK ("email" = lower("email"));
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_textos_curtos" CHECK (
  length("nomeGrupo") BETWEEN 2 AND 80 AND length("responsavel") BETWEEN 2 AND 80
  AND length("email") <= 160 AND length("cidade") <= 80 AND length("whatsapp") <= 20
  AND ("motivoRecusa" IS NULL OR length("motivoRecusa") <= 200)
);
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_contadores" CHECK ("versao" >= 1 AND "reenvios" >= 0);
-- Ativado ⇔ tem o parceiro que ele criou; um pedido gera um parceiro só (único).
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_ativado_tem_parceiro"
  CHECK (("status" = 'ATIVADO') = ("parceiroCriadoId" IS NOT NULL));
-- Recusa sem motivo não existe.
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_recusa_com_motivo"
  CHECK ("status" <> 'RECUSADO' OR length(btrim(coalesce("motivoRecusa", ''))) >= 3);
-- Quem veio da landing aceitou o texto (e a versão dele) antes de enviar.
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_landing_com_consentimento"
  CHECK ("origem" <> 'LANDING' OR ("consentimentoEm" IS NOT NULL AND "consentimentoVersao" IS NOT NULL));
-- Dados excluídos (LGPD) só em pedido recusado.
ALTER TABLE "PedidoParceiro" ADD CONSTRAINT "PedidoParceiro_anonimizado_so_recusado"
  CHECK ("anonimizadoEm" IS NULL OR "status" = 'RECUSADO');
ALTER TABLE "PedidoParceiroEvento" ADD CONSTRAINT "PedidoParceiroEvento_textos_curtos"
  CHECK (length("acao") BETWEEN 1 AND 40 AND length("autorNome") BETWEEN 1 AND 120 AND ("motivo" IS NULL OR length("motivo") <= 200));
ALTER TABLE "TentativaPedidoParceiro" ADD CONSTRAINT "TentativaPedidoParceiro_ip_curto" CHECK (length("ip") BETWEEN 1 AND 64);

-- O evento do pedido só se acrescenta (a mesma função do livro-razão da 0.1):
-- correção é evento novo. DELETE segue possível para limpeza administrativa.
CREATE TRIGGER "PedidoParceiroEvento_sem_update" BEFORE UPDATE ON "PedidoParceiroEvento"
  FOR EACH ROW EXECUTE FUNCTION "erp_bloquear_update"();

-- O papel do tenant NÃO alcança pedido nenhum. Condicional, no padrão da 0.3:
-- só se o papel existir e quem roda for dono das tabelas (que acabou de
-- criar); senão avisa e segue.
DO $$
DECLARE
  tabelas text[] := ARRAY['PedidoParceiro', 'PedidoParceiroEvento', 'TentativaPedidoParceiro'];
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    RAISE NOTICE 'ERP 0.5: papel erp_tenant não existe; nada a revogar.';
    RETURN;
  END IF;
  FOREACH t IN ARRAY tabelas LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON %I FROM erp_tenant', t);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'ERP 0.5: % não pôde revogar % de erp_tenant (sem privilégio); o papel não recebeu GRANT nela.', current_user, t;
    END;
  END LOOP;
END $$;
