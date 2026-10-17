/**
 * O miolo das actions de faturamento (2.1), comum ao nível 1 e à pessoa do
 * parceiro: quem chama já resolveu o contexto e conferiu a permissão e o
 * bloqueio. A regra (por LOJA, com a trava do período) mora em
 * `src/lib/erp/faturamento.ts`, que recebe o alcance e confere de novo. Aqui só
 * se lê o formulário e se traduz o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { CANAIS_EM_ORDEM } from '@/lib/erp/faturamento-campos';
import {
  importarPlanilha,
  lancarDia,
  previaDaImportacao,
  removerLancamento,
  salvarCanaisDaLoja,
  type EntradaDoCanal,
  type ResultadoDoDia,
} from '@/lib/erp/faturamento';
import { decodificarPlanilha, LIMITE_DA_PLANILHA } from '@/lib/erp/faturamento-planilha';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { EstadoDaImportacao, EstadoDoDia, EstadoDosCanais } from './estado';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const vezDe = (anterior: { vez: number } | null) => (anterior?.vez ?? 0) + 1;

export function recusadoNoDia(anterior: EstadoDoDia, motivo: string): EstadoDoDia {
  return { ok: false, erros: { geral: motivo }, porCanal: {}, vez: vezDe(anterior) };
}

/** FormData → os canais que a tela mostrou (cada um traz a versão que leu, mesmo vazia). */
export function lerEntradaDoDia(form: FormData): EntradaDoCanal[] {
  return CANAIS_EM_ORDEM.filter((c) => form.has(`versao_${c}`)).map((c) => ({
    canal: c,
    valor: textoDe(form.get(`valor_${c}`)),
    pedidos: textoDe(form.get(`pedidos_${c}`)),
    clientes: textoDe(form.get(`clientes_${c}`)),
    naoVendeu: form.get(`naoVendeu_${c}`) === 'on',
    versao: textoDe(form.get(`versao_${c}`)),
  }));
}

function paraATela(r: Extract<ResultadoDoDia, { ok: false }>, anterior: EstadoDoDia): EstadoDoDia {
  return { ok: false, erros: r.erros, porCanal: r.porCanal, conflito: r.conflito, vez: vezDe(anterior) };
}

/** Salva o dia: erro volta ao formulário; sucesso revalida e leva de volta ao dia, com a frase do que aconteceu. */
export async function executarSalvarDia(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  lojaId: string,
  data: string,
  anterior: EstadoDoDia,
  form: FormData,
  base: string,
): Promise<EstadoDoDia> {
  const r = await lancarDia(cliente, alcance, { lojaId, data, canais: lerEntradaDoDia(form) }, autorNome);
  if (!r.ok) return paraATela(r, anterior);
  revalidatePath(base, 'layout');
  const mudou = Object.values(r.canais).some((s) => s === 'criado' || s === 'alterado');
  redirect(`${base}/${lojaId}/${data}?feito=${mudou ? 'salvo' : 'igual'}`);
}

export async function executarRemover(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  lojaId: string,
  data: string,
  canal: string,
  anterior: EstadoDoDia,
  form: FormData,
  base: string,
): Promise<EstadoDoDia> {
  const r = await removerLancamento(cliente, alcance, { lojaId, data, canal, motivo: form.get('motivo'), versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return paraATela(r, anterior);
  revalidatePath(base, 'layout');
  redirect(`${base}/${lojaId}/${data}?feito=removido`);
}

// ------------------------------------------------------------------ planilha

/** Prévia: arquivo → o que vai acontecer. Nada é gravado. */
export async function executarPreviaDoFaturamento(cliente: ClienteDoParceiro, alcance: Alcance, anterior: EstadoDaImportacao, form: FormData): Promise<EstadoDaImportacao> {
  const arquivo = form.get('planilha');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { vez: vezDe(anterior), erro: 'Escolha o arquivo da planilha (CSV).' };
  if (arquivo.size > LIMITE_DA_PLANILHA) return { vez: vezDe(anterior), erro: 'Planilha acima de 256 KB: divida em arquivos menores.' };
  const texto = decodificarPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
  const previa = await previaDaImportacao(cliente, alcance, texto);
  return { vez: vezDe(anterior), previa, texto, arquivo: arquivo.name.slice(0, 120) };
}

/** Confirmar: o MESMO texto da prévia, refeito e gravado numa transação; a impressão da prévia tem de bater. */
export async function executarImportacaoDoFaturamento(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  anterior: EstadoDaImportacao,
  form: FormData,
  base: string,
): Promise<EstadoDaImportacao> {
  const texto = textoDe(form.get('texto'));
  if (!texto || texto.length > LIMITE_DA_PLANILHA) return { vez: vezDe(anterior), erro: 'Envie a planilha de novo para ver a prévia.' };
  const r = await importarPlanilha(cliente, alcance, texto, textoDe(form.get('impressao')), textoDe(form.get('arquivo')), autorNome);
  if (!r.ok) return { vez: vezDe(anterior), erro: r.erro, mudou: r.mudou };
  revalidatePath(base, 'layout');
  const { ok: _ok, ...resultado } = r;
  return { vez: vezDe(anterior), resultado };
}

// ------------------------------------------------------------------ canais da loja

export async function executarCanaisDaLoja(cliente: ClienteDoParceiro, autorNome: string, lojaId: string, anterior: EstadoDosCanais, form: FormData, revalidar: string): Promise<EstadoDosCanais> {
  const escolhidos = CANAIS_EM_ORDEM.filter((c) => form.get(`canal_${c}`) === 'on');
  const lidos = textoDe(form.get('lidos')).split(',').filter(Boolean);
  const r = await salvarCanaisDaLoja(cliente, lojaId, escolhidos, lidos, autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro }, vez: vezDe(anterior) };
  revalidatePath(revalidar, 'layout');
  return { ok: true, mensagem: r.mudou ? 'Canais salvos.' : 'Nada mudou: os canais já eram esses.', vez: vezDe(anterior) };
}
