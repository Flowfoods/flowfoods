-- ERP I.1b — "Conservação a confirmar": a marca de que uma PESSOA confirmou a conservação do insumo. Decisão 262.
--
-- Até a I.1a o servidor assumia "Seco" quando o formulário não mandava a conservação: um insumo antigo em Seco pode ser
-- Seco de verdade (batata) ou um padrão que ninguém escolheu (coxa de frango). Esta migration NÃO tenta adivinhar nem
-- reinterpretar nada: só cria a coluna que registra quando uma pessoa confirmou. Insumo antigo fica NULO ("ninguém
-- confirmou"); insumo cadastrado daqui em diante já nasce confirmado (a conservação é escolhida, não assumida). A tela
-- lista "conservação a confirmar" = Seco, sem confirmação, em Proteína, Laticínios, frios e embutidos ou Hortifruti.
--
-- ADITIVA: uma coluna anulável, sem DEFAULT, sem CHECK, sem leitura de linha. Nenhum SELECT sob RLS: segura para
-- superusuário e para dono NÃO-superusuário, com ou sem FORCE RLS.

ALTER TABLE "Insumo" ADD COLUMN "conservacaoConfirmadaEm" TIMESTAMP(3);
