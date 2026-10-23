/**
 * O miolo das actions de etiqueta (3.4), comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o contexto,
 * conferiu a permissão e o bloqueio. A regra por LOJA mora em `src/lib/erp/etiquetas.ts`, que recebe o alcance e confere a
 * loja de novo. Aqui só se lê o formulário e se traduz o resultado (o pedido de impressão volta para a tela, sem redirecionar:
 * a tela ainda vai mandar para a Zebra).
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { ResultadoEstoque } from '@/lib/erp/estoque';
import {
  abrirEmbalagem,
  confirmarImpressao,
  emitirEtiquetaDaAbertura,
  emitirEtiquetaDoLote,
  pedirImpressao,
  registrarLoteDaNota,
  resultadoDaImpressao,
  tirarLoteDaNota,
  type Autor,
  type ResultadoDoPedido,
} from '@/lib/erp/etiquetas';
import type { EstadoEstoque } from '../estoque/estado';

const vezDe = (anterior: EstadoEstoque) => (anterior?.vez ?? 0) + 1;

/** O que a tela manda para pedir uma impressão (a regra lê tudo de novo). */
export interface PedidoDaTela {
  copias: string;
  transporte: string;
  resolucao: string;
  envio: string;
}

export type AcaoDePedir = (p: PedidoDaTela) => Promise<ResultadoDoPedido>;
export type AcaoDeResultado = (pedidoId: string, resultado: 'ENVIADA' | 'FALHOU', erro: string) => Promise<ResultadoEstoque>;
/** "Já imprimi" (rodada 1, decisão 418): a etiqueta saiu no papel; sai da fila com quem e quando. */
export type AcaoDeConfirmar = () => Promise<ResultadoEstoque>;

function concluir(r: ResultadoEstoque, anterior: EstadoEstoque, base: string, destino: (id: string) => string, feito: string, jaFeito: string): EstadoEstoque {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${destino(r.id)}?feito=${r.jaFeito ? jaFeito : feito}`);
}

export async function executarEmitirDoLote(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, equipe: ReadonlySet<string> | null, lojaId: string, ordemId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await emitirEtiquetaDoLote(
    cliente,
    alcance,
    lojaId,
    ordemId,
    { formato: form.get('formato'), quantas: form.get('quantas'), quanto: form.get('quanto'), escala: form.get('escala'), hora: form.get('hora'), envio: form.get('envio') },
    autor,
    equipe,
  );
  return concluir(r, anterior, base, (id) => `${base}/${lojaId}/${id}`, 'emitida', 'ja-emitida');
}

export async function executarAbrir(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await abrirEmbalagem(
    cliente,
    alcance,
    lojaId,
    {
      insumo: form.get('insumo'),
      lote: form.get('lote'),
      codigo: form.get('codigo'),
      vencimento: form.get('vencimento'),
      fabricacao: form.get('fabricacao'),
      marca: form.get('marca'),
      conservacao: form.get('conservacao'),
      quanto: form.get('quanto'),
      escala: form.get('escala'),
      envio: form.get('envio'),
    },
    autor,
  );
  return concluir(r, anterior, base, (id) => `${base}/${lojaId}/aberta/${id}`, 'aberta', 'ja-aberta');
}

export async function executarEmitirDaAbertura(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, aberturaId: string, anterior: EstadoEstoque, form: FormData, base: string) {
  const r = await emitirEtiquetaDaAbertura(cliente, alcance, lojaId, aberturaId, { formato: form.get('formato'), quantas: form.get('quantas'), hora: form.get('hora'), envio: form.get('envio') }, autor);
  return concluir(r, anterior, base, (id) => `${base}/${lojaId}/${id}`, 'emitida', 'ja-emitida');
}

export function executarPedir(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, etiquetaId: string, p: PedidoDaTela): Promise<ResultadoDoPedido> {
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return pedirImpressao(cliente, alcance, lojaId, etiquetaId, { copias: texto(p?.copias), transporte: texto(p?.transporte), resolucao: texto(p?.resolucao), envio: texto(p?.envio) }, autor);
}

export function executarResultado(cliente: ClienteDoParceiro, alcance: Alcance, lojaId: string, pedidoId: string, resultado: unknown, erro: unknown): Promise<ResultadoEstoque> {
  return resultadoDaImpressao(cliente, alcance, lojaId, String(pedidoId), { resultado, erro: typeof erro === 'string' ? erro : '' });
}

export function executarConfirmar(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, lojaId: string, etiquetaId: string, base: string): Promise<ResultadoEstoque> {
  return confirmarImpressao(cliente, alcance, lojaId, etiquetaId, autor).then((r) => {
    if (r.ok) revalidatePath(base, 'layout');
    return r;
  });
}

// ================================================================ o lote do fornecedor na nota (Compras)

export async function executarRegistrarLote(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, notaId: string, anterior: EstadoEstoque, form: FormData, baseCompras: string) {
  const r = await registrarLoteDaNota(
    cliente,
    alcance,
    notaId,
    { insumo: form.get('insumo'), codigo: form.get('codigo'), vencimento: form.get('vencimento'), fabricacao: form.get('fabricacao'), marca: form.get('marca'), envio: form.get('envio'), xml: form.get('xml') },
    autor,
  );
  return concluir(r, anterior, baseCompras, () => `${baseCompras}/${notaId}/lotes`, 'lote-registrado', 'lote-ja');
}

export async function executarTirarLote(cliente: ClienteDoParceiro, alcance: Alcance, autor: Autor, notaId: string, anterior: EstadoEstoque, form: FormData, baseCompras: string) {
  const r = await tirarLoteDaNota(cliente, alcance, notaId, form.get('lote'), autor);
  return concluir(r, anterior, baseCompras, () => `${baseCompras}/${notaId}/lotes`, 'lote-tirado', 'lote-ja-tirado');
}
