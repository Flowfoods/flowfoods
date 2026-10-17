-- ERP 2.1 — Entrada de faturamento por canal (manual + planilha; integração
-- desenhada). Decisão 129.
--
-- ADITIVA. "FaturamentoLancamento" existe desde a 0.1 (portão, RLS, GRANT,
-- FK composta com parceiro e trigger de parceiro imutável): nenhuma tabela
-- nova, então nada muda no portão nem na RLS. Roda igual com o usuário
-- superusuário (produção hoje) ou com o dono não-superusuário (com ou sem a
-- RLS instalada).
--
-- ROBUSTA a linha antiga. Antes da 2.1 nada gravava faturamento, mas esta
-- migration não pode depender disso: cada CHECK novo entra NOT VALID (vale
-- para toda escrita daqui para a frente, sem reprovar a migration por uma
-- linha gravada por fora) e logo em seguida tentamos VALIDATE. Se alguma linha
-- antiga violar, a migration NÃO falha: avisa (WARNING, com o nome do CHECK) e
-- o CHECK segue NOT VALID até alguém corrigir a linha e rodar
--   ALTER TABLE "FaturamentoLancamento" VALIDATE CONSTRAINT "<nome>";
-- (convalidated = false em pg_constraint mostra quais ficaram). Mesma ideia
-- para o índice único do grão humano: com duplicidade antiga ele não é criado
-- (WARNING) e a chave determinística + a trava da regra seguem garantindo as
-- gravações novas.

-- ------------------------------------------------------------ colunas novas
-- Quem lançou ou corrigiu por último (nome na hora, como o histórico).
ALTER TABLE "FaturamentoLancamento" ADD COLUMN "atualizadoPorNome" TEXT NOT NULL DEFAULT '';

-- Em quais canais a loja vende (unidade só delivery desliga a LOJA). As lojas
-- que já existem vendem nos três, como antes.
ALTER TABLE "Loja" ADD COLUMN "canaisDeVenda" "CanalVenda"[] DEFAULT ARRAY['LOJA', 'DELIVERY_PROPRIO', 'IFOOD']::"CanalVenda"[];

-- ------------------------------------------------------------ CHECKs (NOT VALID)
-- Teto por canal/dia: R$ 1 milhão e 100 mil pedidos/clientes. Acima disso é dedo
-- errado; a regra recusa antes com frase, o banco é o cinto.
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_valor_teto"
  CHECK ("valorCentavos" <= 100000000) NOT VALID;
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_pedidos_teto"
  CHECK ("pedidos" <= 100000) NOT VALID;
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_clientes_teto"
  CHECK ("clientes" <= 100000) NOT VALID;
-- Venda sem pedido não existe (o ticket médio dividiria por zero).
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_valor_tem_pedido"
  CHECK ("valorCentavos" = 0 OR "pedidos" > 0) NOT VALID;
-- A casa não vende antes de 2020 neste ERP.
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_data_minima"
  CHECK ("data" >= DATE '2020-01-01') NOT VALID;
-- Dois espaços de chave que não se misturam: o humano (MANUAL ou IMPORTACAO)
-- só usa "manual:..."; a integração usa "<fonte>:<tipo>:<idExterno>".
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_chave_do_espaco"
  CHECK (("origem" IN ('MANUAL', 'IMPORTACAO')) = ("chaveIdempotencia" LIKE 'manual:%')) NOT VALID;
-- Integração diz de onde veio (o id externo): sem ele não há como reconciliar.
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_integracao_tem_ref"
  CHECK ("origem" <> 'INTEGRACAO' OR "origemRef" IS NOT NULL) NOT VALID;
ALTER TABLE "FaturamentoLancamento" ADD CONSTRAINT "FaturamentoLancamento_textos_curtos"
  CHECK (length("chaveIdempotencia") <= 200 AND ("origemRef" IS NULL OR length("origemRef") <= 200) AND length("atualizadoPorNome") <= 120) NOT VALID;

-- Loja vende em pelo menos um canal.
ALTER TABLE "Loja" ADD CONSTRAINT "Loja_canais_ao_menos_um"
  CHECK ("canaisDeVenda" IS NOT NULL AND cardinality("canaisDeVenda") >= 1) NOT VALID;

-- ------------------------------------------------------------ validar o que já existe
-- VALIDATE só LÊ a tabela (trava SHARE UPDATE EXCLUSIVE). Linha antiga que
-- violar não reprova a migration: o CHECK fica NOT VALID e o aviso diz qual.
DO $$
DECLARE
  alvo text[];
BEGIN
  FOREACH alvo SLICE 1 IN ARRAY ARRAY[
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_valor_teto'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_pedidos_teto'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_clientes_teto'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_valor_tem_pedido'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_data_minima'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_chave_do_espaco'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_integracao_tem_ref'],
    ARRAY['FaturamentoLancamento', 'FaturamentoLancamento_textos_curtos'],
    ARRAY['Loja', 'Loja_canais_ao_menos_um']
  ] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', alvo[1], alvo[2]);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'ERP 2.1: o CHECK % ficou NOT VALID (linha antiga em %, corrija e rode VALIDATE CONSTRAINT); vale para toda escrita nova.', alvo[2], alvo[1];
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------ um grão humano por vez
-- Cinto além da chave: loja × canal × dia tem UMA linha humana (MANUAL ou
-- IMPORTACAO), mesmo se alguém gravar uma chave diferente por fora. Índice
-- parcial: o Prisma não descreve WHERE em índice (migration futura que mexa
-- nele reescreve à mão), como "NotaEntrada_chave_da_nota". A linha de integração
-- fica de fora de propósito: vários pedidos no mesmo grão.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "FaturamentoLancamento"
    WHERE "origem" IN ('MANUAL', 'IMPORTACAO')
    GROUP BY "parceiroId", "lojaId", COALESCE("marcaId", '-'), "canal", "data"
    HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'ERP 2.1: o índice "FaturamentoLancamento_grao_humano" NÃO foi criado: há mais de uma linha humana no mesmo loja × canal × dia. Corrija as duplicadas e crie o índice (ver a migration).';
  ELSE
    CREATE UNIQUE INDEX "FaturamentoLancamento_grao_humano"
      ON "FaturamentoLancamento"("parceiroId", "lojaId", COALESCE("marcaId", '-'), "canal", "data")
      WHERE "origem" IN ('MANUAL', 'IMPORTACAO');
  END IF;
END $$;
