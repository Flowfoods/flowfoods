/** Envio da foto da ficha técnica pelo nível 1 (sessão do /rodolfo conferida antes de ler o corpo). */

import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { receberFotoDaFicha } from '@/lib/erp/foto-envio';
import { responderFotoPendente } from '@/lib/erp/foto-pendente';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return receberFotoDaFicha(req, await parceiroDoNivel1OuNada(params.slug));
}

export async function GET(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return responderFotoPendente(req, await parceiroDoNivel1OuNada(params.slug));
}
