DO $$ BEGIN EXECUTE format('SET search_path = %I, pg_temp', current_schema()); END $$;

-- A fotografia de Situação é READ ONLY. Expõe um booleano, nunca os campos globais do app, controle ou posse.
-- O POST repete este predicado depois das travas de cobertura, acesso e loja e ainda exige a mesma geração/estado no UPDATE.
CREATE FUNCTION erp_integracao_pode_reler_dia(p_parceiro text, p_loja text, p_execucao text, p_geracao integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS $$
  SELECT EXISTS (
    SELECT 1 FROM "IntegracaoExecucao" e
    JOIN "IntegracaoConexaoModulo" m ON m."parceiroId" = e."parceiroId" AND m.id = e."moduloId"
    JOIN "IntegracaoConexao" c ON c."parceiroId" = m."parceiroId" AND c.id = m."conexaoId"
    JOIN "Loja" l ON l."parceiroId" = c."parceiroId" AND l.id = c."lojaId"
    JOIN "ParceiroFlow" p ON p.id = e."parceiroId"
    JOIN "LiberacaoDeModulo" lib ON lib."parceiroId" = p.id AND lib.modulo = 'integracao'
    JOIN "IntegracaoApp" app ON app.id = m."appId"
    JOIN "IntegracaoControle" ctl ON ctl.id = 'IFOOD_ANALYTICS'
    WHERE p_parceiro = NULLIF(current_setting('app.parceiro_id', true), '')
      AND e."parceiroId" = p_parceiro AND e.id = p_execucao AND e.geracao = p_geracao AND e.geracao > 0
      AND c."lojaId" = p_loja AND l.ativa AND p.status = 'ATIVO' AND NOT p."homologacaoDeIntegracao" AND lib.liberado
      AND c.provedor = 'IFOOD' AND c.ambiente = 'PRODUCAO' AND c.estado = 'ATIVA'
      AND m.modulo = 'ANALYTICS' AND m.estado = 'ATIVO'
      AND app.provedor = c.provedor AND app.ambiente = c.ambiente AND 'ANALYTICS' = ANY(app.modulos)
      AND app."estadoHomologacao" = 'HOMOLOGADO' AND NOT ctl.pausada
      AND (ctl."bloqueadaAte" IS NULL OR ctl."bloqueadaAte" <= statement_timestamp())
      AND e.perfil = 'diario' AND e.fuso = 'America/Sao_Paulo' AND e.unidade IN ('REAL', 'CENTAVO')
      AND e.dia < (statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date AND e."naoAntesDe" <= statement_timestamp()
      AND e."ultimoErro" IS DISTINCT FROM 'prazo-invalido'
      AND (e.estado IN ('SUCESSO', 'FALHA', 'PENDENTE_PERIODO') OR
        (e.estado = 'EXECUTANDO' AND e."leaseAte" <= statement_timestamp() AND
          (ctl."donoAtual" IS DISTINCT FROM e.dono OR NOT erp_integracao_posse_viva(e.dono))))
      AND NOT EXISTS (SELECT 1 FROM "IntegracaoConexao" outra WHERE outra."parceiroId" = p_parceiro
        AND outra.provedor = c.provedor AND outra.ambiente = c.ambiente AND outra."idExterno" = c."idExterno" AND outra.id <> c.id)
  );
$$;

REVOKE ALL ON FUNCTION erp_integracao_pode_reler_dia(text,text,text,integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_tenant') THEN
    GRANT EXECUTE ON FUNCTION erp_integracao_pode_reler_dia(text,text,text,integer) TO erp_tenant;
  END IF;
END $$;
RESET search_path;
