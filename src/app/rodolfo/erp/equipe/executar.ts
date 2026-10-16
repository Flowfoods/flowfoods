/**
 * O miolo das actions de equipe, comum ao nível 1 e à pessoa do parceiro: quem
 * chama já resolveu o contexto (sessão + parceiro) e conferiu
 * `exigirPermissao(ctx, 'acessos.gerir')`. Aqui só se traduz o formulário e o
 * resultado; as regras (sem escalada, último administrador, histórico) estão
 * em `credenciais.ts`.
 */

import {
  atualizarAcesso,
  criarAcesso,
  excluirPerfil,
  gerarNovoLink,
  liberarEntrada,
  mudarStatusDoAcesso,
  salvarPerfil,
  type Ator,
} from '@/lib/erp/credenciais';
import { entradaDoFormulario } from '@/lib/erp/equipe';
import { linkDePrimeiroAcesso } from '@/lib/erp/sessao';
import { validadeDoLink, type EstadoEquipe } from './estado';

const vezDe = (anterior: EstadoEquipe) => (anterior?.vez ?? 0) + 1;

export function recusado(anterior: EstadoEquipe, motivo: string): EstadoEquipe {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

export async function executarCriar(
  parceiroId: string,
  ator: Ator,
  anterior: EstadoEquipe,
  form: FormData,
): Promise<EstadoEquipe> {
  const r = await criarAcesso(parceiroId, entradaDoFormulario(form), ator);
  if (!r.ok) return { ok: false, erros: r.erros, vez: vezDe(anterior) };
  return {
    ok: true,
    mensagem: r.mensagem,
    link: r.link ? linkDePrimeiroAcesso(r.link.token) : undefined,
    validade: r.link ? validadeDoLink(r.link.expiraEm) : undefined,
    vez: vezDe(anterior),
  };
}

export async function executarAtualizar(
  parceiroId: string,
  ator: Ator,
  acessoId: string,
  anterior: EstadoEquipe,
  form: FormData,
): Promise<EstadoEquipe> {
  const r = await atualizarAcesso(parceiroId, String(acessoId), entradaDoFormulario(form), ator);
  return r.ok
    ? { ok: true, mensagem: r.mensagem, vez: vezDe(anterior) }
    : { ok: false, erros: r.erros, vez: vezDe(anterior) };
}

export async function executarNovoLink(
  parceiroId: string,
  ator: Ator,
  acessoId: string,
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const r = await gerarNovoLink(parceiroId, String(acessoId), ator);
  if (!r.ok) return recusado(anterior, r.erro);
  return {
    ok: true,
    mensagem: `Link novo de ${r.nome}. O anterior deixou de valer.`,
    link: linkDePrimeiroAcesso(r.token),
    validade: validadeDoLink(r.expiraEm),
    vez: vezDe(anterior),
  };
}

export async function executarStatus(
  parceiroId: string,
  ator: Ator,
  acessoId: string,
  novo: 'ATIVO' | 'DESATIVADO',
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const r = await mudarStatusDoAcesso(parceiroId, String(acessoId), novo, ator);
  return r.ok ? { ok: true, mensagem: r.mensagem, vez: vezDe(anterior) } : recusado(anterior, r.erro);
}

export async function executarLiberar(
  parceiroId: string,
  autorNome: string,
  acessoId: string,
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const r = await liberarEntrada(parceiroId, String(acessoId), autorNome);
  return r.ok ? { ok: true, mensagem: r.mensagem, vez: vezDe(anterior) } : recusado(anterior, r.erro);
}

export async function executarSalvarPerfil(
  parceiroId: string,
  ator: Ator,
  anterior: EstadoEquipe,
  form: FormData,
): Promise<EstadoEquipe> {
  const r = await salvarPerfil(parceiroId, entradaDoFormulario(form), ator);
  return r.ok
    ? { ok: true, mensagem: r.mensagem, vez: vezDe(anterior) }
    : { ok: false, erros: r.erros, vez: vezDe(anterior) };
}

export async function executarExcluirPerfil(
  parceiroId: string,
  ator: Ator,
  perfilId: string,
  anterior: EstadoEquipe,
): Promise<EstadoEquipe> {
  const r = await excluirPerfil(parceiroId, String(perfilId), ator);
  return r.ok ? { ok: true, mensagem: r.mensagem, vez: vezDe(anterior) } : recusado(anterior, r.erro);
}
