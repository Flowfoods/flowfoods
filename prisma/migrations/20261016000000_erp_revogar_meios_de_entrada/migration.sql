-- ERP 0.4 (Fiscal QA + Guardião, volta 3) — redefinir a senha pelo link, ou
-- apagar a senha de outro parceiro, revoga TODOS os outros meios de entrar da
-- pessoa (sessões, links pendentes, rostos e desafios de rosto), numa função
-- só: `revogarMeiosDeEntrada` (src/lib/erp/credenciais.ts).
--
-- Só ADITIVA, 3 colunas:
--   - `UsuarioErp.versaoCredencial`: sobe a cada revogação. Login, entrada pelo
--     rosto e ativação de rosto leem a versão antes de conferir a credencial e
--     só gravam se ela não mudou (sob a trava da pessoa): um login em voo
--     durante a limpeza não cria sessão depois dela.
--   - `SessaoErp.versaoCredencial`: a versão em que a sessão nasceu;
--     `validarSessao` recusa sessão de versão velha.
--   - `UsuarioErp.rostosRemovidosEm`: "Seu acesso" avisa que os aparelhos com
--     rosto saíram e podem ser ativados de novo.
-- Sessões e pessoas existentes ficam na versão 0 (continuam valendo). As duas
-- tabelas são credencial (fora do tenant, sem GRANT para `erp_tenant`): nada a
-- fazer no papel. Segura nos dois cenários de produção (ADD COLUMN só exige ser
-- dono das tabelas).

ALTER TABLE "UsuarioErp" ADD COLUMN "rostosRemovidosEm" TIMESTAMP(3);
ALTER TABLE "UsuarioErp" ADD COLUMN "versaoCredencial" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SessaoErp" ADD COLUMN "versaoCredencial" INTEGER NOT NULL DEFAULT 0;
