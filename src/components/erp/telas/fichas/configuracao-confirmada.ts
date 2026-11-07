'use client';

import { useState, useActionState } from 'react';

import type { AcaoConfiguracao, EstadoConfiguracao } from '@/lib/erp/canal-config-campos';
import { useAvisoDeSaida } from '../cadastro/erros';

/** Texto e versão são uma origem indivisível. Revalidação de outro formulário não a substitui. */
export function useConfiguracaoConfirmada(acao: AcaoConfiguracao, versao: string, inicial: Record<string, string>) {
  const [origem, setOrigem] = useState(() => ({ versao, campos: inicial, baseCampos: inicial }));
  const [pendente, setPendente] = useState(false);
  const [estado, enviar] = useActionState<EstadoConfiguracao, FormData>(async (anterior, form) => {
    setPendente(true);
    try {
      const resposta = await acao(anterior, form);
      if (resposta?.ok) {
        const { versao: novaVersao, campos } = resposta.confirmacao;
        setOrigem({ versao: novaVersao, campos, baseCampos: campos });
      }
      return resposta ?? { ok: false, vez: (anterior?.vez ?? 0) + 1, erros: { geral: 'Não foi possível confirmar o salvamento. Tente novamente.' } };
    } catch {
      return { ok: false, vez: (anterior?.vez ?? 0) + 1, erros: { geral: 'Não foi possível confirmar o salvamento. Tente novamente.' } };
    } finally {
      setPendente(false);
    }
  }, null);
  const saida = useAvisoDeSaida(estado);
  return {
    ...origem, estado, enviar, pendente, saida,
    alterado: Object.keys(origem.campos).some(campo => origem.campos[campo] !== origem.baseCampos[campo]),
    erro: estado && !estado.ok ? estado : null,
    mudar: (campo: string, valor: string) => setOrigem(antes => ({ ...antes, campos: { ...antes.campos, [campo]: valor } })),
  };
}
