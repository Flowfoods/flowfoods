/** ERP, Importar faturamento por planilha de um Parceiro Flow, pelo nível 1 (2.1). */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { TelaImportarFaturamento } from '@/components/erp/telas/faturamento/importar';
import { acaoImportarFaturamento, acaoPreviaDoFaturamento } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroImportarFaturamentoPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'faturamento.lancar');
  const slug = ctx.parceiro.slug;
  const base = `/rodolfo/erp/${slug}/faturamento`;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Importar planilha' }]} />
      <Voltar href={base}>Voltar para o faturamento</Voltar>
      <PageHeader icone="importar" cor={COR.dre} titulo="Importar planilha" subtitulo={`${ctx.parceiro.nome} · faturamento por loja, canal e dia`} />
      <TelaImportarFaturamento acaoPrevia={acaoPreviaDoFaturamento.bind(null, slug)} acaoImportar={acaoImportarFaturamento.bind(null, slug)} base={base} bloqueio={ctx.bloqueio} />
    </div>
  );
}
