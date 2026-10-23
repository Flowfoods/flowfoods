/**
 * Consumo e conciliação de estoque (L.4) — a planilha (CSV) e a resposta HTTP dela. Sai do MESMO motor da tela (`consumoCompleto`
 * e `movimentosDoConsumo`), com os mesmos filtros, o mesmo período, as mesmas unidades e os mesmos números; só que SEM página: o que
 * passa do teto não é cortado calado, a resposta é uma recusa em frase.
 *
 * Planilha segura: texto que abre como fórmula (= + - @ tab CR) ganha um apóstrofo na frente (nome de insumo, de loja, motivo do
 * movimento); separador `;` e vírgula decimal (o Excel em português); BOM para o acento abrir certo; números sempre como o sistema
 * formatou. Quantidade na unidade base, com sinal ("-" saiu, sem sinal entrou); dinheiro só para quem vê (mesma regra da tela).
 * Permissão: a MESMA da tela (`estoque.ver`, só nas lojas do acesso); sem sessão 401, sem permissão 403, nada de dado no corpo.
 */

import type { Alcance } from './permissoes';
import { pode } from './permissoes';
import type { ClienteDoParceiro } from './tenant';
import { formatarData, hojeNoRio } from './compra-campos';
import { BOM_DO_CSV, celulaDeTexto } from './compras-relatorio-campos';
import { respostaHttpDaPlanilha, parametrosDaUrl, type RespostaDaPlanilha } from './compras-relatorio-planilha';
import { consumoCompleto, movimentosDoConsumo, resolverRecorteDoConsumo, type LinhaDoConsumo, type MovimentoDoConsumo } from './consumo-estoque';
import {
  BUCKETS,
  LISTA_DE_BUCKETS,
  NOTA_DA_DATA,
  NOTA_DA_TRANSFERENCIA,
  NOTA_DO_AJUSTE,
  NOTA_DO_BRUTO,
  NOTA_DO_USO,
  ROTULO_DO_LINK,
  avisosDoConsumo,
  fraseDoPeriodoDoConsumo,
  lerFiltrosDoConsumo,
  quantidadeParaPlanilha,
  reaisComSinalParaPlanilha,
  somaDeTudo,
  type FiltrosDoConsumo,
} from './consumo-estoque-campos';
import { UNIDADES } from './unidades';

/** Ao exportar, o teto de linhas; ao imprimir, o teto da página. Passou disso a tela diz (nunca corta calada). */
export const TETO_DA_PLANILHA_DO_CONSUMO = 50_000;
export const TETO_DA_IMPRESSAO_DO_CONSUMO = 1_500;

const SEP = ';';
const linha = (celulas: (string | number)[]) => celulas.map((c) => (typeof c === 'number' ? String(c) : c)).join(SEP);
const texto = celulaDeTexto;
const sigla = (u: keyof typeof UNIDADES) => UNIDADES[u].sigla;
const SIM_NAO = (b: boolean) => (b ? 'Sim' : 'Não');

function cabecalho(titulo: string, f: FiltrosDoConsumo, lojas: string[], geradoEm: string, nomes: { insumo?: string; categoria?: string }, verValores: boolean): string[] {
  const filtros = [
    nomes.insumo ? `Insumo: ${nomes.insumo}` : f.q ? `Insumo com “${f.q}” no nome ou na marca` : '',
    nomes.categoria ? `Categoria (a de hoje no cadastro): ${nomes.categoria}` : '',
    f.so === 'atencao' ? 'Só o que pede atenção (saldo negativo, sem origem ou saldo que não bate)' : '',
    f.so === 'semcontagem' ? 'Só insumos sem contagem aplicada no período' : '',
    f.col ? `Só o que forma: ${ROTULO_DO_LINK[f.col]}` : '',
  ].filter(Boolean);
  return [
    linha([texto('Relatório'), texto(titulo)]),
    linha([texto('Período'), texto(fraseDoPeriodoDoConsumo(f))]),
    linha([texto('Como a data é lida'), texto(NOTA_DA_DATA)]),
    linha([texto('Lojas'), texto(lojas.join(', '))]),
    linha([texto('Filtros'), texto(filtros.join(' · ') || 'Nenhum')]),
    linha([texto('Gerado em'), texto(geradoEm)]),
    linha([texto('O que é o uso'), texto(NOTA_DO_USO)]),
    linha([texto('Bruto e líquido'), texto(NOTA_DO_BRUTO)]),
    linha([texto('Ajuste de contagem'), texto(NOTA_DO_AJUSTE)]),
    linha([texto('Transferência entre lojas'), texto(NOTA_DA_TRANSFERENCIA)]),
    linha([
      texto('Valores'),
      texto(
        `Quantidade na unidade base de cada linha (kg, L ou un), com sinal: sem sinal entra, "-" sai. Unidades diferentes nunca são somadas. ${
          verValores ? 'Reais (R$) com vírgula decimal, como o livro do estoque gravou na época.' : 'Sem valores em reais: seu acesso não inclui ver compras e notas.'
        }`,
      ),
    ]),
  ];
}

function colunasDasLinhas(verValores: boolean): string[] {
  const buckets = LISTA_DE_BUCKETS.map((b) => `${BUCKETS[b].rotulo} (quantidade)`);
  const colunas = ['Loja', 'Insumo', 'Unidade', 'Saldo inicial (quantidade)', ...buckets, 'Soma dos movimentos (quantidade)', 'Saldo final (quantidade)', 'Confere (inicial + movimentos = final)', 'Saldo guardado hoje (quantidade)', 'Última contagem aplicada', 'Contagem aplicada no período', 'Lacunas'];
  if (verValores) colunas.push('Saldo inicial (R$)', ...LISTA_DE_BUCKETS.map((b) => `${BUCKETS[b].rotulo} (R$)`), 'Saldo final (R$)');
  return colunas;
}

export function linhaDoConsumo(l: LinhaDoConsumo, verValores: boolean): string {
  const soma = somaDeTudo(l.somas);
  const celulas: (string | number)[] = [
    texto(l.loja),
    texto(l.insumo),
    texto(sigla(l.unidade)),
    quantidadeParaPlanilha(l.inicial.q),
    ...LISTA_DE_BUCKETS.map((b) => quantidadeParaPlanilha(l.somas[b]?.q ?? 0)),
    quantidadeParaPlanilha(soma.q),
    quantidadeParaPlanilha(l.final.q),
    SIM_NAO(l.confere),
    quantidadeParaPlanilha(l.saldoGuardado),
    l.ultimaContagemEm ? formatarData(l.ultimaContagemEm) : 'nenhuma',
    SIM_NAO(l.contadoNoPeriodo),
    texto(l.lacunas.map((x) => x.rotulo).join(' | ')),
  ];
  if (verValores) celulas.push(reaisComSinalParaPlanilha(l.inicial.v), ...LISTA_DE_BUCKETS.map((b) => reaisComSinalParaPlanilha(l.somas[b]?.v ?? 0)), reaisComSinalParaPlanilha(l.final.v));
  return linha(celulas);
}

export const COLUNAS_DOS_MOVIMENTOS = ['Quando entrou no livro (dia no Rio)', 'Hora', 'Loja', 'Insumo', 'Unidade', 'Coluna do relatório', 'Quantidade', 'Saldo antes', 'Saldo depois', 'Estorno', 'Origem', 'Sem origem'] as const;

const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
function origemDoMovimento(m: MovimentoDoConsumo): string {
  if (m.requisicaoNumero !== null) return `Requisição #${m.requisicaoNumero}${m.codigoLote ? ` do lote ${m.codigoLote}` : ''}`;
  if (m.codigoLote) return `Lote ${m.codigoLote}`;
  if (m.contagemId) return m.contagemTipo === 'ABERTURA' ? 'Abertura do estoque' : `Contagem${m.contagemTitulo ? ` · ${m.contagemTitulo}` : ''}`;
  if (m.notaId) return 'Nota de compra';
  return m.motivo ?? '';
}

export function linhaDoMovimento(m: MovimentoDoConsumo, verValores: boolean): string {
  const [dia, hora] = DIA_HORA.format(new Date(m.ocorridoEm)).split(', ');
  const celulas: (string | number)[] = [
    dia,
    hora,
    texto(m.loja),
    texto(m.insumo),
    texto(sigla(m.unidade)),
    texto(BUCKETS[m.bucket].rotulo),
    quantidadeParaPlanilha(m.quantidadeMilesimos),
    quantidadeParaPlanilha(m.antesMilesimos),
    quantidadeParaPlanilha(m.depoisMilesimos),
    SIM_NAO(m.estorno),
    texto(origemDoMovimento(m)),
    SIM_NAO(m.semOrigem),
  ];
  if (verValores) celulas.push(reaisComSinalParaPlanilha(m.valorCentavos));
  return linha(celulas);
}

/** A planilha inteira do relatório (as linhas por insumo × loja) ou dos movimentos de um número (`parte=movimentos`, com `col`). */
export async function planilhaDoConsumo(
  cliente: ClienteDoParceiro | null,
  alcance: Alcance | null,
  f: FiltrosDoConsumo,
  opcoes: { parte: 'linhas' | 'movimentos'; agora?: Date; teto?: number },
): Promise<RespostaDaPlanilha> {
  if (!cliente || !alcance) return { ok: false, status: 401, frase: 'Entre no ERP para baixar a planilha.' };
  if (!pode(alcance, 'estoque.ver')) return { ok: false, status: 403, frase: 'Seu acesso não inclui ver o estoque.' };
  if (f.periodoInvalido) return { ok: false, status: 400, frase: f.periodoInvalido };
  const agora = opcoes.agora ?? new Date();
  const teto = opcoes.teto ?? TETO_DA_PLANILHA_DO_CONSUMO;
  const quando = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const periodo = f.de === f.ate ? f.de : `${f.de}_a_${f.ate}`;

  if (opcoes.parte === 'movimentos') {
    if (!f.col) return { ok: false, status: 400, frase: 'Diga qual número abrir (coluna) para baixar os movimentos dele.' };
    const lido = await cliente.transacao(
      async (tx) => {
        const { recorte, lojasDoAcesso } = await resolverRecorteDoConsumo(tx, alcance, f);
        if (!recorte) return null;
        const m = await movimentosDoConsumo(tx, recorte, f.col as NonNullable<typeof f.col>, null, teto);
        return { recorte, m, lojas: lojasDoAcesso.filter((l) => recorte.lojas.includes(l.id)).map((l) => l.nome), insumo: f.insumoId ? (await tx.insumo.findUnique({ where: { id: f.insumoId }, select: { nome: true } }))?.nome : undefined };
      },
      { repetivel: true, timeout: 120_000 },
    );
    if (!lido) return { ok: false, status: 403, frase: 'Nenhuma loja do seu acesso entra neste relatório.' };
    if (lido.m.passouDoTeto) return { ok: false, status: 413, frase: `Este número tem mais de ${teto.toLocaleString('pt-BR')} movimentos e a planilha não corta calada. Reduza o período ou filtre por loja ou insumo.` };
    const vv = lido.recorte.verValores;
    const partes = cabecalho(`Consumo e conciliação de estoque · movimentos de ${ROTULO_DO_LINK[f.col]}`, f, lido.lojas, quando, { insumo: lido.insumo }, vv);
    partes.push('');
    partes.push(linha([...COLUNAS_DOS_MOVIMENTOS, ...(vv ? ['Valor (R$)'] : [])].map((c) => texto(c))));
    for (const m of lido.m.movimentos) partes.push(linhaDoMovimento(m, vv));
    partes.push('');
    partes.push(linha([texto('TOTAIS'), '']));
    partes.push(linha([texto('Movimentos'), lido.m.total]));
    partes.push(linha([texto('Soma da quantidade (só some com uma unidade só)'), quantidadeParaPlanilha(lido.m.somaMilesimos)]));
    if (vv) partes.push(linha([texto('Soma em R$'), reaisComSinalParaPlanilha(lido.m.somaCentavos)]));
    return { ok: true, nome: `consumo-estoque-movimentos-${f.col}-${periodo}.csv`, corpo: BOM_DO_CSV + partes.join('\r\n') + '\r\n' };
  }

  const r = await consumoCompleto(cliente, alcance, f, teto);
  if (!r.recorte || !r.resumo || !r.linhas) return { ok: false, status: 403, frase: 'Nenhuma loja do seu acesso entra neste relatório.' };
  if (r.linhas.passouDoTeto) return { ok: false, status: 413, frase: `Este recorte tem mais de ${teto.toLocaleString('pt-BR')} linhas e a planilha não corta calada. Reduza o período ou filtre por loja ou insumo.` };
  const vv = r.recorte.verValores;
  const nomes = {
    insumo: f.insumoId ? (await cliente.insumo.findUnique({ where: { id: f.insumoId }, select: { nome: true } }))?.nome : undefined,
    categoria: f.categoriaId ? (await cliente.categoriaInsumo.findUnique({ where: { id: f.categoriaId }, select: { nome: true } }))?.nome : undefined,
  };
  const partes = cabecalho('Consumo e conciliação de estoque', f, r.lojasUsadas.map((l) => l.nome), quando, nomes, vv);
  for (const a of avisosDoConsumo({
    de: f.de,
    ate: f.ate,
    hoje: hojeNoRio(agora),
    verValores: vv,
    lojasSemEstoque: r.lojasSemEstoque,
    aguardando: r.aguardando,
    contagensEmAndamento: r.contagensEmAndamento,
    linhas: r.resumo.linhas,
    comLacunaDura: r.resumo.comLacunaDura,
    semContagem: r.resumo.semContagem,
    semValor: r.resumo.semValor,
    movimentosSemOrigem: r.resumo.movimentosSemOrigem,
  })) {
    partes.push(linha([texto('Aviso'), texto(a.texto)]));
  }
  partes.push('');
  partes.push(linha(colunasDasLinhas(vv).map((c) => texto(c))));
  for (const l of r.linhas.linhas) partes.push(linhaDoConsumo(l, vv));
  partes.push('');
  partes.push(linha([texto('TOTAIS POR UNIDADE (kg, L e un nunca se somam)'), '']));
  for (const u of r.resumo.unidades) {
    const un = sigla(u.unidade);
    partes.push(linha([texto(`Unidade ${un}`), texto(`${u.linhas} insumo(s) × loja(s)`)]));
    partes.push(linha([texto(`Saldo inicial (${un})`), quantidadeParaPlanilha(u.inicial.q), ...(vv ? [reaisComSinalParaPlanilha(u.inicial.v)] : [])]));
    for (const b of LISTA_DE_BUCKETS) partes.push(linha([texto(`${BUCKETS[b].rotulo} (${un})`), quantidadeParaPlanilha(u.somas[b]?.q ?? 0), ...(vv ? [reaisComSinalParaPlanilha(u.somas[b]?.v ?? 0)] : [])]));
    partes.push(linha([texto(`Saldo final (${un})`), quantidadeParaPlanilha(u.final.q), ...(vv ? [reaisComSinalParaPlanilha(u.final.v)] : [])]));
    partes.push(linha([texto(`Confere (${un})`), SIM_NAO(u.diferencaMilesimos === 0)]));
  }
  partes.push(linha([texto('Insumos × lojas no relatório'), r.resumo.linhas]));
  partes.push(linha([texto('Com lacuna que pede atenção'), r.resumo.comLacunaDura]));
  partes.push(linha([texto('Sem contagem aplicada no período'), r.resumo.semContagem]));
  partes.push(linha([texto('Movimentos sem origem'), r.resumo.movimentosSemOrigem]));
  return { ok: true, nome: `consumo-estoque-${periodo}.csv`, corpo: BOM_DO_CSV + partes.join('\r\n') + '\r\n' };
}

/** A rota de download das duas árvores: lê os filtros da URL e responde. */
export async function responderPlanilhaDoConsumo(cliente: ClienteDoParceiro | null, alcance: Alcance | null, req: Request): Promise<Response> {
  const params = parametrosDaUrl(new URL(req.url));
  const f = lerFiltrosDoConsumo(params);
  const parte = params.parte === 'movimentos' ? 'movimentos' : 'linhas';
  return respostaHttpDaPlanilha(await planilhaDoConsumo(cliente, alcance, f, { parte }));
}
