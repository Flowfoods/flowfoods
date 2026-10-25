/** Cadastrar pedido manual (0.5): em tela própria, como os outros cadastros do ERP. */

import { exigirNivel1 } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { FormManual } from './form-manual';

export const dynamic = 'force-dynamic';

export default async function NovoPedidoPage() {
  await exigirNivel1();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: 'Cadastrar pedido manual' }]} />
      <Voltar href="/rodolfo/onboarding">Voltar para Aguardando liberação</Voltar>
      <PageHeader
        icone="novo"
        cor={COR.parceiros}
        titulo="Cadastrar pedido manual"
        subtitulo="Para quem chegou por outro caminho. Depois, ative no quadro."
      />
      <FormManual />
    </div>
  );
}
