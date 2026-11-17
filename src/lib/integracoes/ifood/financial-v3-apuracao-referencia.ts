import { createHash } from 'node:crypto';
import { decimalFinancialEmCentavos } from './financial-dominio';
import { lerRegistrosCsvGzip } from './financial-v3-csv';
import { lerPaginaApresentadaEventosV3 } from './financial-v3-eventos';
import { NumeroJsonFinancial } from './financial-v3-json';
import { lerLiquidacoesV3, type TituloLiquidacaoV3 } from './financial-v3-liquidacoes';
import { diaDoPainelValido, UUID_DO_MERCHANT } from './painel-campos';

export const LIMITE_ARQUIVO_REFERENCIA = 2 * 1024 * 1024;
export const LIMITE_TOTAL_REFERENCIA = 6 * 1024 * 1024;
export const MAX_PAGINAS_REFERENCIA = 20;

export interface PeriodoReferencia { competencia: string; inicio: string; fim: string }
interface ArquivosReferencia { conciliacao: Uint8Array; eventos: Uint8Array[]; liquidacao: Uint8Array }

export class ErroApuracaoReferencia extends Error {}
function recusar(mensagem: string): never { throw new ErroApuracaoReferencia(mensagem); }
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

function merchantDaFonte(valor: unknown) {
  return typeof valor === 'string' && UUID_DO_MERCHANT.test(valor.toLowerCase()) ? valor.toLowerCase() : null;
}

function conferirPeriodo(p: PeriodoReferencia) {
  if (!diaDoPainelValido(p.inicio) || !diaDoPainelValido(p.fim) || p.inicio > p.fim
      || p.inicio.slice(0, 7) !== p.competencia || p.fim.slice(0, 7) !== p.competencia)
    recusar('Selecione a competência e uma apuração inteiramente dentro desse mês.');
}

function dataDoCsv(campo: string) {
  const partes = /^(\d{4}-\d{2}-\d{2}|\d{2}([/-])\d{2}\2\d{4})(?:[ T](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/.exec(campo);
  const data = partes?.[1].replace(/^(\d{2})[/-](\d{2})[/-](\d{4})$/, '$3-$2-$1');
  if (!diaDoPainelValido(data)) recusar('O CSV contém uma data de apuração inválida.');
  return data;
}

function marcarRegistro(vistos: Set<string>, chave: string) {
  if (vistos.has(chave)) recusar('Há registro duplicado nas fontes da apuração. Confira os arquivos selecionados.');
  vistos.add(chave);
}

function novoResumo() {
  return { creditos: 0, debitos: 0, zeradosComImpacto: 0, semImpacto: 0,
    creditosCentavos: 0n, debitosCentavos: 0n, semImpactoCentavos: 0n, distribuicao: new Map<string, number>() };
}

function contar(resumo: ReturnType<typeof novoResumo>, valor: bigint, impacto: boolean) {
  const chave = `${impacto}/${valor}`;
  resumo.distribuicao.set(chave, (resumo.distribuicao.get(chave) ?? 0) + 1);
  if (!impacto) { resumo.semImpacto++; resumo.semImpactoCentavos += valor; }
  else if (valor > 0n) { resumo.creditos++; resumo.creditosCentavos += valor; }
  else if (valor < 0n) { resumo.debitos++; resumo.debitosCentavos += valor; }
  else resumo.zeradosComImpacto++;
}

function totais(resumo: ReturnType<typeof novoResumo>) {
  return {
    creditos: resumo.creditos, debitos: resumo.debitos, semImpacto: resumo.semImpacto, zeradosComImpacto: resumo.zeradosComImpacto,
    creditosCentavos: resumo.creditosCentavos.toString(), debitosCentavos: resumo.debitosCentavos.toString(),
    semImpactoCentavos: resumo.semImpactoCentavos.toString(),
  };
}

async function conferirCsv(bytes: Uint8Array, p: PeriodoReferencia) {
  const obrigatorias = ['loja_id', 'competencia', 'data_apuracao_inicio', 'data_apuracao_fim', 'impacto_no_repasse', 'valor'];
  let colunas: Map<string, number> | undefined, merchant: string | null = null;
  let total = 0, noPeriodo = 0, comImpacto = 0, soma = 0n, outrosComImpacto = 0, outrosCentavos = 0n;
  const resumo = novoResumo();
  const vistos = new Set<string>();
  await lerRegistrosCsvGzip(bytes, campos => {
    if (!colunas) {
      colunas = new Map(campos.map((nome, i) => [nome, i]));
      if (colunas.size !== campos.length || obrigatorias.some(nome => !colunas!.has(nome)))
        recusar('Confira o cabeçalho e as colunas de apuração do CSV de reconciliação.');
      return;
    }
    const indices = colunas;
    const campo = (nome: string) => campos[indices.get(nome)!];
    if (campos.length !== indices.size) recusar('O CSV contém uma linha incompleta.');
    const id = merchantDaFonte(campo('loja_id'));
    if (!id || (merchant && id !== merchant) || campo('competencia') !== p.competencia)
      recusar('A loja ou a competência do arquivo mensal é ausente ou divergente.');
    merchant = id;
    if (indices.has('moeda') && campo('moeda') !== 'BRL') recusar('A moeda do CSV precisa ser BRL.');
    const inicio = dataDoCsv(campo('data_apuracao_inicio')), fim = dataDoCsv(campo('data_apuracao_fim'));
    if (fim < inicio) recusar('O CSV contém uma apuração com datas invertidas.');
    marcarRegistro(vistos, sha256(JSON.stringify(campos)));
    total++;
    const impacto = campo('impacto_no_repasse');
    if (impacto !== 'SIM' && impacto !== 'NAO' && impacto !== 'NÃO') recusar('O impacto no repasse está ausente ou inválido no CSV.');
    const valor = decimalFinancialEmCentavos(campo('valor'));
    if (inicio !== p.inicio || fim !== p.fim) {
      if (impacto === 'SIM') { outrosComImpacto++; outrosCentavos += valor; }
      return;
    }
    noPeriodo++;
    contar(resumo, valor, impacto === 'SIM');
    if (impacto === 'SIM') { comImpacto++; soma += valor; }
  });
  if (!merchant || !noPeriodo) recusar('O arquivo mensal não contém lançamentos para as datas e a competência selecionadas.');
  return { merchant: merchant as string, total, noPeriodo, comImpacto, soma, resumo, outrosComImpacto, outrosCentavos };
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor) || valor instanceof NumeroJsonFinancial)
    recusar('A estrutura da página de eventos está incompleta.');
  return valor as Record<string, unknown>;
}

// A impressão é privada e considera o registro completo, inclusive os campos que não entram no DTO.
function chaveRegistro(registro: Record<string, unknown>) {
  // id do próprio evento/título. Referências ao pedido ou à transação podem se repetir legitimamente.
  if (registro.id != null) {
    if (typeof registro.id !== 'string' || !registro.id || registro.id.trim() !== registro.id)
      recusar('A identificação de um evento ou título está inválida.');
    return sha256('id:' + (merchantDaFonte(registro.id) ?? registro.id));
  }
  return sha256(JSON.stringify(registro, (_chave, valor: unknown) => {
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) return Object.fromEntries(Object.entries(valor).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    return valor;
  }));
}

function textoJson(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function conferirEventos(arquivos: Uint8Array[], merchant: string, p: PeriodoReferencia) {
  const vistos = new Set<string>(), previsoes = new Set<string>();
  const paginas = arquivos.map(bytes => {
    const pagina = lerPaginaApresentadaEventosV3(textoJson(bytes), corpo => {
      if (('merchantId' in corpo && merchantDaFonte(corpo.merchantId) !== merchant)
          || ('competence' in corpo && corpo.competence !== p.competencia)
          || ('beginDate' in corpo && corpo.beginDate !== p.inicio) || ('endDate' in corpo && corpo.endDate !== p.fim)
          || ('currency' in corpo && corpo.currency !== 'BRL')) recusar('A identificação, a moeda ou a janela da página de eventos diverge.');
      for (const bruto of corpo.financialEvents as unknown[]) {
        const evento = objeto(bruto), valor = objeto(evento.amount);
        if (merchantDaFonte(objeto(evento.receiver).merchantId) !== merchant) recusar('O recebedor dos eventos precisa ser a mesma loja indicada no CSV.');
        if ('merchantId' in evento && merchantDaFonte(evento.merchantId) !== merchant) recusar('O evento identifica outra loja de referência.');
        if (('currency' in valor && valor.currency !== 'BRL') || ('currency' in evento && evento.currency !== 'BRL')) recusar('A moeda do evento precisa ser BRL.');
        marcarRegistro(vistos, chaveRegistro(evento));
      }
    });
    return { pagina, hash: sha256(bytes) };
  }).sort((a, b) => a.pagina.page - b.pagina.page);

  let total = 0, comImpacto = 0, soma = 0n;
  const resumo = novoResumo();
  for (const [i, { pagina }] of paginas.entries()) {
    if (pagina.page !== i + 1 || pagina.size !== paginas[0].pagina.size || pagina.hasNextPage !== (i + 1 < paginas.length)
        || !pagina.eventos.length) recusar('Selecione uma vez cada página de eventos, da primeira até a última.');
    for (const evento of pagina.eventos) {
      if (evento.competencia !== p.competencia || evento.periodo?.inicio !== p.inicio || evento.periodo.fim !== p.fim)
        recusar('Os eventos precisam identificar a competência e as datas exatas desta apuração.');
      if (evento.impactoNoRepasse === null || evento.valorCentavos === null) recusar('Há evento sem valor ou indicação de impacto no repasse.');
      total++;
      contar(resumo, evento.valorCentavos, evento.impactoNoRepasse);
      if (evento.impactoNoRepasse) {
        comImpacto++;
        soma += evento.valorCentavos;
        if (evento.repassePrevistoEm) previsoes.add(evento.repassePrevistoEm);
      }
    }
  }
  return { total, comImpacto, soma, resumo, previsoes: [...previsoes].sort(), hashes: paginas.map(pagina => pagina.hash) };
}

function agruparTitulos(titulos: TituloLiquidacaoV3[]) {
  const grupos = new Map<string, { tipo: string; estado: string; data: string | null; quantidade: number; soma: bigint | null }>();
  for (const t of titulos) {
    // Projetar somente vocabulário conhecido. Novos tipos e estados não expõem texto arbitrário da fonte.
    const tipo = t.tipo === 'REPASSE' || t.tipo === 'REPASSE_ANTECIPADO_SEMANAL' ? t.tipo : 'OUTROS';
    const estado = ['SCHEDULED', 'SUCCEED', 'COMPENSATED', 'FAILED'].includes(t.estado ?? '') ? t.estado! : 'NAO_IDENTIFICADO';
    const chave = JSON.stringify([tipo, estado, t.pagamentoEm]);
    const grupo = grupos.get(chave) ?? { tipo, estado, data: t.pagamentoEm, quantidade: 0, soma: 0n as bigint | null };
    grupo.quantidade++;
    grupo.soma = grupo.soma !== null && t.valorCentavos !== null ? grupo.soma + t.valorCentavos : null;
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].map(({ soma, ...grupo }) => ({ ...grupo, centavos: soma?.toString() ?? null }));
}

function conferirLiquidacao(bytes: Uint8Array, merchantId: string, p: PeriodoReferencia) {
  const vistos = new Set<string>();
  function conferirIdentidade(item: Readonly<Record<string, unknown>>) {
    if (('merchantId' in item && merchantDaFonte(item.merchantId) !== merchantId)
        || ('currency' in item && item.currency !== 'BRL')) recusar('A liquidação identifica outra loja ou moeda.');
  }
  const envelope = lerLiquidacoesV3(textoJson(bytes), { merchantId, inicio: p.inicio, fim: p.fim }, corpo => {
    conferirIdentidade(corpo);
    for (const bruto of corpo.settlements as unknown[]) {
      const item = objeto(bruto);
      conferirIdentidade(item);
      for (const titulo of Array.isArray(item.closingItems) ? item.closingItems.map(objeto) : [item]) {
        conferirIdentidade(titulo);
        marcarRegistro(vistos, chaveRegistro(titulo));
      }
    }
  });
  if (envelope.consolidacao === 'OUTROS_MERCHANTS') recusar('A liquidação inclui outras lojas na consolidação.');
  const titulos = envelope.lancamentos.flatMap(l => {
    if (l.natureza === 'TITULO') return [l];
    if (l.inicioApuracao !== p.inicio || l.fimApuracao !== p.fim) recusar('O grupo de liquidação identifica outra apuração.');
    return l.itens;
  });
  return { saldo: envelope.saldoCentavos, situacao: { titulos: titulos.length, grupos: agruparTitulos(titulos) } };
}

export async function apurarReferenciaFinancial(periodo: PeriodoReferencia, arquivos: ArquivosReferencia) {
  conferirPeriodo(periodo);
  if (!arquivos.eventos.length || arquivos.eventos.length > MAX_PAGINAS_REFERENCIA) recusar('Selecione as páginas de eventos da apuração.');
  const entradas = [arquivos.conciliacao, ...arquivos.eventos, arquivos.liquidacao];
  if (entradas.some(a => !(a instanceof Uint8Array) || !a.byteLength || a.byteLength > LIMITE_ARQUIVO_REFERENCIA)
      || entradas.reduce((n, a) => n + a.byteLength, 0) > LIMITE_TOTAL_REFERENCIA) recusar('Confira a presença e o tamanho dos arquivos.');
  let fonte = 'CSV de reconciliação';
  try {
    const csv = await conferirCsv(arquivos.conciliacao, periodo);
    fonte = 'Financial Events';
    const eventos = conferirEventos(arquivos.eventos, csv.merchant, periodo);
    fonte = 'Settlements';
    const liquidacao = conferirLiquidacao(arquivos.liquidacao, csv.merchant, periodo);
    const a = csv.resumo.distribuicao, b = eventos.resumo.distribuicao;
    const mesmaComposicao = a.size === b.size && [...a].every(([chave, n]) => b.get(chave) === n);
    const saldosIguais = csv.soma === eventos.soma && eventos.soma === liquidacao.saldo;
    return {
      periodo, conferidoEm: new Date().toISOString(), cobertura: 'APURACAO_SELECIONADA' as const, unidadeDeApresentacao: 'BRL' as const,
      fechamentoMensal: 'NAO_COMPROVADO' as const, creditoBancario: 'NAO_COMPROVADO' as const, mesmaComposicao, saldosIguais,
      arquivo: { linhas: csv.total, naApuracao: csv.noPeriodo, comImpacto: csv.comImpacto, totais: totais(csv.resumo),
        outrosComImpacto: csv.outrosComImpacto, outrosCentavos: csv.outrosCentavos.toString(), sha256: sha256(arquivos.conciliacao) },
      eventos: { naApuracao: eventos.total, comImpacto: eventos.comImpacto, totais: totais(eventos.resumo),
        previsoes: eventos.previsoes, paginasSha256: eventos.hashes },
      liquidacao: { ...liquidacao.situacao, sha256: sha256(arquivos.liquidacao) },
      somas: { arquivoCentavos: csv.soma.toString(), eventosCentavos: eventos.soma.toString(), liquidacaoCentavos: liquidacao.saldo.toString() },
    };
  } catch (erro) {
    if (erro instanceof ErroApuracaoReferencia) throw erro;
    recusar(`Não foi possível conferir ${fonte}. Revise formato, campos, loja, apuração e valores em centavos.`);
  }
}

export type ApuracaoReferenciaFinancial = Awaited<ReturnType<typeof apurarReferenciaFinancial>>;
