-- ERP Barney — Subfase 0.1: fundação do banco (Ficha Técnica, Estoque,
-- Produção, DRE). Só aditiva: CREATE TYPE/TABLE/INDEX, ADD COLUMN com default
-- ou nulo, ADD CONSTRAINT. Nenhum DROP, RENAME ou ALTER destrutivo.
-- Gerada com `prisma migrate diff`; os CHECKs e as travas do fim são à mão
-- (o Prisma não descreve CHECK nem trigger, e o diff futuro não os enxerga).
-- CreateEnum
CREATE TYPE "PeriodoTipo" AS ENUM ('MENSAL', 'QUINZENAL', 'SEMANAL', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "OrigemDado" AS ENUM ('MANUAL', 'IMPORTACAO', 'INTEGRACAO');

-- CreateEnum
CREATE TYPE "CanalVenda" AS ENUM ('LOJA', 'DELIVERY_PROPRIO', 'IFOOD');

-- CreateEnum
CREATE TYPE "Conservacao" AS ENUM ('SECO', 'PISTA_FRIA', 'REFRIGERADO', 'CONGELADO');

-- CreateEnum
CREATE TYPE "InsumoTipo" AS ENUM ('INGREDIENTE', 'EMBALAGEM', 'PRE_PREPARO');

-- CreateEnum
CREATE TYPE "NotaStatus" AS ENUM ('RASCUNHO', 'LANCADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "FichaTipo" AS ENUM ('PRATO', 'PRE_PREPARO');

-- CreateEnum
CREATE TYPE "MovimentoTipo" AS ENUM ('ABERTURA', 'ENTRADA_COMPRA', 'REQUISICAO', 'PRODUCAO_ENTRADA', 'PRODUCAO_CONSUMO', 'AJUSTE', 'CONTAGEM', 'PERDA');

-- CreateEnum
CREATE TYPE "ContagemTipo" AS ENUM ('ABERTURA', 'CICLICA', 'FECHAMENTO');

-- CreateEnum
CREATE TYPE "ContagemStatus" AS ENUM ('ABERTA', 'FECHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RequisicaoStatus" AS ENUM ('ABERTA', 'ATENDIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ProducaoStatus" AS ENUM ('PLANEJADA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EtiquetaFormato" AS ENUM ('E60X40', 'E60X60');

-- CreateEnum
CREATE TYPE "DreGrupo" AS ENUM ('RECEITA', 'DEDUCAO', 'CMV', 'DESPESA_VARIAVEL', 'PESSOAL', 'OCUPACAO', 'ADMINISTRATIVA', 'MARKETING', 'FINANCEIRA', 'OUTRAS');

-- CreateEnum
CREATE TYPE "PeriodoStatus" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "FarolCor" AS ENUM ('AZUL', 'VERDE', 'AMARELO', 'LARANJA', 'VERMELHO');

-- CreateEnum
CREATE TYPE "FarolIndicador" AS ENUM ('MARGEM_LIQUIDA');

-- AlterTable
ALTER TABLE "Insumo" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "conservacao" "Conservacao" NOT NULL DEFAULT 'SECO',
ADD COLUMN     "estoqueMinimoMilesimos" INTEGER,
ADD COLUMN     "fornecedorPadraoId" TEXT,
ADD COLUMN     "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "taxaEntregaCentavos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo" "InsumoTipo" NOT NULL DEFAULT 'INGREDIENTE',
ADD COLUMN     "validadeCongeladoMin" INTEGER,
ADD COLUMN     "validadePistaFriaMin" INTEGER,
ADD COLUMN     "validadeRefrigeradoMin" INTEGER,
ADD COLUMN     "validadeSecoMin" INTEGER;

-- AlterTable
ALTER TABLE "ParceiroFlow" ADD COLUMN     "periodoDiaInicio" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "periodoTipo" "PeriodoTipo" NOT NULL DEFAULT 'MENSAL';

-- CreateTable
CREATE TABLE "Loja" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marca" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "contato" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsumoVariante" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "conteudoMilesimos" INTEGER NOT NULL,
    "precoEmbalagemCentavos" INTEGER NOT NULL,
    "taxaEntregaCentavos" INTEGER NOT NULL DEFAULT 0,
    "fornecedorId" TEXT,
    "codigoBarras" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsumoVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaEntrada" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "fornecedorNomeSnapshot" TEXT,
    "numero" TEXT,
    "chaveAcesso" TEXT,
    "emitidaEm" DATE,
    "entradaEm" DATE NOT NULL,
    "freteCentavos" INTEGER NOT NULL DEFAULT 0,
    "descontoCentavos" INTEGER NOT NULL DEFAULT 0,
    "totalCentavos" INTEGER NOT NULL,
    "status" "NotaStatus" NOT NULL DEFAULT 'RASCUNHO',
    "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
    "origemRef" TEXT,
    "lancadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaEntrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaEntradaItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "insumoId" TEXT,
    "varianteId" TEXT,
    "descricaoNota" TEXT NOT NULL,
    "insumoNomeSnapshot" TEXT,
    "unidadeSnapshot" "UnidadeBase",
    "embalagensMilesimos" INTEGER NOT NULL,
    "conteudoMilesimos" INTEGER NOT NULL,
    "quantidadeMilesimos" INTEGER NOT NULL,
    "valorTotalCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaEntradaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaTecnica" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "FichaTipo" NOT NULL,
    "rendimentoMilesimos" INTEGER NOT NULL,
    "unidadeRendimento" "UnidadeBase" NOT NULL,
    "insumoProduzidoId" TEXT,
    "modoPreparo" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaTecnica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FichaItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "insumoId" TEXT,
    "subfichaId" TEXT,
    "quantidadeMilesimos" INTEGER NOT NULL,
    "fatorCorrecaoMilesimos" INTEGER NOT NULL DEFAULT 1000,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FichaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoVenda" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "marcaId" TEXT,
    "fichaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoExterno" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoCanal" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "precoManualCentavos" INTEGER,
    "margemAlvoBp" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoCanal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoEmbalagem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidadeMilesimos" INTEGER NOT NULL,

    CONSTRAINT "ProdutoEmbalagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanalConfig" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "canal" "CanalVenda" NOT NULL,
    "taxaBp" INTEGER NOT NULL DEFAULT 0,
    "taxaFixaCentavos" INTEGER NOT NULL DEFAULT 0,
    "margemAlvoPadraoBp" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaldoEstoque" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidadeMilesimos" INTEGER NOT NULL DEFAULT 0,
    "valorCentavos" INTEGER NOT NULL DEFAULT 0,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaldoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEstoque" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "tipo" "MovimentoTipo" NOT NULL,
    "quantidadeMilesimos" INTEGER NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "saldoAntesMilesimos" INTEGER NOT NULL,
    "saldoDepoisMilesimos" INTEGER NOT NULL,
    "insumoNomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase" NOT NULL,
    "motivo" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
    "chaveIdempotencia" TEXT,
    "colaboradorId" TEXT,
    "notaItemId" TEXT,
    "requisicaoItemId" TEXT,
    "contagemItemId" TEXT,
    "ordemProducaoId" TEXT,

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contagem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "periodoId" TEXT,
    "tipo" "ContagemTipo" NOT NULL,
    "status" "ContagemStatus" NOT NULL DEFAULT 'ABERTA',
    "referenciaEm" DATE NOT NULL,
    "fechaAutomaticoEm" TIMESTAMP(3),
    "fechadaEm" TIMESTAMP(3),
    "valorTotalCentavos" INTEGER,
    "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContagemItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "contagemId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "insumoNomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase" NOT NULL,
    "contadoMilesimos" INTEGER,
    "saldoSistemaMilesimos" INTEGER NOT NULL,
    "valorSistemaCentavos" INTEGER NOT NULL,
    "colaboradorId" TEXT,
    "contadoEm" TIMESTAMP(3),

    CONSTRAINT "ContagemItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requisicao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "status" "RequisicaoStatus" NOT NULL DEFAULT 'ABERTA',
    "setor" TEXT,
    "solicitanteId" TEXT,
    "atendenteId" TEXT,
    "observacao" TEXT,
    "solicitadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidaEm" TIMESTAMP(3),

    CONSTRAINT "Requisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisicaoItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "requisicaoId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "insumoNomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase" NOT NULL,
    "solicitadoMilesimos" INTEGER NOT NULL,
    "atendidoMilesimos" INTEGER,

    CONSTRAINT "RequisicaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemProducao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "insumoProduzidoId" TEXT,
    "codigoLote" TEXT NOT NULL,
    "status" "ProducaoStatus" NOT NULL DEFAULT 'PLANEJADA',
    "dataPlanejada" DATE NOT NULL,
    "planejadoMilesimos" INTEGER NOT NULL,
    "produzidoMilesimos" INTEGER,
    "custoTotalCentavos" INTEGER,
    "fichaNomeSnapshot" TEXT NOT NULL,
    "responsavelId" TEXT,
    "responsavelNomeSnapshot" TEXT,
    "requisicaoId" TEXT,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdemProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etiqueta" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "insumoId" TEXT,
    "ordemProducaoId" TEXT,
    "notaItemId" TEXT,
    "nomeSnapshot" TEXT NOT NULL,
    "unidadeSnapshot" "UnidadeBase",
    "quantidadeMilesimos" INTEGER,
    "conservacao" "Conservacao" NOT NULL,
    "loteFornecedor" TEXT,
    "fabricadoEm" TIMESTAMP(3),
    "abertoEm" TIMESTAMP(3),
    "validadeEm" TIMESTAMP(3) NOT NULL,
    "responsavelId" TEXT,
    "responsavelNomeSnapshot" TEXT,
    "formato" "EtiquetaFormato" NOT NULL,
    "impressaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaturamentoLancamento" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "marcaId" TEXT,
    "canal" "CanalVenda" NOT NULL,
    "data" DATE NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "pedidos" INTEGER NOT NULL,
    "clientes" INTEGER NOT NULL,
    "origem" "OrigemDado" NOT NULL,
    "chaveIdempotencia" TEXT NOT NULL,
    "origemRef" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaturamentoLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DreLinha" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupo" "DreGrupo" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "calculada" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DreLinha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DreMeta" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "linhaId" TEXT NOT NULL,
    "percentualBp" INTEGER NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DreMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT,
    "linhaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "competencia" DATE NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "origem" "OrigemDado" NOT NULL DEFAULT 'MANUAL',
    "origemRef" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoApuracao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "status" "PeriodoStatus" NOT NULL DEFAULT 'ABERTO',
    "fechadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodoApuracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarolFaixa" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "indicador" "FarolIndicador" NOT NULL DEFAULT 'MARGEM_LIQUIDA',
    "canal" "CanalVenda" NOT NULL,
    "cor" "FarolCor" NOT NULL,
    "aPartirDeBp" INTEGER NOT NULL,

    CONSTRAINT "FarolFaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoAlteracao" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "motivo" TEXT,
    "autorNome" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "ocorridoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoAlteracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Loja_parceiroId_id_key" ON "Loja"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Loja_parceiroId_slug_key" ON "Loja"("parceiroId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Loja_parceiroId_nome_key" ON "Loja"("parceiroId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Marca_parceiroId_id_key" ON "Marca"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Marca_parceiroId_nome_key" ON "Marca"("parceiroId", "nome");

-- CreateIndex
CREATE INDEX "Colaborador_parceiroId_lojaId_idx" ON "Colaborador"("parceiroId", "lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_parceiroId_id_key" ON "Colaborador"("parceiroId", "id");

-- CreateIndex
CREATE INDEX "Fornecedor_parceiroId_documento_idx" ON "Fornecedor"("parceiroId", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_parceiroId_id_key" ON "Fornecedor"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_parceiroId_nome_key" ON "Fornecedor"("parceiroId", "nome");

-- CreateIndex
CREATE INDEX "InsumoVariante_parceiroId_codigoBarras_idx" ON "InsumoVariante"("parceiroId", "codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "InsumoVariante_parceiroId_id_key" ON "InsumoVariante"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InsumoVariante_parceiroId_insumoId_nome_key" ON "InsumoVariante"("parceiroId", "insumoId", "nome");

-- CreateIndex
CREATE INDEX "NotaEntrada_parceiroId_lojaId_entradaEm_idx" ON "NotaEntrada"("parceiroId", "lojaId", "entradaEm");

-- CreateIndex
CREATE INDEX "NotaEntrada_parceiroId_fornecedorId_entradaEm_idx" ON "NotaEntrada"("parceiroId", "fornecedorId", "entradaEm");

-- CreateIndex
CREATE UNIQUE INDEX "NotaEntrada_parceiroId_id_key" ON "NotaEntrada"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotaEntrada_parceiroId_chaveAcesso_key" ON "NotaEntrada"("parceiroId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "NotaEntradaItem_parceiroId_notaId_idx" ON "NotaEntradaItem"("parceiroId", "notaId");

-- CreateIndex
CREATE INDEX "NotaEntradaItem_parceiroId_insumoId_idx" ON "NotaEntradaItem"("parceiroId", "insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaEntradaItem_parceiroId_id_key" ON "NotaEntradaItem"("parceiroId", "id");

-- CreateIndex
CREATE INDEX "FichaTecnica_parceiroId_tipo_idx" ON "FichaTecnica"("parceiroId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "FichaTecnica_parceiroId_id_key" ON "FichaTecnica"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FichaTecnica_parceiroId_nome_key" ON "FichaTecnica"("parceiroId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "FichaTecnica_parceiroId_insumoProduzidoId_key" ON "FichaTecnica"("parceiroId", "insumoProduzidoId");

-- CreateIndex
CREATE INDEX "FichaItem_parceiroId_fichaId_idx" ON "FichaItem"("parceiroId", "fichaId");

-- CreateIndex
CREATE INDEX "FichaItem_parceiroId_insumoId_idx" ON "FichaItem"("parceiroId", "insumoId");

-- CreateIndex
CREATE INDEX "FichaItem_parceiroId_subfichaId_idx" ON "FichaItem"("parceiroId", "subfichaId");

-- CreateIndex
CREATE UNIQUE INDEX "FichaItem_parceiroId_id_key" ON "FichaItem"("parceiroId", "id");

-- CreateIndex
CREATE INDEX "ProdutoVenda_parceiroId_fichaId_idx" ON "ProdutoVenda"("parceiroId", "fichaId");

-- CreateIndex
CREATE INDEX "ProdutoVenda_parceiroId_codigoExterno_idx" ON "ProdutoVenda"("parceiroId", "codigoExterno");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoVenda_parceiroId_id_key" ON "ProdutoVenda"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoVenda_parceiroId_marcaId_nome_key" ON "ProdutoVenda"("parceiroId", "marcaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoCanal_parceiroId_id_key" ON "ProdutoCanal"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoCanal_parceiroId_produtoId_canal_key" ON "ProdutoCanal"("parceiroId", "produtoId", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoEmbalagem_parceiroId_id_key" ON "ProdutoEmbalagem"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoEmbalagem_parceiroId_produtoId_canal_insumoId_key" ON "ProdutoEmbalagem"("parceiroId", "produtoId", "canal", "insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "CanalConfig_parceiroId_id_key" ON "CanalConfig"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CanalConfig_parceiroId_canal_key" ON "CanalConfig"("parceiroId", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "SaldoEstoque_parceiroId_id_key" ON "SaldoEstoque"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SaldoEstoque_parceiroId_lojaId_insumoId_key" ON "SaldoEstoque"("parceiroId", "lojaId", "insumoId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_parceiroId_lojaId_insumoId_ocorridoEm_idx" ON "MovimentoEstoque"("parceiroId", "lojaId", "insumoId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_parceiroId_lojaId_tipo_ocorridoEm_idx" ON "MovimentoEstoque"("parceiroId", "lojaId", "tipo", "ocorridoEm");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_parceiroId_colaboradorId_ocorridoEm_idx" ON "MovimentoEstoque"("parceiroId", "colaboradorId", "ocorridoEm");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoEstoque_parceiroId_id_key" ON "MovimentoEstoque"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentoEstoque_parceiroId_chaveIdempotencia_key" ON "MovimentoEstoque"("parceiroId", "chaveIdempotencia");

-- CreateIndex
CREATE INDEX "Contagem_parceiroId_lojaId_referenciaEm_idx" ON "Contagem"("parceiroId", "lojaId", "referenciaEm");

-- CreateIndex
CREATE INDEX "Contagem_parceiroId_periodoId_idx" ON "Contagem"("parceiroId", "periodoId");

-- CreateIndex
CREATE UNIQUE INDEX "Contagem_parceiroId_id_key" ON "Contagem"("parceiroId", "id");

-- CreateIndex
CREATE INDEX "ContagemItem_parceiroId_insumoId_idx" ON "ContagemItem"("parceiroId", "insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "ContagemItem_parceiroId_id_key" ON "ContagemItem"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContagemItem_parceiroId_contagemId_insumoId_key" ON "ContagemItem"("parceiroId", "contagemId", "insumoId");

-- CreateIndex
CREATE INDEX "Requisicao_parceiroId_lojaId_solicitadaEm_idx" ON "Requisicao"("parceiroId", "lojaId", "solicitadaEm");

-- CreateIndex
CREATE UNIQUE INDEX "Requisicao_parceiroId_id_key" ON "Requisicao"("parceiroId", "id");

-- CreateIndex
CREATE INDEX "RequisicaoItem_parceiroId_insumoId_idx" ON "RequisicaoItem"("parceiroId", "insumoId");

-- CreateIndex
CREATE UNIQUE INDEX "RequisicaoItem_parceiroId_id_key" ON "RequisicaoItem"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RequisicaoItem_parceiroId_requisicaoId_insumoId_key" ON "RequisicaoItem"("parceiroId", "requisicaoId", "insumoId");

-- CreateIndex
CREATE INDEX "OrdemProducao_parceiroId_lojaId_dataPlanejada_idx" ON "OrdemProducao"("parceiroId", "lojaId", "dataPlanejada");

-- CreateIndex
CREATE INDEX "OrdemProducao_parceiroId_responsavelId_concluidaEm_idx" ON "OrdemProducao"("parceiroId", "responsavelId", "concluidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemProducao_parceiroId_id_key" ON "OrdemProducao"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemProducao_parceiroId_codigoLote_key" ON "OrdemProducao"("parceiroId", "codigoLote");

-- CreateIndex
CREATE INDEX "Etiqueta_parceiroId_lojaId_validadeEm_idx" ON "Etiqueta"("parceiroId", "lojaId", "validadeEm");

-- CreateIndex
CREATE INDEX "Etiqueta_parceiroId_ordemProducaoId_idx" ON "Etiqueta"("parceiroId", "ordemProducaoId");

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_parceiroId_id_key" ON "Etiqueta"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_parceiroId_codigo_key" ON "Etiqueta"("parceiroId", "codigo");

-- CreateIndex
CREATE INDEX "FaturamentoLancamento_parceiroId_lojaId_data_idx" ON "FaturamentoLancamento"("parceiroId", "lojaId", "data");

-- CreateIndex
CREATE INDEX "FaturamentoLancamento_parceiroId_canal_data_idx" ON "FaturamentoLancamento"("parceiroId", "canal", "data");

-- CreateIndex
CREATE UNIQUE INDEX "FaturamentoLancamento_parceiroId_id_key" ON "FaturamentoLancamento"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FaturamentoLancamento_parceiroId_chaveIdempotencia_key" ON "FaturamentoLancamento"("parceiroId", "chaveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "DreLinha_parceiroId_id_key" ON "DreLinha"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DreLinha_parceiroId_nome_key" ON "DreLinha"("parceiroId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "DreMeta_parceiroId_id_key" ON "DreMeta"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DreMeta_parceiroId_linhaId_vigenteDesde_key" ON "DreMeta"("parceiroId", "linhaId", "vigenteDesde");

-- CreateIndex
CREATE INDEX "Despesa_parceiroId_competencia_idx" ON "Despesa"("parceiroId", "competencia");

-- CreateIndex
CREATE INDEX "Despesa_parceiroId_lojaId_competencia_idx" ON "Despesa"("parceiroId", "lojaId", "competencia");

-- CreateIndex
CREATE INDEX "Despesa_parceiroId_linhaId_competencia_idx" ON "Despesa"("parceiroId", "linhaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "Despesa_parceiroId_id_key" ON "Despesa"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoApuracao_parceiroId_id_key" ON "PeriodoApuracao"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoApuracao_parceiroId_inicio_fim_key" ON "PeriodoApuracao"("parceiroId", "inicio", "fim");

-- CreateIndex
CREATE UNIQUE INDEX "FarolFaixa_parceiroId_id_key" ON "FarolFaixa"("parceiroId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FarolFaixa_parceiroId_indicador_canal_cor_key" ON "FarolFaixa"("parceiroId", "indicador", "canal", "cor");

-- CreateIndex
CREATE INDEX "HistoricoAlteracao_parceiroId_entidade_entidadeId_ocorridoE_idx" ON "HistoricoAlteracao"("parceiroId", "entidade", "entidadeId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "HistoricoAlteracao_parceiroId_ocorridoEm_idx" ON "HistoricoAlteracao"("parceiroId", "ocorridoEm");

-- CreateIndex
CREATE INDEX "Insumo_parceiroId_tipo_idx" ON "Insumo"("parceiroId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Insumo_parceiroId_id_key" ON "Insumo"("parceiroId", "id");

-- AddForeignKey
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marca" ADD CONSTRAINT "Marca_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_parceiroId_fornecedorPadraoId_fkey" FOREIGN KEY ("parceiroId", "fornecedorPadraoId") REFERENCES "Fornecedor"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsumoVariante" ADD CONSTRAINT "InsumoVariante_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsumoVariante" ADD CONSTRAINT "InsumoVariante_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsumoVariante" ADD CONSTRAINT "InsumoVariante_parceiroId_fornecedorId_fkey" FOREIGN KEY ("parceiroId", "fornecedorId") REFERENCES "Fornecedor"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_parceiroId_fornecedorId_fkey" FOREIGN KEY ("parceiroId", "fornecedorId") REFERENCES "Fornecedor"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_parceiroId_notaId_fkey" FOREIGN KEY ("parceiroId", "notaId") REFERENCES "NotaEntrada"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_parceiroId_varianteId_fkey" FOREIGN KEY ("parceiroId", "varianteId") REFERENCES "InsumoVariante"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_parceiroId_insumoProduzidoId_fkey" FOREIGN KEY ("parceiroId", "insumoProduzidoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_parceiroId_fichaId_fkey" FOREIGN KEY ("parceiroId", "fichaId") REFERENCES "FichaTecnica"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_parceiroId_subfichaId_fkey" FOREIGN KEY ("parceiroId", "subfichaId") REFERENCES "FichaTecnica"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoVenda" ADD CONSTRAINT "ProdutoVenda_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoVenda" ADD CONSTRAINT "ProdutoVenda_parceiroId_marcaId_fkey" FOREIGN KEY ("parceiroId", "marcaId") REFERENCES "Marca"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoVenda" ADD CONSTRAINT "ProdutoVenda_parceiroId_fichaId_fkey" FOREIGN KEY ("parceiroId", "fichaId") REFERENCES "FichaTecnica"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoCanal" ADD CONSTRAINT "ProdutoCanal_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoCanal" ADD CONSTRAINT "ProdutoCanal_parceiroId_produtoId_fkey" FOREIGN KEY ("parceiroId", "produtoId") REFERENCES "ProdutoVenda"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoEmbalagem" ADD CONSTRAINT "ProdutoEmbalagem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoEmbalagem" ADD CONSTRAINT "ProdutoEmbalagem_parceiroId_produtoId_fkey" FOREIGN KEY ("parceiroId", "produtoId") REFERENCES "ProdutoVenda"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoEmbalagem" ADD CONSTRAINT "ProdutoEmbalagem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoEstoque" ADD CONSTRAINT "SaldoEstoque_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoEstoque" ADD CONSTRAINT "SaldoEstoque_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoEstoque" ADD CONSTRAINT "SaldoEstoque_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_colaboradorId_fkey" FOREIGN KEY ("parceiroId", "colaboradorId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_notaItemId_fkey" FOREIGN KEY ("parceiroId", "notaItemId") REFERENCES "NotaEntradaItem"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_requisicaoItemId_fkey" FOREIGN KEY ("parceiroId", "requisicaoItemId") REFERENCES "RequisicaoItem"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_contagemItemId_fkey" FOREIGN KEY ("parceiroId", "contagemItemId") REFERENCES "ContagemItem"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_parceiroId_ordemProducaoId_fkey" FOREIGN KEY ("parceiroId", "ordemProducaoId") REFERENCES "OrdemProducao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_parceiroId_periodoId_fkey" FOREIGN KEY ("parceiroId", "periodoId") REFERENCES "PeriodoApuracao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_parceiroId_contagemId_fkey" FOREIGN KEY ("parceiroId", "contagemId") REFERENCES "Contagem"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_parceiroId_colaboradorId_fkey" FOREIGN KEY ("parceiroId", "colaboradorId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_parceiroId_solicitanteId_fkey" FOREIGN KEY ("parceiroId", "solicitanteId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisicao" ADD CONSTRAINT "Requisicao_parceiroId_atendenteId_fkey" FOREIGN KEY ("parceiroId", "atendenteId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_parceiroId_requisicaoId_fkey" FOREIGN KEY ("parceiroId", "requisicaoId") REFERENCES "Requisicao"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_parceiroId_fichaId_fkey" FOREIGN KEY ("parceiroId", "fichaId") REFERENCES "FichaTecnica"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_parceiroId_insumoProduzidoId_fkey" FOREIGN KEY ("parceiroId", "insumoProduzidoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_parceiroId_responsavelId_fkey" FOREIGN KEY ("parceiroId", "responsavelId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_parceiroId_requisicaoId_fkey" FOREIGN KEY ("parceiroId", "requisicaoId") REFERENCES "Requisicao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_ordemProducaoId_fkey" FOREIGN KEY ("parceiroId", "ordemProducaoId") REFERENCES "OrdemProducao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_notaItemId_fkey" FOREIGN KEY ("parceiroId", "notaItemId") REFERENCES "NotaEntradaItem"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_parceiroId_responsavelId_fkey" FOREIGN KEY ("parceiroId", "responsavelId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_parceiroId_marcaId_fkey" FOREIGN KEY ("parceiroId", "marcaId") REFERENCES "Marca"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreLinha" ADD CONSTRAINT "DreLinha_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreMeta" ADD CONSTRAINT "DreMeta_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreMeta" ADD CONSTRAINT "DreMeta_parceiroId_linhaId_fkey" FOREIGN KEY ("parceiroId", "linhaId") REFERENCES "DreLinha"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_parceiroId_linhaId_fkey" FOREIGN KEY ("parceiroId", "linhaId") REFERENCES "DreLinha"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodoApuracao" ADD CONSTRAINT "PeriodoApuracao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarolFaixa" ADD CONSTRAINT "FarolFaixa_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAlteracao" ADD CONSTRAINT "HistoricoAlteracao_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoAlteracao" ADD CONSTRAINT "HistoricoAlteracao_parceiroId_colaboradorId_fkey" FOREIGN KEY ("parceiroId", "colaboradorId") REFERENCES "Colaborador"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- =====================================================================
-- CHECKs: inteiros válidos garantidos pelo banco, não só pela tela.
-- Quantidade em milésimos, dinheiro em centavos, percentual em pontos-base
-- (1% = 100), fator em milésimos (1,000 = 1000).
-- =====================================================================

ALTER TABLE "ParceiroFlow" ADD CONSTRAINT "ParceiroFlow_periodoDiaInicio_faixa" CHECK ("periodoDiaInicio" BETWEEN 1 AND 28);

ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_taxaEntregaCentavos_naoneg" CHECK ("taxaEntregaCentavos" >= 0);
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_estoqueMinimoMilesimos_naoneg" CHECK ("estoqueMinimoMilesimos" >= 0);
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_validades_positivas" CHECK (
  "validadeSecoMin" > 0 AND "validadePistaFriaMin" > 0 AND "validadeRefrigeradoMin" > 0 AND "validadeCongeladoMin" > 0
) NOT VALID;
-- NOT VALID + VALIDATE: nulos passam (CHECK com NULL é verdadeiro); as linhas
-- antigas só têm nulo, então a validação é instantânea.
ALTER TABLE "Insumo" VALIDATE CONSTRAINT "Insumo_validades_positivas";

ALTER TABLE "InsumoVariante" ADD CONSTRAINT "InsumoVariante_conteudoMilesimos_positivo" CHECK ("conteudoMilesimos" > 0);
ALTER TABLE "InsumoVariante" ADD CONSTRAINT "InsumoVariante_precoEmbalagemCentavos_naoneg" CHECK ("precoEmbalagemCentavos" >= 0);
ALTER TABLE "InsumoVariante" ADD CONSTRAINT "InsumoVariante_taxaEntregaCentavos_naoneg" CHECK ("taxaEntregaCentavos" >= 0);

ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_valores_naoneg" CHECK ("freteCentavos" >= 0 AND "descontoCentavos" >= 0 AND "totalCentavos" >= 0);
ALTER TABLE "NotaEntrada" ADD CONSTRAINT "NotaEntrada_chaveAcesso_44" CHECK ("chaveAcesso" ~ '^[0-9]{44}$');

ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_quantidades_positivas" CHECK ("embalagensMilesimos" > 0 AND "conteudoMilesimos" > 0 AND "quantidadeMilesimos" > 0);
ALTER TABLE "NotaEntradaItem" ADD CONSTRAINT "NotaEntradaItem_valorTotalCentavos_naoneg" CHECK ("valorTotalCentavos" >= 0);

ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_rendimentoMilesimos_positivo" CHECK ("rendimentoMilesimos" > 0);
ALTER TABLE "FichaTecnica" ADD CONSTRAINT "FichaTecnica_insumoProduzido_so_preparo" CHECK ("tipo" = 'PRE_PREPARO' OR "insumoProduzidoId" IS NULL);

ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_quantidadeMilesimos_positivo" CHECK ("quantidadeMilesimos" > 0);
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_fatorCorrecao_minimo" CHECK ("fatorCorrecaoMilesimos" >= 1000);
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_insumo_xor_subficha" CHECK (num_nonnulls("insumoId", "subfichaId") = 1);
ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_subficha_nao_eh_ela" CHECK ("subfichaId" IS DISTINCT FROM "fichaId");

ALTER TABLE "ProdutoCanal" ADD CONSTRAINT "ProdutoCanal_precoManualCentavos_naoneg" CHECK ("precoManualCentavos" >= 0);
ALTER TABLE "ProdutoCanal" ADD CONSTRAINT "ProdutoCanal_margemAlvoBp_faixa" CHECK ("margemAlvoBp" >= 0 AND "margemAlvoBp" < 10000);

ALTER TABLE "ProdutoEmbalagem" ADD CONSTRAINT "ProdutoEmbalagem_quantidadeMilesimos_positivo" CHECK ("quantidadeMilesimos" > 0);
ALTER TABLE "ProdutoEmbalagem" ADD CONSTRAINT "ProdutoEmbalagem_canal_com_embalagem" CHECK ("canal" <> 'LOJA');

ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_taxaBp_faixa" CHECK ("taxaBp" BETWEEN 0 AND 10000);
ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_taxaFixaCentavos_naoneg" CHECK ("taxaFixaCentavos" >= 0);
ALTER TABLE "CanalConfig" ADD CONSTRAINT "CanalConfig_margemAlvoPadraoBp_faixa" CHECK ("margemAlvoPadraoBp" >= 0 AND "margemAlvoPadraoBp" < 10000);

ALTER TABLE "SaldoEstoque" ADD CONSTRAINT "SaldoEstoque_versao_naoneg" CHECK ("versao" >= 0);

-- Movimento: nunca zero; sinal coerente com o tipo; valor com o mesmo sinal
-- da quantidade (ou zero); saldo depois = antes + quantidade; no máximo um
-- documento de origem.
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_quantidade_naozero" CHECK ("quantidadeMilesimos" <> 0);
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_sinal_do_tipo" CHECK (
  ("tipo" IN ('ABERTURA', 'ENTRADA_COMPRA', 'PRODUCAO_ENTRADA') AND "quantidadeMilesimos" > 0)
  OR ("tipo" IN ('REQUISICAO', 'PRODUCAO_CONSUMO', 'PERDA') AND "quantidadeMilesimos" < 0)
  OR "tipo" IN ('AJUSTE', 'CONTAGEM')
);
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_valor_mesmo_sinal" CHECK (
  "valorCentavos" = 0 OR sign("valorCentavos") = sign("quantidadeMilesimos")
);
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_saldo_fecha" CHECK (
  "saldoDepoisMilesimos" = "saldoAntesMilesimos" + "quantidadeMilesimos"
);
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_um_documento" CHECK (
  num_nonnulls("notaItemId", "requisicaoItemId", "contagemItemId", "ordemProducaoId") <= 1
);

ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_valorTotalCentavos_naoneg" CHECK ("valorTotalCentavos" >= 0);
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_contadoMilesimos_naoneg" CHECK ("contadoMilesimos" >= 0);

ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_solicitado_positivo" CHECK ("solicitadoMilesimos" > 0);
ALTER TABLE "RequisicaoItem" ADD CONSTRAINT "RequisicaoItem_atendido_naoneg" CHECK ("atendidoMilesimos" >= 0);

ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_planejado_positivo" CHECK ("planejadoMilesimos" > 0);
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_produzido_naoneg" CHECK ("produzidoMilesimos" >= 0);
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_custo_naoneg" CHECK ("custoTotalCentavos" >= 0);

ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_quantidade_positiva" CHECK ("quantidadeMilesimos" > 0);
ALTER TABLE "Etiqueta" ADD CONSTRAINT "Etiqueta_tem_origem" CHECK (num_nonnulls("insumoId", "ordemProducaoId", "notaItemId") >= 1);

ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_naoneg" CHECK ("valorCentavos" >= 0 AND "pedidos" >= 0 AND "clientes" >= 0);
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_chave_naovazia" CHECK (length("chaveIdempotencia") > 0);

ALTER TABLE "DreMeta" ADD CONSTRAINT "DreMeta_percentualBp_faixa" CHECK ("percentualBp" BETWEEN 0 AND 10000);
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_valorCentavos_naoneg" CHECK ("valorCentavos" >= 0);
ALTER TABLE "PeriodoApuracao" ADD CONSTRAINT "PeriodoApuracao_fim_apos_inicio" CHECK ("fim" >= "inicio");
ALTER TABLE "FarolFaixa" ADD CONSTRAINT "FarolFaixa_aPartirDeBp_faixa" CHECK ("aPartirDeBp" BETWEEN -10000 AND 10000);

-- =====================================================================
-- Livro-razão só se acrescenta: movimento de estoque e histórico de
-- alteração não se editam (correção é um lançamento novo). DELETE fica
-- possível para limpeza administrativa/LGPD; UPDATE, nunca.
-- =====================================================================

CREATE OR REPLACE FUNCTION "erp_bloquear_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '[erp] % só aceita INSERT: correção é um lançamento novo.', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MovimentoEstoque_sem_update" BEFORE UPDATE ON "MovimentoEstoque"
  FOR EACH ROW EXECUTE FUNCTION "erp_bloquear_update"();
CREATE TRIGGER "HistoricoAlteracao_sem_update" BEFORE UPDATE ON "HistoricoAlteracao"
  FOR EACH ROW EXECUTE FUNCTION "erp_bloquear_update"();
