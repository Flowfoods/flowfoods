/**
 * Janela de módulo (UX-MOD-2, piloto do nível 1): o quadro da janela da área Rede e Equipe, comum às telas que abrem nela
 * (as abas trocam a tela sem refazer o quadro: tamanho, minimizada e rascunho do quadro ficam). O contexto é o mesmo do
 * topo: o parceiro e a rede ou a loja escolhida.
 */

import type { ReactNode } from 'react';
import { exigirParceiro, visaoDaRequisicao } from '@/lib/erp/contexto';
import { areaDaJanela } from '@/lib/erp/janela';
import { rotuloDoEscopo } from '@/lib/erp/visao';
import { JanelaDeModulo } from '@/components/erp/shell/JanelaDeModulo';

export const dynamic = 'force-dynamic';

export default async function JanelaDaRede(props: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  const { visao } = await visaoDaRequisicao(ctx);
  const contexto = rotuloDoEscopo(visao.tipo === 'loja' ? visao.nome : null, ctx.parceiro.nome);
  return (
    <JanelaDeModulo area={areaDaJanela(`/rodolfo/erp/${ctx.parceiro.slug}`)} contexto={contexto}>
      {props.children}
    </JanelaDeModulo>
  );
}
