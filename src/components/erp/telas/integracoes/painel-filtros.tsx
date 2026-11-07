'use client';

import Link from 'next/link';
import { useState } from 'react';
import { deslocarDiaDoPainel, type FiltrosDoPainelAnalytics, type FonteDoPainelAnalytics } from '@/lib/integracoes/ifood/painel-campos';
import { Campo, CAMPO, MARCAR } from '@/components/erp/ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';

/** URL completa do recorte. Atalhos mudam só o período, sem perder a seleção de fontes. */
export function hrefDoPainelAnalytics(base: string, filtros: FiltrosDoPainelAnalytics, mudar: Partial<FiltrosDoPainelAnalytics> = {}): string {
  const f = { ...filtros, ...mudar }, q = new URLSearchParams();
  if (f.lojaId) q.set('loja', f.lojaId);
  q.set('inicio', f.inicio); q.set('fim', f.fim);
  for (const merchant of f.merchants) q.append('merchant', merchant);
  return `${base}?${q.toString()}`;
}

export interface PropsFiltrosPainelAnalytics {
  base: string;
  filtros: FiltrosDoPainelAnalytics;
  lojas: { id: string; nome: string }[];
  fontes: FonteDoPainelAnalytics[];
  ontem: string;
}

/** A key inclui o recorte efetivo: Link/back/forward não conserva campos antigos. */
export function FiltrosPainelAnalytics(props: PropsFiltrosPainelAnalytics) {
  return <Formulario key={hrefDoPainelAnalytics(props.base, props.filtros)} {...props} />;
}

function Formulario({ base, filtros, lojas, fontes, ontem }: PropsFiltrosPainelAnalytics) {
  const [loja, setLoja] = useState(filtros.lojaId);
  const [marcadas, setMarcadas] = useState(filtros.merchants);
  const mudouLoja = loja !== filtros.lojaId;
  const atalhos = [
    { nome: 'Últimos 7 dias', inicio: deslocarDiaDoPainel(ontem, -6), fim: ontem },
    { nome: 'Últimos 30 dias', inicio: deslocarDiaDoPainel(ontem, -29), fim: ontem },
    { nome: 'Mês até ontem', inicio: `${ontem.slice(0, 7)}-01`, fim: ontem },
  ];
  return <form action={base} method="get" aria-label="Filtros do painel iFood" className="min-w-0 space-y-4">
    <div className="grid min-w-0 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Campo id="analytics-loja" rotulo="Loja">
        <select id="analytics-loja" name="loja" value={loja} required className={CAMPO} onChange={e => { setLoja(e.target.value); setMarcadas([]); }}>
          <option value="" disabled>Escolha uma loja</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </Campo>
      <Campo id="analytics-inicio" rotulo="De">
        <input id="analytics-inicio" name="inicio" type="date" required max={ontem} defaultValue={filtros.inicio} className={CAMPO} />
      </Campo>
      <Campo id="analytics-fim" rotulo="Até">
        <input id="analytics-fim" name="fim" type="date" required max={ontem} defaultValue={filtros.fim} className={CAMPO} />
      </Campo>
      <button type="submit" className={classeDeBotao('secundario')}>Consultar painel</button>
    </div>
    <details className="min-w-0 rounded-[7px] border border-linha-forte">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 text-[13px] font-medium text-texto">Fontes da loja · {mudouLoja ? 'consulte a nova loja' : marcadas.length ? `${marcadas.length} selecionadas` : 'todas'}</summary>
      <fieldset disabled={mudouLoja} className="min-w-0 space-y-2 border-t border-linha px-3 py-3">
        <legend className="sr-only">Fontes da loja selecionada</legend>
        <p id="analytics-fontes-ajuda" className="text-[12px] text-suave">{mudouLoja ? 'Consulte a outra loja para escolher as fontes dela. A seleção anterior foi retirada.' : 'Sem marcação, entram todas as fontes desta loja, inclusive vínculos desligados com histórico.'}</p>
        {fontes.length > 0 ? <ul className="max-h-64 space-y-1 overflow-y-auto">
          {fontes.map(f => <li key={f.chave}><label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[5px] py-2 text-sm hover:bg-texto/5">
            <input type="checkbox" name="merchant" value={f.chave} checked={marcadas.includes(f.chave)} aria-describedby="analytics-fontes-ajuda" className={`${MARCAR} mt-0.5 shrink-0`} onChange={e => setMarcadas(atual => e.target.checked ? [...atual, f.chave] : atual.filter(id => id !== f.chave))} />
            <span className="min-w-0 break-words">{f.nome}{f.marca && <span className="text-suave"> · {f.marca}</span>}{!f.ativa && <span className="text-suave"> · vínculo desligado</span>}{f.ambigua && <span className="text-suave"> · vínculo a conferir</span>}</span>
          </label></li>)}
        </ul> : <p className="text-[13px] text-suave">Nenhuma fonte disponível nesta seleção.</p>}
      </fieldset>
    </details>
    <nav aria-label="Atalhos de período do Analytics" className="flex flex-wrap gap-x-4 gap-y-1">
      {atalhos.map(a => <Link key={a.nome} href={hrefDoPainelAnalytics(base, filtros, { lojaId: loja, merchants: marcadas, inicio: a.inicio, fim: a.fim })} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center`} aria-current={filtros.inicio === a.inicio && filtros.fim === a.fim ? 'date' : undefined}>{a.nome}</Link>)}
    </nav>
  </form>;
}
