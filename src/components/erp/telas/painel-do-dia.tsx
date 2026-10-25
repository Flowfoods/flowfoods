/**
 * Início de trabalho (24/10/2026): a faixa de indicadores e "O que precisa de
 * você", acima das áreas. Referência: painéis da Nina (número grande, contexto
 * curto, pendência com ação) e Início do iFood (atalhos por intenção). Só o que
 * a permissão da pessoa libera chega aqui (`painelDoDia`).
 */

import Link from 'next/link';
import type { PainelDoDia } from '@/lib/erp/painel-do-dia';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Barra, Painel } from '../ui/superficies';

export function PainelDoDiaNaTela({ painel }: { painel: PainelDoDia }) {
  if (painel.indicadores.length === 0 && painel.pendencias.length === 0) return null;
  return (
    <section aria-label="Resumo de hoje" className="space-y-4">
      {painel.indicadores.length > 0 && (
        <div className={`grid gap-3 ${painel.indicadores.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {painel.indicadores.map((i) => (
            <Link
              key={i.chave}
              href={i.href}
              className="ff-transicao group flex min-w-0 flex-col rounded-[14px] border border-linha bg-painel px-4 py-3.5 hover:border-linha-forte sm:px-5"
            >
              <span className="text-[12px] font-medium text-suave">{i.rotulo}</span>
              <span className="mt-2 truncate font-display text-[26px] font-bold leading-none tabular-nums text-texto">
                {i.valor.tipo === 'dinheiro' ? (
                  formatarDinheiro(i.valor.centavos)
                ) : i.valor.tipo === 'numero' ? (
                  i.valor.numero === null ? '—' : i.valor.numero.toLocaleString('pt-BR')
                ) : (
                  <>
                    {i.valor.de}
                    <span className="ml-1 font-sans text-[15px] font-medium text-suave">de {i.valor.total}</span>
                  </>
                )}
              </span>
              {i.valor.tipo === 'fracao' && (
                <span className="mt-2.5 block">
                  <Barra valor={i.valor.de} total={i.valor.total} tom={i.valor.de === i.valor.total ? 'ok' : 'alerta'} rotulo={`${i.rotulo}: ${i.valor.de} de ${i.valor.total}`} />
                </span>
              )}
              <span className="mt-1.5 truncate text-[12px] text-suave">{i.contexto}</span>
            </Link>
          ))}
        </div>
      )}
      {painel.pendencias.length > 0 && (
        <Painel titulo="O que precisa de você" subtitulo="Na ordem em que vale resolver" semRespiro>
          <ol className="divide-y divide-linha">
            {painel.pendencias.map((p, n) => (
              <li key={p.chave} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-linha-forte text-[12px] font-semibold text-texto">
                  {n + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-texto">{p.titulo}</p>
                  <p className="text-[13px] leading-relaxed text-suave">{p.texto}</p>
                </div>
                <Link href={p.href} className={`${LINK_DE_TEXTO} inline-flex min-h-11 shrink-0 basis-full items-center pl-9 text-[13px] sm:min-h-9 sm:basis-auto sm:pl-0 sm:pt-0.5`}>
                  {p.acao}
                </Link>
              </li>
            ))}
          </ol>
        </Painel>
      )}
    </section>
  );
}
