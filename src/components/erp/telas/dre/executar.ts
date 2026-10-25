/**
 * O miolo das actions do DRE (2.2a), comum ao nível 1 e à pessoa do parceiro:
 * quem chama já resolveu o contexto e conferiu a permissão e o bloqueio. A regra
 * (por loja, com a trava do período) mora em `src/lib/erp/{despesas,plano,periodos}.ts`
 * e confere de novo com o alcance. Aqui só se lê o formulário e se traduz o resultado.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  desfazerPagamento,
  editarDespesa,
  lancarDespesa,
  lancarDoMesPassado,
  pagarDespesa,
  pararDeRepetir,
  removerDespesa,
  type ResultadoDaDespesa,
} from '@/lib/erp/despesas';
import type { TextosDaDespesa } from '@/lib/erp/despesa-campos';
import { criarLinha, ocultarLinha, renomearLinha } from '@/lib/erp/plano';
import { salvarRegra } from '@/lib/erp/periodos';
import { salvarMetas } from '@/lib/erp/dre-metas';
import { salvarMetasPorCategoria } from '@/lib/erp/metas-categorias';
import { fecharPeriodo, reabrirPeriodo } from '@/lib/erp/dre-fechamento';
import { formatarData } from '@/lib/erp/compra-campos';
import type { Alcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { voltaDoRelatorio } from '@/lib/erp/volta';
import type { EstadoCadastro, EstadoLocal, EstadoMesPassado } from './estado';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');
const vezDe = (anterior: { vez: number } | null) => (anterior?.vez ?? 0) + 1;

/** O formulário de despesa (os nomes dos campos são os do `form-despesa.tsx`). */
export function lerTextosDaDespesa(form: FormData): TextosDaDespesa {
  return {
    envio: textoDe(form.get('envio')),
    lojaId: textoDe(form.get('lojaId')),
    linha: textoDe(form.get('linha')),
    descricao: textoDe(form.get('descricao')),
    valor: textoDe(form.get('valor')),
    tipo: textoDe(form.get('tipo')),
    dia: textoDe(form.get('dia')),
    mes: textoDe(form.get('mes')),
    de: textoDe(form.get('de')),
    ate: textoDe(form.get('ate')),
    recorrente: form.get('recorrente') === 'on',
    vencimento: textoDe(form.get('vencimento')),
  };
}

export function recusadoNaDespesa(anterior: EstadoCadastro, motivo: string): EstadoCadastro {
  return { ok: false, erros: { geral: motivo }, vez: vezDe(anterior) };
}

function paraATela(r: Extract<ResultadoDaDespesa, { ok: false }>, anterior: EstadoCadastro): EstadoCadastro {
  return { ok: false, erros: r.erros as Partial<Record<string, string>>, conflito: r.conflito, vez: vezDe(anterior) };
}

/** `raiz` = `/erp` ou `/rodolfo/erp/<slug>`. */
const despesas = (raiz: string) => `${raiz}/dre/despesas`;

/**
 * O caminho de volta que veio no formulário (decisão 474), conferido como o da página: só caminho interno da área. Sai como
 * `&volta=…` para a despesa abrir com o mesmo "voltar" (para a composição da linha, por exemplo).
 */
function comAVolta(form: FormData, raiz: string): string {
  const v = voltaDoRelatorio(textoDe(form.get('volta')), raiz);
  return v ? `&volta=${encodeURIComponent(v.href)}` : '';
}

export async function executarLancarDespesa(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoCadastro, form: FormData, raiz: string): Promise<EstadoCadastro> {
  const r = await lancarDespesa(cliente, alcance, lerTextosDaDespesa(form), autorNome);
  if (!r.ok) return paraATela(r, anterior);
  revalidatePath(raiz, 'layout');
  redirect(`${despesas(raiz)}/${r.id}?feito=${r.jaLancada ? 'ja' : 'lancada'}`);
}

export async function executarEditarDespesa(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, id: string, anterior: EstadoCadastro, form: FormData, raiz: string): Promise<EstadoCadastro> {
  const { envio: _envio, ...resto } = lerTextosDaDespesa(form);
  const r = await editarDespesa(cliente, alcance, id, { ...resto, versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return paraATela(r, anterior);
  revalidatePath(raiz, 'layout');
  redirect(`${despesas(raiz)}/${id}?feito=${r.mudou ? 'salva' : 'igual'}${comAVolta(form, raiz)}`);
}

export async function executarRemoverDespesa(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, id: string, anterior: EstadoCadastro, form: FormData, raiz: string): Promise<EstadoCadastro> {
  const r = await removerDespesa(cliente, alcance, id, { motivo: form.get('motivo'), versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return paraATela(r, anterior);
  revalidatePath(raiz, 'layout');
  redirect(`${despesas(raiz)}?feito=removida`);
}

/** Pagar, desfazer o pagamento e "não repete mais": ficam na tela da despesa. */
export async function executarMudancaSemDre(
  qual: 'pagar' | 'desfazer' | 'parar',
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  autorNome: string,
  id: string,
  anterior: EstadoCadastro,
  form: FormData,
  raiz: string,
): Promise<EstadoCadastro> {
  const versao = textoDe(form.get('versao'));
  const r =
    qual === 'pagar'
      ? await pagarDespesa(cliente, alcance, id, { data: textoDe(form.get('data')), versao }, autorNome)
      : qual === 'desfazer'
        ? await desfazerPagamento(cliente, alcance, id, versao, autorNome)
        : await pararDeRepetir(cliente, alcance, id, versao, autorNome);
  if (!r.ok) return paraATela(r, anterior);
  revalidatePath(raiz, 'layout');
  const feito = !r.mudou ? 'igual' : qual === 'pagar' ? 'paga' : qual === 'desfazer' ? 'nao-paga' : 'nao-repete';
  redirect(`${despesas(raiz)}/${id}?feito=${feito}${comAVolta(form, raiz)}`);
}

export async function executarMesPassado(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoMesPassado, form: FormData, raiz: string): Promise<EstadoMesPassado> {
  const marcados = form.getAll('marcar').map(textoDe).filter(Boolean);
  const itens = marcados.map((origemId) => ({ origemId, valor: textoDe(form.get(`valor_${origemId}`)) }));
  const mes = textoDe(form.get('mes'));
  const r = await lancarDoMesPassado(cliente, alcance, { envio: textoDe(form.get('envio')), mes, itens }, autorNome);
  if (!r.ok) return { ok: false, erro: r.erro, porItem: r.porItem, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  redirect(`${despesas(raiz)}?feito=mes&criadas=${r.criadas}&mes=${mes}`);
}

// ------------------------------------------------------------------ período e plano (ficam na própria tela)

export async function executarRegra(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const r = await salvarRegra(cliente, alcance, { tipo: form.get('tipo'), dia: form.get(`dia_${textoDe(form.get('tipo')).toLowerCase()}`), versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  if (!r.mudou) return { ok: true, mensagem: 'Nada mudou: a regra já era essa.', vez: vezDe(anterior) };
  if (r.voltouAtual) return { ok: true, mensagem: 'A mudança agendada foi cancelada: segue a regra de agora.', vez: vezDe(anterior) };
  return {
    ok: true,
    mensagem: `Regra salva. Ela vale a partir de ${formatarData(r.vigenteDesde!)}; ${r.periodoAtual.nome} segue como está, sem mudar nenhum número.`,
    vez: vezDe(anterior),
  };
}

export async function executarCriarLinha(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const r = await criarLinha(cliente, alcance, { nome: form.get('nome'), grupo: form.get('grupo') }, autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  return { ok: true, mensagem: 'Linha criada.', vez: vezDe(anterior) };
}

export async function executarRenomearLinha(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const r = await renomearLinha(cliente, alcance, { linha: form.get('linha'), nome: form.get('nome'), versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  return { ok: true, mensagem: r.mudou ? 'Nome salvo. As despesas já lançadas mostram o nome novo.' : 'Nada mudou.', vez: vezDe(anterior) };
}

export async function executarOcultarLinha(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const r = await ocultarLinha(cliente, alcance, { linha: form.get('linha'), ocultar: form.get('ocultar') === '1', versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  return { ok: true, mensagem: r.mudou ? (form.get('ocultar') === '1' ? 'Linha oculta.' : 'Linha de volta ao formulário.') : 'Nada mudou.', vez: vezDe(anterior) };
}


// ------------------------------------------------------------------ metas, fechar e reabrir (2.2b)

/** Os campos `meta_<chave>` do formulário das metas: chave da linha → o que a pessoa digitou. */
export async function executarSalvarMetas(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const valores: Record<string, string> = {};
  for (const [campo, v] of form.entries()) if (campo.startsWith('meta_') && typeof v === 'string') valores[campo.slice(5)] = v;
  const r = await salvarMetas(cliente, alcance, { valores, versao: textoDe(form.get('versao')) }, autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  if (r.mudou === 0) return { ok: true, mensagem: 'Nada mudou: as metas já eram essas.', vez: vezDe(anterior) };
  return {
    ok: true,
    mensagem: `${r.mudou === 1 ? '1 meta salva' : `${r.mudou} metas salvas`}. Valem a partir de ${formatarData(r.valeDesde)}; os períodos anteriores seguem com as metas que valiam neles.`,
    vez: vezDe(anterior),
  };
}

/**
 * As metas por categoria (I.2a): os campos `cat_<id>` (a meta de cada categoria), `usa_<id>` com `viu_<id>` (a loja usa? o
 * marcador diz que a categoria estava na tela, porque caixa desmarcada não é enviada), `segue` e, na rede, `total`.
 * `lojaId` vem preso à URL (bind), nunca do formulário; nulo = a rede.
 */
export async function executarSalvarMetasPorCategoria(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, lojaId: string | null, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const campos: Record<string, string> = {};
  const usa: Record<string, boolean> = {};
  for (const [campo, v] of form.entries()) {
    if (campo.startsWith('cat_') && typeof v === 'string') campos[campo.slice(4)] = v;
    if (campo.startsWith('viu_')) usa[campo.slice(4)] = form.get(`usa_${campo.slice(4)}`) === 'on';
  }
  const r = await salvarMetasPorCategoria(cliente, alcance, { lojaId, versao: textoDe(form.get('versao')), total: textoDe(form.get('total')), campos, segue: textoDe(form.get('segue')), ...(lojaId === null ? {} : { usa }) }, autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, conflito: r.conflito, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  const aviso = r.aviso ? ` Confira a divisão: ${r.aviso}.` : '';
  if (r.mudou === 0) return { ok: true, mensagem: `Nada mudou: as metas já eram essas.${aviso}`, vez: vezDe(anterior) };
  return { ok: true, mensagem: `Metas salvas. Valem a partir de ${formatarData(r.valeDesde)}; os períodos anteriores seguem com as metas que valiam neles.${aviso}`, vez: vezDe(anterior) };
}

/** `inicio` vem preso à URL (bind), nunca do formulário. Depois de fechar volta à tela do período. */
export async function executarFechar(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, inicio: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const r = await fecharPeriodo(
    cliente,
    alcance,
    { inicio, ressalvas: form.getAll('ressalva').map(textoDe), justificativa: form.get('justificativa'), impressao: textoDe(form.get('impressao')) },
    autorNome,
  );
  if (!r.ok) return { ok: false, erros: { geral: r.erro, ...(r.erros ?? {}) }, conflito: r.mudou, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  redirect(`${raiz}/dre/periodos/${inicio}?feito=${r.jaFechado ? 'ja-fechado' : 'fechado'}`);
}

export async function executarReabrir(cliente: ClienteDoParceiro, alcance: Alcance, autorNome: string, inicio: string, anterior: EstadoLocal, form: FormData, raiz: string): Promise<EstadoLocal> {
  const r = await reabrirPeriodo(cliente, alcance, { inicio, motivo: form.get('motivo'), fotografia: textoDe(form.get('fotografia')) }, autorNome);
  if (!r.ok) return { ok: false, erros: { geral: r.erro, ...(r.erro.includes('motivo') || r.erro.includes('letras') ? { motivo: r.erro } : {}) }, conflito: r.mudou, vez: vezDe(anterior) };
  revalidatePath(raiz, 'layout');
  redirect(`${raiz}/dre/periodos/${inicio}?feito=reaberto`);
}
