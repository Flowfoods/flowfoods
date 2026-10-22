'use client';

/**
 * Retorno ao salvar (I.1a), comum aos cadastros do ERP:
 *  - `SalvandoAnunciado`: enquanto o formulário está em voo, uma região viva diz "Salvando…" ao leitor de tela (o botão já
 *    mostra o texto e fica desabilitado; a mudança de texto dentro do botão não costuma ser anunciada);
 *  - `AvisoDeSalvo`: a confirmação na tela de depois ("Insumo salvo com sucesso: Farinha de trigo"). Uma região `role=status`
 *    que já nasce com o texto no HTML não é anunciada por leitor de tela; por isso a região viva nasce VAZIA e é preenchida
 *    depois da montagem. O aviso fica na página (não some sozinho, não cobre botão nenhum), vem para a vista e traz os
 *    caminhos do que fazer em seguida;
 *  - `useAcaoSegura`: a conexão que cai no meio do envio não derruba a tela nem apaga o que foi digitado: volta a frase
 *    dizendo que o resultado é incerto e que pode tentar de novo sem medo de duplicar (o servidor reconhece o reenvio).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { AcaoDeCadastro, EstadoCadastro } from './estado';

export function SalvandoAnunciado({ texto = 'Salvando…' }: { texto?: string }) {
  const { pending } = useFormStatus();
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {pending ? texto : ''}
    </p>
  );
}

export function AvisoDeSalvo({ titulo, apoio, children }: { titulo: string; apoio?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [anunciado, setAnunciado] = useState('');
  useEffect(() => {
    // Depois da montagem: é a mudança do conteúdo da região viva que o leitor de tela anuncia.
    setAnunciado(apoio ? `${titulo}. ${apoio}` : titulo);
    const menosMovimento = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: menosMovimento ? 'auto' : 'smooth', block: 'nearest' });
  }, [titulo, apoio]);
  return (
    <div ref={ref} className="scroll-mt-24 rounded-[14px] border border-linha bg-painel px-4 py-3 text-sm sm:px-5" data-aviso-de-salvo>
      <div className="flex items-start gap-3">
        <span className="flex h-5 shrink-0 items-center">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-texto">{titulo}</p>
          {apoio && <p className="mt-0.5 text-suave">{apoio}</p>}
          {children && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {anunciado}
      </p>
    </div>
  );
}

export const FRASE_SEM_CONEXAO =
  'Não deu para confirmar se o envio chegou (a conexão pode ter caído). O que você digitou continua aqui. Toque em salvar de novo: se já tiver sido salvo, o sistema reconhece e não cria outro.';

/** O redirecionamento do Next é uma exceção de controle: nunca vira mensagem de erro. */
function ehRedirecionamento(e: unknown): boolean {
  return typeof e === 'object' && e !== null && typeof (e as { digest?: unknown }).digest === 'string' && (e as { digest: string }).digest.startsWith('NEXT_REDIRECT');
}

/** A action do formulário com a rede protegida: falha de conexão volta como erro geral, com o formulário intacto. */
export function useAcaoSegura(acao: AcaoDeCadastro): AcaoDeCadastro {
  return useCallback(
    async (anterior: EstadoCadastro, form: FormData) => {
      try {
        return await acao(anterior, form);
      } catch (e) {
        if (ehRedirecionamento(e)) throw e;
        return { ok: false, erros: { geral: FRASE_SEM_CONEXAO }, vez: (anterior?.vez ?? 0) + 1 } satisfies NonNullable<EstadoCadastro>;
      }
    },
    [acao],
  );
}
