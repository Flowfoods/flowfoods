/**
 * O miolo das actions de produção (3.1), comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o contexto,
 * conferiu a permissão (com a loja) e o bloqueio. A regra por LOJA mora em `src/lib/erp/producao.ts`, que recebe o
 * alcance e confere a loja de novo. Aqui só se lê o formulário e se traduz o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { ResultadoEstoque } from '@/lib/erp/estoque';
import { cancelarProducao, concluirProducao, estornarProducao, iniciarProducao, planejarProducao, type Autor } from '@/lib/erp/producao';
import { confirmarLista } from '@/lib/erp/lista-do-dia';
import { lerRascunho } from '@/lib/erp/lista-do-dia-campos';
import { linhasDoPedido } from '../requisicoes/executar';
import type { EstadoEstoque } from '../estoque/estado';

const vezDe = (anterior: EstadoEstoque) => (anterior?.vez ?? 0) + 1;

function concluir(r: ResultadoEstoque, anterior: EstadoEstoque, base: string, destino: (id: string) => string, feito: string, jaFeito: string): EstadoEstoque {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${destino(r.id)}?feito=${r.jaFeito ? jaFeito : feito}`);
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

export async function executarIniciar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await iniciarProducao(cliente, alcance, lojaId, id, { versao: form.get('versao') }, autor);
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/${x}`, 'iniciado', 'ja-iniciado');
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
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/${x}`, 'concluido', 'ja-concluido');
}

export async function executarCancelarLote(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await cancelarProducao(cliente, alcance, lojaId, id, { versao: form.get('versao'), motivo: form.get('motivo') }, autor);
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/${x}`, 'lote-cancelado', 'lote-ja-cancelado');
}

export async function executarEstornar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, id: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await estornarProducao(cliente, alcance, lojaId, id, { versao: form.get('versao'), motivo: form.get('motivo'), confirmarNegativo: form.get('confirmarNegativo') }, autor);
  return concluir(r, anterior, base, (x) => `${base}/${lojaId}/${x}`, 'estornado', 'ja-estornado');
}

/**
 * Confirmar a lista do dia (3.2): o rascunho vem nos campos `l` (ficha~quanto) e o dia em `dia`. O servidor lê tudo de novo e
 * grava os lotes numa transação só; ao terminar, volta para a lista do dia (com o aviso de que os lotes estão no quadro).
 */
export async function executarConfirmarLista(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const bruto = form.getAll('l').filter((v): v is string => typeof v === 'string');
  const lido = lerRascunho(bruto);
  const dia = typeof form.get('dia') === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(form.get('dia'))) ? String(form.get('dia')) : '';
  // Passou de 30 linhas: nada é cortado em silêncio (cortar seria gravar menos do que a pessoa viu).
  if (lido.excedeu) return { ok: false as const, erros: { geral: 'A lista passa de 30 linhas: tire algumas e confirme o resto depois.' }, vez: vezDe(anterior) };
  const r = await confirmarLista(cliente, alcance, lojaId, { dia, linhas: lido.linhas, envio: form.get('envio') }, autor);
  if (!r.ok) return { ok: false as const, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${base}/${lojaId}/lista?${dia ? `dia=${dia}&` : ''}feito=${r.jaFeito ? 'lista-ja-confirmada' : 'lista-confirmada'}`);
}
