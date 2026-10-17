/**
 * ERP do parceiro — um período (2.2b): as condições para fechar, o fechamento, a fotografia e as
 * versões. Exige "definir metas, plano de contas e período" (que só vale com a rede inteira) e
 * "ver DRE e CMV". Reabrir NÃO existe aqui: é só do nível 1, e a regra confere de novo. O início da
 * URL só ESCOLHE: quem não é início de período, é futuro ou anterior ao ERP é 404.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, visaoDaRequisicao } from '@/lib/erp/contexto';
import { rotuloDaVisao } from '@/lib/erp/visao';
import { PaginaDoFechamento } from '@/components/erp/telas/dre/paginas';
import { acaoFecharPeriodo } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function ErpPeriodoPage({ params, searchParams }: { params: { inicio: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'metas.editar');
  exigirPermissaoNaPagina(ctx, 'dre.ver');
  const { visao } = await visaoDaRequisicao(ctx);
  const { inicio } = params;
  return (
    <PaginaDoFechamento
      c={{ cliente: ctx.cliente, alcance: ctx.alcance, bloqueio: ctx.bloqueio, contexto: rotuloDaVisao(visao), raiz: '/erp' }}
      inicio={inicio}
      query={searchParams}
      acoes={{ fechar: acaoFecharPeriodo.bind(null, inicio) }}
    />
  );
}
