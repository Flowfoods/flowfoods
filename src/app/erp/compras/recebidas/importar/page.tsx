/**
 * ERP do parceiro — Importar o XML da nota fiscal. Exige "lançar nota de compra". Receber grava o documento (e o fornecedor
 * provisório, se for novo) e leva à conferência; nada é lançado. Quem decide é a action (e a regra, que confere a loja do CNPJ da nota).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { visaoDaRequisicao } from '@/lib/erp/contexto';
import { TelaImportarXml } from '@/components/erp/telas/compras/tela-importar';
import { acaoImportarXml } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpImportarXmlPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'compras.lancar');
  const { visao } = await visaoDaRequisicao(ctx);
  return <TelaImportarXml base="/erp/compras/recebidas" contexto={rotuloDaVisao(visao)} acao={acaoImportarXml} bloqueio={ctx.bloqueio} />;
}
