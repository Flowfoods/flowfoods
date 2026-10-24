'use server';

/**
 * Ações da pessoa do parceiro em /erp. Toda ação abre com
 * `exigirParceiroDaSessao()`: o parceiro vem da sessão, nunca do formulário. E
 * confere a permissão com a regra única (`recusaDaAcao` = `exigirPermissao`):
 * esconder o botão é conforto; quem decide é aqui. Parceiro não ativo: o
 * cliente é somente leitura (portão e banco recusam).
 */

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { exigirParceiroDaSessao, exigirPessoa, recusaDaAcao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { cadastrarLoja, cadastrarMarca } from '@/lib/erp/estrutura';
import type { EstadoForm } from '@/components/erp/ui/campos';
import type { EstadoDosCanais } from '@/components/erp/telas/faturamento/estado';
import { executarCanaisDaLoja } from '@/components/erp/telas/faturamento/executar';
import { executarCnpjDaLoja } from '@/components/erp/telas/estrutura/executar';
import {
  concluirRegistroDeRosto,
  ERRO_ATIVAR_ROSTO,
  gravarPreferenciaDeAjuda,
  iniciarRegistroDeRosto,
  LimiteDoRosto,
  podeAtivarRosto,
  removerRosto,
} from '@/lib/erp/credenciais';
import { buscarInsumos } from '@/lib/erp/insumos';
import { buscarFichas } from '@/lib/erp/fichas';
import { TIPOS_DE_FICHA } from '@/lib/erp/ficha-campos';
import type { RegistrationResponseJSON } from '@/lib/erp/rosto';
import { aparelhoAtual, tokenDoCookie } from '@/lib/erp/sessao';
import type { RespostaDaVisao, ResultadoDaBusca } from '@/components/erp/shell/tipos';
import { UNIDADES } from '@/lib/erp/unidades';
import { sessaoSegura } from '@/lib/erp/sessao-cookie';
import { COOKIE_VISAO, escolhaPermitida, valorDoCookieDeVisao } from '@/lib/erp/visao';

/** Lojas e marcas são da rede: "cadastrar lojas e marcas" exige a rede inteira (a regra está no catálogo). */
async function cadastrarEstruturaDaSessao(tipo: 'loja' | 'marca', anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiroDaSessao();
  const vez = (anterior?.vez ?? 0) + 1;
  const negado = recusaDaAcao(ctx, 'lojas.gerir');
  if (negado) return { ok: false, erros: { geral: negado }, vez };
  if (ctx.bloqueio) return { ok: false, erros: { geral: ctx.bloqueio }, vez };
  const r = await (tipo === 'loja' ? cadastrarLoja : cadastrarMarca)(ctx.cliente, Object.fromEntries(form), ctx.sessao.autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  revalidatePath('/erp', 'layout');
  return { ok: true, mensagem: `“${r.nome}” cadastrada.`, vez };
}

export async function acaoCadastrarLojaDaSessao(anterior: EstadoForm, form: FormData) {
  return cadastrarEstruturaDaSessao('loja', anterior, form);
}

export async function acaoCadastrarMarcaDaSessao(anterior: EstadoForm, form: FormData) {
  return cadastrarEstruturaDaSessao('marca', anterior, form);
}

/** 2.1: em quais canais a loja vende. É cadastro da rede: "cadastrar lojas e marcas", que exige a rede inteira. */
export async function acaoSalvarCanaisDaLojaDaSessao(lojaId: string, anterior: EstadoDosCanais, form: FormData): Promise<EstadoDosCanais> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'lojas.gerir') ?? ctx.bloqueio;
  if (negado) return { ok: false, erros: { geral: negado }, vez: (anterior?.vez ?? 0) + 1 };
  return executarCanaisDaLoja(ctx.cliente, ctx.sessao.autorNome, String(lojaId), anterior, form, '/erp');
}

/** F.1a: o CNPJ da loja (o destinatário das notas fiscais). Cadastro da rede: "cadastrar lojas e marcas", que exige a rede inteira. */
export async function acaoSalvarCnpjDaLojaDaSessao(lojaId: string, anterior: EstadoForm, form: FormData): Promise<EstadoForm> {
  const ctx = await exigirParceiroDaSessao();
  const negado = recusaDaAcao(ctx, 'lojas.gerir') ?? ctx.bloqueio;
  if (negado) return { ok: false, erros: { geral: negado }, vez: (anterior?.vez ?? 0) + 1 };
  return executarCnpjDaLoja(ctx.cliente, ctx.sessao.autorNome, String(lojaId), anterior, form, '/erp');
}

export async function acaoOpcoesDeAtivarRosto() {
  const pessoa = await exigirPessoa();
  if (!podeAtivarRosto(pessoa)) return { ok: false as const, erro: ERRO_ATIVAR_ROSTO };
  try {
    return { ok: true as const, opcoes: await iniciarRegistroDeRosto(pessoa) };
  } catch (e) {
    if (e instanceof LimiteDoRosto) return { ok: false as const, erro: 'Muitos pedidos seguidos. Espere 5 minutos.' };
    throw e;
  }
}

export async function acaoConfirmarRosto(resposta: RegistrationResponseJSON) {
  const pessoa = await exigirPessoa();
  if (!resposta || typeof resposta !== 'object') return { ok: false as const, erro: 'Resposta inválida do aparelho.' };
  const r = await concluirRegistroDeRosto(pessoa, resposta, aparelhoAtual());
  if (r.ok) revalidatePath('/erp/acesso');
  return r;
}

export async function acaoRemoverRosto(passkeyId: string) {
  const pessoa = await exigirPessoa();
  const r = await removerRosto(pessoa, String(passkeyId));
  if (r.ok) revalidatePath('/erp/acesso');
  return r;
}

// ------------------------------------------------------------ shell (1.1)

/**
 * Busca do ⌘K: insumos e fichas do parceiro DA SESSÃO. Confere "ver insumos" e
 * "ver fichas" aqui — quem não pode recebe lista vazia, mesmo chamando a action direto.
 */
export async function acaoBuscarNoErp(q: string): Promise<ResultadoDaBusca[]> {
  const ctx = await exigirParceiroDaSessao();
  const termo = String(q ?? '');
  const insumos = recusaDaAcao(ctx, 'insumos.ver') ? [] : await buscarInsumos(ctx.cliente, termo);
  const fichas = recusaDaAcao(ctx, 'fichas.ver') ? [] : await buscarFichas(ctx.cliente, termo);
  return [
    ...insumos.map((i) => ({
      tipo: 'insumo' as const,
      rotulo: i.nome,
      detalhe: `Insumo · ${UNIDADES[i.unidade].nome}`,
      href: `/erp/insumos/${i.id}`,
      desativado: !i.ativo,
    })),
    ...fichas.map((f) => ({
      tipo: 'ficha' as const,
      rotulo: f.nome,
      detalhe: `Ficha técnica · ${TIPOS_DE_FICHA[f.tipo]}`,
      href: `/erp/fichas/${f.id}`,
      desativado: !f.ativa,
    })),
  ];
}

/**
 * Visão do topo (Rede Completa ↔ loja). Não é permissão: só filtra DENTRO do
 * alcance. A escolha é conferida contra as lojas que o alcance da pessoa já
 * alcança; loja fora dele é recusada e o cookie nem é gravado.
 */
export async function acaoEscolherVisao(valor: string): Promise<RespostaDaVisao> {
  const ctx = await exigirParceiroDaSessao();
  const { lojas } = await visaoDaRequisicao(ctx);
  if (!escolhaPermitida(ctx.alcance, lojas, valor)) return { ok: false, mensagem: 'Essa loja não está no seu acesso.' };
  cookies().set(COOKIE_VISAO, valorDoCookieDeVisao(ctx.parceiro.id, valor), {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: sessaoSegura(),
    maxAge: 60 * 60 * 24 * 90,
  });
  revalidatePath('/erp', 'layout');
  return { ok: true };
}

// ------------------------------------------------------- ajuda contextual (0.6)
//
// As ações de ajuda são da PRÓPRIA pessoa (preferência dela, não dado do parceiro):
// não pedem permissão e valem até em parceiro suspenso. Nenhuma recebe quem é a
// pessoa: o `usuarioId` sai da sessão validada dentro de `credenciais.ts`; um
// campo forjado no formulário não tem onde entrar. Recusa (sessão morta, caixa
// que não existe) não grava nada e não quebra a tela.

/** "Não mostrar novamente" do card da tela: fecha ESTA caixa nesta versão do texto. */
export async function acaoAjudaFechar(form: FormData): Promise<void> {
  await gravarPreferenciaDeAjuda(tokenDoCookie(), { tipo: 'fechar', caixa: String(form.get('caixa') ?? '') });
  revalidatePath('/erp', 'layout');
}

/** Manter, desligar ou religar as dicas (a pergunta da 1ª vez e "Seu acesso"). */
export async function acaoAjudaDicas(form: FormData): Promise<void> {
  const v = String(form.get('dicas') ?? '');
  if (v === 'manter' || v === 'ligar' || v === 'desligar') {
    await gravarPreferenciaDeAjuda(tokenDoCookie(), { tipo: 'dicas', ligadas: v !== 'desligar' });
  }
  revalidatePath('/erp', 'layout');
}

/**
 * Ponto de ajuda: o card abriu sozinho agora (guarda o dia, para voltar só daqui
 * a 7 dias). Sem revalidar: a tela segue como está, nada do formulário se perde;
 * a próxima navegação já lê a preferência nova junto com a sessão.
 */
export async function acaoAjudaPontoVisto(ponto: string): Promise<void> {
  await gravarPreferenciaDeAjuda(tokenDoCookie(), { tipo: 'ponto-visto', ponto: String(ponto ?? '') });
}

/** Ponto de ajuda: "Não mostrar novamente" (só corta a abertura automática; o botão do campo continua). */
export async function acaoAjudaPontoNunca(form: FormData): Promise<void> {
  await gravarPreferenciaDeAjuda(tokenDoCookie(), { tipo: 'ponto-nunca', ponto: String(form.get('ponto') ?? '') });
}

/** "Mostrar de novo as que fechei": zera a lista. */
export async function acaoAjudaReabrir(): Promise<void> {
  await gravarPreferenciaDeAjuda(tokenDoCookie(), { tipo: 'reabrir' });
  revalidatePath('/erp', 'layout');
}
