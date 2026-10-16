/** Envio da foto da ficha técnica pelo nível 1 (sessão do /rodolfo conferida antes de ler o corpo). */

import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { receberFotoDaFicha } from '@/lib/erp/foto-envio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  return receberFotoDaFicha(req, await parceiroDoNivel1OuNada(params.slug));
}
