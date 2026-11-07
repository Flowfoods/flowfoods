-- INT-1.7A: Analytics não informa clientes atendidos (decisão 8 do plano).
-- NULL é ausência, não zero ou quantidade de pedidos. Digitação e importação
-- continuam numéricas; valores existentes, limites, índices, FK e RLS não mudam.
--
-- Um único ALTER troca a restrição atomicamente. O novo CHECK já pode ser
-- validado: antes deste comando a coluna é NOT NULL em todas as linhas.
-- Não depende de SELECT sob RLS nem preenche/reescreve qualquer dado antigo.
ALTER TABLE "FaturamentoLancamento"
  ALTER COLUMN "clientes" DROP NOT NULL,
  ADD CONSTRAINT "FaturamentoLancamento_clientes_humanos"
    CHECK ("origem" = 'INTEGRACAO' OR "clientes" IS NOT NULL);
