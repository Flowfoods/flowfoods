'use server';

/**
 * Central de Integrações (INT-1.8, primeira parte; decisão 490) — ações do nível 1. Toda ação abre com `exigirNivel1()` ou
 * `exigirParceiro(slug)` (sessão do /rodolfo; o slug só escolhe o parceiro, e tudo do parceiro passa pelo portão dele). Os
 * serviços (INT-1.1) conferem os dados e gravam o histórico do parceiro na mesma transação; aqui fica o registro de auditoria.
 *
 * Nenhuma ação chama o iFood. "Erro de permissão" não é ação de tela: quem registra é o serviço, quando o iFood responde 403.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { exigirNivel1, exigirParceiro } from '@/lib/erp/contexto';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { marcarParceiroDeHomologacao } from '@/lib/integracoes/core/central';
import { desligarConexao, ligarConexao, mudarModulo, prepararModulo } from '@/lib/integracoes/core/conexoes';
import type { EstadoForm } from '@/components/erp/ui/campos';

/** As ações de módulo que a tela oferece (a sétima, `erro-permissao`, é só do serviço). */
const ACOES_DA_TELA = ['solicitar', 'cancelar-pedido', 'autorizar', 'ativar', 'pausar', 'retomar'] as const;

const MENSAGEM_DA_ACAO: Record<(typeof ACOES_DA_TELA)[number], string> = {
  solicitar: 'Pedido de acesso registrado. Falta a loja aprovar no Portal do Parceiro.',
  'cancelar-pedido': 'Pedido cancelado.',
  autorizar: 'Módulo marcado como autorizado.',
  ativar: 'Módulo ativo. A busca dos números começa quando a sincronização diária existir.',
  pausar: 'Módulo pausado.',
  retomar: 'Módulo ativo de novo.',
};

const proxima = (anterior: EstadoForm) => (anterior?.vez ?? 0) + 1;
const recusa = (vez: number, geral: string): EstadoForm => ({ ok: false, erros: { geral }, vez });

async function auditar(userId: string, evento: string, dados: Record<string, string | boolean | null>) {
  await prisma.auditLog.create({ data: { userId, evento, dados } });
}

function revalidar(slug?: string) {
  revalidatePath('/rodolfo/integracoes');
  if (slug) revalidatePath(`/rodolfo/integracoes/${slug}`);
}

export async function acaoRegistrarApp(anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const sessao = await exigirNivel1();
  const vez = proxima(anterior);
  const entrada = {
    provedor: 'IFOOD',
    ambiente: form.get('ambiente'),
    nome: form.get('nome'),
    categoria: form.get('categoria'),
    clientId: form.get('clientId'),
    nomeDoSegredo: form.get('nomeDoSegredo'),
    modulos: form.getAll('modulos'),
  };
  const r = await registrarApp(entrada, sessao.autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  await auditar(sessao.userId, 'integracao.app-cadastrado', { appId: r.id, clientId: String(entrada.clientId ?? '').trim(), ambiente: String(entrada.ambiente) });
  revalidar();
  return { ok: true, mensagem: 'App cadastrado. O segredo continua só no cofre do servidor.', vez };
}

export async function acaoMudarLiberacao(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, ctx.bloqueio);
  const liberado = form.get('liberado') === 'sim';
  const r = await mudarLiberacao(ctx.cliente, 'integracao', liberado, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, liberado ? 'integracao.modulo-liberado' : 'integracao.modulo-bloqueado', { parceiroId: ctx.parceiro.id });
  revalidar(slug);
  return { ok: true, mensagem: !r.mudou ? 'Já estava assim.' : liberado ? 'Módulo Integração liberado para este parceiro.' : 'Módulo Integração bloqueado. Nada foi apagado.', vez };
}

export async function acaoMarcarHomologacao(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  const valor = form.get('valor') === 'sim';
  if (valor && form.get('soTestes') !== 'sim') return { ok: false, erros: { soTestes: 'Confirme que este parceiro existe só para testes.' }, vez };
  const r = await marcarParceiroDeHomologacao(ctx.parceiro.id, valor);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, valor ? 'integracao.parceiro-de-testes-marcado' : 'integracao.parceiro-de-testes-desmarcado', { parceiroId: ctx.parceiro.id });
  revalidar(slug);
  return { ok: true, mensagem: !r.mudou ? 'Já estava assim.' : valor ? 'Marcado como parceiro de testes: aqui só entra loja do ambiente de teste.' : 'Marca retirada: aqui só entra loja de produção.', vez };
}

export async function acaoLigarConexao(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, ctx.bloqueio);
  // O ambiente não é escolha da tela: vem da marca do parceiro (o banco confere de novo ao gravar).
  const ambiente = ctx.parceiro.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';
  const entrada = {
    lojaId: form.get('lojaId'),
    marcaId: form.get('marcaId'),
    provedor: 'IFOOD',
    ambiente,
    idExterno: form.get('idExterno'),
    idCurto: form.get('idCurto'),
    nomeExterno: form.get('nomeExterno'),
  };
  const r = await ligarConexao(ctx.cliente, entrada, { nome: ctx.sessao.autorNome, usuarioId: null });
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  await auditar(ctx.sessao.userId, 'integracao.loja-ligada', { parceiroId: ctx.parceiro.id, conexaoId: r.id, ambiente });
  revalidar(slug);
  return { ok: true, mensagem: 'Loja do iFood ligada. Agora prepare o módulo que ela vai usar.', vez };
}

export async function acaoDesligarConexao(slug: string, conexaoId: string, anterior: EstadoForm): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, ctx.bloqueio);
  const r = await desligarConexao(ctx.cliente, conexaoId, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, 'integracao.loja-desligada', { parceiroId: ctx.parceiro.id, conexaoId });
  revalidar(slug);
  return { ok: true, mensagem: r.mudou ? 'Loja desligada. O histórico fica; ligar de novo cria outra ligação.' : 'Já estava desligada.', vez };
}

export async function acaoPrepararModulo(slug: string, conexaoId: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, ctx.bloqueio);
  const escolha = String(form.get('appModulo') ?? '');
  const [appId, modulo] = escolha.split('|');
  if (!appId || !modulo) return { ok: false, erros: { appModulo: 'Escolha o app e o módulo.' }, vez };
  const r = await prepararModulo(ctx.cliente, conexaoId, appId, modulo, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, 'integracao.modulo-preparado', { parceiroId: ctx.parceiro.id, conexaoId, appId, modulo });
  revalidar(slug);
  return { ok: true, mensagem: r.mudou ? 'Módulo preparado.' : 'Este módulo já estava preparado nesta loja.', vez };
}

export async function acaoMudarModulo(slug: string, moduloId: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, ctx.bloqueio);
  const acao = form.get('acao');
  const daTela = ACOES_DA_TELA.find((a) => a === acao);
  if (!daTela) return recusa(vez, 'Ação desconhecida.');
  const r = await mudarModulo(ctx.cliente, moduloId, daTela, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  await auditar(ctx.sessao.userId, 'integracao.modulo-mudou', { parceiroId: ctx.parceiro.id, moduloId, acao: daTela, estado: r.estado });
  revalidar(slug);
  return { ok: true, mensagem: MENSAGEM_DA_ACAO[daTela], vez };
}
