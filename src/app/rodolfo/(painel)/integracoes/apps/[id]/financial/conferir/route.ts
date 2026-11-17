import { getServerSession } from 'next-auth';
import { origemDoSite } from '@/lib/erp/sessao';
import { erroNoEnvioDeReferencia, receberApuracaoDeReferencia } from '@/lib/integracoes/core/apuracao-referencia-financial-http';
import { authOptions } from '@/lib/rodolfo/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const sessao = await getServerSession(authOptions);
  if (!(sessao?.user as { id?: string } | undefined)?.id) return erroNoEnvioDeReferencia(401, 'Entre na central FlowFoods para conferir esta apuração.');
  if (req.headers.get('origin') !== await origemDoSite()) return erroNoEnvioDeReferencia(403, 'Envie os arquivos pela central FlowFoods.');
  return receberApuracaoDeReferencia(req, (await props.params).id);
}
