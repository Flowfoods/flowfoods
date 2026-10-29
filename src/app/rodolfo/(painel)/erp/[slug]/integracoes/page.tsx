/**
 * Espelho do nível 1 para a aba Integrações (INT-1.8, decisão 491): dentro do parceiro, a aba leva à Central de Integrações
 * DELE, onde o nível 1 libera o módulo, liga lojas e muda módulos. A tela só leitura do parceiro é a de /erp/integracoes.
 */

import { redirect } from 'next/navigation';
import { exigirParceiro } from '@/lib/erp/contexto';

export const dynamic = 'force-dynamic';

export default async function IntegracoesNoEspelhoDoParceiro({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  redirect(`/rodolfo/integracoes/${encodeURIComponent(ctx.parceiro.slug)}`);
}
