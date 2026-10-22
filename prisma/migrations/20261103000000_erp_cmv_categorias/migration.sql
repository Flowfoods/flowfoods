-- ERP I.2a — Metas por categoria, CMV gerencial por categoria (pelas compras) e retrato do estoque por insumo.
-- Decisões 270 a 283.
--
-- ADITIVA: quatro tabelas novas de tenant ("CategoriaNaLoja", "MetaCmvConjunto", "MetaCmvCategoria", "ContagemRetratoItem") e UMA
-- coluna anulável em "Contagem" ("retratoGravadoEm"). Nada é lido, movido nem apagado; nenhuma linha é criada (o retrato por
-- insumo só nasce a partir do primeiro fechamento ou abertura concluídos depois do deploy; contagem antiga fica com a coluna
-- nula = "antes da I.2", e nunca é reconstruída, porque o preço da época não existe).
--
-- Segura para superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS: nenhum passo lê tabela de tenant (lição da 2.1:
-- o dono com FORCE RLS enxerga 0 linhas). As tabelas nascem vazias, com os CHECKs validados de nascença; o único CHECK que entra
-- em tabela que já existe ("Contagem") vai NOT VALID e logo se tenta o VALIDATE (só lê o catálogo e a tabela fora da RLS do
-- papel); linha antiga que o viole não reprova a migration, deixa o CHECK NOT VALID e avisa (WARNING). O bloco da RLS é o padrão
-- condicional da 0.2 (se as tabelas antigas JÁ têm RLS e uma nova não puder ganhar, a migration para com a frase).
-- Depois do deploy, `npm run erp:conferir-migracao` confere as tabelas, a RLS, os índices, os gatilhos e o CHECK.
--
-- O que o banco garante (além do portão): a FK da categoria na meta é RESTRICT (categoria com meta não se exclui, nem por SQL);
-- o retrato só se inclui (UPDATE/DELETE/TRUNCATE recusados), só entra em contagem ABERTA de abertura ou fechamento, e a contagem
-- só ganha `retratoGravadoEm` quando a soma dos valores do retrato é o `valorTotalCentavos` dela, ao centavo; o conjunto de metas
-- só muda enquanto é o mais novo do escopo (o passado não é reescrito) e o conjunto que "segue a rede" não tem meta própria.

-- ------------------------------------------------------------ coluna da contagem
ALTER TABLE "Contagem" ADD COLUMN "retratoGravadoEm" TIMESTAMP(3);

-- ------------------------------------------------------------ tabelas
CREATE TABLE "ContagemRetratoItem" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "contagemId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "categoriaIdNaHora" TEXT,
    "tipoNaHora" "InsumoTipo" NOT NULL,
    "quantidadeMilesimos" INTEGER NOT NULL,
    "valorCentavos" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContagemRetratoItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContagemRetratoItem_quantidade_positiva" CHECK ("quantidadeMilesimos" > 0),
    CONSTRAINT "ContagemRetratoItem_valor_nao_negativo" CHECK ("valorCentavos" IS NULL OR "valorCentavos" >= 0)
);

CREATE TABLE "CategoriaNaLoja" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "usa" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atualizadoPorNome" TEXT NOT NULL DEFAULT '',
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaNaLoja_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CategoriaNaLoja_versao_positiva" CHECK ("versao" >= 1),
    CONSTRAINT "CategoriaNaLoja_nome_curto" CHECK (char_length("atualizadoPorNome") <= 120)
);

CREATE TABLE "MetaCmvConjunto" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "lojaId" TEXT,
    "vigenteDesde" DATE NOT NULL,
    "segueARede" BOOLEAN NOT NULL DEFAULT false,
    "aplicouModelo" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoPorNome" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCmvConjunto_pkey" PRIMARY KEY ("id"),
    -- Só a loja segue a rede: o conjunto da rede não tem a quem seguir.
    CONSTRAINT "MetaCmvConjunto_rede_nao_segue" CHECK ("lojaId" IS NOT NULL OR NOT "segueARede"),
    CONSTRAINT "MetaCmvConjunto_modelo_conhecido" CHECK ("aplicouModelo" IS NULL OR "aplicouModelo" IN ('MODELO_32')),
    CONSTRAINT "MetaCmvConjunto_versao_positiva" CHECK ("versao" >= 1),
    CONSTRAINT "MetaCmvConjunto_vigencia_minima" CHECK ("vigenteDesde" >= DATE '2020-01-01'),
    CONSTRAINT "MetaCmvConjunto_nome_curto" CHECK (char_length("criadoPorNome") <= 120)
);

CREATE TABLE "MetaCmvCategoria" (
    "id" TEXT NOT NULL,
    "parceiroId" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "percentualBp" INTEGER NOT NULL,

    CONSTRAINT "MetaCmvCategoria_pkey" PRIMARY KEY ("id"),
    -- Pontos-base da receita bruta: de 0 a 100,00 %.
    CONSTRAINT "MetaCmvCategoria_percentual_faixa" CHECK ("percentualBp" BETWEEN 0 AND 10000)
);

-- ------------------------------------------------------------ índices
CREATE INDEX "ContagemRetratoItem_parceiroId_insumoId_idx" ON "ContagemRetratoItem"("parceiroId", "insumoId");
CREATE INDEX "ContagemRetratoItem_parceiroId_categoriaIdNaHora_idx" ON "ContagemRetratoItem"("parceiroId", "categoriaIdNaHora");
CREATE UNIQUE INDEX "ContagemRetratoItem_parceiroId_id_key" ON "ContagemRetratoItem"("parceiroId", "id");
-- Um insumo por retrato: a segunda aplicação não duplica.
CREATE UNIQUE INDEX "ContagemRetratoItem_parceiroId_contagemId_insumoId_key" ON "ContagemRetratoItem"("parceiroId", "contagemId", "insumoId");

CREATE UNIQUE INDEX "CategoriaNaLoja_parceiroId_id_key" ON "CategoriaNaLoja"("parceiroId", "id");
CREATE UNIQUE INDEX "CategoriaNaLoja_parceiroId_lojaId_categoriaId_key" ON "CategoriaNaLoja"("parceiroId", "lojaId", "categoriaId");

CREATE UNIQUE INDEX "MetaCmvConjunto_parceiroId_id_key" ON "MetaCmvConjunto"("parceiroId", "id");
-- A rede tem loja nula: sem NULLS NOT DISTINCT dois conjuntos da rede na mesma vigência passariam.
CREATE UNIQUE INDEX "MetaCmvConjunto_parceiroId_lojaId_vigenteDesde_key" ON "MetaCmvConjunto"("parceiroId", "lojaId", "vigenteDesde") NULLS NOT DISTINCT;

CREATE INDEX "MetaCmvCategoria_parceiroId_categoriaId_idx" ON "MetaCmvCategoria"("parceiroId", "categoriaId");
CREATE UNIQUE INDEX "MetaCmvCategoria_parceiroId_id_key" ON "MetaCmvCategoria"("parceiroId", "id");
CREATE UNIQUE INDEX "MetaCmvCategoria_parceiroId_conjuntoId_categoriaId_key" ON "MetaCmvCategoria"("parceiroId", "conjuntoId", "categoriaId");

-- ------------------------------------------------------------ chaves estrangeiras (todas compostas com o parceiro)
ALTER TABLE "ContagemRetratoItem" ADD CONSTRAINT "ContagemRetratoItem_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContagemRetratoItem" ADD CONSTRAINT "ContagemRetratoItem_parceiroId_contagemId_fkey" FOREIGN KEY ("parceiroId", "contagemId") REFERENCES "Contagem"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContagemRetratoItem" ADD CONSTRAINT "ContagemRetratoItem_parceiroId_insumoId_fkey" FOREIGN KEY ("parceiroId", "insumoId") REFERENCES "Insumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContagemRetratoItem" ADD CONSTRAINT "ContagemRetratoItem_parceiroId_categoriaIdNaHora_fkey" FOREIGN KEY ("parceiroId", "categoriaIdNaHora") REFERENCES "CategoriaInsumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoriaNaLoja" ADD CONSTRAINT "CategoriaNaLoja_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoriaNaLoja" ADD CONSTRAINT "CategoriaNaLoja_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoriaNaLoja" ADD CONSTRAINT "CategoriaNaLoja_parceiroId_categoriaId_fkey" FOREIGN KEY ("parceiroId", "categoriaId") REFERENCES "CategoriaInsumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaCmvConjunto" ADD CONSTRAINT "MetaCmvConjunto_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MetaCmvConjunto" ADD CONSTRAINT "MetaCmvConjunto_parceiroId_lojaId_fkey" FOREIGN KEY ("parceiroId", "lojaId") REFERENCES "Loja"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MetaCmvCategoria" ADD CONSTRAINT "MetaCmvCategoria_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "ParceiroFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MetaCmvCategoria" ADD CONSTRAINT "MetaCmvCategoria_parceiroId_conjuntoId_fkey" FOREIGN KEY ("parceiroId", "conjuntoId") REFERENCES "MetaCmvConjunto"("parceiroId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: a categoria que tem meta não se exclui (nem por SQL cru); o servidor confere antes e diz a frase.
ALTER TABLE "MetaCmvCategoria" ADD CONSTRAINT "MetaCmvCategoria_parceiroId_categoriaId_fkey" FOREIGN KEY ("parceiroId", "categoriaId") REFERENCES "CategoriaInsumo"("parceiroId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------ CHECK da contagem (NOT VALID)
-- O retrato por insumo só existe em contagem FECHADA de abertura ou de fechamento.
ALTER TABLE "Contagem" ADD CONSTRAINT "Contagem_retrato_so_na_fechada"
  CHECK ("retratoGravadoEm" IS NULL OR ("status" = 'FECHADA' AND "tipo" IN ('ABERTURA', 'FECHAMENTO'))) NOT VALID;

DO $$
BEGIN
  BEGIN
    ALTER TABLE "Contagem" VALIDATE CONSTRAINT "Contagem_retrato_so_na_fechada";
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'ERP I.2a: o CHECK Contagem_retrato_so_na_fechada ficou NOT VALID (linha antiga em Contagem, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.';
  END;
END $$;

-- ------------------------------------------------------------ gatilhos
-- Dono da linha é imutável (a mesma função de todas as tabelas de tenant).
CREATE TRIGGER "ContagemRetratoItem_parceiro_imutavel" BEFORE UPDATE ON "ContagemRetratoItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "CategoriaNaLoja_parceiro_imutavel" BEFORE UPDATE ON "CategoriaNaLoja"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "MetaCmvConjunto_parceiro_imutavel" BEFORE UPDATE ON "MetaCmvConjunto"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();
CREATE TRIGGER "MetaCmvCategoria_parceiro_imutavel" BEFORE UPDATE ON "MetaCmvCategoria"
  FOR EACH ROW EXECUTE FUNCTION "erp_parceiro_imutavel"();

-- O retrato só se inclui: correção é contagem nova, como no livro-razão e na fotografia.
CREATE OR REPLACE FUNCTION "erp_contagem_retrato_so_inclusao"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '[erp] o retrato do estoque por insumo só se inclui (ContagemRetratoItem_so_inclusao).' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContagemRetratoItem_so_inclusao" BEFORE UPDATE OR DELETE ON "ContagemRetratoItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_contagem_retrato_so_inclusao"();
CREATE TRIGGER "ContagemRetratoItem_sem_truncate" BEFORE TRUNCATE ON "ContagemRetratoItem"
  FOR EACH STATEMENT EXECUTE FUNCTION "erp_contagem_retrato_so_inclusao"();

-- O retrato só entra enquanto a contagem (de abertura ou de fechamento) ainda está ABERTA: nasce na transação que a fecha.
CREATE OR REPLACE FUNCTION "erp_contagem_retrato_da_contagem_aberta"() RETURNS trigger AS $$
DECLARE
  s text;
  t text;
BEGIN
  SELECT c."status"::text, c."tipo"::text INTO s, t FROM "Contagem" c WHERE c."parceiroId" = NEW."parceiroId" AND c."id" = NEW."contagemId";
  IF s IS DISTINCT FROM 'ABERTA' OR t NOT IN ('ABERTURA', 'FECHAMENTO') THEN
    RAISE EXCEPTION '[erp] o retrato por insumo só entra na contagem de abertura ou de fechamento que está sendo concluída (ContagemRetratoItem_da_contagem_aberta).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ContagemRetratoItem_da_contagem_aberta" BEFORE INSERT ON "ContagemRetratoItem"
  FOR EACH ROW EXECUTE FUNCTION "erp_contagem_retrato_da_contagem_aberta"();

-- A contagem só ganha `retratoGravadoEm` com a soma do retrato igual ao valor fotografado, ao centavo (e nunca depois: fechada não muda).
CREATE OR REPLACE FUNCTION "erp_contagem_retrato_confere"() RETURNS trigger AS $$
DECLARE
  soma bigint;
BEGIN
  IF NEW."retratoGravadoEm" IS NOT NULL AND OLD."retratoGravadoEm" IS NULL THEN
    IF NEW."status" <> 'FECHADA' OR NEW."valorTotalCentavos" IS NULL THEN
      RAISE EXCEPTION '[erp] o retrato por insumo só se registra na mesma transação que fecha a contagem, com o valor total (Contagem_retrato_confere).' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(sum(r."valorCentavos"), 0) INTO soma FROM "ContagemRetratoItem" r WHERE r."parceiroId" = NEW."parceiroId" AND r."contagemId" = NEW."id";
    IF soma <> NEW."valorTotalCentavos" THEN
      RAISE EXCEPTION '[erp] a soma do retrato por insumo (% centavos) não é o valor total da contagem (% centavos) (Contagem_retrato_confere).', soma, NEW."valorTotalCentavos" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contagem_retrato_confere" BEFORE UPDATE ON "Contagem"
  FOR EACH ROW EXECUTE FUNCTION "erp_contagem_retrato_confere"();

-- O conjunto de metas: o grão (escopo, vigência) não muda e só o conjunto MAIS NOVO do escopo se altera; o passado não é reescrito.
-- Conjunto não se apaga: para mudar, grava-se outro (ou se atualiza o do período em curso, que é o mais novo).
CREATE OR REPLACE FUNCTION "erp_meta_cmv_conjunto_so_o_mais_novo"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '[erp] o conjunto de metas por categoria não se apaga: grave um novo (MetaCmvConjunto_so_o_mais_novo).' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."lojaId" IS DISTINCT FROM OLD."lojaId" OR NEW."vigenteDesde" <> OLD."vigenteDesde" THEN
    RAISE EXCEPTION '[erp] o conjunto de metas não muda de loja nem de vigência (MetaCmvConjunto_so_o_mais_novo).' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "MetaCmvConjunto" c
    WHERE c."parceiroId" = OLD."parceiroId" AND c."lojaId" IS NOT DISTINCT FROM OLD."lojaId" AND c."vigenteDesde" > OLD."vigenteDesde"
  ) THEN
    RAISE EXCEPTION '[erp] só o conjunto de metas mais novo do escopo se altera; o de uma vigência passada não muda (MetaCmvConjunto_so_o_mais_novo).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MetaCmvConjunto_so_o_mais_novo" BEFORE UPDATE OR DELETE ON "MetaCmvConjunto"
  FOR EACH ROW EXECUTE FUNCTION "erp_meta_cmv_conjunto_so_o_mais_novo"();

-- A meta de uma categoria: só no conjunto mais novo do escopo, só no que não "segue a rede", e a categoria/conjunto não trocam.
CREATE OR REPLACE FUNCTION "erp_meta_cmv_categoria_do_conjunto_novo"() RETURNS trigger AS $$
DECLARE
  alvo text := CASE WHEN TG_OP = 'DELETE' THEN OLD."conjuntoId" ELSE NEW."conjuntoId" END;
  dono text := CASE WHEN TG_OP = 'DELETE' THEN OLD."parceiroId" ELSE NEW."parceiroId" END;
  c record;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."conjuntoId" <> OLD."conjuntoId" OR NEW."categoriaId" <> OLD."categoriaId") THEN
    RAISE EXCEPTION '[erp] a meta não troca de conjunto nem de categoria (MetaCmvCategoria_do_conjunto_novo).' USING ERRCODE = 'check_violation';
  END IF;
  SELECT k."lojaId", k."vigenteDesde", k."segueARede" INTO c FROM "MetaCmvConjunto" k WHERE k."parceiroId" = dono AND k."id" = alvo;
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "MetaCmvConjunto" k
    WHERE k."parceiroId" = dono AND k."lojaId" IS NOT DISTINCT FROM c."lojaId" AND k."vigenteDesde" > c."vigenteDesde"
  ) THEN
    RAISE EXCEPTION '[erp] só as metas do conjunto mais novo do escopo se alteram; o de uma vigência passada não muda (MetaCmvCategoria_do_conjunto_novo).' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP <> 'DELETE' AND c."segueARede" THEN
    RAISE EXCEPTION '[erp] a loja que segue a rede não tem meta própria por categoria (MetaCmvCategoria_do_conjunto_novo).' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MetaCmvCategoria_do_conjunto_novo" BEFORE INSERT OR UPDATE OR DELETE ON "MetaCmvCategoria"
  FOR EACH ROW EXECUTE FUNCTION "erp_meta_cmv_categoria_do_conjunto_novo"();

-- ------------------------------------------------------------ RLS
-- O mesmo padrão condicional da 0.2, da 2.2a, da 2.2b e da I.1a (só se quem roda pode instalar por inteiro). Se as tabelas antigas
-- JÁ têm RLS e uma destas não puder ser instalada, a migration falha com a frase: tabela sem GRANT para o papel quebraria o ERP em
-- tempo de execução, e é melhor o deploy parar do que o ERP.
--
-- Grants mínimos: o retrato só INSERE e LÊ (nada de UPDATE/DELETE); o conjunto de metas não se apaga; a meta por categoria e o uso
-- por loja leem, incluem, mudam e apagam (os gatilhos e as FKs acima protegem o resto).
DO $$
DECLARE
  tabela text;
  permissoes text;
  ja_tem_rls boolean;
  eu record;
  dono boolean;
  pode_assumir boolean;
BEGIN
  SELECT coalesce(relrowsecurity, false) INTO ja_tem_rls FROM pg_class WHERE oid = to_regclass('"Loja"');
  SELECT rolsuper, rolcreaterole INTO eu FROM pg_roles WHERE rolname = current_user;

  FOREACH tabela IN ARRAY ARRAY['ContagemRetratoItem', 'CategoriaNaLoja', 'MetaCmvConjunto', 'MetaCmvCategoria'] LOOP
    permissoes := CASE tabela
      WHEN 'ContagemRetratoItem' THEN 'SELECT, INSERT'
      WHEN 'MetaCmvConjunto' THEN 'SELECT, INSERT, UPDATE'
      ELSE 'SELECT, INSERT, UPDATE, DELETE' END;

    dono := pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass(format('%I', tabela))), 'USAGE');
    IF NOT coalesce(dono, false) THEN
      IF ja_tem_rls THEN RAISE EXCEPTION 'ERP I.2a: % não é dono de "%": a RLS não pode ser instalada nela.', current_user, tabela; END IF;
      RAISE NOTICE 'ERP RLS NÃO instalada em %: % não é dono. O portão segue isolando sem o papel erp_tenant.', tabela, current_user;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
      IF NOT (eu.rolsuper OR eu.rolcreaterole) THEN
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP I.2a: o papel erp_tenant não existe e % não pode criá-lo.', current_user; END IF;
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
        IF ja_tem_rls THEN RAISE EXCEPTION 'ERP I.2a: % não consegue assumir o papel erp_tenant.', current_user; END IF;
        RAISE NOTICE 'ERP RLS NÃO instalada em %: % não consegue assumir o papel erp_tenant.', tabela, current_user;
        CONTINUE;
      END;
    END IF;

    EXECUTE format('GRANT USAGE ON SCHEMA %I TO erp_tenant', current_schema());
    EXECUTE format('GRANT %s ON %I TO erp_tenant', permissoes, tabela);
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
