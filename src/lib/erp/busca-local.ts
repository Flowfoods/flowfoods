/**
 * Busca ⌘K do shell: o que ela encontra sem ir ao servidor — as telas e as ações do menu de quem busca e, no nível 1, os
 * parceiros. Puro, testável.
 *
 * Os nomes curtos e sinônimos (`termos` das áreas e abas, plano de módulos de 11/11/2026: "Financeiro" para Faturamento e
 * DRE, "Gestão" e "Configurações" para Rede e Equipe, "iFood" e "Integração" para Integrações, "Analytics" para o hub) só
 * ajudam a ACHAR: não aparecem na lista nem criam destino. Os resultados saem do menu da pessoa, então quem não vê a tela
 * no menu não a acha pela busca, e módulo sem tela ("Em breve") não vira resultado.
 */

import { acoesDaNavegacao, telasDaNavegacao, type Navegacao } from './modulos';

export interface LocalDaBusca {
  tipo: 'tela' | 'acao' | 'parceiro';
  rotulo: string;
  detalhe: string;
  href: string;
  /** Nomes curtos e sinônimos, só para achar (não aparecem). */
  termos?: string;
}

/** Sem acento e em minúsculas: "Gestão" acha "gestao", "Integração" acha "integracao". */
export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const juntar = (termos: readonly string[] | undefined) => (termos?.length ? { termos: termos.join(' · ') } : {});

/** As telas (com o hub), as ações e os parceiros que a busca conhece, na ordem do menu. */
export function locaisDaNavegacao(
  nav: Navegacao,
  parceiros: readonly { slug: string; nome: string; rotuloStatus: string }[] | null,
): LocalDaBusca[] {
  const telas: LocalDaBusca[] = [
    { tipo: 'tela', rotulo: nav.inicio.titulo, detalhe: 'Início', href: nav.inicio.href, ...juntar(nav.inicio.termos) },
    ...telasDaNavegacao(nav).map((t) => ({
      tipo: 'tela' as const,
      rotulo: t.rotulo,
      detalhe: `${t.modulo} · ${t.subtitulo}`,
      href: t.href,
      ...juntar(t.termos),
    })),
    // Ações das áreas que a pessoa vê E pode fazer (o filtro é de `modulosDoParceiro`; aqui só se lista).
    ...acoesDaNavegacao(nav).map((a) => ({
      tipo: 'acao' as const,
      rotulo: a.rotulo,
      detalhe: `${a.modulo} · ${a.subtitulo}`,
      href: a.href,
      ...juntar(a.termos),
    })),
  ];
  const dosParceiros: LocalDaBusca[] = (parceiros ?? []).map((p) => ({
    tipo: 'parceiro',
    rotulo: p.nome,
    detalhe: p.rotuloStatus,
    href: `/rodolfo/erp/${p.slug}`,
  }));
  return [...telas, ...dosParceiros];
}

/** O que responde ao termo (no nome, no detalhe ou num nome curto/sinônimo), na ordem do menu; sem termo, só as telas. */
export function filtrarLocais<T extends { tipo: string; rotulo: string; detalhe: string; termos?: string }>(locais: readonly T[], q: string): T[] {
  const termo = normalizarBusca(q.trim());
  if (!termo) return locais.filter((r) => r.tipo === 'tela');
  return locais.filter((r) => normalizarBusca(`${r.rotulo} ${r.detalhe} ${r.termos ?? ''}`).includes(termo));
}
