-- ERP 1.3 — Subfichas (pré-preparos) com fator de correção, custo em cascata.
--
-- O esquema da 0.1 já tinha tudo: "FichaItem"."subfichaId" (com CHECK de
-- insumo OU subficha, e de não apontar para a própria ficha), o fator de
-- correção em milésimos (CHECK >= 1000) e "FichaTecnica"."insumoProduzidoId".
-- Esta migration só ACRESCENTA o teto do fator: 10 (10000 milésimos). Acima
-- disso é erro de digitação (o fator é peso bruto ÷ peso limpo), e o teto
-- deixa a conta da cascata com tamanho conhecido. Nenhum dado existente passa
-- do teto (até a 1.3 todo item nasceu com 1000).
--
-- Só ADITIVA, sem tabela nova: portão, RLS, GRANT e trigger da tabela
-- continuam valendo. Roda igual com o usuário superusuário (produção hoje) ou
-- com o dono não-superusuário (quem roda a migration é o dono da tabela).
--
-- Círculo entre pré-preparos e a profundidade (até 5 fichas numa cadeia) são
-- regra do servidor, conferidos sob `pg_advisory_xact_lock` por parceiro
-- (docs/DECISOES.md, 58): um CHECK não enxerga outras linhas.

ALTER TABLE "FichaItem" ADD CONSTRAINT "FichaItem_fatorCorrecao_maximo"
  CHECK ("fatorCorrecaoMilesimos" <= 10000);
