/** ERP do parceiro — Importar faturamento por planilha (2.1). Só com "lançar faturamento" (as actions conferem de novo, loja a loja). */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { TelaImportarFaturamento } from '@/components/erp/telas/faturamento/importar';
import { acaoImportarFaturamento, acaoPreviaDoFaturamento } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpImportarFaturamentoPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'faturamento.lancar');
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Importar planilha' }]} />
      <Voltar href="/erp/faturamento">Voltar para o faturamento</Voltar>
      <PageHeader icone="importar" cor={COR.dre} titulo="Importar planilha" subtitulo={`${ctx.parceiro.nome} · faturamento por loja, canal e dia`} />
      <TelaImportarFaturamento acaoPrevia={acaoPreviaDoFaturamento} acaoImportar={acaoImportarFaturamento} base="/erp/faturamento" bloqueio={ctx.bloqueio} />
    </div>
  );
}
