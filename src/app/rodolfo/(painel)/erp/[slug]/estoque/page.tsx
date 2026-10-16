/**
 * ERP, Estoque por loja de um Parceiro Flow, pelo nível 1 (1.6). A MESMA
 * tela da pessoa do parceiro; tudo passa pelo cliente de `exigirParceiro`
 * (portão + RLS). O nível 1 alcança todas as lojas; a visão do topo filtra.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaSituacaoDoEstoque } from '@/components/erp/telas/estoque/situacao';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoIniciarAbertura } from './actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroEstoquePage({ params, searchParams }: { params: { slug: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'estoque.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const todas = await situacaoDoEstoque(ctx.cliente, ctx.alcance);
  const lojas = visao.tipo === 'loja' ? todas.filter((l) => l.id === visao.lojaId) : todas;
  return (
    <TelaSituacaoDoEstoque
      lojas={lojas}
      base={`/rodolfo/erp/${ctx.parceiro.slug}/estoque`}
      contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`}
      feito={fraseDoEstoque(searchParams.feito)}
      abrir={(lojaId) => acaoIniciarAbertura.bind(null, ctx.parceiro.slug, lojaId)}
      podeAbrir={() => true}
      podeContar={() => true}
      bloqueio={ctx.bloqueio}
    />
  );
}
