-- ERP 2.2b — Metas e fechamento do período (decisões 149 a 157).
--
-- ADITIVA. Segura com o usuário superusuário (produção hoje) e com o dono
-- NÃO-superusuário, com ou sem a RLS instalada. Lição da 2.1: nenhum passo
-- depende de SELECT em tabela de tenant (o dono com FORCE RLS enxerga 0 linhas).
-- O que lê tabela de tenant aqui é só o VALIDATE do catálogo, que varre a tabela
-- inteira sem passar pela RLS; as duas tabelas novas nascem vazias.
--
--  1. Colunas novas em "DreMeta" (apagar a meta vira linha `semMeta`) e em
--     "PeriodoApuracao" (quem fechou).
--  2. CHECKs novos entram NOT VALID (valem para toda escrita daqui para a frente)
--     e logo se tenta o VALIDATE: linha antiga que viole não reprova a migration,
--     só deixa o CHECK NOT VALID e avisa (WARNING). Depois do deploy,
--     `npm run erp:conferir-migracao` lista o que ficou pendente.
--  3. "DreFotografia" e "DreFotografiaLinha", as duas tabelas novas (de tenant):
--     RLS/FORCE/política/GRANT no mesmo padrão condicional da 0.2 e da 2.2a, e
--     sem DELETE (nem UPDATE na linha) para o papel do tenant.
--  4. Gatilhos: a fotografia é imutável (só se marca como substituída, uma vez),
--     a linha só entra na transação da fotografia, o período FECHADO não muda de
--     datas e só fica FECHADO com uma fotografia vigente (gatilho adiado); a fotografia
--     só nasce com o período ABERTO, na versão seguinte, e a tabela não se esvazia;
--     período ABERTO com fotografia vigente também não existe (gatilho adiado).

-- ------------------------------------------------------------ colunas novas
ALTER TABLE "DreMeta"
  ADD COLUMN "semMeta" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "criadoPorNome" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "PeriodoApuracao" ADD COLUMN "fechadoPorNome" TEXT;

-- ------------------------------------------------------------ CHECKs (NOT VALID)
-- "Sem meta" é uma linha que guarda zero: a meta anterior não volta sozinha.
ALTER TABLE "DreMeta" ADD CONSTRAINT "DreMeta_sem_meta_zera"
  CHECK (NOT "semMeta" OR "percentualBp" = 0) NOT VALID;
ALTER TABLE "DreMeta" ADD CONSTRAINT "DreMeta_nome_curto"
  CHECK (char_length("criadoPorNome") <= 120) NOT VALID;
-- Fechado sem data de fechamento não existe.
ALTER TABLE "PeriodoApuracao" ADD CONSTRAINT "PeriodoApuracao_fechado_tem_data"
  CHECK ("status" <> 'FECHADO' OR "fechadoEm" IS NOT NULL) NOT VALID;
ALTER TABLE "PeriodoApuracao" ADD CONSTRAINT "PeriodoApuracao_fechadoPor_curto"
  CHECK ("fechadoPorNome" IS NULL OR char_length("fechadoPorNome") <= 120) NOT VALID;

-- VALIDATE só LÊ a tabela. Linha antiga que violar não reprova a migration: o
-- CHECK fica NOT VALID e o aviso diz qual. Não passa pela RLS, então vale igual
-- para o dono não-superusuário.
DO $$
DECLARE
  alvo text[];
BEGIN
  FOREACH alvo SLICE 1 IN ARRAY ARRAY[
    ARRAY['DreMeta', 'DreMeta_sem_meta_zera'],
    ARRAY['DreMeta', 'DreMeta_nome_curto'],
    ARRAY['PeriodoApuracao', 'PeriodoApuracao_fechado_tem_data'],
    ARRAY['PeriodoApuracao', 'PeriodoApuracao_fechadoPor_curto']
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', alvo[1], alvo[2]);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP 2.2b: o CHECK % ficou NOT VALID (linha antiga em %, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo[2], alvo[1];
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------ a fotografia do fechamento
CREATE TABLE "DreFotografia" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "nomeDoPeriodo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadaNaTransacao" BIGINT NOT NULL DEFAULT txid_current(),
    "fechadoPorNome" TEXT NOT NULL,
    "taxaComissaoBp" INTEGER,
    "taxaPagamentoBp" INTEGER,
    "versaoDaConta" INTEGER NOT NULL DEFAULT 1,
    "entrada" JSONB NOT NULL,
    "ressalvas" JSONB NOT NULL DEFAULT '[]',
    "justificativa" TEXT,
    "substituidaEm" TIMESTAMP(3),
    "reabertaPorNome" TEXT,
    "motivoReabertura" TEXT,

    CONSTRAINT "DreFotografia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DreFotografia_versao_minima" CHECK ("versao" >= 1 AND "versaoDaConta" >= 1),
    CONSTRAINT "DreFotografia_datas" CHECK ("fim" >= "inicio"),
    CONSTRAINT "DreFotografia_taxa_faixa" CHECK (
      ("taxaComissaoBp" IS NULL OR "taxaComissaoBp" BETWEEN 0 AND 10000)
      AND ("taxaPagamentoBp" IS NULL OR "taxaPagamentoBp" BETWEEN 0 AND 10000)
      AND (("taxaComissaoBp" IS NULL) = ("taxaPagamentoBp" IS NULL))
    ),
    CONSTRAINT "DreFotografia_json" CHECK (jsonb_typeof("entrada") = 'object' AND jsonb_typeof("ressalvas") = 'array'),
    CONSTRAINT "DreFotografia_textos_curtos" CHECK (
      char_length("nomeDoPeriodo") BETWEEN 1 AND 120
      AND char_length("fechadoPorNome") <= 120
      AND ("justificativa" IS NULL OR char_length("justificativa") <= 300)
      AND ("reabertaPorNome" IS NULL OR char_length("reabertaPorNome") <= 120)
      AND ("motivoReabertura" IS NULL OR char_length("motivoReabertura") <= 200)
    ),
    -- A reabertura grava os três juntos, ou nenhum.
    CONSTRAINT "DreFotografia_reabertura_inteira" CHECK (
      ("substituidaEm" IS NULL AND "reabertaPorNome" IS NULL AND "motivoReabertura" IS NULL)
      OR ("substituidaEm" IS NOT NULL AND "reabertaPorNome" IS NOT NULL AND "motivoReabertura" IS NOT NULL)
    )
);

CREATE TABLE "DreFotografiaLinha" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "fotografiaId" TEXT NOT NULL,
    "lojaId" TEXT,
    "lojaNome" TEXT,
    "ordem" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "codigo" TEXT,
    "linhaId" TEXT,
    "nome" TEXT NOT NULL,
    "grupo" "DreGrupo" NOT NULL,
    "tipo" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "sentido" "DreSentido" NOT NULL,
    "valorCentavos" BIGINT,
    "percentualBp" INTEGER,
    "metaBp" INTEGER,
    "semContar" TEXT[],
    "nota" TEXT,
    "oculta" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DreFotografiaLinha_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DreFotografiaLinha_tipo" CHECK ("tipo" IN ('receita', 'taxa', 'linha', 'subtotal', 'cmv', 'resultado')),
    CONSTRAINT "DreFotografiaLinha_nivel" CHECK ("nivel" IN (0, 1) AND "ordem" >= 0),
    CONSTRAINT "DreFotografiaLinha_meta_faixa" CHECK ("metaBp" IS NULL OR "metaBp" BETWEEN 0 AND 10000),
    CONSTRAINT "DreFotografiaLinha_loja_com_nome" CHECK (("lojaId" IS NULL) = ("lojaNome" IS NULL)),
    CONSTRAINT "DreFotografiaLinha_textos_curtos" CHECK (
      char_length("chave") BETWEEN 1 AND 80
      AND char_length("nome") BETWEEN 1 AND 120
      AND ("lojaNome" IS NULL OR char_length("lojaNome") <= 120)
      AND ("nota" IS NULL OR char_length("nota") <= 120)
    )
);

CREATE UNIQUE INDEX "DreFotografia_parceiroId_id_key" ON "DreFotografia"("parceiroId", "id");
CREATE UNIQUE INDEX "DreFotografia_parceiroId_periodoId_versao_key" ON "DreFotografia"("parceiroId", "periodoId", "versao");
-- Uma fotografia VIGENTE por período (a substituída sai do índice).
CREATE UNIQUE INDEX "DreFotografia_uma_vigente" ON "DreFotografia"("parceiroId", "periodoId") WHERE "substituidaEm" IS NULL;

CREATE UNIQUE INDEX "DreFotografiaLinha_parceiroId_id_key" ON "DreFotografiaLinha"("parceiroId", "id");
-- A rede (loja nula) também não repete a chave.
CREATE UNIQUE INDEX "DreFotografiaLinha_parceiroId_fotografiaId_lojaId_chave_key"
  ON "DreFotografiaLinha"("parceiroId", "fotografiaId", "lojaId", "chave") NULLS NOT DISTINCT;
CREATE INDEX "DreFotografiaLinha_parceiroId_fotografiaId_idx" ON "DreFotografiaLinha"("parceiroId", "fotografiaId");

ALTER TABLE "DreFotografia" ADD CONSTRAINT "DreFotografia_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DreFotografia" ADD CONSTRAINT "DreFotografia_parceiroId_periodoId_fkey"
  FOREIGN KEY ("parceiroId", "periodoId") REFERENCES "PeriodoApuracao"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DreFotografiaLinha" ADD CONSTRAINT "DreFotografiaLinha_parceiroId_fkey"
  FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DreFotografiaLinha" ADD CONSTRAINT "DreFotografiaLinha_parceiroId_fotografiaId_fkey"
  FOREIGN KEY ("parceiroId", "fotografiaId") REFERENCES "DreFotografia"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DreFotografiaLinha" ADD CONSTRAINT "DreFotografiaLinha_parceiroId_lojaId_fkey"
  FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ gatilhos
-- Dono da linha é imutável (a mesma função de todas as tabelas de tenant).
CREATE TRIGGER "DreFotografia_parceiro_imutavel" BEFORE UPDATE ON "DreFotografia"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "DreFotografiaLinha_parceiro_imutavel" BEFORE UPDATE ON "DreFotografiaLinha"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- A fotografia não se apaga e não muda. A única escrita que passa: a reabertura marca
-- `substituidaEm`, `reabertaPorNome` e `motivoReabertura`, de nulo para valor, UMA vez.
CREATE OR REPLACE FUNCTION "erp_dre_fotografia_imutavel"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '[erp] a fotografia do fechamento não se apaga (DreFotografia_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'substituidaEm' - 'reabertaPorNome' - 'motivoReabertura')
     IS DISTINCT FROM (to_jsonb(OLD) - 'substituidaEm' - 'reabertaPorNome' - 'motivoReabertura') THEN
    RAISE EXCEPTION '[erp] a fotografia do fechamento não muda: só se marca como substituída (DreFotografia_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."substituidaEm" IS NOT NULL THEN
    RAISE EXCEPTION '[erp] esta fotografia já foi substituída: não se marca de novo (DreFotografia_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DreFotografia_imutavel" BEFORE UPDATE OR DELETE ON "DreFotografia"
  FOR EACH ROW EXECUTE FUNCTION "erp_dre_fotografia_imutavel"();

-- A linha só se inclui, e só na transação em que a fotografia nasceu: não há como
-- acrescentar uma linha a um fechamento que já existe.
CREATE OR REPLACE FUNCTION "erp_dre_fotografia_linha_so_inclusao"() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '[erp] a linha da fotografia só se inclui (DreFotografiaLinha_so_inclusao).' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "DreFotografia" f
    WHERE f."parceiroId" = NEW."parceiroId" AND f."id" = NEW."fotografiaId" AND f."criadaNaTransacao" = txid_current()
  ) THEN
    RAISE EXCEPTION '[erp] as linhas só entram na mesma transação da fotografia (DreFotografiaLinha_so_inclusao).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DreFotografiaLinha_so_inclusao" BEFORE INSERT OR UPDATE OR DELETE ON "DreFotografiaLinha"
  FOR EACH ROW EXECUTE FUNCTION "erp_dre_fotografia_linha_so_inclusao"();

-- Período FECHADO: início, fim, nome e dono não mudam (o anti-sobreposição da 2.2a segue valendo).
CREATE OR REPLACE FUNCTION "erp_periodo_fechado_imutavel"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'FECHADO' AND (
    NEW."inicio" <> OLD."inicio" OR NEW."fim" <> OLD."fim" OR NEW."nome" <> OLD."nome" OR NEW."parceiroId" <> OLD."parceiroId"
  ) THEN
    RAISE EXCEPTION '[erp] o período fechado não muda de datas nem de nome: reabra antes (PeriodoApuracao_fechado_imutavel).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PeriodoApuracao_fechado_imutavel" BEFORE UPDATE ON "PeriodoApuracao"
  FOR EACH ROW EXECUTE FUNCTION "erp_periodo_fechado_imutavel"();

-- O cinto contra UPDATE solto: o período só fica FECHADO com uma fotografia vigente.
-- Adiado até o fim da transação (a fotografia nasce na mesma).
CREATE OR REPLACE FUNCTION "erp_periodo_fechado_tem_fotografia"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'FECHADO' AND NOT EXISTS (
    SELECT 1 FROM "DreFotografia" f
    WHERE f."parceiroId" = NEW."parceiroId" AND f."periodoId" = NEW."id" AND f."substituidaEm" IS NULL
  ) THEN
    RAISE EXCEPTION '[erp] o período de % a % só fica FECHADO com uma fotografia vigente do DRE (PeriodoApuracao_fechado_tem_fotografia).', NEW."inicio", NEW."fim"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PeriodoApuracao_fechado_tem_fotografia" AFTER INSERT OR UPDATE ON "PeriodoApuracao"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_periodo_fechado_tem_fotografia"();

-- E o outro lado do mesmo cinto: marcar a fotografia como substituída (a reabertura) sem voltar o
-- período a ABERTO deixaria um período FECHADO sem fotografia vigente. Também adiado: a reabertura
-- marca a fotografia e muda o período na mesma transação.
CREATE OR REPLACE FUNCTION "erp_fotografia_substituida_reabre_periodo"() RETURNS trigger AS $$
BEGIN
  IF NEW."substituidaEm" IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM "PeriodoApuracao" p
       WHERE p."parceiroId" = NEW."parceiroId" AND p."id" = NEW."periodoId" AND p."status" = 'FECHADO'
     )
     AND NOT EXISTS (
       SELECT 1 FROM "DreFotografia" f
       WHERE f."parceiroId" = NEW."parceiroId" AND f."periodoId" = NEW."periodoId" AND f."substituidaEm" IS NULL
     ) THEN
    RAISE EXCEPTION '[erp] a fotografia só é substituída quando o período volta a ser ABERTO (DreFotografia_substituida_reabre_periodo).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "DreFotografia_substituida_reabre_periodo" AFTER UPDATE ON "DreFotografia"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_fotografia_substituida_reabre_periodo"();

-- Uma fotografia só NASCE com o período ABERTO e na versão seguinte à última. Sem isto, quem marca a
-- vigente como substituída e insere uma "v999" vigente deixa o período FECHADO, sem REABRIU, lendo uma
-- fotografia falsa: os dois gatilhos adiados acima ficariam satisfeitos. O fluxo legítimo (fechar) grava a
-- fotografia com o período ainda ABERTO e só depois o marca FECHADO, na mesma transação; reabrir volta a ABERTO
-- antes de a versão seguinte nascer.
CREATE OR REPLACE FUNCTION "erp_dre_fotografia_so_periodo_aberto"() RETURNS trigger AS $$
DECLARE
  situacao text;
  ultima integer;
BEGIN
  SELECT p."status"::text INTO situacao FROM "PeriodoApuracao" p WHERE p."parceiroId" = NEW."parceiroId" AND p."id" = NEW."periodoId";
  IF situacao IS DISTINCT FROM 'ABERTO' THEN
    RAISE EXCEPTION '[erp] a fotografia só nasce com o período ABERTO: reabra antes (DreFotografia_so_periodo_aberto).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT coalesce(max(f."versao"), 0) INTO ultima FROM "DreFotografia" f WHERE f."parceiroId" = NEW."parceiroId" AND f."periodoId" = NEW."periodoId";
  IF NEW."versao" <> ultima + 1 THEN
    RAISE EXCEPTION '[erp] a versão da fotografia é a seguinte à última (esperada %, veio %) (DreFotografia_so_periodo_aberto).', ultima + 1, NEW."versao" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."substituidaEm" IS NOT NULL THEN
    RAISE EXCEPTION '[erp] a fotografia nasce vigente (DreFotografia_so_periodo_aberto).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DreFotografia_so_periodo_aberto" BEFORE INSERT ON "DreFotografia"
  FOR EACH ROW EXECUTE FUNCTION "erp_dre_fotografia_so_periodo_aberto"();

-- O outro lado do mesmo cinto: período ABERTO com fotografia vigente não existe. Fecha o UPDATE solto
-- FECHADO -> ABERTO (sem marcar a fotografia como substituída) que deixaria o DRE lendo ao vivo um período
-- que tem fotografia, e a fotografia vigente nascida num período que não ficou FECHADO. Adiado até o fim da
-- transação: fechar (fotografia + FECHADO) e reabrir (substituída + ABERTO) passam; os dois lados soltos, não.
CREATE OR REPLACE FUNCTION "erp_periodo_aberto_sem_fotografia_vigente"() RETURNS trigger AS $$
DECLARE
  alvo text;
  parceiro text;
  situacao text;
BEGIN
  -- O gatilho adiado recebe a linha COMO ERA no evento (o INSERT do período nasce ABERTO e só depois vira FECHADO,
  -- na mesma transação): o que vale é o estado de agora, lido aqui.
  IF TG_TABLE_NAME = 'PeriodoApuracao' THEN
    alvo := NEW."id"; parceiro := NEW."parceiroId";
  ELSE
    IF NEW."substituidaEm" IS NOT NULL THEN RETURN NULL; END IF;
    alvo := NEW."periodoId"; parceiro := NEW."parceiroId";
  END IF;
  SELECT p."status"::text INTO situacao FROM "PeriodoApuracao" p WHERE p."parceiroId" = parceiro AND p."id" = alvo;
  IF situacao = 'ABERTO' AND EXISTS (
    SELECT 1 FROM "DreFotografia" f WHERE f."parceiroId" = parceiro AND f."periodoId" = alvo AND f."substituidaEm" IS NULL
  ) THEN
    RAISE EXCEPTION '[erp] período ABERTO com fotografia vigente do DRE: reabrir marca a fotografia como substituída, e a fotografia só fica vigente num período FECHADO (%).', TG_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "PeriodoApuracao_aberto_sem_fotografia_vigente" AFTER INSERT OR UPDATE ON "PeriodoApuracao"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_periodo_aberto_sem_fotografia_vigente"();
CREATE CONSTRAINT TRIGGER "DreFotografia_vigente_so_em_periodo_fechado" AFTER INSERT ON "DreFotografia"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_periodo_aberto_sem_fotografia_vigente"();

-- Esvaziar a tabela inteira também não vale (DELETE linha a linha já é recusado acima).
CREATE OR REPLACE FUNCTION "erp_dre_fotografia_sem_truncate"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '[erp] a fotografia do fechamento não se esvazia (%).', TG_NAME USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DreFotografia_sem_truncate" BEFORE TRUNCATE ON "DreFotografia"
  FOR EACH STATEMENT EXECUTE FUNCTION "erp_dre_fotografia_sem_truncate"();
CREATE TRIGGER "DreFotografiaLinha_sem_truncate" BEFORE TRUNCATE ON "DreFotografiaLinha"
  FOR EACH STATEMENT EXECUTE FUNCTION "erp_dre_fotografia_sem_truncate"();

-- ------------------------------------------------------------ RLS
-- O mesmo padrão condicional da 0.2 e da 2.2a (só se quem roda pode instalar por
-- inteiro). Se as tabelas antigas JÁ têm RLS e estas não puderem ser instaladas,
-- a migration falha com a frase: tabela sem GRANT para o papel quebraria o ERP em
-- tempo de execução, e é melhor o deploy parar do que o ERP.
--
-- O papel do tenant só INSERE e LÊ a fotografia e a linha: nada de DELETE, e o único
-- UPDATE é nas três colunas da reabertura (o gatilho ainda confere a regra).
DO $$
DECLARE
  tabela text;
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  FOREACH tabela IN ARRAY ARRAY['DreFotografia', 'DreFotografiaLinha'] LOOP
    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 2.2b: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 2.2b: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não pode criar o papel erp_tenant.', tabela, current_user;
        CONTINUE;
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
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP 2.2b: % não consegue assumir o papel erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT SELECT, INSERT ON %I TO erp_tenant', tabela);
    IF tabela = 'DreFotografia' THEN
      EXECUTE 'GRANT UPDATE ("substituidaEm", "reabertaPorNome", "motivoReabertura") ON "DreFotografia" TO erp_tenant';
    END IF;
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
  END LOOP;
END $$;
