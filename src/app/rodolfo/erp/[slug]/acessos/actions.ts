'use server';

/**
 * Acessos das pessoas do parceiro (nível 1). Toda ação abre com
 * `exigirParceiro(slug)` (sessão do /rodolfo + parceiro resolvido no servidor)
 * e passa o `parceiroId` para `credenciais.ts`, que grava antes/depois no
 * histórico do parceiro na mesma transação.
 *
 * Vale em qualquer situação do parceiro (ativo, suspenso, aguardando): o
 * Rodolfo prepara os acessos antes de liberar; quem entra num parceiro não
 * ativo só consulta (cliente somente leitura).
 *
 * O link aparece UMA vez, na resposta: o banco guarda só o hash do token. Não
 * há envio por e-mail/WhatsApp aqui — o Rodolfo copia e manda.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { exigirParceiro } from '@/lib/erp/contexto';
import { criarAcesso, gerarNovoLink, mudarStatusDoAcesso } from '@/lib/erp/credenciais';
import { linkDePrimeiroAcesso } from '@/lib/erp/sessao';

export type EstadoAcesso = {
  ok: boolean;
  mensagem?: string;
  erros?: Partial<Record<string, string>>;
  link?: string;
  validade?: string;
  vez: number;
} | null;

const VALIDADE = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function validade(d: Date) {
  return VALIDADE.format(d).replace(',', ' às');
}

async function auditar(userId: string, evento: string, dados: Record<string, string>) {
  await prisma.auditLog.create({ data: { userId, evento, dados } });
}

export async function acaoCriarAcesso(slug: string, anterior: EstadoAcesso, form: FormData): Promise<EstadoAcesso> {
  const { sessao, parceiro } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  const r = await criarAcesso(parceiro.id, Object.fromEntries(form), sessao.autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  await auditar(sessao.userId, 'erp_acesso_criado', { parceiroId: parceiro.id });
  revalidatePath(`/rodolfo/erp/${slug}`, 'layout');
  return {
    ok: true,
    mensagem: r.mensagem,
    link: r.link ? linkDePrimeiroAcesso(r.link.token) : undefined,
    validade: r.link ? validade(r.link.expiraEm) : undefined,
    vez,
  };
}

export async function acaoNovoLink(slug: string, acessoId: string, anterior: EstadoAcesso): Promise<EstadoAcesso> {
  const { sessao, parceiro } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  const r = await gerarNovoLink(parceiro.id, acessoId, sessao.autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez };
  await auditar(sessao.userId, 'erp_acesso_novo_link', { parceiroId: parceiro.id, acessoId });
  revalidatePath(`/rodolfo/erp/${slug}`, 'layout');
  return {
    ok: true,
    mensagem: `Link novo de ${r.nome}. O anterior deixou de valer.`,
    link: linkDePrimeiroAcesso(r.token),
    validade: validade(r.expiraEm),
    vez,
  };
}

export async function acaoMudarStatusAcesso(
  slug: string,
  acessoId: string,
  novo: 'ATIVO' | 'DESATIVADO',
  anterior: EstadoAcesso,
): Promise<EstadoAcesso> {
  const { sessao, parceiro } = await exigirParceiro(slug);
  const vez = (anterior?.vez ?? 0) + 1;
  if (novo !== 'ATIVO' && novo !== 'DESATIVADO') return { ok: false, erros: { geral: 'Situação inválida.' }, vez };
  const r = await mudarStatusDoAcesso(parceiro.id, acessoId, novo, sessao.autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez };
  await auditar(sessao.userId, novo === 'ATIVO' ? 'erp_acesso_reativado' : 'erp_acesso_desativado', {
    parceiroId: parceiro.id,
    acessoId,
  });
  revalidatePath(`/rodolfo/erp/${slug}`, 'layout');
  return { ok: true, mensagem: r.mensagem, vez };
}
