'use server';

/**
 * Formulário da landing (0.5): o pedido de quem quer começar. Público, sem
 * sessão. A regra toda mora em `src/lib/erp/pedidos.ts` (limite por IP, teto
 * global, armadilha, reenvio no mesmo cartão, resposta única); aqui só se lê o
 * IP, se escolhe a frase e se protege a landing quando não há banco.
 *
 * Sem `DATABASE_URL` (o site no ar antes do Postgres), não há 500: responde com
 * o caminho do WhatsApp. Erro inesperado também: a frase não entrega nada do
 * servidor, e o erro vai para o log.
 */

import { headers } from 'next/headers';
import { ipDaRequisicao } from '@/lib/erp/acesso';
import { receberPedidoDaLanding } from '@/lib/erp/pedidos';
import { RESPOSTA_BLOQUEADO, RESPOSTA_DE_ERRO, RESPOSTA_DO_ENVIO, RESPOSTA_SEM_BANCO } from '@/lib/erp/pedido-textos';
import type { ErrosDoPedido } from '@/lib/erp/pedido-campos';

export type EstadoDoComecar = {
  tipo: 'recebido' | 'bloqueado' | 'erros' | 'indisponivel';
  mensagem: string;
  erros?: ErrosDoPedido;
  valores?: Record<string, string>;
  vez: number;
} | null;

export async function enviarPedido(anterior: EstadoDoComecar, form: FormData): Promise<EstadoDoComecar> {
  const vez = (anterior?.vez ?? 0) + 1;
  if (!process.env.DATABASE_URL) return { tipo: 'indisponivel', mensagem: RESPOSTA_SEM_BANCO, vez };

  const entrada: Record<string, unknown> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') entrada[k] = v;
  });

  try {
    const r = await receberPedidoDaLanding(entrada, ipDaRequisicao(headers()));
    if (r.tipo === 'recebido') return { tipo: 'recebido', mensagem: RESPOSTA_DO_ENVIO, vez };
    if (r.tipo === 'bloqueado') return { tipo: 'bloqueado', mensagem: RESPOSTA_BLOQUEADO, vez };
    return { tipo: 'erros', mensagem: 'Confira os campos marcados.', erros: r.erros, valores: r.valores, vez };
  } catch (e) {
    console.error('[comecar] falha ao gravar o pedido:', e instanceof Error ? e.message : e);
    return { tipo: 'indisponivel', mensagem: RESPOSTA_DE_ERRO, vez };
  }
}
