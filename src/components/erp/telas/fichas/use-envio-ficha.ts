'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { MENSAGEM_ENVIO_INDETERMINADO, type AcaoFichaUnificada, type EstadoFichaUnificada } from '@/lib/erp/ficha-unificada-campos';

/** Só uma confirmação da tentativa ainda montada pode limpar o rascunho e navegar. */
export function useEnvioFicha(acao: AcaoFichaUnificada, antes: () => void, aoConfirmar: (r: Extract<EstadoFichaUnificada, { ok: true }>) => void) {
  const [pendente, setPendente] = useState(false);
  const tentativa = useRef(0), montado = useRef(true);
  useEffect(() => {
    const contador = tentativa;
    montado.current = true;
    return () => { montado.current = false; contador.current++; };
  }, []);
  const [estado, enviar] = useFormState<EstadoFichaUnificada, FormData>(async (anterior, form) => {
    const pedido = ++tentativa.current;
    antes();
    setPendente(true);
    try {
      const resposta = await acao(anterior, form);
      if (!montado.current || pedido !== tentativa.current) return anterior;
      if (resposta?.ok) aoConfirmar(resposta);
      return resposta;
    } catch {
      if (!montado.current || pedido !== tentativa.current) return anterior;
      return { ok: false, vez: (anterior?.vez ?? 0) + 1, indeterminado: true, erros: { geral: MENSAGEM_ENVIO_INDETERMINADO } };
    } finally {
      if (montado.current && pedido === tentativa.current) setPendente(false);
    }
  }, null);
  return { estado, enviar, pendente };
}
