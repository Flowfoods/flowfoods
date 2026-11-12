import { parceiroDoNivel1OuNada } from '@/lib/erp/contexto';
import { origemDoSite } from '@/lib/erp/sessao';
import { receberPacoteFinancial } from '@/lib/integracoes/core/fontes-financial-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  return receberPacoteFinancial(req, await parceiroDoNivel1OuNada(slug), await origemDoSite());
}
