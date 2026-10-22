-- ERP F.1a — cadastro do fornecedor evoluído (preparado para o documento fiscal da F.1b) e CNPJ da loja. Decisões 300 a 313.
--
-- ADITIVA: colunas anuláveis (ou com default constante) em "Fornecedor" e "Loja", um tipo novo, CHECKs e dois índices únicos. Nenhuma
-- tabela nova (RLS, GRANT e portão não mudam), nenhuma linha é apagada, movida ou reescrita. Os fornecedores que já existem ficam
-- exatamente como estavam e ganham, pelo DEFAULT da coluna, a situação "A_COMPLETAR" (falta e-mail, WhatsApp e, se for o caso, razão
-- social): mesmos ids, mesmos vínculos com insumos e notas. O "contato" em texto livre NÃO é convertido em WhatsApp, e-mail ou
-- contato comercial (nada se inventa).
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: NENHUM passo lê tabela de tenant (nada de SELECT, nada
-- de UPDATE em massa). Os CHECKs entram NOT VALID e se tenta o VALIDATE logo depois (a validação lê a tabela fora da RLS do papel);
-- linha antiga que viole um deles não reprova a migration: o CHECK fica NOT VALID e avisa (WARNING). O índice único do documento é
-- criado dentro de um bloco que captura a violação: se já houver dois fornecedores do mesmo parceiro com o mesmo CNPJ/CPF, a migration
-- termina, o índice NÃO é criado, o WARNING avisa (o PostgreSQL não diz qual é o par ao criar um índice) e `npm run erp:conferir-migracao`
-- lista todos os pares, parceiro por parceiro. A regra do
-- servidor já recusa o documento repetido antes (e a corrida, quando o índice existe).
-- Depois do deploy, `npm run erp:conferir-migracao` confere colunas, CHECKs, índices e a lista de documentos repetidos.

CREATE TYPE "SituacaoCadastroFornecedor" AS ENUM ('COMPLETO', 'A_COMPLETAR');

ALTER TABLE "Fornecedor"
  ADD COLUMN "razaoSocial" TEXT,
  ADD COLUMN "inscricaoEstadual" TEXT,
  ADD COLUMN "endereco" TEXT,
  ADD COLUMN "municipio" TEXT,
  ADD COLUMN "uf" TEXT,
  ADD COLUMN "cep" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "contatoComercial" TEXT,
  ADD COLUMN "prazoPagamentoDias" INTEGER,
  ADD COLUMN "semNotaFiscal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "situacaoCadastro" "SituacaoCadastroFornecedor" NOT NULL DEFAULT 'A_COMPLETAR',
  ADD COLUMN "chaveEnvio" TEXT,
  ADD COLUMN "hashEnvio" TEXT;

ALTER TABLE "Loja" ADD COLUMN "cnpj" TEXT;

-- A chave de envio é única por parceiro (nulo não repete: o fornecedor antigo e o que vem do sistema não têm chave).
CREATE UNIQUE INDEX "Fornecedor_parceiroId_chaveEnvio_key" ON "Fornecedor"("parceiroId", "chaveEnvio");

-- ------------------------------------------------------------ CHECKs (NOT VALID, depois se tenta validar)
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_documento_formato"
  CHECK ("documento" IS NULL OR "documento" ~ '^([0-9]{11}|[0-9]{14})$') NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_inscricao_formato"
  CHECK ("inscricaoEstadual" IS NULL OR "inscricaoEstadual" ~ '^(ISENTO|[0-9]{2,14})$') NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_uf_valida"
  CHECK ("uf" IS NULL OR "uf" IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')) NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_cep_formato"
  CHECK ("cep" IS NULL OR "cep" ~ '^[0-9]{8}$') NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_whatsapp_formato"
  CHECK ("whatsapp" IS NULL OR "whatsapp" ~ '^[0-9]{10,11}$') NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_email_formato"
  CHECK ("email" IS NULL OR ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length("email") <= 120)) NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_prazo_faixa"
  CHECK ("prazoPagamentoDias" IS NULL OR "prazoPagamentoDias" BETWEEN 0 AND 180) NOT VALID;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_textos_curtos"
  CHECK (
    ("razaoSocial" IS NULL OR char_length("razaoSocial") BETWEEN 1 AND 120)
    AND ("endereco" IS NULL OR char_length("endereco") BETWEEN 1 AND 200)
    AND ("municipio" IS NULL OR char_length("municipio") BETWEEN 1 AND 60)
    AND ("contatoComercial" IS NULL OR char_length("contatoComercial") BETWEEN 1 AND 80)
  ) NOT VALID;
-- Chave e impressão vêm juntas, e a chave tem um tamanho que sirva de UUID.
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_chaveEnvio_completa"
  CHECK (("chaveEnvio" IS NULL) = ("hashEnvio" IS NULL) AND ("chaveEnvio" IS NULL OR char_length("chaveEnvio") BETWEEN 8 AND 80)) NOT VALID;
-- "Completo" quer dizer que tem o básico: WhatsApp sempre; e, fora "Compras sem nota fiscal", razão social, CNPJ/CPF e e-mail.
-- O "a completar" não tem regra (é o que o sistema cria quando não sabe o resto), por isso nenhum fornecedor antigo viola.
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_completo_tem_o_basico"
  CHECK (
    "situacaoCadastro" <> 'COMPLETO'
    OR ("whatsapp" IS NOT NULL AND ("semNotaFiscal" OR ("razaoSocial" IS NOT NULL AND "documento" IS NOT NULL AND "email" IS NOT NULL)))
  ) NOT VALID;

ALTER TABLE "Loja" ADD CONSTRAINT "Loja_cnpj_formato"
  CHECK ("cnpj" IS NULL OR "cnpj" ~ '^[0-9]{14}$') NOT VALID;

-- ------------------------------------------------------------ validar o que já existe
DO $$
DECLARE
  alvo text;
BEGIN
  FOREACH alvo IN ARRAY ARRAY[
    'Fornecedor_documento_formato',
    'Fornecedor_inscricao_formato',
    'Fornecedor_uf_valida',
    'Fornecedor_cep_formato',
    'Fornecedor_whatsapp_formato',
    'Fornecedor_email_formato',
    'Fornecedor_prazo_faixa',
    'Fornecedor_textos_curtos',
    'Fornecedor_chaveEnvio_completa',
    'Fornecedor_completo_tem_o_basico'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE "Fornecedor" VALIDATE CONSTRAINT %I', alvo);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP F.1a: o CHECK % ficou NOT VALID (linha antiga em Fornecedor, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo;
    END;
  END LOOP;
  BEGIN
    ALTER TABLE "Loja" VALIDATE CONSTRAINT "Loja_cnpj_formato";
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'ERP F.1a: o CHECK Loja_cnpj_formato ficou NOT VALID (linha antiga em Loja, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.';
  END;
END $$;

-- ------------------------------------------------------------ o documento fiscal é único por parceiro
-- Só onde existe documento (o fornecedor de feira não tem). A filial tem OUTRO CNPJ: é outro cadastro e passa. Nada se funde por
-- nome. Se já houver dois fornecedores do mesmo parceiro com o mesmo documento, o índice não é criado e a migration segue (o aviso
-- manda rodar `npm run erp:conferir-migracao`, que lista todos os pares). Nenhum SELECT: a migration só tenta criar o índice.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX "Fornecedor_parceiroId_documento_key" ON "Fornecedor"("parceiroId", "documento") WHERE "documento" IS NOT NULL;
  EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'ERP F.1a: o índice Fornecedor_parceiroId_documento_key NÃO foi criado: há fornecedores do mesmo parceiro com o mesmo CNPJ/CPF. Rode npm run erp:conferir-migracao para a lista, corrija o cadastro (o documento certo de cada um, ou "Compras sem nota fiscal") e crie o índice (CREATE UNIQUE INDEX da migration 20261105000000_erp_fornecedor_cadastro). Enquanto isso o servidor já recusa documento repetido.';
  END;
END $$;
