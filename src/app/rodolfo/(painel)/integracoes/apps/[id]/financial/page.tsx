import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormApuracaoReferencia } from '@/components/erp/telas/integracoes/form-apuracao-referencia';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso } from '@/components/erp/ui/superficies';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { appDeReferenciaFinancial } from '@/lib/integracoes/core/apps';

export const dynamic = 'force-dynamic';

export default async function ApuracaoReferenciaPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirNivel1();
  const app = await appDeReferenciaFinancial((await params).id);
  if (!app) notFound();
  return <div className="space-y-4">
    <PageHeader icone="canais" cor={COR.parceiros} titulo="Conferência Financial"
      subtitulo="Apuração de referência do iFood" acao={<Link href="/rodolfo/integracoes" className={LINK_DE_TEXTO}>Voltar às integrações</Link>} />
    <div className="sticky top-16 z-20 bg-fundo"><Aviso tom="alerta" titulo="TEST · Base de homologação do iFood">
      Arquivos da base fornecida ou autorizada pelo iFood, apresentados pelo operador. Sem consulta ao vivo.
    </Aviso></div>
    <p className="break-words text-sm">{app.nome} · Client ID <code className="select-all break-all">{app.clientId}</code></p>
    <FormApuracaoReferencia key={app.id} rota={`/rodolfo/integracoes/apps/${encodeURIComponent(app.id)}/financial/conferir`} />
  </div>;
}
