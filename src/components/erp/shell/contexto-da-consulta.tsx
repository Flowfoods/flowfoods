'use client';

/**
 * Identidade da consulta, independente do estado dos formulários. Pessoa,
 * parceiro e visão vêm do shell; trocar a loja pelo seletor também avisa
 * depois de a ação autorizar. O contexto só reinicia estados de leitura
 * (históricos e retorno), nunca remonta a página ou concede permissões.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const ContextoDaConsulta = createContext({ chave: '', avisarTrocaDeVisao: () => {} });

export function ProvedorDaConsulta({ contexto, children }: { contexto: string; children: ReactNode }) {
  const [ultimaTroca, definirTroca] = useState({ contexto, revisao: 0 });
  const revisao = ultimaTroca.contexto === contexto ? ultimaTroca.revisao : 0;
  const avisarTrocaDeVisao = useCallback(() => {
    definirTroca((anterior) => ({ contexto, revisao: anterior.contexto === contexto ? anterior.revisao + 1 : 1 }));
  }, [contexto]);
  const valor = useMemo(() => ({ chave: JSON.stringify([contexto, revisao]), avisarTrocaDeVisao }), [contexto, revisao, avisarTrocaDeVisao]);
  return <ContextoDaConsulta.Provider value={valor}>{children}</ContextoDaConsulta.Provider>;
}

export function useContextoDaConsulta() {
  return useContext(ContextoDaConsulta);
}
