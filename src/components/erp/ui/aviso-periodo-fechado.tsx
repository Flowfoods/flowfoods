'use client';

/**
 * O aviso de período fechado (2.2b): UM só para faturamento, despesa, nota, estoque e o que mais recusar
 * por período fechado. Diz o que não dá, a saída ("peça à FlowFoods para reabrir"), a alternativa de quem
 * está lançando e leva a Períodos. Aparece ANTES de a pessoa preencher quando a tela já sabe, e de novo se
 * o servidor recusar (o servidor é quem decide; a tela só adianta).
 */

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { saidaDoPeriodoFechado } from '@/lib/erp/periodo-fechado-campos';
import { LINK_DE_TEXTO } from './estilos';

/** Espaço entre o pé do aviso e o topo da barra fixa de salvar. */
const FOLGA_SOBRE_A_BARRA = 16;

export function AvisoDoPeriodoFechado({
  periodo,
  href,
  alternativa,
  frase,
  id,
  dentro = false,
  rolar = false,
}: {
  periodo: string;
  /** A tela Períodos; null quando a pessoa não abre essa tela (o aviso fica sem o link). */
  href: string | null;
  /** O que fazer sem reabrir, na voz de quem lança: "Se a compra entrou agora, lance com a data de hoje." */
  alternativa?: string;
  /** Troca a frase "não dá para lançar, corrigir nem remover nele" (dia só para consulta, despesa já lançada…). */
  frase?: string;
  id?: string;
  /** Dentro de um painel: sem moldura própria. */
  dentro?: boolean;
  /** O aviso nasceu agora (a pessoa digitou a data, ou o servidor recusou): traz ele para a vista, acima da barra fixa de salvar. */
  rolar?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rolar) return;
    // A barra fixa de salvar (`data-barra-fixa`, em toda tela que tem uma) cobre o pé da tela e a altura dela varia (121 px no
    // celular da despesa): em vez de uma margem chumbada, mede a barra de verdade e rola até o aviso, com o link, ficar acima dela.
    // Duas passadas: depois do layout e depois de o que muda por baixo (fonte, texto de apoio) assentar.
    const ajustar = () => {
      const el = caixa.current;
      if (!el) return;
      const barras = Array.from(document.querySelectorAll('[data-barra-fixa]'))
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.top < window.innerHeight);
      const limite = barras.length ? Math.min(...barras.map((r) => r.top)) : window.innerHeight;
      const sobra = el.getBoundingClientRect().bottom - (limite - FOLGA_SOBRE_A_BARRA);
      if (sobra > 0) window.scrollBy({ top: sobra, behavior: 'auto' });
    };
    const quadro = requestAnimationFrame(ajustar);
    const depois = setTimeout(ajustar, 250);
    return () => {
      cancelAnimationFrame(quadro);
      clearTimeout(depois);
    };
  }, [rolar]);
  return (
    <div ref={caixa} id={id} role="status" data-aviso-periodo-fechado className={`flex items-start gap-3 text-sm ${dentro ? '' : 'rounded-[14px] border border-linha bg-painel px-4 py-3 sm:px-5'}`}>
      <span className="flex h-5 shrink-0 items-center">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-atencao" />
      </span>
      <div className="min-w-0 space-y-1 text-suave">
        <p>
          <span className="font-semibold text-texto">O período {periodo} já foi fechado no DRE.</span> {frase ?? 'Não dá para lançar, corrigir nem remover nele.'}
        </p>
        <p>
          {saidaDoPeriodoFechado(periodo)}
          {alternativa ? ` ${alternativa}` : ''}
        </p>
        {href && (
          <p>
            <Link href={href} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}>
              Ver os períodos
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
