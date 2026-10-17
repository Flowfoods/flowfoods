-- ERP 2.2a — DRE ao vivo: plano de contas, despesas por competência, contas a
-- pagar mínimas e a regra do período como fonte única (decisões 135 a 148).
--
-- ADITIVA. Segura com o usuário superusuário (produção hoje) e com o dono
-- NÃO-superusuário, com ou sem a RLS instalada. Lição da 2.1: nenhum passo
-- depende de SELECT em tabela de tenant (o dono com FORCE RLS enxerga 0 linhas).
-- O que consulta tabela de tenant aqui é só o CREATE/VALIDATE do catálogo (que
-- lê a tabela inteira, sem passar pela RLS) e a cópia de "ParceiroFlow", que
-- não é de tenant.
--
--  1. Colunas e índices novos em "DreLinha" e "Despesa" (nenhuma tabela de
--     tenant existente muda de forma); dois valores novos em "DreGrupo" que
--     NÃO são usados neste arquivo (o Postgres só os libera depois do COMMIT).
--  2. CHECKs novos entram NOT VALID (valem para toda escrita daqui para a
--     frente) e logo se tenta o VALIDATE: linha antiga que viole não reprova a
--     migration, só deixa o CHECK NOT VALID e avisa (WARNING). Depois do deploy,
--     `npm run erp:conferir-migracao` lista o que ficou pendente.
--  3. "RegraDoPeriodo", a única tabela nova (de tenant): RLS/FORCE/política/GRANT
--     no mesmo padrão condicional da 0.2, FK ao parceiro, gatilhos (parceiro
--     imutável e só-inclusão). A primeira linha de cada parceiro é copiada de
--     "ParceiroFlow" ANTES de a RLS ser ligada nela (o dono não-superusuário com
--     FORCE RLS não escreveria sem o contexto do parceiro).
--  4. Gatilho anti-sobreposição em "PeriodoApuracao".
--
-- "DreLinha" NÃO é semeada aqui: o plano padrão se completa sozinho, por
-- código, na primeira escrita do DRE (garantirPlano, idempotente) e a leitura
-- usa o padrão do código enquanto o parceiro não tem linha.

-- ------------------------------------------------------------ grupos novos
ALTER TYPE "DreGrupo" ADD VALUE 'UTILIDADES';
ALTER TYPE "DreGrupo" ADD VALUE 'RESULTADO';

-- ------------------------------------------------------------ plano de contas
ALTER TABLE "DreLinha"
  ADD COLUMN "codigo" TEXT,
  ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "DreLinha_parceiroId_codigo_key" ON "DreLinha"("parceiroId", "codigo");

-- ------------------------------------------------------------ despesa
ALTER TABLE "Despesa"
  ADD COLUMN "competenciaFim" DATE,
  ADD COLUMN "recorrente" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repeteDeId" TEXT,
  ADD COLUMN "vencimento" DATE,
  ADD COLUMN "pagaEm" DATE,
  ADD COLUMN "atualizadoPorNome" TEXT NOT NULL DEFAULT '';

-- A filha aponta a despesa de origem (FK composta com o parceiro). NoAction: a
-- limpeza administrativa apaga origem e filha no mesmo DELETE.
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_parceiroId_repeteDeId_fkey"
  FOREIGN KEY ("parceiroId", "repeteDeId") REFERENCES "Despesa"("parceiroId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- A mesma despesa não se repete duas vezes (corrida de "Lançar as do mês passado").
CREATE UNIQUE INDEX "Despesa_parceiroId_repeteDeId_key" ON "Despesa"("parceiroId", "repeteDeId");
-- Contas a pagar: o filtro lê por vencimento.
CREATE INDEX "Despesa_parceiroId_vencimento_idx" ON "Despesa"("parceiroId", "vencimento");

-- ------------------------------------------------------------ CHECKs (NOT VALID)
ALTER TABLE "DreLinha" ADD CONSTRAINT "DreLinha_nome_curto"
  CHECK (char_length("nome") BETWEEN 1 AND 60) NOT VALID;
ALTER TABLE "DreLinha" ADD CONSTRAINT "DreLinha_codigo_curto"
  CHECK ("codigo" IS NULL OR char_length("codigo") BETWEEN 1 AND 60) NOT VALID;
-- Linha calculada é do sistema: sempre tem o código do padrão.
ALTER TABLE "DreLinha" ADD CONSTRAINT "DreLinha_calculada_tem_codigo"
  CHECK (NOT "calculada" OR "codigo" IS NOT NULL) NOT VALID;

-- R$ 0,01 a R$ 10.000.000,00 por despesa. A regra recusa antes com frase; o banco é o cinto.
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_valor_faixa"
  CHECK ("valorCentavos" BETWEEN 1 AND 1000000000) NOT VALID;
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_competencia_minima"
  CHECK ("competencia" >= DATE '2020-01-01') NOT VALID;
-- Intervalo de competência: o fim não vem antes do início e cabe em 366 dias.
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_competencia_fim"
  CHECK ("competenciaFim" IS NULL OR ("competenciaFim" >= "competencia" AND "competenciaFim" - "competencia" <= 365)) NOT VALID;
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_descricao_curta"
  CHECK (char_length("descricao") BETWEEN 1 AND 120) NOT VALID;
-- A despesa não tem canal (rateio por canal é da 2.4).
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_canal_nulo"
  CHECK ("canal" IS NULL) NOT VALID;
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_textos_curtos"
  CHECK (char_length("atualizadoPorNome") <= 120 AND ("chaveIdempotencia" IS NULL OR char_length("chaveIdempotencia") <= 200)) NOT VALID;
-- Repete todo mês só vale para competência de mês inteiro (aluguel, salário, luz).
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_recorrente_de_mes_inteiro"
  CHECK (NOT "recorrente" OR (
    "competenciaFim" IS NOT NULL
    AND "competencia" = date_trunc('month', "competencia"::timestamp)::date
    AND "competenciaFim" = (date_trunc('month', "competencia"::timestamp) + interval '1 month' - interval '1 day')::date
  )) NOT VALID;

-- ------------------------------------------------------------ validar o que já existe
-- VALIDATE só LÊ a tabela. Linha antiga que violar não reprova a migration: o
-- CHECK fica NOT VALID e o aviso diz qual. Não passa pela RLS, então vale igual
-- para o dono não-superusuário.
DO $$
DECLARE
  alvo text[];
BEGIN
  FOREACH alvo SLICE 1 IN ARRAY ARRAY[
    ARRAY['DreLinha', 'DreLinha_nome_curto'],
    ARRAY['DreLinha', 'DreLinha_codigo_curto'],
    ARRAY['DreLinha', 'DreLinha_calculada_tem_codigo'],
    ARRAY['Despesa', 'Despesa_valor_faixa'],
    ARRAY['Despesa', 'Despesa_competencia_minima'],
    ARRAY['Despesa', 'Despesa_competencia_fim'],
    ARRAY['Despesa', 'Despesa_descricao_curta'],
    ARRAY['Despesa', 'Despesa_canal_nulo'],
    ARRAY['Despesa', 'Despesa_textos_curtos'],
    ARRAY['Despesa', 'Despesa_recorrente_de_mes_inteiro']
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', alvo[1], alvo[2]);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP 2.2a: o CHECK % ficou NOT VALID (linha antiga em %, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo[2], alvo[1];
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------ a regra do período
CREATE TABLE "RegraDoPeriodo" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "tipo" "PeriodoTipo" NOT NULL,
    "diaInicio" INTEGER NOT NULL,
    "criadoPorNome" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegraDoPeriodo_pkey" PRIMARY KEY ("id"),
    -- PERSONALIZADO é legado e não tem tela.
    CONSTRAINT "RegraDoPeriodo_tipo_do_catalogo" CHECK ("tipo" <> 'PERSONALIZADO'),
    -- Semanal: dia da semana (1 = segunda … 7 = domingo). Mensal e quinzenal: dia do mês (1 a 28).
    CONSTRAINT "RegraDoPeriodo_dia_faixa" CHECK (
      ("tipo" = 'SEMANAL' AND "diaInicio" BETWEEN 1 AND 7) OR ("tipo" <> 'SEMANAL' AND "diaInicio" BETWEEN 1 AND 28)
    ),
    CONSTRAINT "RegraDoPeriodo_vigencia_minima" CHECK ("vigenteDesde" >= DATE '2020-01-01'),
    CONSTRAINT "RegraDoPeriodo_nome_curto" CHECK (char_length("criadoPorNome") <= 120)
);

CREATE UNIQUE INDEX "RegraDoPeriodo_parceiroId_id_key" ON "RegraDoPeriodo"("parceiroId", "id");
CREATE UNIQUE INDEX "RegraDoPeriodo_parceiroId_vigenteDesde_key" ON "RegraDoPeriodo"("parceiroId", "vigenteDesde");
ALTER TABLE "RegraDoPeriodo" ADD CONSTRAINT "RegraDoPeriodo_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A primeira regra de cada parceiro é a configuração antiga dele ("ParceiroFlow"
-- não é de tenant: este SELECT enxerga todos, com qualquer usuário). Personalizado
-- (legado, sem tela) vale o mês civil, como a 1.7 já tratava; semanal com dia
-- acima de 7 já valia segunda. Feito ANTES de ligar a RLS nesta tabela.
INSERT INTO "RegraDoPeriodo" ("id", "parceiroId", "vigenteDesde", "tipo", "diaInicio", "criadoPorNome")
SELECT
  gen_random_uuid()::text,
  p."id",
  DATE '2020-01-01',
  CASE WHEN p."periodoTipo" = 'PERSONALIZADO' THEN 'MENSAL'::"PeriodoTipo" ELSE p."periodoTipo" END,
  CASE
    WHEN p."periodoTipo" = 'PERSONALIZADO' THEN 1
    WHEN p."periodoTipo" = 'SEMANAL' AND p."periodoDiaInicio" > 7 THEN 1
    ELSE p."periodoDiaInicio"
  END,
  'Configuração anterior'
FROM "ParceiroFlow" p
ON CONFLICT DO NOTHING;

-- Dono da linha é imutável (mesma função de todas as tabelas de tenant) e a regra
-- só se inclui: o histórico das regras é o que garante que o passado não é reescrito.
CREATE TRIGGER "RegraDoPeriodo_parceiro_imutavel" BEFORE UPDATE ON "RegraDoPeriodo"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

CREATE OR REPLACE FUNCTION "erp_regra_do_periodo_so_inclusao"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '[erp] a regra do período só se inclui: para mudar, grave uma regra nova (RegraDoPeriodo_so_inclusao).'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RegraDoPeriodo_so_inclusao" BEFORE UPDATE ON "RegraDoPeriodo"
  FOR EACH ROW EXECUTE FUNCTION "erp_regra_do_periodo_so_inclusao"();

-- RLS: o mesmo padrão condicional da 0.2 (só se quem roda pode instalar por
-- inteiro). Se as tabelas antigas JÁ têm RLS e esta não puder ser instalada,
-- a migration falha com a frase: tabela sem GRANT para o papel quebraria o ERP
-- em tempo de execução, e é melhor o deploy parar do que o ERP.
DO $$
DECLARE
  tabela text := 'RegraDoPeriodo';
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
  IF NOT coalesce(dono, false) THEN
    IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 2.2a: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
    RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 2.2a: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não pode criar o papel erp_tenant.', tabela, current_user;
      RETURN;
    END IF;
    CREATE ROLE erp_tenant NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;

  pode_assumir := CASE WHEN current_setting('server_version_num')::int >= 160000
                       THEN pg_has_role(current_user, 'erp_tenant', 'SET')
                       ELSE pg_has_role(current_user, 'erp_tenant', 'MEMBER') END;
  IF NOT pode_assumir THEN
    BEGIN
      EXECUTE format('GRANT erp_tenant TO %I', current_user);
    EXCEPTION WHEN insufficient_privilege OR invalid_grant_operation THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 2.2a: % não consegue assumir o papel erp_tenant.', current_user; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
      RETURN;
    END;
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO erp_tenant', tabela);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tabela);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tabela);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tabela || '_do_parceiro', tabela);
  EXECUTE format(
    'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO erp_tenant '
    'USING ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), '''')) '
    'WITH CHECK ("parceiroId" = NULLIF(current_setting(''app.parceiro_id'', true), ''''))',
    tabela || '_do_parceiro', tabela
  );
  RAISE NOTICE 'ERP RLS instalada em %.', tabela;
END $$;

-- ------------------------------------------------------------ períodos não se sobrepõem
-- Cinto além de `registrarPeriodo` (que serializa por trava): o banco recusa
-- período que cruza outro do mesmo parceiro, mesmo por SQL cru. Dentro do
-- contexto do parceiro (a RLS) ele só enxerga os períodos dele, que é o que se
-- compara. UPDATE só confere se as datas mudaram (fechar o período, na 2.2b,
-- não depende de dado antigo).
CREATE OR REPLACE FUNCTION "erp_periodo_sem_sobreposicao"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."inicio" = OLD."inicio" AND NEW."fim" = OLD."fim" THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "PeriodoApuracao" p
    WHERE p."parceiroId" = NEW."parceiroId" AND p."id" <> NEW."id" AND p."inicio" <= NEW."fim" AND p."fim" >= NEW."inicio"
  ) THEN
    RAISE EXCEPTION '[erp] o período de % a % se sobrepõe a outro período já registrado (PeriodoApuracao_sem_sobreposicao).', NEW."inicio", NEW."fim"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PeriodoApuracao_sem_sobreposicao" BEFORE INSERT OR UPDATE ON "PeriodoApuracao"
  FOR EACH ROW EXECUTE FUNCTION "erp_periodo_sem_sobreposicao"();
