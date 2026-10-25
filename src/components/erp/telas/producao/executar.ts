/**
 * O miolo das actions de produção (3.1; 3.3: pegar, soltar e passar), comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o contexto,
 * conferiu a permissão (com a loja) e o bloqueio. A regra por LOJA mora em `src/lib/erp/producao.ts`, que recebe o
 * alcance e confere a loja de novo. Aqui só se lê o formulário e se traduz o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { ResultadoEstoque } from '@/lib/erp/estoque';
import { cancelarProducao, concluirProducao, estornarProducao, passarProducao, pegarProducao, planejarProducao, soltarProducao, type Autor, type QuemPodeReceber } from '@/lib/erp/producao';
import { gerarLotesDaLista, pegarDaLista, porNaListaDoDia, salvarListaDoDia } from '@/lib/erp/producao-lista';
import { linhasDoPedido } from '../requisicoes/executar';
import type { EstadoEstoque } from '../estoque/estado';

const vezDe = (anterior: EstadoEstoque) => (anterior?.vez ?? 0) + 1;

function concluir(r: ResultadoEstoque, anterior: EstadoEstoque, base: string, destino: (id: string) => string, feito: string, jaFeito: string): EstadoEstoque {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  const para = destino(r.id);
  redirect(`${para}${para.includes('?') ? '&' : '?'}feito=${r.jaFeito ? jaFeito : feito}`);
}

export async function executarPlanejar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await planejarProducao(
    cliente,
    alcance,
    lojaId,
    { fichaId: form.get('fichaId'), quantidade: form.get('quantidade_ficha'), paraDia: form.get('paraDia'), observacao: form.get('observacao'), linhas: linhasDoPedido(form), envio: form.get('envio') },
    autor,
  );
  return concluir(r, anterior, base, (id) => `${base}/${lojaId}/${id}`, 'planejado', 'planejado');
}

// ================================================================ a cozinha pega a tarefa (3.3)

/** Para onde volta: a tela da cozinha (`voltar=tarefas`, só esse valor) ou o lote. */
const destinoDaCozinha = (base: string, lojaId: string, form: FormData) => (id: string) => (form.get('voltar') === 'tarefas' ? `${base}/tarefas/${lojaId}` : `${base}/${lojaId}/${id}`);

/** O lote vem no formulário (`lote`): a regra confere a loja e o lote de novo. */
const loteDo = (form: FormData) => String(form.get('lote') ?? '');

export async function executarPegarLote(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await pegarProducao(cliente, alcance, lojaId, loteDo(form), { versao: form.get('versao') }, autor);
  return concluir(r, anterior, base, destinoDaCozinha(base, lojaId, form), 'pegou', 'ja-pegou');
}

export async function executarPegarDaLista(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await pegarDaLista(cliente, alcance, lojaId, { linha: form.get('linha'), ficha: form.get('ficha'), quantidade: form.get('quantidade') }, autor);
  return concluir(r, anterior, base, destinoDaCozinha(base, lojaId, form), 'pegou', 'ja-pegou');
}

export async function executarSoltar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await soltarProducao(cliente, alcance, lojaId, loteDo(form), { versao: form.get('versao'), motivo: form.get('motivo') }, autor);
  return concluir(r, anterior, base, destinoDaCozinha(base, lojaId, form), 'soltou', 'ja-soltou');
}

/** `quem` = quem pode receber (das credenciais, montado no servidor pela action) e a releitura na gravação. */
export async function executarPassar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, quem: QuemPodeReceber, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await passarProducao(cliente, alcance, lojaId, loteDo(form), { versao: form.get('versao'), motivo: form.get('motivo'), para: form.get('para') }, quem, autor);
  return concluir(r, anterior, base, destinoDaCozinha(base, lojaId, form), 'passou', 'ja-passou');
}

export async function executarConcluir(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await concluirProducao(
    cliente,
    alcance,
    lojaId,
    id,
    { versao: form.get('versao'), produzido: form.get('produzido'), escala: form.get('escala'), motivo: form.get('motivo'), conservacao: form.get('conservacao') },
    autor,
  );
  // Pelas Tarefas, a volta leva o lote: a confirmação oferece a etiqueta dele a um toque (revisão de UX, E4).
  const volta = (x: string) => (form.get('voltar') === 'tarefas' ? `${base}/tarefas/${lojaId}?lote=${encodeURIComponent(x)}` : `${base}/${lojaId}/${x}`);
  return concluir(r, anterior, base, volta, 'concluido', 'ja-concluido');
}

export async function executarCancelarLote(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await cancelarProducao(cliente, alcance, lojaId, id, { versao: form.get('versao'), motivo: form.get('motivo') }, autor);
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/${x}`, 'lote-cancelado', 'lote-ja-cancelado');
}

export async function executarEstornar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await estornarProducao(cliente, alcance, lojaId, id, { versao: form.get('versao'), motivo: form.get('motivo'), confirmarNegativo: form.get('confirmarNegativo') }, autor);
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/${x}`, 'estornado', 'ja-estornado');
}

// ================================================================ a lista do dia (3.2)

/** Volta para a lista do mesmo dia (a tela é por loja e dia). `base` = `/erp/producao` ou o espelho do nível 1. */
const naLista = (base: string, lojaId: string, dia: unknown) => `${base}/lista/${lojaId}${typeof dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `?dia=${dia}&` : '?'}`;

function voltarParaALista(r: ResultadoEstoque, anterior: EstadoEstoque, base: string, lojaId: string, dia: unknown, feito: string, jaFeito: string): EstadoEstoque {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${naLista(base, lojaId, dia)}feito=${r.jaFeito ? jaFeito : feito}`);
}

export async function executarSalvarLista(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await salvarListaDoDia(
    cliente,
    alcance,
    lojaId,
    { dia: form.get('dia'), versao: form.get('versao'), linhaIds: form.getAll('linhaId'), fichaIds: form.getAll('fichaId'), quantidades: form.getAll('quantidade'), vistas: form.get('vistas') },
    autor,
  );
  return voltarParaALista(r, anterior, base, lojaId, form.get('dia'), 'lista-salva', 'lista-ja');
}

export async function executarGerarLotes(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  // Só as linhas em aberto que a tela mostrou viram lote (decisão 228).
  const r = await gerarLotesDaLista(cliente, alcance, lojaId, { dia: form.get('dia'), versao: form.get('versao'), linhas: form.getAll('linha') }, autor);
  return voltarParaALista(r, anterior, base, lojaId, form.get('dia'), 'lotes-gerados', 'lotes-ja');
}

export async function executarPorNaLista(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await porNaListaDoDia(cliente, alcance, lojaId, { dia: form.get('dia'), versao: form.get('versao'), fichaId: form.get('fichaId'), quantidade: form.get('quantidade') }, autor);
  return voltarParaALista(r, anterior, base, lojaId, form.get('dia'), 'posto-na-lista', 'posto-na-lista');
}
