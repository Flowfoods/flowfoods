/**
 * Documento fiscal por XML (F.1b) — receber, conferir, conciliar, ligar e cancelar a NF-e que o fornecedor emitiu, com banco e sem
 * tela. Recebe sempre um `ClienteDoParceiro` (o parceiro da sessão) e o `Alcance` da pessoa.
 *
 * RECEBER não é lançar: ler o XML grava o documento e os itens e NADA MAIS (nenhuma nota de compra, nenhum movimento de estoque,
 * nenhum custo, nenhuma despesa). Quem faz a nota existir é a CONCILIAÇÃO, que chama o MESMO núcleo de lançamento da 1.5
 * (`lancarNotaNaTransacao`): período fechado, estoque, histórico, duplicada, tudo igual ao da nota digitada, numa transação só com
 * a trava do documento. Por isso a nota do XML nunca duplica estoque: a chave de acesso é única por parceiro (no documento) e entre
 * as notas que valem (índice parcial), a conciliação trava o documento (`FOR UPDATE`) e confere a versão, e a nota que já foi
 * lançada à mão se LIGA ao documento sem efeito novo.
 *
 * Permissões (nenhuma nova): ver = `compras.ver` na loja; receber, conferir, conciliar, ligar e cancelar = `compras.lancar` na
 * loja DESTINATÁRIA (a do CNPJ da nota); mudar o que o sistema lembra de um item que já estava lembrado de outro jeito =
 * `fornecedores.editar`. Documento fora do alcance não existe para quem pede (404, sem revelar de quem é).
 */

import { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { ehDeadlock, ehErroDeUnicidade } from './tenant';
import { filtroDeLojas, pode, recusa, type Alcance } from './permissoes';
import { lojasComCompras } from './compras-custo';
import {
  conflitoDoFornecedor,
  dadosDoFormularioDeNota,
  dataDoBanco,
  ID,
  lancarNotaNaTransacao,
  cancelarNotaNaTransacao,
  MENSAGEM_CORRIDA,
  motivoLimpo,
  previaDaNota,
  Recusa,
  travarFornecedores,
  type PreviaDaNota,
} from './compras';
import { documentoAConferir, faltaNoCadastro, formatarData, formatarDocumento, hojeNoRio, retratoDoFornecedor, rotuloDaNota, type DadosFornecedor } from './compra-campos';
import { ErroDeTeto } from './estoque-campos';
import { listarHistorico } from './historico';
import { chaveDoNome } from './categoria-campos';
import { lerNfeXml, type NotaDoXml } from './nfe-xml';
import { travarParaEscrever } from './periodo-trava';
import { formatarDinheiro, formatarQuantidade, type Unidade } from './unidades';
import {
  chaveDaMemoria,
  colunasDaEmbalagem,
  conferirTotalDoDocumento,
  contaDoItem,
  dadosDoFornecedorProvisorio,
  DOCUMENTOS_POR_PAGINA,
  embalagemDaMemoria,
  errosPorItemDoDocumento,
  fatorParaCampo,
  FILTROS_DE_DOCUMENTO_PADRAO,
  lerFator,
  LIMITES_DO_DOCUMENTO,
  montarEntradaDaNota,
  retratoDoDocumento,
  type ConferenciaDoTotal,
  type EntradaMontada,
  type EscolhaDoItem,
  type FiltrosDeDocumento,
} from './documento-fiscal-campos';

// ================================================================ tipos e frases

export type ResultadoDoc =
  | {
      ok: true;
      id: string;
      /** O que mudou (para a frase de volta). */
      mudou: string[];
      /** Receber: o mesmo arquivo já tinha sido recebido (nada foi gravado de novo). */
      repetido?: boolean;
      /** Conciliar ou ligar: a nota de compra. */
      notaId?: string;
    }
  | {
      ok: false;
      erros: Record<string, string>;
      conflito?: boolean;
      naoEncontrado?: boolean;
      /** Receber: o documento que já existe com esta chave (visível para quem tenta). */
      existenteId?: string;
    };

type Recusado = Extract<ResultadoDoc, { ok: false }>;

class RecusaDoc extends Error {
  constructor(readonly resultado: Recusado) {
    super('recusa-documento');
  }
}

export const MENSAGEM_CONFLITO_DOCUMENTO = 'Alguém mexeu nesta nota agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
const NAO_ENCONTRADO = 'Nota recebida não encontrada.';

const SITUACAO_EM_TEXTO: Record<string, string> = {
  RECEBIDO: 'recebida',
  AGUARDANDO_CONFERENCIA: 'aguardando conferência',
  CONCILIADO: 'conciliada',
  CANCELADO: 'cancelada',
  ERRO: 'com erro',
};

/** Os quatro códigos da frase de volta (`?feito=`). */
export type FeitoDoDocumento = 'recebida' | 'ja-recebida' | 'salva' | 'conciliada' | 'ligada' | 'cancelada';

// ================================================================ quem enxerga o quê

/**
 * O filtro de documentos que a pessoa vê (null = nenhum). Documento com loja resolvida: a loja tem de estar no alcance. Documento
 * ainda sem loja (duas lojas com o mesmo CNPJ): quem alcança alguma loja com o CNPJ do destinatário.
 */
async function ondeVisivel(tx: ClienteDoParceiro, alcance: Alcance): Promise<Prisma.DocumentoFiscalWhereInput | null> {
  const lojas = lojasComCompras(alcance);
  if (lojas === null) return null;
  if (lojas === undefined) return {};
  const cnpjs = (await tx.loja.findMany({ where: { id: lojas, cnpj: { not: null } }, select: { cnpj: true } })).map((l) => l.cnpj!);
  return { OR: [{ lojaId: lojas }, { lojaId: null, destinatarioDocumento: { in: cnpjs } }] };
}

/** As lojas onde a pessoa pode LANÇAR e que têm este CNPJ (o destinatário do documento). */
async function lojasDoDestinatario(tx: ClienteDoParceiro, alcance: Alcance, cnpj: string) {
  const lojas = await tx.loja.findMany({
    where: { id: filtroDeLojas(alcance), cnpj },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, ativa: true, cnpj: true },
  });
  return lojas.filter((l) => pode(alcance, 'compras.lancar', { lojaId: l.id }));
}

// ================================================================ receber

const FRASE_ARQUIVO_SEM_PERMISSAO = 'Seu acesso não inclui lançar nota de compra, que é o que receber uma nota fiscal pede.';

/**
 * Lê o XML e GRAVA o documento fiscal (e os itens, já resolvidos pela memória do fornecedor quando ela conhece o código e a unidade).
 * Não lança nota, não mexe em estoque nem em custo. O mesmo arquivo de novo devolve o documento que já existe; a mesma chave com
 * outro conteúdo é recusada.
 */
export async function receberXml(cliente: ClienteDoParceiro, alcance: Alcance, bytes: Uint8Array, autorNome = 'Sistema'): Promise<ResultadoDoc> {
  if (!pode(alcance, 'compras.lancar')) return { ok: false, erros: { arquivo: FRASE_ARQUIVO_SEM_PERMISSAO } };
  const lido = lerNfeXml(bytes);
  if (!lido.ok) return { ok: false, erros: { arquivo: lido.erro } };
  const { nota, sha256, texto } = lido;
  try {
    return await cliente.transacao((tx) => gravarRecebido(tx, alcance, nota, sha256, texto, autorNome));
  } catch (e) {
    if (e instanceof RecusaDoc) return e.resultado;
    if (ehErroDeUnicidade(e)) {
      // Cinco abas ao mesmo tempo: a segunda esbarrou na chave. Relê e responde como "já recebido".
      const r = await cliente.transacao((tx) => responderSeJaRecebida(tx, alcance, nota.chaveAcesso, sha256));
      if (r) return r;
    }
    throw e;
  }
}

/** A chave já existe? Mesmo arquivo = "já recebido" (com o link, se a pessoa pode ver); outro conteúdo = recusa. Null = não existe. */
async function responderSeJaRecebida(tx: ClienteDoParceiro, alcance: Alcance, chave: string, sha: string): Promise<ResultadoDoc | null> {
  const ja = await tx.documentoFiscal.findFirst({ where: { chaveAcesso: chave }, select: { id: true, xmlSha256: true, lojaId: true, destinatarioDocumento: true, criadoEm: true } });
  if (!ja) return null;
  const onde = await ondeVisivel(tx, alcance);
  const visivel = onde !== null && (await tx.documentoFiscal.count({ where: { id: ja.id, ...onde } })) > 0;
  const quando = formatarData(ja.criadoEm.toISOString().slice(0, 10));
  if (ja.xmlSha256 === sha) {
    return visivel
      ? { ok: true, id: ja.id, mudou: [], repetido: true }
      : { ok: false, erros: { arquivo: `Esta nota já foi recebida em ${quando} por outra loja. Nada foi gravado de novo.` } };
  }
  return {
    ok: false,
    erros: {
      arquivo: `Esta nota (a mesma chave de acesso) já foi recebida em ${quando}, mas com OUTRO conteúdo. Uma nota recebida não é trocada. Se o fornecedor reemitiu, peça a nota nova; nada foi gravado.`,
    },
    ...(visivel ? { existenteId: ja.id } : {}),
  };
}

type Memoria = { id: string; fornecedorId: string; codigoProduto: string; unidadeComercial: string; insumoId: string; varianteId: string | null; aGranel: boolean; fatorMilesimos: number };

async function gravarRecebido(tx: ClienteDoParceiro, alcance: Alcance, nota: NotaDoXml, sha: string, xml: string, autorNome: string): Promise<ResultadoDoc> {
  // Dois envios da mesma nota esperam um ao outro: o segundo já enxerga o primeiro.
  await tx.sql`SELECT 1 AS "ok" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ff:documento-fiscal:${tx.parceiroId}:${nota.chaveAcesso}`}, 0))) AS "trava"`;
  const ja = await responderSeJaRecebida(tx, alcance, nota.chaveAcesso, sha);
  if (ja) return ja;

  // O destinatário: a loja do CNPJ, entre as lojas em que a pessoa lança.
  const dest = nota.destinatarioDocumento;
  const doAlcance = await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, ativa: true, cnpj: true } });
  const minhas = doAlcance.filter((l) => pode(alcance, 'compras.lancar', { lojaId: l.id }));
  const donas = minhas.filter((l) => l.cnpj === dest);
  const ativas = donas.filter((l) => l.ativa);
  if (nota.emitente.documento === dest) {
    throw new RecusaDoc({ ok: false, erros: { arquivo: 'O emitente e o destinatário desta nota são o mesmo CNPJ (transferência ou devolução da própria loja). Ela não entra como compra.' } });
  }
  if (donas.length === 0) {
    const semCnpj = minhas.filter((l) => !l.cnpj);
    throw new RecusaDoc({
      ok: false,
      erros: {
        arquivo:
          semCnpj.length > 0
            ? `Nenhuma loja sua tem o CNPJ ${formatarDocumento(dest)}, que é o desta nota. Cadastre o CNPJ da loja (em Lojas) e envie o arquivo de novo. Lojas ainda sem CNPJ: ${semCnpj.map((l) => l.nome).join(', ')}.`
            : `Esta nota é para o CNPJ ${formatarDocumento(dest)}, que não é de nenhuma loja sua. Nada foi gravado.`,
      },
    });
  }
  if (ativas.length === 0) {
    throw new RecusaDoc({ ok: false, erros: { arquivo: `A loja “${donas[0].nome}”, dona do CNPJ ${formatarDocumento(dest)}, está desativada. Reative a loja e envie o arquivo de novo.` } });
  }
  // Compra de uma loja do próprio grupo (transferência): outro assunto, que a F.1b não trata.
  const doGrupo = await tx.loja.findFirst({ where: { cnpj: nota.emitente.documento }, select: { nome: true } });
  if (doGrupo) {
    throw new RecusaDoc({ ok: false, erros: { arquivo: `O emitente desta nota é o CNPJ da loja “${doGrupo.nome}”: é transferência entre lojas do grupo, não compra de fornecedor. Ela não entra por aqui.` } });
  }

  // O emitente: o fornecedor ativo com este CNPJ; nenhum cadastro = provisório "a completar"; dois ativos = a pessoa escolhe.
  const comDocumento = await tx.fornecedor.findMany({
    where: { documento: nota.emitente.documento },
    orderBy: [{ ativo: 'desc' }, { criadoEm: 'asc' }],
    select: { id: true, nome: true, ativo: true, semNotaFiscal: true },
  });
  const aptos = comDocumento.filter((f) => f.ativo && !f.semNotaFiscal);
  let fornecedorId: string | null = null;
  let criouProvisorio = false;
  if (aptos.length === 1) fornecedorId = aptos[0].id;
  else if (aptos.length > 1) fornecedorId = null;
  else if (comDocumento.length > 0) {
    const f = comDocumento[0];
    throw new RecusaDoc({
      ok: false,
      erros: {
        arquivo: f.semNotaFiscal
          ? `O cadastro “${f.nome}” tem o CNPJ ${formatarDocumento(nota.emitente.documento)} e está marcado como “Compras sem nota fiscal”, que nunca recebe nota fiscal. Tire a marca no cadastro dele (em Fornecedores) e envie o arquivo de novo.`
          : `O fornecedor “${f.nome}” (CNPJ ${formatarDocumento(nota.emitente.documento)}) está desativado. Reative em Fornecedores e envie o arquivo de novo.`,
      },
    });
  } else {
    fornecedorId = await criarFornecedorProvisorio(tx, nota, autorNome);
    criouProvisorio = true;
  }

  // Os itens que o sistema já conhece (memória do fornecedor).
  const lembrados = fornecedorId ? await memoriaUtilizavel(tx, fornecedorId, nota.itens) : new Map<string, Memoria>();

  const lojaId = ativas.length === 1 ? ativas[0].id : null;
  const doc = await tx.documentoFiscal.create({
    data: {
      parceiroId: tx.parceiroId,
      chaveAcesso: nota.chaveAcesso,
      modelo: 55,
      serie: nota.serie,
      numero: nota.numero,
      emitidaEm: dataDoBanco(nota.emitidaEm),
      emitenteDocumento: nota.emitente.documento,
      emitenteRazao: nota.emitente.razao,
      emitenteFantasia: nota.emitente.fantasia,
      emitenteIe: nota.emitente.inscricaoEstadual,
      emitenteUf: nota.emitente.uf,
      emitenteMunicipio: nota.emitente.municipio,
      emitenteEndereco: nota.emitente.endereco,
      emitenteCep: nota.emitente.cep,
      destinatarioDocumento: dest,
      lojaId,
      fornecedorId,
      vProdCentavos: nota.totais.vProdCentavos,
      vDescCentavos: nota.totais.vDescCentavos,
      vFreteCentavos: nota.totais.vFreteCentavos,
      vSegCentavos: nota.totais.vSegCentavos,
      vOutroCentavos: nota.totais.vOutroCentavos,
      vIpiCentavos: nota.totais.vIpiCentavos,
      vStCentavos: nota.totais.vStCentavos,
      vNfCentavos: nota.totais.vNfCentavos,
      duplicatas: nota.duplicatas.length > 0 ? (nota.duplicatas as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      situacao: 'AGUARDANDO_CONFERENCIA',
      origem: 'XML_MANUAL',
      xmlSha256: sha,
      xml,
      criadoPorNome: autorNome,
    },
    select: { id: true },
  });
  await tx.documentoFiscalItem.createMany({
    data: nota.itens.map((i) => {
      const m = lembrados.get(chaveDoItem(i.codigoProduto, i.unidadeComercial));
      return {
        parceiroId: tx.parceiroId,
        documentoId: doc.id,
        nItem: i.nItem,
        codigoProduto: i.codigoProduto,
        gtin: i.gtin,
        descricao: i.descricao,
        ncm: i.ncm,
        cfop: i.cfop,
        unidadeComercial: i.unidadeComercial,
        qComTexto: i.qComTexto,
        qComMilesimos: i.qComMilesimos,
        vProdCentavos: i.vProdCentavos,
        vDescCentavos: i.vDescCentavos,
        vOutroCentavos: i.vOutroCentavos,
        vSegCentavos: i.vSegCentavos,
        vIpiCentavos: i.vIpiCentavos,
        vStCentavos: i.vStCentavos,
        vFreteCentavos: i.vFreteCentavos,
        liquidoCentavos: i.liquidoCentavos,
        ...(m ? { insumoId: m.insumoId, varianteId: m.varianteId, aGranel: m.aGranel, fatorMilesimos: m.fatorMilesimos, vinculoId: m.id } : {}),
      };
    }),
  });
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'DocumentoFiscal',
      entidadeId: doc.id,
      acao: 'CRIOU',
      depois: {
        ...retratoDoDocumento({
          numero: nota.numero,
          serie: nota.serie,
          emitente: nota.emitente.fantasia ?? nota.emitente.razao,
          loja: lojaId ? (ativas.find((l) => l.id === lojaId)?.nome ?? null) : null,
          situacao: 'aguardando conferência',
        }),
        chaveDeAcesso: nota.chaveAcesso,
        itensVinculados: `${lembrados.size} de ${nota.itens.length}`,
        ...(criouProvisorio ? { fornecedor: 'cadastro provisório criado com os dados da nota' } : {}),
      },
      autorNome,
    },
  });
  return { ok: true, id: doc.id, mudou: [] };
}

const chaveDoItem = (codigo: string, unidade: string) => {
  const k = chaveDaMemoria(codigo, unidade);
  return `${k.codigoProduto}|${k.unidadeComercial}`;
};

async function criarFornecedorProvisorio(tx: ClienteDoParceiro, nota: NotaDoXml, autorNome: string): Promise<string> {
  await travarFornecedores(tx);
  const p = dadosDoFornecedorProvisorio(nota.emitente);
  const dados = (nome: string): DadosFornecedor => ({
    nome,
    razaoSocial: p.razaoSocial,
    documento: p.documento,
    inscricaoEstadual: p.inscricaoEstadual,
    endereco: p.endereco,
    municipio: p.municipio,
    uf: p.uf,
    cep: p.cep,
    email: null,
    whatsapp: null,
    contatoComercial: null,
    prazoPagamentoDias: null,
    semNotaFiscal: false,
  });
  // O nome é único (também escrito de outro jeito): se já existe, o provisório leva o CNPJ no nome. Nada se funde.
  let d = dados(p.nome);
  if (await conflitoDoFornecedor(tx, d, null)) {
    const sufixo = ` (${formatarDocumento(nota.emitente.documento)})`;
    d = dados(`${p.nome.slice(0, 80 - sufixo.length)}${sufixo}`);
    if (await conflitoDoFornecedor(tx, d, null)) {
      throw new RecusaDoc({ ok: false, erros: { arquivo: `Já existe um fornecedor com o nome “${p.nome}” e outro CNPJ. Dê um nome diferente a ele em Fornecedores e envie o arquivo de novo.` } });
    }
  }
  const f = await tx.fornecedor.create({
    data: {
      parceiroId: tx.parceiroId,
      nome: d.nome,
      razaoSocial: d.razaoSocial,
      documento: d.documento,
      inscricaoEstadual: d.inscricaoEstadual,
      endereco: d.endereco,
      municipio: d.municipio,
      uf: d.uf,
      cep: d.cep,
      situacaoCadastro: 'A_COMPLETAR',
    },
    select: { id: true },
  });
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'Fornecedor',
      entidadeId: f.id,
      acao: 'CRIOU',
      depois: retratoDoFornecedor({ ...d, situacaoCadastro: 'A_COMPLETAR' }),
      motivo: `Cadastro provisório criado pela nota fiscal ${rotuloDaNota(nota)} (dados do XML). Falta completar.`,
      autorNome,
    },
  });
  return f.id;
}

/** A memória do fornecedor que ainda vale para estes itens: o insumo está ativo, não é pré-preparo, e a embalagem (se há) está ativa. */
async function memoriaUtilizavel(tx: ClienteDoParceiro, fornecedorId: string, itens: readonly { codigoProduto: string; unidadeComercial: string }[]): Promise<Map<string, Memoria>> {
  const codigos = Array.from(new Set(itens.map((i) => chaveDaMemoria(i.codigoProduto, i.unidadeComercial).codigoProduto)));
  const lidas = await tx.vinculoItemFornecedor.findMany({
    where: { fornecedorId, codigoProduto: { in: codigos } },
    select: {
      id: true,
      fornecedorId: true,
      codigoProduto: true,
      unidadeComercial: true,
      insumoId: true,
      varianteId: true,
      aGranel: true,
      fatorMilesimos: true,
      insumo: { select: { ativo: true, fichaQueProduz: { select: { id: true } } } },
      variante: { select: { ativo: true } },
    },
  });
  const out = new Map<string, Memoria>();
  for (const m of lidas) {
    if (!m.insumo.ativo || m.insumo.fichaQueProduz || (m.variante && !m.variante.ativo)) continue;
    out.set(`${m.codigoProduto}|${m.unidadeComercial}`, m);
  }
  return out;
}

// ================================================================ lista

/** Página de documentos nas lojas do alcance. Nunca traz o XML. */
export async function listarDocumentos(cliente: ClienteDoParceiro, alcance: Alcance, filtros: Partial<FiltrosDeDocumento> = {}) {
  const f: FiltrosDeDocumento = { ...FILTROS_DE_DOCUMENTO_PADRAO, ...filtros };
  return cliente.transacao(async (tx) => {
    const visivel = await ondeVisivel(tx, alcance);
    if (visivel === null) return { linhas: [], total: 0, pagina: 1, paginas: 1, naFila: 0, temAlguma: false };
    const doAlcance = filtroDeLojas(alcance);
    const lojaPedida = f.lojaId && doAlcance && !doAlcance.in.includes(f.lojaId) ? { in: [] as string[] } : f.lojaId || undefined;
    const situacao: Prisma.DocumentoFiscalWhereInput =
      f.situacao === 'fila'
        ? { situacao: { in: ['AGUARDANDO_CONFERENCIA', 'RECEBIDO', 'ERRO'] } }
        : f.situacao === 'conciliadas'
          ? { situacao: 'CONCILIADO' }
          : f.situacao === 'canceladas'
            ? { situacao: 'CANCELADO' }
            : {};
    const where: Prisma.DocumentoFiscalWhereInput = {
      AND: [visivel, situacao, ...(lojaPedida ? [{ lojaId: lojaPedida }] : []), ...(f.fornecedorId ? [{ fornecedorId: f.fornecedorId }] : [])],
    };
    const total = await tx.documentoFiscal.count({ where });
    const naFila = await tx.documentoFiscal.count({ where: { AND: [visivel, { situacao: { in: ['AGUARDANDO_CONFERENCIA', 'RECEBIDO', 'ERRO'] } }] } });
    const temAlguma = total > 0 || (await tx.documentoFiscal.count({ where: visivel })) > 0;
    const paginas = Math.max(1, Math.ceil(total / DOCUMENTOS_POR_PAGINA));
    const pagina = Math.min(Math.max(1, f.pagina), paginas);
    const lidas = await tx.documentoFiscal.findMany({
      where,
      orderBy: [{ emitidaEm: 'desc' }, { criadoEm: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * DOCUMENTOS_POR_PAGINA,
      take: DOCUMENTOS_POR_PAGINA,
      select: {
        id: true,
        numero: true,
        serie: true,
        emitidaEm: true,
        emitenteRazao: true,
        emitenteFantasia: true,
        vNfCentavos: true,
        situacao: true,
        lojaId: true,
        fornecedor: { select: { id: true, nome: true } },
        loja: { select: { id: true, nome: true } },
        _count: { select: { itens: true } },
      },
    });
    const vinculados = lidas.length
      ? await tx.documentoFiscalItem.groupBy({ by: ['documentoId'], where: { documentoId: { in: lidas.map((d) => d.id) }, insumoId: { not: null } }, _count: { _all: true } })
      : [];
    const vincPorDoc = new Map(vinculados.map((v) => [v.documentoId, v._count._all]));
    return {
      linhas: lidas.map((d) => ({
        id: d.id,
        rotulo: rotuloDaNota(d),
        emitidaEm: d.emitidaEm.toISOString().slice(0, 10),
        emitente: d.fornecedor?.nome ?? d.emitenteFantasia ?? d.emitenteRazao,
        totalCentavos: d.vNfCentavos,
        situacao: d.situacao,
        loja: d.loja?.nome ?? null,
        itens: d._count.itens,
        vinculados: vincPorDoc.get(d.id) ?? 0,
      })),
      total,
      pagina,
      paginas,
      naFila,
      /** Há alguma nota recebida (em qualquer situação) que a pessoa veja? Sem nenhuma, a tela convida a importar a primeira. */
      temAlguma,
    };
  });
}

export type LinhaDeDocumento = Awaited<ReturnType<typeof listarDocumentos>>['linhas'][number];

/** Os filtros da lista: lojas do alcance e os fornecedores (cadastro da rede, como no filtro das notas de compra). */
export async function opcoesDosFiltrosDeDocumento(cliente: ClienteDoParceiro, alcance: Alcance) {
  return cliente.transacao(async (tx) => ({
    lojas: await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    fornecedores: await tx.fornecedor.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  }));
}

// ================================================================ detalhe

const SELECAO_DO_DOCUMENTO = {
  id: true,
  chaveAcesso: true,
  numero: true,
  serie: true,
  emitidaEm: true,
  emitenteDocumento: true,
  emitenteRazao: true,
  emitenteFantasia: true,
  emitenteIe: true,
  emitenteUf: true,
  emitenteMunicipio: true,
  emitenteEndereco: true,
  emitenteCep: true,
  destinatarioDocumento: true,
  lojaId: true,
  fornecedorId: true,
  vProdCentavos: true,
  vDescCentavos: true,
  vFreteCentavos: true,
  vSegCentavos: true,
  vOutroCentavos: true,
  vIpiCentavos: true,
  vStCentavos: true,
  vNfCentavos: true,
  duplicatas: true,
  situacao: true,
  notaEntradaId: true,
  motivo: true,
  canceladoEm: true,
  criadoEm: true,
  criadoPorNome: true,
  atualizadoEm: true,
  itens: {
    orderBy: { nItem: 'asc' as const },
    select: {
      id: true,
      nItem: true,
      codigoProduto: true,
      gtin: true,
      descricao: true,
      ncm: true,
      cfop: true,
      unidadeComercial: true,
      qComTexto: true,
      qComMilesimos: true,
      vProdCentavos: true,
      vDescCentavos: true,
      vOutroCentavos: true,
      vSegCentavos: true,
      vIpiCentavos: true,
      vStCentavos: true,
      vFreteCentavos: true,
      liquidoCentavos: true,
      insumoId: true,
      varianteId: true,
      aGranel: true,
      fatorMilesimos: true,
      vinculoId: true,
    },
  },
} as const;

type DocumentoLido = Prisma.DocumentoFiscalGetPayload<{ select: typeof SELECAO_DO_DOCUMENTO }>;

/** O documento (sem o XML) que a pessoa vê; `travar`: FOR UPDATE até o fim da transação. */
async function carregarDocumento(tx: ClienteDoParceiro, alcance: Alcance, id: string, travar: boolean): Promise<DocumentoLido | null> {
  if (!ID.test(id)) return null;
  const onde = await ondeVisivel(tx, alcance);
  if (onde === null) return null;
  const visto = await tx.documentoFiscal.findFirst({ where: { id, ...onde }, select: { id: true } });
  if (!visto) return null;
  if (travar) await tx.sql`SELECT 1 FROM "DocumentoFiscal" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR UPDATE`;
  return tx.documentoFiscal.findFirst({ where: { id }, select: SELECAO_DO_DOCUMENTO });
}

/** Notas já lançadas à mão que podem ser este mesmo documento (mesmo número, série igual ou sem série, na loja, sem chave de acesso). */
async function notasParaLigar(tx: ClienteDoParceiro, alcance: Alcance, doc: DocumentoLido, lojaIds: readonly string[]) {
  if (lojaIds.length === 0) return [];
  const notas = await tx.notaEntrada.findMany({
    where: { numero: doc.numero, serie: { in: [doc.serie, ''] }, status: 'LANCADA', chaveAcesso: null, lojaId: { in: [...lojaIds] } },
    orderBy: [{ entradaEm: 'desc' }],
    take: 5,
    select: {
      id: true,
      numero: true,
      serie: true,
      lojaId: true,
      entradaEm: true,
      totalCentavos: true,
      fornecedorId: true,
      fornecedorNomeSnapshot: true,
      loja: { select: { nome: true } },
      fornecedor: { select: { documento: true } },
    },
  });
  return notas
    .filter((n) => pode(alcance, 'compras.lancar', { lojaId: n.lojaId }))
    .map((n) => ({
      id: n.id,
      rotulo: rotuloDaNota(n),
      entradaEm: n.entradaEm.toISOString().slice(0, 10),
      totalCentavos: n.totalCentavos,
      diferencaCentavos: doc.vNfCentavos - n.totalCentavos,
      loja: n.loja.nome,
      fornecedor: n.fornecedorNomeSnapshot ?? '—',
      /** Do fornecedor com o CNPJ do emitente (mesmo havendo dois cadastros com ele): é a mesma nota, sem dúvida; senão, o fornecedor da nota lançada não tem CNPJ e pode ser o mesmo. */
      mesmoFornecedor: !!n.fornecedor?.documento && n.fornecedor.documento === doc.emitenteDocumento,
      fornecedorSemCnpj: !n.fornecedor?.documento,
    }))
    .filter((n) => n.mesmoFornecedor || n.fornecedorSemCnpj);
}

/**
 * Tudo para a tela de conferir (e para ler depois de conciliada): o documento sem o XML, os itens com o que está resolvido, as
 * escolhas pendentes (loja, fornecedor), a conferência do total, a nota que já foi lançada à mão e o histórico. Fora do alcance: null.
 */
export async function obterDocumento(cliente: ClienteDoParceiro, alcance: Alcance, id: string) {
  return cliente.transacao(async (tx) => {
    const d = await carregarDocumento(tx, alcance, id, false);
    if (!d) return null;
    const lojasCandidatas = d.lojaId ? [] : await lojasDoDestinatario(tx, alcance, d.destinatarioDocumento);
    const fornecedoresCandidatos = d.fornecedorId
      ? []
      : await tx.fornecedor.findMany({ where: { documento: d.emitenteDocumento, ativo: true, semNotaFiscal: false }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } });
    const loja = d.lojaId ? await tx.loja.findFirst({ where: { id: d.lojaId }, select: { id: true, nome: true } }) : null;
    const fornecedor = d.fornecedorId
      ? await tx.fornecedor.findFirst({ where: { id: d.fornecedorId }, select: { id: true, nome: true, situacaoCadastro: true, razaoSocial: true, documento: true, email: true, whatsapp: true, semNotaFiscal: true, ativo: true } })
      : null;
    const insumoIds = Array.from(new Set(d.itens.map((i) => i.insumoId).filter((x): x is string => !!x)));
    const insumos = insumoIds.length
      ? await tx.insumo.findMany({
          where: { id: { in: insumoIds } },
          select: { id: true, nome: true, ativo: true, unidade: true, conteudoMilesimos: true, variantes: { select: { id: true, nome: true, conteudoMilesimos: true, ativo: true } } },
        })
      : [];
    const porInsumo = new Map(insumos.map((i) => [i.id, i]));
    const vinculos = d.fornecedorId
      ? await tx.vinculoItemFornecedor.findMany({ where: { fornecedorId: d.fornecedorId, codigoProduto: { in: Array.from(new Set(d.itens.map((i) => chaveDaMemoria(i.codigoProduto, i.unidadeComercial).codigoProduto))) } } })
      : [];
    const memoriaPorChave = new Map(vinculos.map((v) => [`${v.codigoProduto}|${v.unidadeComercial}`, v]));

    // Sugestão pelo código de barras: só vale se um único insumo ativo tem uma embalagem com esse GTIN. A pessoa confirma.
    const gtins = Array.from(new Set(d.itens.filter((i) => !i.insumoId && i.gtin).map((i) => i.gtin!)));
    const porGtin = new Map<string, { insumoId: string; insumoNome: string; varianteId: string; varianteNome: string }>();
    if (gtins.length) {
      const achadas = await tx.insumoVariante.findMany({
        where: { codigoBarras: { in: gtins }, ativo: true, insumo: { ativo: true, fichaQueProduz: { is: null } } },
        select: { id: true, nome: true, codigoBarras: true, insumo: { select: { id: true, nome: true } } },
      });
      const contagem = new Map<string, number>();
      for (const a of achadas) contagem.set(a.codigoBarras!, (contagem.get(a.codigoBarras!) ?? 0) + 1);
      for (const a of achadas) if (contagem.get(a.codigoBarras!) === 1) porGtin.set(a.codigoBarras!, { insumoId: a.insumo.id, insumoNome: a.insumo.nome, varianteId: a.id, varianteNome: a.nome });
    }

    const itens = d.itens.map((i) => {
      const ins = i.insumoId ? porInsumo.get(i.insumoId) : undefined;
      const variante = ins && i.varianteId ? ins.variantes.find((v) => v.id === i.varianteId) : undefined;
      const conteudo = i.aGranel ? 1000 : variante ? variante.conteudoMilesimos : (ins?.conteudoMilesimos ?? 0);
      const conta = ins && i.fatorMilesimos ? contaDoItem({ qComMilesimos: i.qComMilesimos, unidadeComercial: i.unidadeComercial, fatorMilesimos: i.fatorMilesimos }, { conteudoMilesimos: conteudo, unidade: ins.unidade }) : null;
      const memoria = memoriaPorChave.get(chaveDoItem(i.codigoProduto, i.unidadeComercial)) ?? null;
      return {
        id: i.id,
        nItem: i.nItem,
        codigoProduto: i.codigoProduto,
        gtin: i.gtin,
        descricao: i.descricao,
        ncm: i.ncm,
        unidadeComercial: i.unidadeComercial,
        qComMilesimos: i.qComMilesimos,
        valorCentavos: i.vProdCentavos,
        descontoCentavos: i.vDescCentavos,
        liquidoCentavos: i.liquidoCentavos,
        outrosCentavos: i.vOutroCentavos + i.vSegCentavos + i.vIpiCentavos + i.vStCentavos,
        insumoId: i.insumoId,
        insumoNome: ins?.nome ?? null,
        insumoAtivo: ins?.ativo ?? null,
        unidadeDoInsumo: (ins?.unidade ?? null) as Unidade | null,
        embalagem: i.insumoId ? embalagemDaMemoria({ varianteId: i.varianteId, aGranel: i.aGranel }) : '',
        embalagemTexto: !ins ? null : i.aGranel ? `A granel (${ins.unidade === 'UN' ? 'un' : ins.unidade === 'KG' ? 'kg' : 'L'})` : variante ? `${variante.nome} · ${formatarQuantidade(variante.conteudoMilesimos, ins.unidade)}` : `Padrão · ${formatarQuantidade(ins.conteudoMilesimos, ins.unidade)}`,
        fator: i.fatorMilesimos ? fatorParaCampo(i.fatorMilesimos) : '',
        fatorMilesimos: i.fatorMilesimos,
        conta,
        /** De onde veio a escolha: a memória do fornecedor (igual ao que está no item), a pessoa, ou a sugestão do código de barras. */
        origem: !i.insumoId ? (i.gtin && porGtin.has(i.gtin) ? ('sugestao' as const) : null) : i.vinculoId && memoria && memoria.id === i.vinculoId ? ('memoria' as const) : ('escolha' as const),
        sugestao: !i.insumoId && i.gtin ? (porGtin.get(i.gtin) ?? null) : null,
      };
    });

    const conferencia = conferirTotalDoDocumento(d.itens, { vFreteCentavos: d.vFreteCentavos, vNfCentavos: d.vNfCentavos, temAjusteQueNaoLanca: false });
    const lojaIds = d.lojaId ? [d.lojaId] : lojasCandidatas.map((l) => l.id);
    const paraLigar = d.situacao === 'AGUARDANDO_CONFERENCIA' ? await notasParaLigar(tx, alcance, d, lojaIds) : [];
    const nota = d.notaEntradaId
      ? await tx.notaEntrada.findFirst({ where: { id: d.notaEntradaId, lojaId: filtroDeLojas(alcance) }, select: { id: true, numero: true, serie: true, entradaEm: true, totalCentavos: true, origem: true } })
      : null;
    // O provisório criado com os dados da nota: se já existe um "Compras sem nota fiscal" de nome igual, a pessoa pode estar duplicando.
    let parecidoSemNota: { id: string; nome: string } | null = null;
    if (fornecedor?.situacaoCadastro === 'A_COMPLETAR') {
      const nomes = new Set([chaveDoNome(d.emitenteRazao), ...(d.emitenteFantasia ? [chaveDoNome(d.emitenteFantasia)] : [])]);
      const semNota = await tx.fornecedor.findMany({ where: { semNotaFiscal: true, ativo: true }, select: { id: true, nome: true }, take: 500 });
      parecidoSemNota = semNota.find((f) => nomes.has(chaveDoNome(f.nome))) ?? null;
    }
    const historico = await listarHistorico(tx, { de: [{ entidade: 'DocumentoFiscal', ids: [id] }], limite: 10, verPrecos: false });
    return {
      id: d.id,
      rotulo: rotuloDaNota(d),
      numero: d.numero,
      serie: d.serie,
      chaveAcesso: d.chaveAcesso,
      emitidaEm: d.emitidaEm.toISOString().slice(0, 10),
      situacao: d.situacao,
      emitente: {
        documento: d.emitenteDocumento,
        razao: d.emitenteRazao,
        fantasia: d.emitenteFantasia,
        inscricaoEstadual: d.emitenteIe,
        uf: d.emitenteUf,
        municipio: d.emitenteMunicipio,
        endereco: d.emitenteEndereco,
        cep: d.emitenteCep,
      },
      destinatarioDocumento: d.destinatarioDocumento,
      loja,
      lojasCandidatas: lojasCandidatas.map((l) => ({ id: l.id, nome: l.nome })),
      fornecedor: fornecedor ? { ...fornecedor, falta: faltaNoCadastro(fornecedor), documentoAConferir: documentoAConferir(fornecedor.documento) } : null,
      fornecedoresCandidatos,
      parecidoSemNota,
      totais: {
        vProdCentavos: d.vProdCentavos,
        vDescCentavos: d.vDescCentavos,
        vFreteCentavos: d.vFreteCentavos,
        vSegCentavos: d.vSegCentavos,
        vOutroCentavos: d.vOutroCentavos,
        vIpiCentavos: d.vIpiCentavos,
        vStCentavos: d.vStCentavos,
        vNfCentavos: d.vNfCentavos,
      },
      conferencia,
      duplicatas: (Array.isArray(d.duplicatas) ? d.duplicatas : []) as { numero: string; vencimento: string; valorCentavos: number }[],
      itens,
      vinculados: itens.filter((i) => i.insumoId).length,
      notaParaLigar: paraLigar,
      nota: nota ? { id: nota.id, rotulo: rotuloDaNota(nota), entradaEm: nota.entradaEm.toISOString().slice(0, 10), totalCentavos: nota.totalCentavos, diferencaCentavos: d.vNfCentavos - nota.totalCentavos, veioDoXml: nota.origem === 'IMPORTACAO' } : null,
      motivo: d.motivo,
      canceladoEm: d.canceladoEm,
      criadoEm: d.criadoEm,
      criadoPorNome: d.criadoPorNome,
      versao: d.atualizadoEm.toISOString(),
      historico,
    };
  });
}

export type DocumentoDetalhado = NonNullable<Awaited<ReturnType<typeof obterDocumento>>>;
export type ItemDoDocumento = DocumentoDetalhado['itens'][number];

/** Os insumos que o seletor da conferência oferece (os mesmos da nota digitada) e os que o documento já usa. */
export async function opcoesDeInsumosDoDocumento(cliente: ClienteDoParceiro, alcance: Alcance, d: Pick<DocumentoDetalhado, 'itens'>) {
  const ja = d.itens.map((i) => i.insumoId).filter((x): x is string => !!x);
  const f = await dadosDoFormularioDeNota(cliente, alcance, { insumoIds: ja });
  return f.insumos;
}

// ================================================================ conferir, salvar, conciliar, ligar

export interface EntradaDaConferencia {
  versao?: unknown;
  lojaId?: unknown;
  fornecedorId?: unknown;
  /** A data de entrada na loja, como a pessoa digitou (dd/mm/aaaa). */
  data?: unknown;
  itens: EscolhaDoItem[];
  /** "Esta nota não é aquela já lançada": concilia mesmo com uma nota parecida lançada à mão. */
  outraNota?: boolean;
  /** Ligar a uma nota lançada com total DIFERENTE do da nota fiscal: a pessoa viu a diferença e confirmou que é a mesma nota. */
  confirmouDiferenca?: boolean;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

/** Passa o resultado de uma Recusa do lançamento da 1.5 para o formato do documento (itens re-chaveados por número do item). */
function recusaDoLancamento(e: Recusa, itensDaLinha: readonly number[][]): RecusaDoc {
  const r = e.resultado;
  const erros = errosPorItemDoDocumento(r.erros as Record<string, string | undefined>, itensDaLinha);
  return new RecusaDoc({ ok: false, erros, ...(r.conflito ? { conflito: true } : {}), ...(r.naoEncontrado ? { naoEncontrado: true } : {}) });
}

interface Resolvida {
  insumoId: string;
  varianteId: string | null;
  aGranel: boolean;
  fatorMilesimos: number;
  insumoNome: string;
  embalagemTexto: string;
}

/** As escolhas da pessoa conferidas contra o cadastro: insumo ativo e comprável, embalagem do próprio insumo e fator na faixa. */
async function conferirEscolhas(
  tx: ClienteDoParceiro,
  doc: DocumentoLido,
  escolhas: readonly EscolhaDoItem[],
): Promise<{ resolvidas: Map<number, Resolvida>; erros: Record<string, string>; limpar: Set<number> }> {
  const erros: Record<string, string> = {};
  const resolvidas = new Map<number, Resolvida>();
  const limpar = new Set<number>();
  const ids = Array.from(new Set(escolhas.map((e) => e.insumoId).filter((x) => ID.test(x))));
  const insumos = ids.length
    ? await tx.insumo.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, unidade: true, ativo: true, conteudoMilesimos: true, fichaQueProduz: { select: { nome: true } }, variantes: { select: { id: true, nome: true, conteudoMilesimos: true, ativo: true } } },
      })
    : [];
  const porId = new Map(insumos.map((i) => [i.id, i]));
  for (const it of doc.itens) {
    const e = escolhas.find((x) => x.nItem === it.nItem);
    if (!e || !e.insumoId) {
      if (it.insumoId) limpar.add(it.nItem);
      continue;
    }
    const ins = porId.get(e.insumoId);
    const chave = `item-${it.nItem}`;
    if (!ins) {
      erros[chave] = 'Insumo não encontrado neste cadastro.';
      continue;
    }
    if (ins.fichaQueProduz) {
      erros[chave] = `“${ins.nome}” é feito na casa (ficha “${ins.fichaQueProduz.nome}”): não entra em nota de compra.`;
      continue;
    }
    if (!ins.ativo && it.insumoId !== ins.id) {
      erros[chave] = `“${ins.nome}” está desativado: reative em Insumos para comprar.`;
      continue;
    }
    const col = colunasDaEmbalagem(e.embalagem);
    if (!col) {
      erros[chave] = `Embalagem não encontrada em “${ins.nome}”.`;
      continue;
    }
    let embalagemTexto = `Padrão · ${formatarQuantidade(ins.conteudoMilesimos, ins.unidade)}`;
    if (col.aGranel) embalagemTexto = `A granel (${ins.unidade === 'UN' ? 'un' : ins.unidade === 'KG' ? 'kg' : 'L'})`;
    if (col.varianteId) {
      const v = ins.variantes.find((x) => x.id === col.varianteId);
      if (!v) {
        erros[chave] = `Embalagem não encontrada em “${ins.nome}”.`;
        continue;
      }
      if (!v.ativo && it.varianteId !== v.id) {
        erros[chave] = `A embalagem “${v.nome}” de “${ins.nome}” está desativada.`;
        continue;
      }
      embalagemTexto = `${v.nome} · ${formatarQuantidade(v.conteudoMilesimos, ins.unidade)}`;
    }
    const f = lerFator(e.fator, it.unidadeComercial);
    if (!f.ok) {
      erros[`fator-${it.nItem}`] = f.erro;
      continue;
    }
    resolvidas.set(it.nItem, { insumoId: ins.id, varianteId: col.varianteId, aGranel: col.aGranel, fatorMilesimos: f.milesimos, insumoNome: ins.nome, embalagemTexto });
  }
  return { resolvidas, erros, limpar };
}

/** Itens com o mesmo código e a mesma unidade têm de ter a mesma escolha: o sistema lembra UMA por código e unidade. */
function conferirRepetidos(doc: DocumentoLido, resolvidas: ReadonlyMap<number, Resolvida>): Record<string, string> {
  const erros: Record<string, string> = {};
  const primeira = new Map<string, { nItem: number; r: Resolvida }>();
  for (const it of doc.itens) {
    const r = resolvidas.get(it.nItem);
    if (!r) continue;
    const k = chaveDoItem(it.codigoProduto, it.unidadeComercial);
    const p = primeira.get(k);
    if (!p) {
      primeira.set(k, { nItem: it.nItem, r });
      continue;
    }
    if (p.r.insumoId !== r.insumoId || p.r.varianteId !== r.varianteId || p.r.aGranel !== r.aGranel || p.r.fatorMilesimos !== r.fatorMilesimos) {
      erros[`item-${it.nItem}`] = `O mesmo código (${it.codigoProduto}) na mesma unidade aparece no item ${p.nItem} com outra escolha. O sistema lembra uma escolha só por código e unidade: use a mesma nos dois.`;
    }
  }
  return erros;
}

const textoDaMemoria = (m: { insumoNome: string; embalagemTexto: string; fatorMilesimos: number }, uCom: string) =>
  `${m.insumoNome}, ${m.embalagemTexto}, ${fatorParaCampo(m.fatorMilesimos)} por ${uCom}`;

/**
 * Grava a memória do item (fornecedor + código + unidade → insumo, embalagem e fator). Novo: qualquer pessoa que concilia grava.
 * Já lembrado de outro jeito: só `fornecedores.editar` troca, com o antes e o depois no histórico. O que o item já usou em nota
 * conciliada NÃO muda (o item do documento guarda a própria escolha). Devolve o id da memória, ou a frase que impede.
 */
async function gravarMemoria(
  tx: ClienteDoParceiro,
  alcance: Alcance,
  fornecedorId: string,
  fornecedorNome: string,
  item: { codigoProduto: string; unidadeComercial: string },
  r: Resolvida,
  autorNome: string,
): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const k = chaveDaMemoria(item.codigoProduto, item.unidadeComercial);
  const existente = await tx.vinculoItemFornecedor.findFirst({
    where: { fornecedorId, codigoProduto: k.codigoProduto, unidadeComercial: k.unidadeComercial },
    include: { insumo: { select: { nome: true, unidade: true, conteudoMilesimos: true } }, variante: { select: { nome: true, conteudoMilesimos: true } } },
  });
  const nome = `${k.codigoProduto} (${k.unidadeComercial})`;
  if (!existente) {
    const novo = await tx.vinculoItemFornecedor.create({
      data: {
        parceiroId: tx.parceiroId,
        fornecedorId,
        codigoProduto: k.codigoProduto,
        unidadeComercial: k.unidadeComercial,
        insumoId: r.insumoId,
        varianteId: r.varianteId,
        aGranel: r.aGranel,
        fatorMilesimos: r.fatorMilesimos,
        atualizadoPorNome: autorNome,
      },
      select: { id: true },
    });
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'VinculoItemFornecedor',
        entidadeId: novo.id,
        acao: 'CRIOU',
        depois: { nome, fornecedor: fornecedorNome, itemDoFornecedor: textoDaMemoria(r, k.unidadeComercial) },
        autorNome,
      },
    });
    return { ok: true, id: novo.id };
  }
  const igual = existente.insumoId === r.insumoId && existente.varianteId === r.varianteId && existente.aGranel === r.aGranel && existente.fatorMilesimos === r.fatorMilesimos;
  if (igual) return { ok: true, id: existente.id };
  const negado = recusa(alcance, 'fornecedores.editar');
  if (negado) {
    return { ok: false, erro: `O sistema lembra este item de outro jeito (${existente.insumo.nome}, ${fatorParaCampo(existente.fatorMilesimos)} por ${k.unidadeComercial}). Só quem pode editar fornecedores muda o que ele lembra: peça a essa pessoa, ou volte à escolha que o sistema lembra.` };
  }
  const antes = {
    insumo: existente.insumo.nome,
    unidade: existente.unidadeComercial,
    embalagemEscolhida: existente.aGranel ? 'a granel' : existente.variante ? `${existente.variante.nome} · ${formatarQuantidade(existente.variante.conteudoMilesimos, existente.insumo.unidade)}` : `Padrão · ${formatarQuantidade(existente.insumo.conteudoMilesimos, existente.insumo.unidade)}`,
    fatorPorUnidade: fatorParaCampo(existente.fatorMilesimos),
  };
  const depois = { insumo: r.insumoNome, unidade: existente.unidadeComercial, embalagemEscolhida: r.embalagemTexto, fatorPorUnidade: fatorParaCampo(r.fatorMilesimos) };
  await tx.vinculoItemFornecedor.update({
    where: { id: existente.id },
    data: { insumoId: r.insumoId, varianteId: r.varianteId, aGranel: r.aGranel, fatorMilesimos: r.fatorMilesimos, atualizadoPorNome: autorNome },
  });
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'VinculoItemFornecedor',
      entidadeId: existente.id,
      acao: 'ALTEROU',
      antes: { nome, fornecedor: fornecedorNome, ...antes },
      depois: { nome, fornecedor: fornecedorNome, ...depois },
      autorNome,
    },
  });
  return { ok: true, id: existente.id };
}

/** O que impede mexer neste documento agora (null = pode): a frase por situação. */
function frasePorSituacao(situacao: string): string | null {
  if (situacao === 'AGUARDANDO_CONFERENCIA') return null;
  if (situacao === 'CONCILIADO') return 'Esta nota já foi conciliada. Para conciliar de novo, cancele a nota de compra dela.';
  if (situacao === 'CANCELADO') return 'Este documento foi cancelado: não se concilia.';
  return 'Este documento não está pronto para conferir.';
}

/** A trava de leitura-e-escrita de todo caminho que muda o documento: existe para a pessoa, versão certa, aguardando conferência. */
async function abrirParaMudar(tx: ClienteDoParceiro, alcance: Alcance, id: string, versaoTexto: unknown): Promise<DocumentoLido> {
  const doc = await carregarDocumento(tx, alcance, id, true);
  if (!doc) throw new RecusaDoc({ ok: false, erros: { geral: NAO_ENCONTRADO }, naoEncontrado: true });
  const versao = new Date(typeof versaoTexto === 'string' ? versaoTexto : '');
  if (Number.isNaN(versao.getTime()) || versao.getTime() !== doc.atualizadoEm.getTime()) {
    // Antes da versão: um documento que já mudou de situação diz a situação (a frase é mais útil que "alguém mexeu").
    const s = frasePorSituacao(doc.situacao);
    throw new RecusaDoc({ ok: false, erros: { geral: s ?? MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true });
  }
  const s = frasePorSituacao(doc.situacao);
  if (s) throw new RecusaDoc({ ok: false, erros: { geral: s }, conflito: true });
  return doc;
}

/** Loja e fornecedor do documento: os que já tem, ou o que a pessoa escolheu entre os candidatos. */
async function resolverLojaEFornecedor(
  tx: ClienteDoParceiro,
  alcance: Alcance,
  doc: DocumentoLido,
  entrada: EntradaDaConferencia,
): Promise<{ lojaId: string; fornecedorId: string; fornecedorNome: string; lojaNome: string; novos: { lojaId?: string; fornecedorId?: string } }> {
  const erros: Record<string, string> = {};
  let lojaId = doc.lojaId;
  let fornecedorId = doc.fornecedorId;
  const novos: { lojaId?: string; fornecedorId?: string } = {};
  if (!lojaId) {
    const candidatas = await lojasDoDestinatario(tx, alcance, doc.destinatarioDocumento);
    const escolhida = texto(entrada.lojaId);
    const loja = candidatas.find((l) => l.id === escolhida && l.ativa);
    if (!escolhida) erros.lojaId = 'Escolha a loja que recebeu a mercadoria.';
    else if (!loja) erros.lojaId = 'Essa loja não é uma das que têm o CNPJ desta nota, ou não está no seu acesso.';
    else {
      lojaId = loja.id;
      novos.lojaId = loja.id;
    }
  }
  if (!fornecedorId) {
    const candidatos = await tx.fornecedor.findMany({ where: { documento: doc.emitenteDocumento, ativo: true, semNotaFiscal: false }, select: { id: true } });
    const escolhido = texto(entrada.fornecedorId);
    if (!escolhido) erros.fornecedorId = 'Escolha o fornecedor desta nota.';
    else if (!candidatos.some((f) => f.id === escolhido)) erros.fornecedorId = 'Esse fornecedor não tem o CNPJ do emitente desta nota.';
    else {
      fornecedorId = escolhido;
      novos.fornecedorId = escolhido;
    }
  }
  if (Object.keys(erros).length > 0 || !lojaId || !fornecedorId) throw new RecusaDoc({ ok: false, erros });
  const negado = recusa(alcance, 'compras.lancar', { lojaId });
  if (negado) throw new RecusaDoc({ ok: false, erros: { geral: negado } });
  const loja = await tx.loja.findFirst({ where: { id: lojaId }, select: { nome: true } });
  const forn = await tx.fornecedor.findFirst({ where: { id: fornecedorId }, select: { nome: true, ativo: true } });
  if (!forn || !forn.ativo) throw new RecusaDoc({ ok: false, erros: { geral: `O fornecedor${forn ? ` “${forn.nome}”` : ''} está desativado: reative em Fornecedores.` } });
  return { lojaId, fornecedorId, fornecedorNome: forn.nome, lojaNome: loja?.nome ?? 'loja', novos };
}

/** Grava loja/fornecedor (uma vez) e as escolhas dos itens com a memória. Devolve quantos itens ficaram vinculados e se algo mudou. */
async function aplicarEscolhas(
  tx: ClienteDoParceiro,
  alcance: Alcance,
  doc: DocumentoLido,
  r: { fornecedorId: string; fornecedorNome: string; novos: { lojaId?: string; fornecedorId?: string } },
  c: { resolvidas: Map<number, Resolvida>; limpar: Set<number> },
  autorNome: string,
): Promise<{ mudou: boolean; vinculados: number }> {
  let mudou = false;
  if (r.novos.lojaId || r.novos.fornecedorId) {
    await tx.documentoFiscal.update({ where: { id: doc.id }, data: { ...(r.novos.lojaId ? { lojaId: r.novos.lojaId } : {}), ...(r.novos.fornecedorId ? { fornecedorId: r.novos.fornecedorId } : {}) } });
    mudou = true;
  }
  const errosDaMemoria: Record<string, string> = {};
  for (const it of doc.itens) {
    if (c.limpar.has(it.nItem)) {
      await tx.documentoFiscalItem.update({ where: { id: it.id }, data: { insumoId: null, varianteId: null, aGranel: false, fatorMilesimos: null, vinculoId: null } });
      mudou = true;
      continue;
    }
    const res = c.resolvidas.get(it.nItem);
    if (!res) continue;
    const m = await gravarMemoria(tx, alcance, r.fornecedorId, r.fornecedorNome, it, res, autorNome);
    if (!m.ok) {
      errosDaMemoria[`item-${it.nItem}`] = m.erro;
      continue;
    }
    const igual = it.insumoId === res.insumoId && it.varianteId === res.varianteId && it.aGranel === res.aGranel && it.fatorMilesimos === res.fatorMilesimos && it.vinculoId === m.id;
    if (!igual) {
      await tx.documentoFiscalItem.update({
        where: { id: it.id },
        data: { insumoId: res.insumoId, varianteId: res.varianteId, aGranel: res.aGranel, fatorMilesimos: res.fatorMilesimos, vinculoId: m.id },
      });
      mudou = true;
    }
  }
  if (Object.keys(errosDaMemoria).length > 0) throw new RecusaDoc({ ok: false, erros: errosDaMemoria });
  const vinculados = doc.itens.filter((i) => (c.limpar.has(i.nItem) ? false : c.resolvidas.has(i.nItem) || !!i.insumoId)).length;
  return { mudou, vinculados };
}

/**
 * "Salvar o que escolhi": grava a loja/fornecedor (quando havia dúvida), as escolhas dos itens e a memória do fornecedor, SEM
 * conciliar. Item em branco continua pendente. Toca a versão do documento (outra aba que ainda vê a de antes recebe o conflito).
 */
export async function salvarConferencia(cliente: ClienteDoParceiro, alcance: Alcance, id: string, entrada: EntradaDaConferencia, autorNome = 'Sistema'): Promise<ResultadoDoc> {
  try {
    return await cliente.transacao(async (tx) => {
      const doc = await abrirParaMudar(tx, alcance, id, entrada.versao);
      const quem = await resolverLojaEFornecedor(tx, alcance, doc, entrada);
      const c = await conferirEscolhas(tx, doc, entrada.itens);
      const erros = { ...c.erros, ...conferirRepetidos(doc, c.resolvidas) };
      if (Object.keys(erros).length > 0) throw new RecusaDoc({ ok: false, erros });
      const antes = doc.itens.filter((i) => i.insumoId).length;
      const r = await aplicarEscolhas(tx, alcance, doc, quem, c, autorNome);
      if (!r.mudou) return { ok: true as const, id, mudou: [] };
      await tx.documentoFiscal.update({ where: { id }, data: { atualizadoEm: new Date() } });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'DocumentoFiscal',
          entidadeId: id,
          acao: 'ALTEROU',
          antes: { nome: rotuloDaNota(doc), itensVinculados: `${antes} de ${doc.itens.length}` },
          depois: { nome: rotuloDaNota(doc), itensVinculados: `${r.vinculados} de ${doc.itens.length}`, loja: quem.lojaNome },
          autorNome,
        },
      });
      return { ok: true as const, id, mudou: ['itens'] };
    });
  } catch (e) {
    if (e instanceof RecusaDoc) return e.resultado;
    if (ehDeadlock(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true };
    throw e;
  }
}

/** Monta a entrada do lançamento a partir do documento e das escolhas (sem gravar nada). Falta de escolha vira erro no item. */
function montar(doc: DocumentoLido, q: { lojaId: string; fornecedorId: string }, c: Map<number, Resolvida>, entrada: EntradaDaConferencia): EntradaMontada {
  const escolhas: EscolhaDoItem[] = doc.itens
    .map((i): EscolhaDoItem | null => {
      const r = c.get(i.nItem);
      return r ? { nItem: i.nItem, insumoId: r.insumoId, embalagem: r.aGranel ? 'granel' : r.varianteId ? `v:${r.varianteId}` : 'padrao', fator: fatorParaCampo(r.fatorMilesimos) } : null;
    })
    .filter((x): x is EscolhaDoItem => !!x);
  const m = montarEntradaDaNota(
    { lojaId: q.lojaId, fornecedorId: q.fornecedorId, numero: doc.numero, serie: doc.serie, vFreteCentavos: doc.vFreteCentavos, vNfCentavos: doc.vNfCentavos },
    doc.itens,
    escolhas,
    texto(entrada.data),
  );
  if (!m.ok) throw new RecusaDoc({ ok: false, erros: m.erros });
  return m.montada;
}

/** O total do documento fecha? Senão, a frase com a diferença, no lugar de qualquer lançamento. */
function exigirTotalQueFecha(doc: DocumentoLido): ConferenciaDoTotal {
  const conf = conferirTotalDoDocumento(doc.itens, { vFreteCentavos: doc.vFreteCentavos, vNfCentavos: doc.vNfCentavos });
  if (!conf.fecha) throw new RecusaDoc({ ok: false, erros: { total: conf.frase! } });
  return conf;
}

/**
 * "Conferir o impacto": a prévia do que a nota de compra faria (custo dos insumos, fichas, estoque, orçamento), SEM gravar nada.
 * Passa pelas mesmas conferências da conciliação (escolhas completas, total que fecha), menos a memória e a nota.
 */
export async function previaDoDocumento(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  id: string,
  entrada: EntradaDaConferencia,
): Promise<{ ok: true; previa: PreviaDaNota; contas: Record<number, string> } | Recusado> {
  try {
    const montado = await cliente.transacao(async (tx) => {
      const doc = await carregarDocumento(tx, alcance, id, false);
      if (!doc) throw new RecusaDoc({ ok: false, erros: { geral: NAO_ENCONTRADO }, naoEncontrado: true });
      const s = frasePorSituacao(doc.situacao);
      if (s) throw new RecusaDoc({ ok: false, erros: { geral: s }, conflito: true });
      const lojaId = doc.lojaId ?? texto(entrada.lojaId);
      const fornecedorId = doc.fornecedorId ?? texto(entrada.fornecedorId);
      const erros: Record<string, string> = {};
      if (!lojaId) erros.lojaId = 'Escolha a loja que recebeu a mercadoria.';
      else if (!doc.lojaId && !(await lojasDoDestinatario(tx, alcance, doc.destinatarioDocumento)).some((l) => l.id === lojaId)) erros.lojaId = 'Essa loja não é uma das que têm o CNPJ desta nota.';
      if (!fornecedorId) erros.fornecedorId = 'Escolha o fornecedor desta nota.';
      if (Object.keys(erros).length > 0) throw new RecusaDoc({ ok: false, erros });
      const c = await conferirEscolhas(tx, doc, entrada.itens);
      const e = { ...c.erros, ...conferirRepetidos(doc, c.resolvidas) };
      if (Object.keys(e).length > 0) throw new RecusaDoc({ ok: false, erros: e });
      exigirTotalQueFecha(doc);
      const montada = montar(doc, { lojaId, fornecedorId }, c.resolvidas, entrada);
      const contas: Record<number, string> = {};
      for (const it of doc.itens) {
        const r = c.resolvidas.get(it.nItem);
        if (r) contas[it.nItem] = `${r.insumoNome} · ${r.embalagemTexto}`;
      }
      return { montada, contas };
    });
    const p = await previaDaNota(cliente, alcance, montado.montada.entrada);
    if (!p.ok) return { ok: false, erros: errosPorItemDoDocumento(p.erros as Record<string, string | undefined>, montado.montada.itensDaLinha), ...(p.conflito ? { conflito: true } : {}) };
    return { ok: true, previa: p.previa, contas: montado.contas };
  } catch (e) {
    if (e instanceof RecusaDoc) return e.resultado;
    if (ehDeadlock(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true };
    throw e;
  }
}

/**
 * Conciliar = lançar a nota de compra pelo núcleo da 1.5, na MESMA transação em que o documento é travado, as escolhas e a memória
 * são gravadas e o documento vira CONCILIADO com a nota. Qualquer recusa (item sem insumo, total que não fecha, período fechado,
 * nota igual já lançada...) desfaz tudo: o documento fica como estava. Cinco conciliações ao mesmo tempo: uma nota.
 */
export async function conciliarDocumento(cliente: ClienteDoParceiro, alcance: Alcance, id: string, entrada: EntradaDaConferencia, autorNome = 'Sistema'): Promise<ResultadoDoc> {
  let itensDaLinha: readonly number[][] = [];
  try {
    return await cliente.transacao(async (tx) => {
      // 2.2b: a trava compartilhada do período é a primeira coisa (o núcleo de lançar a pede de novo; é a mesma trava).
      await travarParaEscrever(tx);
      const doc = await abrirParaMudar(tx, alcance, id, entrada.versao);
      const quem = await resolverLojaEFornecedor(tx, alcance, doc, entrada);
      const c = await conferirEscolhas(tx, doc, entrada.itens);
      const erros = { ...c.erros, ...conferirRepetidos(doc, c.resolvidas) };
      if (Object.keys(erros).length > 0) throw new RecusaDoc({ ok: false, erros });
      exigirTotalQueFecha(doc);
      const montada = montar(doc, quem, c.resolvidas, entrada);
      itensDaLinha = montada.itensDaLinha;

      // A nota já lançada à mão (mesmo fornecedor: é ela, sem dúvida; fornecedor sem CNPJ: pode ser): nunca a segunda nota nem a segunda entrada no estoque.
      const parecidas = await notasParaLigar(tx, alcance, { ...doc, lojaId: quem.lojaId, fornecedorId: quem.fornecedorId }, [quem.lojaId]);
      const mesma = parecidas.find((n) => n.mesmoFornecedor);
      if (mesma) {
        throw new RecusaDoc({ ok: false, erros: { geral: `A ${mesma.rotulo} já foi lançada à mão em ${formatarData(mesma.entradaEm)}. Ligue o documento a ela (sem lançar de novo) ou cancele aquela nota antes.` } });
      }
      if (parecidas.length > 0 && !entrada.outraNota) {
        throw new RecusaDoc({ ok: false, erros: { geral: `Já existe a ${parecidas[0].rotulo} lançada à mão (fornecedor “${parecidas[0].fornecedor}”, sem CNPJ). Se é a mesma nota, ligue o documento a ela. Se é outra, marque que não é a mesma e concilie de novo.` } });
      }

      await aplicarEscolhas(tx, alcance, doc, quem, c, autorNome);
      let nota: { id: string };
      try {
        nota = await lancarNotaNaTransacao(tx, alcance, montada.entrada, autorNome, { origem: 'IMPORTACAO', chaveAcesso: doc.chaveAcesso, emitidaEm: doc.emitidaEm.toISOString().slice(0, 10), origemRef: doc.id });
      } catch (e) {
        if (e instanceof Recusa) throw recusaDoLancamento(e, itensDaLinha);
        throw e;
      }
      // A versão já foi conferida com o documento travado (`abrirParaMudar`); `aplicarEscolhas` pode ter tocado `atualizadoEm` ao gravar
      // a loja ou o fornecedor escolhidos agora, então a trava final é só pela situação.
      const conciliou = await tx.documentoFiscal.updateMany({
        where: { id, situacao: 'AGUARDANDO_CONFERENCIA' },
        data: { situacao: 'CONCILIADO', notaEntradaId: nota.id },
      });
      if (conciliou.count === 0) throw new RecusaDoc({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'DocumentoFiscal',
          entidadeId: id,
          acao: 'CONCILIOU',
          antes: { nome: rotuloDaNota(doc), situacao: 'aguardando conferência' },
          depois: { nome: rotuloDaNota(doc), situacao: 'conciliada', loja: quem.lojaNome, notaDeCompra: rotuloDaNota(doc), itensVinculados: `${doc.itens.length} de ${doc.itens.length}` },
          autorNome,
        },
      });
      return { ok: true as const, id, mudou: ['situacao'], notaId: nota.id };
    });
  } catch (e) {
    if (e instanceof RecusaDoc) return e.resultado;
    if (ehDeadlock(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true };
    if (e instanceof Recusa) return recusaDoLancamento(e, itensDaLinha).resultado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CORRIDA }, conflito: true };
    throw e;
  }
}

/**
 * "Ligar à nota já lançada": a nota digitada à mão É este documento. Grava a chave de acesso (e a data de emissão) nela e marca o
 * documento como conciliado com ela. NENHUM efeito novo: não cria nota, não mexe no estoque nem no custo. Mostra a diferença de total
 * na tela, mas a decisão é da pessoa. A nota ligada deixa de ser editável (ela é o que o documento diz).
 */
export async function ligarDocumento(cliente: ClienteDoParceiro, alcance: Alcance, id: string, notaId: unknown, versao: unknown, entrada: Pick<EntradaDaConferencia, 'lojaId' | 'fornecedorId' | 'confirmouDiferenca'> = {}, autorNome = 'Sistema'): Promise<ResultadoDoc> {
  try {
    return await cliente.transacao(async (tx) => {
      await travarParaEscrever(tx);
      const doc = await abrirParaMudar(tx, alcance, id, versao);
      if (typeof notaId !== 'string' || !ID.test(notaId)) throw new RecusaDoc({ ok: false, erros: { geral: 'Escolha a nota lançada a que este documento se liga.' } });
      // Loja do documento: a que ele tem, ou a da nota (que tem de ser uma das lojas do CNPJ).
      const nota = await tx.notaEntrada.findFirst({
        where: { id: notaId },
        select: { id: true, numero: true, serie: true, lojaId: true, fornecedorId: true, status: true, chaveAcesso: true, entradaEm: true, totalCentavos: true, atualizadoEm: true, fornecedorNomeSnapshot: true, fornecedor: { select: { documento: true } } },
      });
      const donas = await lojasDoDestinatario(tx, alcance, doc.destinatarioDocumento);
      const lojaOk = nota && (doc.lojaId ? nota.lojaId === doc.lojaId : donas.some((l) => l.id === nota.lojaId));
      if (!nota || !lojaOk || nota.status !== 'LANCADA' || nota.numero !== doc.numero || ![doc.serie, ''].includes(nota.serie)) {
        throw new RecusaDoc({ ok: false, erros: { geral: 'Essa nota não é uma das que podem ser ligadas a este documento (mesmo número, na loja da nota fiscal).' } });
      }
      const negado = recusa(alcance, 'compras.lancar', { lojaId: nota.lojaId });
      if (negado) throw new RecusaDoc({ ok: false, erros: { geral: negado } });
      if (nota.chaveAcesso) throw new RecusaDoc({ ok: false, erros: { geral: 'Essa nota já está ligada a uma nota fiscal.' } });
      // Total diferente: ligar não muda o valor da nota lançada, então a pessoa precisa ter visto a diferença e confirmado.
      if (nota.totalCentavos !== doc.vNfCentavos && !entrada.confirmouDiferenca) {
        const dif = Math.abs(doc.vNfCentavos - nota.totalCentavos);
        throw new RecusaDoc({
          ok: false,
          erros: { geral: `A nota lançada tem ${formatarDinheiro(nota.totalCentavos)} e a nota fiscal diz ${formatarDinheiro(doc.vNfCentavos)}: ${formatarDinheiro(dif)} de diferença. Confirme que é a mesma nota para ligar; o valor da nota lançada não muda.` },
        });
      }
      if (nota.fornecedor?.documento && nota.fornecedor.documento !== doc.emitenteDocumento) {
        throw new RecusaDoc({ ok: false, erros: { geral: 'O fornecedor dessa nota tem outro CNPJ: não é o emitente deste documento.' } });
      }
      // O fornecedor do documento: o que já tem; ou, havendo dúvida (dois cadastros com o mesmo CNPJ), o da nota lançada se for um deles.
      let fornecedorId = doc.fornecedorId;
      if (!fornecedorId) {
        const candidatos = await tx.fornecedor.findMany({ where: { documento: doc.emitenteDocumento, ativo: true, semNotaFiscal: false }, select: { id: true } });
        const escolhido = texto(entrada.fornecedorId) || nota.fornecedorId || '';
        if (!candidatos.some((f) => f.id === escolhido)) throw new RecusaDoc({ ok: false, erros: { fornecedorId: 'Escolha o fornecedor desta nota.' } });
        fornecedorId = escolhido;
      }
      const ligouNota = await tx.notaEntrada.updateMany({
        where: { id: nota.id, chaveAcesso: null, status: 'LANCADA', atualizadoEm: nota.atualizadoEm },
        data: { chaveAcesso: doc.chaveAcesso, emitidaEm: doc.emitidaEm, origemRef: doc.id },
      });
      if (ligouNota.count === 0) throw new RecusaDoc({ ok: false, erros: { geral: 'Alguém mexeu nessa nota agora há pouco. Recarregue a página; nada foi gravado.' }, conflito: true });
      const ligouDoc = await tx.documentoFiscal.updateMany({
        where: { id, situacao: 'AGUARDANDO_CONFERENCIA', atualizadoEm: doc.atualizadoEm },
        data: { situacao: 'CONCILIADO', notaEntradaId: nota.id, lojaId: nota.lojaId, fornecedorId },
      });
      if (ligouDoc.count === 0) throw new RecusaDoc({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true });
      const rotulo = rotuloDaNota(nota);
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'NotaEntrada',
          entidadeId: nota.id,
          acao: 'LIGOU',
          antes: { nome: rotulo, chaveDeAcesso: null },
          depois: { nome: rotulo, chaveDeAcesso: doc.chaveAcesso },
          autorNome,
        },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'DocumentoFiscal',
          entidadeId: id,
          acao: 'LIGOU',
          antes: { nome: rotuloDaNota(doc), situacao: 'aguardando conferência' },
          depois: { nome: rotuloDaNota(doc), situacao: 'conciliada', notaDeCompra: `${rotulo} (já lançada à mão; nada foi lançado de novo)` },
          autorNome,
        },
      });
      return { ok: true as const, id, mudou: ['situacao'], notaId: nota.id };
    });
  } catch (e) {
    if (e instanceof RecusaDoc) return e.resultado;
    if (ehDeadlock(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true };
    if (e instanceof Recusa) return e.resultado as Recusado;
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { geral: MENSAGEM_CORRIDA }, conflito: true };
    throw e;
  }
}

/**
 * Descarta o documento (com motivo). Aguardando conferência: só marca. Conciliado: cancela PRIMEIRO a nota de compra pelo núcleo
 * oficial (estorno do estoque, custo volta ao anterior, período fechado respeitado) e depois marca o documento. O cancelado não volta.
 */
export async function cancelarDocumento(cliente: ClienteDoParceiro, alcance: Alcance, id: string, versao: unknown, motivoTexto: unknown, autorNome = 'Sistema'): Promise<ResultadoDoc> {
  const motivo = motivoLimpo(motivoTexto);
  if (!motivo || motivo.length < 3) return { ok: false, erros: { motivo: 'Diga por que esta nota fiscal sai (ex.: não é da casa, o fornecedor emitiu de novo).' } };
  try {
    return await cliente.transacao(async (tx) => {
      await travarParaEscrever(tx);
      const doc = await carregarDocumento(tx, alcance, id, true);
      if (!doc) throw new RecusaDoc({ ok: false, erros: { geral: NAO_ENCONTRADO }, naoEncontrado: true });
      const v = new Date(typeof versao === 'string' ? versao : '');
      if (Number.isNaN(v.getTime()) || v.getTime() !== doc.atualizadoEm.getTime()) throw new RecusaDoc({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true });
      if (doc.situacao === 'CANCELADO') throw new RecusaDoc({ ok: false, erros: { geral: 'Este documento já estava cancelado.' }, conflito: true });
      // Quem descarta precisa poder lançar na loja do documento (ou, sem loja ainda, em alguma das lojas do CNPJ).
      const lojasQuePode = doc.lojaId ? [doc.lojaId] : (await lojasDoDestinatario(tx, alcance, doc.destinatarioDocumento)).map((l) => l.id);
      const negado = doc.lojaId ? recusa(alcance, 'compras.lancar', { lojaId: doc.lojaId }) : lojasQuePode.length === 0 ? 'Seu acesso não inclui lançar nota de compra nesta loja.' : null;
      if (negado) throw new RecusaDoc({ ok: false, erros: { geral: negado } });
      const estava = doc.situacao;
      if (doc.situacao === 'CONCILIADO' && doc.notaEntradaId) {
        try {
          await cancelarNotaNaTransacao(tx, alcance, doc.notaEntradaId, `Nota fiscal descartada: ${motivo}`, autorNome);
        } catch (e) {
          if (e instanceof Recusa) throw new RecusaDoc({ ok: false, erros: e.resultado.erros as Record<string, string>, ...(e.resultado.conflito ? { conflito: true } : {}) });
          throw e;
        }
      } else if (doc.situacao !== 'AGUARDANDO_CONFERENCIA' && doc.situacao !== 'RECEBIDO' && doc.situacao !== 'ERRO') {
        throw new RecusaDoc({ ok: false, erros: { geral: 'Este documento não pode ser cancelado agora.' } });
      }
      const r = await tx.documentoFiscal.updateMany({
        where: { id, situacao: { in: ['AGUARDANDO_CONFERENCIA', 'RECEBIDO', 'ERRO'] } },
        data: { situacao: 'CANCELADO', canceladoEm: new Date(), motivo },
      });
      if (r.count === 0) throw new RecusaDoc({ ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'DocumentoFiscal',
          entidadeId: id,
          acao: 'CANCELOU',
          antes: { nome: rotuloDaNota(doc), situacao: SITUACAO_EM_TEXTO[estava] ?? estava },
          depois: { nome: rotuloDaNota(doc), situacao: 'cancelada' },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id, mudou: ['situacao'] };
    });
  } catch (e) {
    if (e instanceof RecusaDoc) return e.resultado;
    if (ehDeadlock(e)) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_DOCUMENTO }, conflito: true };
    if (e instanceof Recusa) return e.resultado as Recusado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    throw e;
  }
}

export { LIMITES_DO_DOCUMENTO, hojeNoRio };
