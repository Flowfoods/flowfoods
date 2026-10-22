/** ERP, importar o XML da nota fiscal num Parceiro Flow, pelo nível 1. */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { TelaImportarXml } from '@/components/erp/telas/compras/tela-importar';
import { acaoImportarXml } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroImportarXmlPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'compras.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  return <TelaImportarXml base={`/rodolfo/erp/${ctx.parceiro.slug}/compras/recebidas`} contexto={`${ctx.parceiro.nome} · ${rotuloDaVisao(visao)}`} acao={acaoImportarXml.bind(null, ctx.parceiro.slug)} bloqueio={ctx.bloqueio} />;
}
