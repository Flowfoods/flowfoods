'use server';

/**
 * Central de Integrações (INT-1.8, primeira parte; decisão 490) — ações do nível 1. Toda ação abre com `exigirNivel1()` ou
 * `exigirParceiro(slug)` (sessão do /rodolfo; o slug só escolhe o parceiro, e tudo do parceiro passa pelo portão dele). Os
 * serviços (INT-1.1) conferem os dados e gravam o histórico do parceiro na mesma transação; aqui fica o registro de auditoria.
 * Parceiro suspenso ou em rascunho só lê: toda ação do parceiro recusa, inclusive a marca de testes.
 *
 * As ações cujo botão some depois de dar certo (mudar o módulo, preparar, desligar) voltam para a página com `?feito=`: o
 * aviso no topo diz o que aconteceu. As outras respondem no próprio formulário.
 *
 * Nenhuma ação chama o iFood. "Erro de permissão" não é ação de tela: quem registra é o serviço, quando o iFood responde 403.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { exigirNivel1, exigirParceiro } from '@/lib/erp/contexto';
import { mudarLiberacao } from '@/lib/erp/liberacao';
import { registrarApp } from '@/lib/integracoes/core/apps';
import { marcarParceiroDeHomologacao } from '@/lib/integracoes/core/central';
import { desligarConexao, ligarConexao, mudarModulo, prepararModulo } from '@/lib/integracoes/core/conexoes';
import type { EstadoForm } from '@/components/erp/ui/campos';
import { ACOES_DA_TELA, type CodigoFeito } from './rotulos';

const MENSAGEM_SO_LEITURA = 'Parceiro suspenso ou em rascunho: nada muda nas integrações dele até reativar em Parceiros Flow.';

const proxima = (anterior: EstadoForm) => (anterior?.vez ?? 0) + 1;
const recusa = (vez: number, geral: string): EstadoForm => ({ ok: false, erros: { geral }, vez });

async function auditar(userId: string, evento: string, dados: Record<string, string | boolean | null>) {
  await prisma.auditLog.create({ data: { userId, evento, dados } });
}

function revalidar(slug?: string) {
  revalidatePath('/rodolfo/integracoes');
  if (slug) revalidatePath(`/rodolfo/integracoes/${slug}`);
}

/** Volta para a página do parceiro com o aviso do que foi feito (o botão que foi apertado não existe mais). */
function voltarCom(slug: string, feito: CodigoFeito): never {
  revalidar(slug);
  redirect(`/rodolfo/integracoes/${encodeURIComponent(slug)}?feito=${feito}`);
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
  if (ctx.bloqueio) return recusa(vez, MENSAGEM_SO_LEITURA);
  const pedido = form.get('liberado');
  if (pedido !== 'sim' && pedido !== 'nao') return recusa(vez, 'Diga se é para liberar ou bloquear.');
  const liberado = pedido === 'sim';
  const r = await mudarLiberacao(ctx.cliente, 'integracao', liberado, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, liberado ? 'integracao.modulo-liberado' : 'integracao.modulo-bloqueado', { parceiroId: ctx.parceiro.id });
  revalidar(slug);
  return { ok: true, mensagem: !r.mudou ? 'Já estava assim.' : liberado ? 'Módulo Integração liberado para este parceiro.' : 'Módulo Integração bloqueado. Nada foi apagado.', vez };
}

export async function acaoMarcarHomologacao(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, MENSAGEM_SO_LEITURA);
  const pedido = form.get('valor');
  if (pedido !== 'sim' && pedido !== 'nao') return recusa(vez, 'Diga se é para marcar ou desmarcar.');
  const valor = pedido === 'sim';
  if (valor && form.get('soTestes') !== 'sim') return { ok: false, erros: { soTestes: 'Marque a caixa para confirmar que este parceiro existe só para testes.' }, vez };
  const r = await marcarParceiroDeHomologacao(ctx.parceiro.id, valor, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, valor ? 'integracao.parceiro-de-testes-marcado' : 'integracao.parceiro-de-testes-desmarcado', { parceiroId: ctx.parceiro.id });
  revalidar(slug);
  return { ok: true, mensagem: !r.mudou ? 'Já estava assim.' : valor ? 'Marcado como parceiro de testes: aqui só entra loja do ambiente de teste.' : 'Marca retirada: aqui só entra loja de produção.', vez };
}

export async function acaoLigarConexao(slug: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, MENSAGEM_SO_LEITURA);
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
  return { ok: true, mensagem: 'Loja do iFood ligada. Agora prepare, nela, o módulo que vai usar.', vez };
}

export async function acaoDesligarConexao(slug: string, conexaoId: string, anterior: EstadoForm): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, MENSAGEM_SO_LEITURA);
  const r = await desligarConexao(ctx.cliente, conexaoId, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, 'integracao.loja-desligada', { parceiroId: ctx.parceiro.id, conexaoId });
  voltarCom(ctx.parceiro.slug, r.mudou ? 'desligou' : 'ja-desligada');
}

export async function acaoPrepararModulo(slug: string, conexaoId: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, MENSAGEM_SO_LEITURA);
  const escolha = String(form.get('appModulo') ?? '');
  const [appId, modulo] = escolha.split('|');
  if (!appId || !modulo) return { ok: false, erros: { appModulo: 'Escolha na lista o app e o módulo.' }, vez };
  const r = await prepararModulo(ctx.cliente, conexaoId, appId, modulo, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  if (r.mudou) await auditar(ctx.sessao.userId, 'integracao.modulo-preparado', { parceiroId: ctx.parceiro.id, conexaoId, appId, modulo });
  voltarCom(ctx.parceiro.slug, r.mudou ? 'preparou' : 'ja-preparado');
}

export async function acaoMudarModulo(slug: string, moduloId: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiro(slug);
  const vez = proxima(anterior);
  if (ctx.bloqueio) return recusa(vez, MENSAGEM_SO_LEITURA);
  const acao = form.get('acao');
  const daTela = ACOES_DA_TELA.find((a) => a === acao);
  if (!daTela) return recusa(vez, 'Ação desconhecida.');
  const r = await mudarModulo(ctx.cliente, moduloId, daTela, ctx.sessao.autorNome);
  if (!r.ok) return recusa(vez, r.erro);
  await auditar(ctx.sessao.userId, 'integracao.modulo-mudou', { parceiroId: ctx.parceiro.id, moduloId, acao: daTela, estado: r.estado });
  voltarCom(ctx.parceiro.slug, daTela);
}
