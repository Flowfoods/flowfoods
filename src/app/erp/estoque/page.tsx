/**
 * ERP do parceiro — Estoque por loja (1.6). A MESMA tela do nível 1, com o
 * cliente do portão resolvido pela SESSÃO. Ver exige "ver o estoque"; só as
 * lojas do alcance em que a pessoa vê estoque (e, com uma loja escolhida no
 * topo, só ela — a visão filtra, nunca concede). "Abrir estoque" só com
 * "ajustar saldo" naquela loja (a action confere de novo).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { situacaoDoEstoque } from '@/lib/erp/estoque';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaSituacaoDoEstoque } from '@/components/erp/telas/estoque/situacao';
import { fraseDoEstoque } from '@/components/erp/telas/estoque/estado';
import { acaoIniciarAbertura } from './actions';

export const dynamic = 'force-dynamic';

export default async function ErpEstoquePage({ searchParams }: { searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const todas = await situacaoDoEstoque(ctx.cliente, ctx.alcance);
  const lojas = visao.tipo === 'loja' ? todas.filter((l) => l.id === visao.lojaId) : todas;
  return (
    <TelaSituacaoDoEstoque
      lojas={lojas}
      base="/erp/estoque"
      contexto={rotuloDaVisao(visao)}
      feito={fraseDoEstoque(searchParams.feito)}
      abrir={(lojaId) => acaoIniciarAbertura.bind(null, lojaId)}
      podeAbrir={(lojaId) => pode(ctx.alcance, 'estoque.ajustar', { lojaId })}
      podeContar={(lojaId) => pode(ctx.alcance, 'estoque.contar', { lojaId })}
      bloqueio={ctx.bloqueio}
    />
  );
}
