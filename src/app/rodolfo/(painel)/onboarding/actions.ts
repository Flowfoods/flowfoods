'use server';

/**
 * Ações do quadro "Aguardando liberação" (0.5, nível 1): mover de etapa,
 * recusar, ativar, excluir dados e cadastrar pedido manual. Todas abrem com
 * `exigirNivel1()` (a pessoa do parceiro nunca chega aqui). A regra mora em
 * `src/lib/erp/pedidos.ts` e `credenciais.ts` (`ativarPedido`).
 *
 * O link de primeiro acesso só existe na resposta da ativação: vai para a tela,
 * uma vez. Não entra no AuditLog, no histórico nem na URL.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { ativarPedido } from '@/lib/erp/credenciais';
import { linkDoWhatsApp, mensagemDoConvite } from '@/lib/erp/pedido-campos';
import { cadastrarPedidoManual, excluirDadosDoPedido, moverPedido, recusarPedido } from '@/lib/erp/pedidos';
import { linkDePrimeiroAcesso } from '@/lib/erp/sessao';
import { validadeDoLink } from '@/components/erp/telas/equipe/estado';

export type EstadoDoPedido = {
  ok: boolean;
  mensagem?: string;
  erros?: Partial<Record<string, string>>;
  /** Só na ativação: o que a tela mostra uma vez. */
  ativacao?: { link: string | null; validade?: string; whatsapp: string | null; slug: string; nome: string };
  vez: number;
} | null;

const vezDe = (anterior: EstadoDoPedido) => (anterior?.vez ?? 0) + 1;

async function auditar(userId: string, evento: string, dados: Record<string, string>) {
  await prisma.auditLog.create({ data: { userId, evento, dados } });
}

/** O quadro, o sino e a lista de parceiros leem pedido: tudo se refaz. */
function refazer() {
  revalidatePath('/rodolfo', 'layout');
}

function leitura(form: FormData) {
  const e: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') e[k] = v;
  });
  return e;
}

export async function acaoAtivarPedido(id: string, anterior: EstadoDoPedido, form: FormData): Promise<EstadoDoPedido> {
  const { userId, autorNome } = await exigirNivel1();
  const vez = vezDe(anterior);
  const r = await ativarPedido(id, leitura(form), autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  await auditar(userId, 'erp_pedido_ativado', { pedidoId: id, parceiroId: r.parceiro.id, slug: r.parceiro.slug });
  refazer();
  const link = r.link ? linkDePrimeiroAcesso(r.link.token) : null;
  return {
    ok: true,
    mensagem: r.mensagem,
    vez,
    ativacao: {
      link,
      validade: r.link ? validadeDoLink(r.link.expiraEm) : undefined,
      whatsapp: link ? linkDoWhatsApp(r.whatsapp, mensagemDoConvite(r.dono.nome, link)) : null,
      slug: r.parceiro.slug,
      nome: r.parceiro.nome,
    },
  };
}

export async function acaoMoverPedido(id: string, anterior: EstadoDoPedido, form: FormData): Promise<EstadoDoPedido> {
  const { userId, autorNome } = await exigirNivel1();
  const vez = vezDe(anterior);
  const para = form.get('para');
  if (para !== 'NOVO' && para !== 'EM_CONVERSA') return { ok: false, erros: { geral: 'Etapa inválida.' }, vez };
  const r = await moverPedido(id, para, Number(form.get('versao')), autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez };
  await auditar(userId, 'erp_pedido_movido', { pedidoId: id, para });
  refazer();
  return { ok: true, mensagem: r.mensagem, vez };
}

export async function acaoRecusarPedido(id: string, anterior: EstadoDoPedido, form: FormData): Promise<EstadoDoPedido> {
  const { userId, autorNome } = await exigirNivel1();
  const vez = vezDe(anterior);
  const r = await recusarPedido(id, form.get('motivo'), Number(form.get('versao')), autorNome);
  if (!r.ok) return { ok: false, erros: { motivo: r.erro }, vez };
  await auditar(userId, 'erp_pedido_recusado', { pedidoId: id });
  refazer();
  return { ok: true, mensagem: r.mensagem, vez };
}

export async function acaoExcluirDadosDoPedido(id: string, anterior: EstadoDoPedido): Promise<EstadoDoPedido> {
  const { userId, autorNome } = await exigirNivel1();
  const vez = vezDe(anterior);
  const r = await excluirDadosDoPedido(id, autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez };
  await auditar(userId, 'erp_pedido_dados_excluidos', { pedidoId: id });
  refazer();
  return { ok: true, mensagem: r.mensagem, vez };
}

export async function acaoCadastrarPedidoManual(anterior: EstadoDoPedido, form: FormData): Promise<EstadoDoPedido> {
  const { userId, autorNome } = await exigirNivel1();
  const vez = vezDe(anterior);
  const r = await cadastrarPedidoManual(leitura(form), autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  await auditar(userId, 'erp_pedido_manual', { pedidoId: r.id });
  refazer();
  redirect(`/rodolfo/onboarding/${r.id}?feito=manual`);
}
