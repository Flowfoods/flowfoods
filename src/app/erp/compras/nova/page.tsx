/**
 * ERP do parceiro — Lançar nota. Exige "lançar nota de compra"; as lojas do
 * formulário são só as do alcance em que a pessoa lança. Quem decide é a
 * action (e a regra, que confere a loja de novo).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { dadosDoFormularioDeNota } from '@/lib/erp/compras';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { avisoDePeriodos } from '@/lib/erp/periodo-aviso';
import { TelaFormNota } from '@/components/erp/telas/compras/paginas';
import { acaoSalvarNota } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpLancarNotaPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.lancar');
  const [opcoes, { visao }] = await Promise.all([dadosDoFormularioDeNota(ctx.cliente, ctx.alcance), visaoDaRequisicao(ctx)]);
  return (
    <TelaFormNota
      base="/erp/compras"
      contexto={rotuloDaVisao(visao)}
      opcoes={opcoes}
      lojaSugerida={visao.tipo === 'loja' ? visao.lojaId : undefined}
      acao={acaoSalvarNota.bind(null, '')}
      bloqueio={ctx.bloqueio}
      periodos={await avisoDePeriodos(ctx.cliente, ctx.alcance, '/erp')}
      novoFornecedor={pode(ctx.alcance, 'fornecedores.editar') ? '/erp/compras/fornecedores/novo' : undefined}
      novoInsumo={pode(ctx.alcance, 'insumos.editar') ? '/erp/insumos/novo' : undefined}
    />
  );
}
