/**
 * Janela de módulo (UX-MOD-2, piloto do nível 1): o quadro da janela da área Rede e Equipe, comum às telas que abrem nela
 * (as abas trocam a tela sem refazer o quadro: tamanho, minimizada e pilha do Voltar ficam). O contexto é o mesmo do
 * topo: o parceiro e a rede ou a loja escolhida; a situação do parceiro (suspenso, em implantação) aparece na janela também.
 */

import type { ReactNode } from 'react';
import { exigirParceiro, visaoDaRequisicao } from '@/lib/erp/contexto';
import { areaDaJanela } from '@/lib/erp/janela';
import { rotuloDoEscopo } from '@/lib/erp/visao';
import { AvisoDoParceiro } from '@/components/erp/shell/aviso-do-parceiro';
import { JanelaDeModulo } from '@/components/erp/shell/JanelaDeModulo';

export const dynamic = 'force-dynamic';

export default async function JanelaDaRede(props: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const ctx = await exigirParceiro(slug);
  const { visao } = await visaoDaRequisicao(ctx);
  const contexto = rotuloDoEscopo(visao.tipo === 'loja' ? visao.nome : null, ctx.parceiro.nome);
  const base = `/rodolfo/erp/${ctx.parceiro.slug}`;
  return (
    <JanelaDeModulo
      base={base}
      area={areaDaJanela(base)}
      contexto={contexto}
      aviso={ctx.bloqueio ? <AvisoDoParceiro status={ctx.parceiro.status} bloqueio={ctx.bloqueio} /> : null}
    >
      {props.children}
    </JanelaDeModulo>
  );
}
