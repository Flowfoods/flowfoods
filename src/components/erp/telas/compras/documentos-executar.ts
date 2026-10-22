/**
 * O miolo das actions das notas recebidas por XML (F.1b), comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o contexto
 * e conferiu a permissão (`compras.lancar`) e o bloqueio. A regra (por loja, a memória, o lançamento) mora em
 * `src/lib/erp/documentos-fiscais.ts`. Aqui só se lê o formulário e se traduz o resultado em estado ou em redirecionamento.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import {
  cancelarDocumento,
  conciliarDocumento,
  ligarDocumento,
  previaDoDocumento,
  receberXml,
  salvarConferencia,
  type EntradaDaConferencia,
  type ResultadoDoc,
} from '@/lib/erp/documentos-fiscais';
import { LIMITES_DO_XML } from '@/lib/erp/nfe-limites';
import type { EstadoDocumento } from './documentos-estado';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const vezDe = (anterior: EstadoDocumento) => (anterior?.vez ?? 0) + 1;

export function recusadoNoDocumento(anterior: EstadoDocumento, motivo: string): EstadoDocumento {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

/** Falha → estado (a tela mostra no lugar certo); sucesso → revalida e leva ao documento com a frase. */
function concluir(r: ResultadoDoc, anterior: EstadoDocumento, base: string, feito: (r: Extract<ResultadoDoc, { ok: true }>) => string): EstadoDocumento {
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, existenteId: r.existenteId, vez: vezDe(anterior) };
  revalidatePath(base, 'layout');
  redirect(`${base}/${r.id}?feito=${feito(r)}`);
}

/** Receber o arquivo. O tamanho é conferido ANTES de ler os bytes (arquivo gigante nem entra na memória). */
export async function executarImportacao(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoDocumento, form: FormData, base: string): Promise<EstadoDocumento> {
  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erros: { arquivo: 'Escolha o arquivo XML da nota.' }, vez: vezDe(anterior) };
  if (arquivo.size > LIMITES_DO_XML.bytes) {
    const kb = Math.ceil(arquivo.size / 1000).toLocaleString('pt-BR');
    return { ok: false, erros: { arquivo: `O arquivo tem ${kb} KB e o limite é 1 MB. Uma NF-e costuma ter poucas dezenas de KB: confira se é o XML da nota (e não um arquivo compactado ou outra coisa).` }, vez: vezDe(anterior) };
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const r = await receberXml(cliente, alcance, bytes, autorNome);
  return concluir(r, anterior, base, (x) => (x.repetido ? 'ja-recebida' : 'recebida'));
}

/** O formulário da conferência → a entrada do serviço (itens na ordem da tela). */
export function lerEntradaDaConferencia(form: FormData): EntradaDaConferencia {
  const nItens = form.getAll('item_n').map(textoDe);
  const insumos = form.getAll('item_insumo').map(textoDe);
  const embalagens = form.getAll('item_embalagem').map(textoDe);
  const fatores = form.getAll('item_fator').map(textoDe);
  return {
    versao: textoDe(form.get('versao')),
    lojaId: textoDe(form.get('lojaId')),
    fornecedorId: textoDe(form.get('fornecedorId')),
    data: textoDe(form.get('data')),
    outraNota: form.get('outraNota') === 'on',
    itens: nItens.map((n, i) => ({ nItem: Number(n), insumoId: insumos[i] ?? '', embalagem: embalagens[i] ?? '', fator: fatores[i] ?? '' })).filter((i) => Number.isInteger(i.nItem) && i.nItem > 0),
  };
}

/**
 * Salvar, conferir o impacto, conciliar ou ligar à nota já lançada, conforme o botão (`intencao`; o botão "Ligar" manda `ligar` com o
 * id da nota). `conferir` só calcula a prévia; nenhuma outra coisa grava sem a pessoa ter apertado o botão dela.
 */
export async function executarConferencia(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  documentoId: string,
  anterior: EstadoDocumento,
  form: FormData,
  base: string,
): Promise<EstadoDocumento> {
  const entrada = lerEntradaDaConferencia(form);
  const ligar = textoDe(form.get('ligar'));
  if (ligar) {
    const r = await ligarDocumento(cliente, alcance, documentoId, ligar, entrada.versao, { lojaId: entrada.lojaId, fornecedorId: entrada.fornecedorId }, autorNome);
    return concluir(r, anterior, base, () => 'ligada');
  }
  const intencao = textoDe(form.get('intencao'));
  if (intencao === 'conferir') {
    const p = await previaDoDocumento(cliente, alcance, documentoId, entrada);
    if (!p.ok) return { ok: false, erros: p.erros, conflito: p.conflito, vez: vezDe(anterior) };
    return { ok: false, erros: {}, previa: p.previa, contas: p.contas, vez: vezDe(anterior) };
  }
  if (intencao === 'conciliar') {
    const r = await conciliarDocumento(cliente, alcance, documentoId, entrada, autorNome);
    return concluir(r, anterior, base, () => 'conciliada');
  }
  const r = await salvarConferencia(cliente, alcance, documentoId, entrada, autorNome);
  return concluir(r, anterior, base, () => 'salva');
}

export async function executarCancelamentoDoDocumento(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  documentoId: string,
  anterior: EstadoDocumento,
  form: FormData,
  base: string,
): Promise<EstadoDocumento> {
  const r = await cancelarDocumento(cliente, alcance, documentoId, textoDe(form.get('versao')), form.get('motivo'), autorNome);
  return concluir(r, anterior, base, () => 'cancelada');
}
