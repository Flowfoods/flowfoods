-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('SITE', 'LEDS_IMPORT', 'MANUAL', 'BARNEY', 'INDICACAO');

-- CreateEnum
CREATE TYPE "Interesse" AS ENUM ('CONSULTORIA', 'MENTORIA', 'CURSO', 'CONTEUDO');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NOVO', 'EM_CADENCIA', 'RESPONDEU', 'DIAGNOSTICO_PREENCHIDO', 'DIAGNOSTICO_AGENDADO', 'DIAGNOSTICO_FEITO', 'PROPOSTA', 'CLIENTE', 'PERDIDO', 'OPT_OUT', 'CONFLITO');

-- CreateEnum
CREATE TYPE "TipoTelefone" AS ENUM ('CELULAR', 'FIXO', 'INVALIDO');

-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'VISITA');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('T1', 'T2', 'T3');

-- CreateEnum
CREATE TYPE "Toque" AS ENUM ('D0', 'D4', 'D10');

-- CreateEnum
CREATE TYPE "CanalTemplate" AS ENUM ('WHATSAPP', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ATIVA', 'PAUSADA_RESPOSTA', 'PAUSADA_MANUAL', 'CONCLUIDA', 'OPT_OUT');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDENTE', 'AGENDADA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PROPOSTO', 'APROVADO', 'EM_ENVIO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Intencao" AS ENUM ('INTERESSADO', 'PERGUNTA', 'DEPOIS', 'RECUSA', 'OPT_OUT', 'OUTRO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "restaurante" TEXT,
    "telefoneNormalizado" TEXT,
    "tipoTelefone" "TipoTelefone" NOT NULL DEFAULT 'INVALIDO',
    "telefoneOriginal" TEXT,
    "categoria" TEXT,
    "bairro" TEXT,
    "bloco" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'LEDS_IMPORT',
    "interesse" "Interesse",
    "status" "LeadStatus" NOT NULL DEFAULT 'NOVO',
    "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utm" JSONB,
    "endereco" TEXT,
    "nota" DOUBLE PRECISION,
    "avaliacoes" INTEGER,
    "obs" TEXT,
    "instagram" TEXT,
    "ifoodUrl" TEXT,
    "donoNome" TEXT,
    "scoreBase" INTEGER,
    "capacidade" INTEGER,
    "acessoDecisor" INTEGER,
    "territorio" INTEGER,
    "gapDigital" INTEGER,
    "scoreTotal" INTEGER,
    "tier" "Tier",
    "canal" "Canal" NOT NULL DEFAULT 'VISITA',
    "lote" TEXT,
    "importadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "dados" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptOut" (
    "id" TEXT NOT NULL,
    "telefoneNormalizado" TEXT NOT NULL,
    "termo" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'RESPOSTA',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "categoria" TEXT,
    "toque" "Toque" NOT NULL,
    "canal" "CanalTemplate" NOT NULL DEFAULT 'WHATSAPP',
    "variante" TEXT NOT NULL DEFAULT 'A',
    "corpo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "validadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "toque" "Toque" NOT NULL,
    "offsetDias" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ATIVA',
    "toqueAtual" "Toque",
    "proximoEnvioEm" TIMESTAMP(3),
    "pausadoEm" TIMESTAMP(3),
    "motivoPausa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDENTE',
    "dedupKey" TEXT NOT NULL,
    "evolutionMessageId" TEXT,
    "to" TEXT,
    "corpoRenderizado" TEXT,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "agendadaPara" TIMESTAMP(3),
    "enviadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT,
    "enrollmentId" TEXT,
    "templateId" TEXT,
    "loteId" TEXT,
    "toque" "Toque",

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PROPOSTO',
    "aprovadoEm" TIMESTAMP(3),
    "aprovadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "toque" "Toque" NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "BatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundClassification" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "intencao" "Intencao" NOT NULL,
    "confianca" DOUBLE PRECISION NOT NULL,
    "rascunhoSugerido" TEXT,
    "custoIA" DECIMAL(10,6),
    "modelo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCounter" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "instancia" TEXT NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "entregues" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "ultimoEnvioEm" TIMESTAMP(3),

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceState" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'close',
    "ultimoCheck" TIMESTAMP(3),
    "primeiroEnvioEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "evento" TEXT NOT NULL,
    "dados" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebEvent" (
    "id" TEXT NOT NULL,
    "pagina" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "origem" TEXT,
    "utm" JSONB,
    "referrer" TEXT,
    "sessionHash" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_tier_idx" ON "Lead"("tier");

-- CreateIndex
CREATE INDEX "Lead_bloco_bairro_idx" ON "Lead"("bloco", "bairro");

-- CreateIndex
CREATE INDEX "Lead_canal_idx" ON "Lead"("canal");

-- CreateIndex
CREATE INDEX "Lead_lote_idx" ON "Lead"("lote");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_telefoneNormalizado_key" ON "Lead"("telefoneNormalizado");

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_criadoEm_idx" ON "LeadEvent"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "LeadEvent_tipo_idx" ON "LeadEvent"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "OptOut_telefoneNormalizado_key" ON "OptOut"("telefoneNormalizado");

-- CreateIndex
CREATE INDEX "Template_ativo_toque_idx" ON "Template"("ativo", "toque");

-- CreateIndex
CREATE UNIQUE INDEX "Template_categoria_toque_canal_variante_key" ON "Template"("categoria", "toque", "canal", "variante");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_nome_key" ON "Sequence"("nome");

-- CreateIndex
CREATE INDEX "SequenceStep_sequenceId_ordem_idx" ON "SequenceStep"("sequenceId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceStep_sequenceId_toque_key" ON "SequenceStep"("sequenceId", "toque");

-- CreateIndex
CREATE INDEX "Enrollment_status_proximoEnvioEm_idx" ON "Enrollment"("status", "proximoEnvioEm");

-- CreateIndex
CREATE INDEX "Enrollment_proximoEnvioEm_idx" ON "Enrollment"("proximoEnvioEm");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_leadId_sequenceId_key" ON "Enrollment"("leadId", "sequenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_dedupKey_key" ON "Message"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_evolutionMessageId_key" ON "Message"("evolutionMessageId");

-- CreateIndex
CREATE INDEX "Message_status_agendadaPara_idx" ON "Message"("status", "agendadaPara");

-- CreateIndex
CREATE INDEX "Message_leadId_criadoEm_idx" ON "Message"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "Message_loteId_idx" ON "Message"("loteId");

-- CreateIndex
CREATE INDEX "Message_direction_criadoEm_idx" ON "Message"("direction", "criadoEm");

-- CreateIndex
CREATE INDEX "Batch_status_idx" ON "Batch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_data_key" ON "Batch"("data");

-- CreateIndex
CREATE INDEX "BatchItem_batchId_ordem_idx" ON "BatchItem"("batchId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "BatchItem_batchId_leadId_key" ON "BatchItem"("batchId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundClassification_messageId_key" ON "InboundClassification"("messageId");

-- CreateIndex
CREATE INDEX "InboundClassification_intencao_idx" ON "InboundClassification"("intencao");

-- CreateIndex
CREATE INDEX "DailyCounter_instancia_data_idx" ON "DailyCounter"("instancia", "data");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCounter_data_instancia_key" ON "DailyCounter"("data", "instancia");

-- CreateIndex
CREATE UNIQUE INDEX "InstanceState_nome_key" ON "InstanceState"("nome");

-- CreateIndex
CREATE INDEX "AuditLog_evento_criadoEm_idx" ON "AuditLog"("evento", "criadoEm");

-- CreateIndex
CREATE INDEX "AuditLog_criadoEm_idx" ON "AuditLog"("criadoEm");

-- CreateIndex
CREATE INDEX "WebEvent_pagina_ts_idx" ON "WebEvent"("pagina", "ts");

-- CreateIndex
CREATE INDEX "WebEvent_evento_ts_idx" ON "WebEvent"("evento", "ts");

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundClassification" ADD CONSTRAINT "InboundClassification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

