/**
 * O aviso de período fechado (2.2b): UM só para faturamento, despesa, nota, estoque e o que mais recusar
 * por período fechado. Diz o que não dá, a saída ("peça à FlowFoods para reabrir"), a alternativa de quem
 * está lançando e leva a Períodos. Aparece ANTES de a pessoa preencher quando a tela já sabe, e de novo se
 * o servidor recusar (o servidor é quem decide; a tela só adianta).
 */

import Link from 'next/link';
import { saidaDoPeriodoFechado } from '@/lib/erp/periodo-fechado-campos';
import { LINK_DE_TEXTO } from './estilos';

export function AvisoDoPeriodoFechado({
  periodo,
  href,
  alternativa,
  frase,
  id,
  dentro = false,
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
}) {
  return (
    <div id={id} role="status" className={`flex items-start gap-3 text-sm ${dentro ? '' : 'rounded-[14px] border border-linha bg-painel px-4 py-3 sm:px-5'}`}>
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
            <Link href={href} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
              Ver os períodos
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
