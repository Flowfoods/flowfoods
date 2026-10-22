/**
 * Compras (1.5) — fornecedores e notas de entrada, com banco, sem tela.
 * Recebe sempre um `ClienteDoParceiro` (parceiro da sessão) e, nas notas, o
 * `Alcance` da pessoa: nota é por LOJA, então ler, lançar, editar e cancelar
 * só valem nas lojas do alcance (`compras.ver` / `compras.lancar` com
 * `lojaId`). A action também confere; aqui é a segunda trava, e a única que
 * enxerga a loja que a nota JÁ tem.
 *
 * - toda gravação leva o histórico (antes/depois) na MESMA transação;
 * - editar é condicional à versão lida (`atualizadoEm`): duas abas, a segunda
 *   recebe "alguém alterou" e nada é sobrescrito;
 * - a mesma nota (fornecedor + número + série) não entra duas vezes: conferida
 *   antes (frase com link) e garantida pelo índice único parcial (corrida);
 * - o custo do insumo não é gravado: a última nota lançada passa a valer na
 *   próxima leitura (`compras-custo.ts`, decisão 65). Cancelar a última volta
 *   ao preço anterior;
 * - estoque (1.6, decisão 68): na loja com o estoque ABERTO, a nota lançada
 *   depois da abertura (com data a partir dela) entra no razão na MESMA
 *   transação (`aplicarNotaNoEstoque`); editar e cancelar estornam o que valia
 *   (nunca UPDATE em movimento). A abertura da loja é travada (`FOR SHARE`)
 *   antes de marcar `lancadaEm`: lançar e concluir a abertura se esperam.
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { checkVioladoDe, ehErroDeUnicidade } from './tenant';
import { listarHistorico } from './historico';
import { filtroDeLojas, pode, recusa, type Alcance } from './permissoes';
import {
  A_GRANEL,
  compararCompras,
  EMBALAGEM_PADRAO,
  PREFIXO_DA_EMBALAGEM,
  custoDaCompra,
  FILTROS_DE_NOTA_PADRAO,
  documentoAConferir,
  faltaNoCadastro,
  formatarData,
  hojeNoRio,
  lerFormFornecedor,
  lerFormNota,
  NOTAS_POR_PAGINA,
  retratoDaNota,
  retratoDoFornecedor,
  raizDoCnpj,
  rotuloDaNota,
  type DadosDaNota,
  type DadosFornecedor,
  type EntradaDaNota,
  type FiltrosDeNota,
  type InsumoDaCompra,
} from './compra-campos';
import { lojasComCompras, ultimasCompras, type UltimaCompra } from './compras-custo';
import { aplicarNotaNoEstoque, efeitoPrevistoDaNota, estoqueDaNota, travarAberturas } from './estoque';
import { datasEmPeriodoFechado, fraseDoPeriodoFechado, travarParaEscrever } from './periodo-trava';
import { ErroDeTeto } from './estoque-campos';
import { formatarRendimento, porUnidadeDeRendimento, TIPOS_DE_FICHA, type CustoDaFicha } from './ficha-campos';
import { lerCascata } from './ficha-custos';
import { orcamentoNaNota, type OrcamentoNaNota } from './orcamento';
import { cascataDeCusto, PROFUNDIDADE_MAXIMA, type FichaDaCascata } from './ficha-cascata';
import { diferenca, lerChaveDeEnvio, type Erros } from './insumo-campos';
import { ACENTUADAS, chaveDoNome, SEM_ACENTO } from './categoria-campos';
import { centavosDaFracao, compararCustos, compararFracoes, custoDaEmbalagem, formatarCusto, formatarFracao, formatarQuantidade as formatarQtd, type CustoExato, type Unidade } from './unidades';

export type ResultadoCompras =
  | {
      ok: true;
      id: string;
      mudou: string[];
      /** F.1a: o mesmo envio chegou de novo (clique repetido, resposta perdida): devolve o fornecedor que já existe, sem criar outro. */
      repetido?: boolean;
    }
  | {
      ok: false;
      erros: Erros;
      conflito?: boolean;
      /** Fornecedor com o mesmo nome ou o mesmo CNPJ/CPF, desativado: dá para reativar. */
      desativadoId?: string;
      /** F.1a: o fornecedor ATIVO que já tem este nome ou este CNPJ/CPF: abrir em vez de cadastrar de novo. */
      existenteId?: string;
      naoEncontrado?: boolean;
      /** A mesma nota já lançada (e visível para quem tenta): link para ela. */
      duplicadaId?: string;
    };

type Recusada = Extract<ResultadoCompras, { ok: false }>;

class Recusa extends Error {
  constructor(readonly resultado: Recusada) {
    super('recusa');
  }
}

const motivoLimpo = (t: unknown) => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null);

export const MENSAGEM_CONFLITO_FORNECEDOR = 'Alguém alterou este fornecedor agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
export const MENSAGEM_CONFLITO_NOTA = 'Alguém alterou esta nota agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';
export const MENSAGEM_NOTA_CANCELADA = 'Esta nota está cancelada: não se edita. Lance de novo, certa.';

// ================================================================ fornecedor

const FRASE_ENVIO_TORTO = 'O envio deste formulário não tem uma chave válida. Recarregue a página e tente de novo; nada foi gravado.';
const FRASE_ENVIO_DIFERENTE = (nome: string) =>
  `Este envio já cadastrou “${nome}” e agora chegou com dados diferentes. Recarregue a página para cadastrar de novo; nada foi gravado.`;
const DICA_DE_FILIAL = 'Se é outro estabelecimento da mesma empresa, acrescente o bairro ou a cidade ao nome.';

/** A impressão do conteúdo do envio: mesma chave com impressão diferente é outro pedido, não um reenvio. */
export function hashDoEnvioDoFornecedor(d: DadosFornecedor): string {
  return createHash('sha256')
    .update(JSON.stringify([d.nome, d.razaoSocial, d.documento, d.inscricaoEstadual, d.endereco, d.municipio, d.uf, d.cep, d.email, d.whatsapp, d.contatoComercial, d.prazoPagamentoDias, d.semNotaFiscal]))
    .digest('hex');
}

/** Cadastrar e editar fornecedor esperam um ao outro (nome parecido e documento repetido se conferem sem corrida). */
async function travarFornecedores(tx: ClienteDoParceiro) {
  await tx.sql`SELECT 1 AS "ok" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ff:fornecedor-cadastro:${tx.parceiroId}`}, 0))) AS "trava"`;
}

/**
 * O que impede gravar este cadastro (null = livre): o MESMO CNPJ/CPF em outro fornecedor, ou o mesmo nome (também escrito de outro
 * jeito: caixa, acento). Filial tem outro CNPJ e passa; nada se funde, nem por documento nem por nome. `exceto`: o próprio, ao editar.
 */
async function conflitoDoFornecedor(tx: ClienteDoParceiro, d: DadosFornecedor, exceto: string | null): Promise<Recusada | null> {
  if (d.documento) {
    const outro = await tx.fornecedor.findFirst({
      where: { documento: d.documento, ...(exceto ? { id: { not: exceto } } : {}) },
      orderBy: [{ ativo: 'desc' }, { criadoEm: 'asc' }],
      select: { id: true, nome: true, ativo: true },
    });
    if (outro) {
      const que = d.documento.length === 14 ? 'CNPJ' : 'CPF';
      return outro.ativo
        ? { ok: false, erros: { documento: `Já existe “${outro.nome}” com este ${que}. Abra esse cadastro em vez de cadastrar de novo.` }, existenteId: outro.id }
        : { ok: false, erros: { documento: `Já existe “${outro.nome}” desativado com este ${que}. Reative em vez de cadastrar de novo.` }, desativadoId: outro.id };
    }
  }
  const achados = await tx.sql<{ id: string; nome: string; ativo: boolean }>`
    SELECT "id", "nome", "ativo" FROM "Fornecedor"
    WHERE "parceiroId" = ${tx.parceiroId}
      AND lower(translate(normalize("nome", NFC), ${ACENTUADAS}, ${SEM_ACENTO})) = ${chaveDoNome(d.nome)}
      AND "id" <> ${exceto ?? ''}
    ORDER BY ("nome" = ${d.nome}) DESC, "ativo" DESC
    LIMIT 1`;
  const a = achados[0];
  if (!a) return null;
  const igual = a.nome === d.nome;
  if (!a.ativo) {
    return {
      ok: false,
      erros: { nome: `Já existe “${a.nome}” desativado${igual ? '' : ' (o mesmo nome, escrito de outro jeito)'}. Reative em vez de cadastrar de novo.` },
      desativadoId: a.id,
    };
  }
  return {
    ok: false,
    erros: { nome: igual ? `Já existe um fornecedor com esse nome. ${DICA_DE_FILIAL}` : `Já existe “${a.nome}” (o mesmo nome, escrito de outro jeito). ${DICA_DE_FILIAL}` },
    existenteId: a.id,
  };
}

/** O banco recusou por CHECK (gravado por fora das regras): frase no lugar do erro cru. */
function erroDoCheckDoFornecedor(e: unknown): Recusada | null {
  return checkVioladoDe(e) ? { ok: false, erros: { geral: 'O banco recusou estes valores (fora da regra do cadastro). Confira os campos e tente de novo. Nada foi gravado.' } } : null;
}

const COLUNAS_DO_CADASTRO = (d: DadosFornecedor) => ({
  nome: d.nome,
  razaoSocial: d.razaoSocial,
  documento: d.documento,
  inscricaoEstadual: d.inscricaoEstadual,
  endereco: d.endereco,
  municipio: d.municipio,
  uf: d.uf,
  cep: d.cep,
  email: d.email,
  whatsapp: d.whatsapp,
  contatoComercial: d.contatoComercial,
  prazoPagamentoDias: d.prazoPagamentoDias,
  semNotaFiscal: d.semNotaFiscal,
});

/**
 * Cadastra o fornecedor (F.1a). Tudo o que o formulário tem de obrigatório é conferido aqui (`lerFormFornecedor`); o cadastro que
 * sai daqui é sempre COMPLETO: o "a completar" só nasce do sistema. `entrada.envio` (a chave do formulário, por pessoa) faz o
 * reenvio voltar como o mesmo fornecedor, sem criar outro.
 */
export async function cadastrarFornecedor(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
  /** Quem envia (id do usuário): a chave de envio é POR PESSOA, então a chave de um não reconhece nem revela o envio de outro. */
  pessoaId = '',
): Promise<ResultadoCompras> {
  const lido = lerFormFornecedor(entrada);
  const envio = lerChaveDeEnvio(entrada.envio);
  if (!lido.ok) return lido;
  if (!envio.ok) return { ok: false, erros: { geral: FRASE_ENVIO_TORTO }, conflito: true };
  const d = lido.dados;
  const chave = envio.chave ? createHash('sha256').update(`${pessoaId}|${envio.chave}`).digest('hex').slice(0, 40) : null;
  const hash = chave ? hashDoEnvioDoFornecedor(d) : null;
  try {
    return await cliente.transacao(async (tx) => {
      await travarFornecedores(tx);
      if (chave) {
        const j = await tx.fornecedor.findFirst({ where: { chaveEnvio: chave }, select: { id: true, nome: true, hashEnvio: true } });
        if (j) {
          if (j.hashEnvio === hash) return { ok: true as const, id: j.id, mudou: [], repetido: true };
          throw new Recusa({ ok: false, erros: { geral: FRASE_ENVIO_DIFERENTE(j.nome) }, conflito: true });
        }
      }
      const conflito = await conflitoDoFornecedor(tx, d, null);
      if (conflito) throw new Recusa(conflito);
      const f = await tx.fornecedor.create({
        data: { parceiroId: tx.parceiroId, ...COLUNAS_DO_CADASTRO(d), situacaoCadastro: 'COMPLETO', ...(chave ? { chaveEnvio: chave, hashEnvio: hash } : {}) },
        select: { id: true },
      });
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'Fornecedor', entidadeId: f.id, acao: 'CRIOU', depois: retratoDoFornecedor({ ...d, situacaoCadastro: 'COMPLETO' }), autorNome },
      });
      return { ok: true as const, id: f.id, mudou: [] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) {
      // A chave, o documento ou o nome já existiam (outra aba, ao mesmo tempo): se é o mesmo envio, é sucesso; senão, a frase certa.
      if (chave) {
        const j = await cliente.fornecedor.findFirst({ where: { chaveEnvio: chave }, select: { id: true, hashEnvio: true } });
        if (j && j.hashEnvio === hash) return { ok: true, id: j.id, mudou: [], repetido: true };
      }
      const conflito = await cliente.transacao((tx) => conflitoDoFornecedor(tx, d, null));
      return conflito ?? { ok: false, erros: { geral: 'Já existe um fornecedor com estes dados. Recarregue a página e confira; nada foi gravado.' }, conflito: true };
    }
    const check = erroDoCheckDoFornecedor(e);
    if (check) return check;
    throw e;
  }
}

export async function editarFornecedor(
  cliente: ClienteDoParceiro,
  id: string,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoCompras> {
  const versao = new Date(typeof entrada.versao === 'string' ? entrada.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_FORNECEDOR }, conflito: true };
  const atual = await cliente.fornecedor.findUnique({ where: { id } });
  if (!atual) return { ok: false, erros: { geral: 'Fornecedor não encontrado.' }, naoEncontrado: true };
  if (!atual.ativo) return { ok: false, erros: { geral: 'Fornecedor desativado: reative antes de editar.' } };
  if (atual.atualizadoEm.getTime() !== versao.getTime()) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_FORNECEDOR }, conflito: true };
  // Editar é completar: as mesmas obrigações de cadastrar valem aqui, para o "a completar" também.
  const lido = lerFormFornecedor(entrada);
  if (!lido.ok) return lido;
  const d = lido.dados;
  const mudanca = diferenca(retratoDoFornecedor(atual), retratoDoFornecedor({ ...d, situacaoCadastro: 'COMPLETO' }));
  if (!mudanca) return { ok: true, id, mudou: [] };
  try {
    await cliente.transacao(async (tx) => {
      await travarFornecedores(tx);
      const conflito = await conflitoDoFornecedor(tx, d, id);
      if (conflito) throw new Recusa(conflito);
      const r = await tx.fornecedor.updateMany({
        where: { id, atualizadoEm: versao, ativo: true },
        data: { ...COLUNAS_DO_CADASTRO(d), situacaoCadastro: 'COMPLETO' },
      });
      if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_FORNECEDOR }, conflito: true });
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'Fornecedor', entidadeId: id, acao: 'ALTEROU', antes: mudanca.antes, depois: mudanca.depois, autorNome },
      });
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    if (ehErroDeUnicidade(e)) {
      const conflito = await cliente.transacao((tx) => conflitoDoFornecedor(tx, d, id));
      return conflito ?? { ok: false, erros: { geral: MENSAGEM_CONFLITO_FORNECEDOR }, conflito: true };
    }
    const check = erroDoCheckDoFornecedor(e);
    if (check) return check;
    throw e;
  }
  return { ok: true, id, mudou: mudanca.campos };
}

export async function mudarSituacaoFornecedor(
  cliente: ClienteDoParceiro,
  id: string,
  ativo: boolean,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoCompras> {
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await tx.fornecedor.findUnique({ where: { id }, select: { nome: true } });
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Fornecedor não encontrado.' }, naoEncontrado: true });
      const r = await tx.fornecedor.updateMany({ where: { id, ativo: !ativo }, data: { ativo } });
      if (r.count === 0) {
        throw new Recusa({ ok: false, erros: { geral: ativo ? 'Este fornecedor já está ativo.' : 'Este fornecedor já estava desativado.' }, conflito: true });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Fornecedor',
          entidadeId: id,
          acao: ativo ? 'REATIVOU' : 'DESATIVOU',
          antes: { nome: atual.nome, ativo: !ativo },
          depois: { nome: atual.nome, ativo },
          motivo: motivoLimpo(motivoTexto),
          autorNome,
        },
      });
      return { ok: true as const, id, mudou: ['ativo'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    throw e;
  }
}

export type SituacaoDoFornecedor = 'ativos' | 'desativados' | 'todos';
/** F.1a: o filtro do cadastro: todos, só os "a completar" ou só os completos. */
export type CadastroDoFornecedor = 'todos' | 'a-completar' | 'completos';

/** Fornecedores com quantas notas lançadas (nas lojas do alcance) e a data da última. */
export async function listarFornecedores(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  filtros: { q?: string; situacao?: SituacaoDoFornecedor; cadastro?: CadastroDoFornecedor } = {},
) {
  const q = (filtros.q ?? '').trim().slice(0, 80);
  const situacao = filtros.situacao ?? 'ativos';
  const cadastro = filtros.cadastro ?? 'todos';
  return cliente.transacao(async (tx) => {
    const lidos = await tx.fornecedor.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: 'insensitive' as const } },
                { razaoSocial: { contains: q, mode: 'insensitive' as const } },
                { documento: { contains: q.replace(/\D/g, '') || q } },
              ],
            }
          : {}),
        ...(situacao === 'ativos' ? { ativo: true } : situacao === 'desativados' ? { ativo: false } : {}),
        ...(cadastro === 'a-completar' ? { situacaoCadastro: 'A_COMPLETAR' as const } : cadastro === 'completos' ? { situacaoCadastro: 'COMPLETO' as const } : {}),
      },
      orderBy: [{ nome: 'asc' }],
      take: 500,
      select: {
        id: true,
        nome: true,
        razaoSocial: true,
        documento: true,
        contato: true,
        whatsapp: true,
        email: true,
        semNotaFiscal: true,
        situacaoCadastro: true,
        ativo: true,
      },
    });
    const ids = lidos.map((f) => f.id);
    const lojas = lojasComCompras(alcance);
    const notas = ids.length && lojas !== null
      ? await tx.notaEntrada.groupBy({
          by: ['fornecedorId'],
          where: { fornecedorId: { in: ids }, status: 'LANCADA', lojaId: lojas },
          _count: { _all: true },
          _max: { entradaEm: true },
        })
      : [];
    const porId = new Map(notas.map((n) => [n.fornecedorId, n]));
    return lidos.map((f) => ({
      ...f,
      falta: faltaNoCadastro(f),
      notas: porId.get(f.id)?._count._all ?? 0,
      ultimaNota: porId.get(f.id)?._max.entradaEm?.toISOString().slice(0, 10) ?? null,
    }));
  });
}

export type LinhaDeFornecedor = Awaited<ReturnType<typeof listarFornecedores>>[number];

/** Detalhe: cadastro, últimas notas nas lojas do alcance, o que já vendeu (último preço por insumo) e alterações. */
export async function obterFornecedor(cliente: ClienteDoParceiro, alcance: Alcance, id: string) {
  return cliente.transacao(async (tx) => {
    const f = await tx.fornecedor.findUnique({ where: { id } });
    if (!f) return null;
    // Notas e preços são das lojas em que a pessoa vê compras (sem a permissão: nenhum).
    const lojas = lojasComCompras(alcance);
    const notas = lojas === null ? [] : await tx.notaEntrada.findMany({
      where: { fornecedorId: id, lojaId: lojas, status: { in: ['LANCADA', 'CANCELADA'] } },
      orderBy: [{ entradaEm: 'desc' }, { lancadaEm: 'desc' }],
      take: 10,
      select: { id: true, numero: true, serie: true, entradaEm: true, totalCentavos: true, status: true, loja: { select: { nome: true } } },
    });
    const itens = lojas === null ? [] : await tx.notaEntradaItem.findMany({
      where: { nota: { fornecedorId: id, status: 'LANCADA', lojaId: lojas }, insumoId: { not: null } },
      orderBy: [{ nota: { entradaEm: 'desc' } }, { nota: { lancadaEm: 'desc' } }],
      take: 300,
      select: {
        insumoId: true,
        notaId: true,
        valorTotalCentavos: true,
        freteRateadoCentavos: true,
        quantidadeMilesimos: true,
        nota: { select: { entradaEm: true } },
        insumo: { select: { nome: true, unidade: true } },
      },
    });
    const porInsumo = new Map<string, { insumoId: string; nome: string; unidade: Unidade; entradaEm: string; notaId: string; partes: typeof itens }>();
    for (const i of itens) {
      const ja = porInsumo.get(i.insumoId!);
      if (!ja) porInsumo.set(i.insumoId!, { insumoId: i.insumoId!, nome: i.insumo!.nome, unidade: i.insumo!.unidade, entradaEm: i.nota.entradaEm.toISOString().slice(0, 10), notaId: i.notaId, partes: [i] });
      else if (ja.notaId === i.notaId) ja.partes.push(i);
    }
    const insumos = Array.from(porInsumo.values())
      .map((p) => ({
        insumoId: p.insumoId,
        nome: p.nome,
        unidade: p.unidade,
        entradaEm: p.entradaEm,
        custo: custoDaCompra(p.partes.map((x) => ({ valorCentavos: x.valorTotalCentavos, freteRateadoCentavos: x.freteRateadoCentavos, quantidadeMilesimos: x.quantidadeMilesimos }))),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const historico = await listarHistorico(tx, { de: [{ entidade: 'Fornecedor', ids: [id] }], limite: 10, verPrecos: false });
    // Outros estabelecimentos da mesma empresa (mesma raiz de CNPJ, CNPJ diferente): só aviso, nada se funde.
    const raiz = raizDoCnpj(f.documento);
    const mesmaEmpresa = raiz
      ? await tx.fornecedor.findMany({
          where: { documento: { startsWith: raiz }, id: { not: id } },
          orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
          take: 20,
          select: { id: true, nome: true, documento: true, ativo: true },
        })
      : [];
    return {
      id: f.id,
      nome: f.nome,
      razaoSocial: f.razaoSocial,
      documento: f.documento,
      inscricaoEstadual: f.inscricaoEstadual,
      endereco: f.endereco,
      municipio: f.municipio,
      uf: f.uf,
      cep: f.cep,
      email: f.email,
      whatsapp: f.whatsapp,
      contatoComercial: f.contatoComercial,
      prazoPagamentoDias: f.prazoPagamentoDias,
      semNotaFiscal: f.semNotaFiscal,
      situacaoCadastro: f.situacaoCadastro,
      falta: faltaNoCadastro(f),
      documentoAConferir: documentoAConferir(f.documento),
      mesmaEmpresa: mesmaEmpresa.filter((o) => raizDoCnpj(o.documento) === raiz),
      contato: f.contato,
      ativo: f.ativo,
      versao: f.atualizadoEm.toISOString(),
      notas: notas.map((n) => ({ ...n, entradaEm: n.entradaEm.toISOString().slice(0, 10), loja: n.loja.nome })),
      insumos,
      historico,
    };
  });
}

export type FornecedorDetalhado = NonNullable<Awaited<ReturnType<typeof obterFornecedor>>>;

// ================================================================ nota: leitura do cadastro

const SELECAO_DO_INSUMO_DA_COMPRA = {
  id: true,
  nome: true,
  unidade: true,
  ativo: true,
  conteudoMilesimos: true,
  precoEmbalagemCentavos: true,
  taxaEntregaCentavos: true,
  fichaQueProduz: { select: { nome: true } },
  variantes: { orderBy: { nome: 'asc' as const }, select: { id: true, nome: true, conteudoMilesimos: true, ativo: true } },
} as const;

type InsumoLido = Prisma.InsumoGetPayload<{ select: typeof SELECAO_DO_INSUMO_DA_COMPRA }>;

const paraCompra = (i: InsumoLido): InsumoDaCompra => ({
  id: i.id,
  nome: i.nome,
  unidade: i.unidade,
  ativo: i.ativo,
  produzidoPor: i.fichaQueProduz?.nome ?? null,
  conteudoMilesimos: i.conteudoMilesimos,
  embalagens: i.variantes,
});

const ID = /^[a-z0-9]{1,64}$/i;

/** Os insumos que a nota cita, deste parceiro; `travar`: FOR SHARE até o fim da transação (a unidade não muda no meio). */
async function insumosCitados(tx: ClienteDoParceiro, ids: readonly string[], travar: boolean): Promise<Map<string, InsumoLido>> {
  const unicos = Array.from(new Set(ids.filter((x) => typeof x === 'string' && ID.test(x))));
  if (unicos.length === 0) return new Map();
  if (travar) await tx.sql`SELECT 1 FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ANY(${unicos}::text[]) FOR SHARE`;
  const lidos = await tx.insumo.findMany({ where: { id: { in: unicos } }, select: SELECAO_DO_INSUMO_DA_COMPRA });
  return new Map(lidos.map((i) => [i.id, i]));
}

/** Lojas onde a pessoa pode lançar nota (alcance + `compras.lancar`). */
async function lojasParaLancar(tx: ClienteDoParceiro, alcance: Alcance) {
  const lojas = await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, ativa: true } });
  return lojas.filter((l) => pode(alcance, 'compras.lancar', { lojaId: l.id }));
}

/** O que o formulário de nota precisa: lojas, fornecedores e insumos comprados (com o custo de agora). */
export async function dadosDoFormularioDeNota(cliente: ClienteDoParceiro, alcance: Alcance, ja: { lojaId?: string; fornecedorId?: string; insumoIds?: string[] } = {}) {
  return cliente.transacao(async (tx) => {
    const lojas = (await lojasParaLancar(tx, alcance)).filter((l) => l.ativa || l.id === ja.lojaId);
    const fornecedores = await tx.fornecedor.findMany({
      where: { OR: [{ ativo: true }, ...(ja.fornecedorId ? [{ id: ja.fornecedorId }] : [])] },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, ativo: true },
    });
    const lidos = await tx.insumo.findMany({
      where: { fichaQueProduz: { is: null }, OR: [{ ativo: true }, { id: { in: ja.insumoIds ?? [] } }] },
      orderBy: { nome: 'asc' },
      select: SELECAO_DO_INSUMO_DA_COMPRA,
    });
    const compras = await ultimasCompras(
      tx,
      lidos.map((i) => i.id),
    );
    const insumos = lidos.map((i) => {
      const c = compras.get(i.id);
      return {
        ...paraCompra(i),
        /** Custo de agora (última compra ou preço cadastrado), exato; null = sem preço. */
        custo: c?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos),
        /** Data da última compra lançada ("2026-10-14"): a nota de data anterior não muda o custo. */
        ultimaCompraEm: c?.entradaEm ?? null,
      };
    });
    return { lojas, fornecedores, insumos };
  });
}

export type FormularioDeNota = Awaited<ReturnType<typeof dadosDoFormularioDeNota>>;
export type InsumoDoFormularioDeNota = FormularioDeNota['insumos'][number];

interface Contexto {
  lojas: Map<string, { nome: string; ativa: boolean }>;
  fornecedores: Map<string, { nome: string; ativo: boolean }>;
  cadastro: Map<string, InsumoLido>;
}

/** Lê o que a entrada cita (lojas do alcance, fornecedor, insumos) e passa pelo leitor puro. */
async function lerNota(
  tx: ClienteDoParceiro,
  alcance: Alcance,
  entrada: EntradaDaNota,
  travar: boolean,
  atual?: { lojaId: string; fornecedorId: string | null; itens: { insumoId: string | null; varianteId: string | null }[] },
) {
  const lojas = await lojasParaLancar(tx, alcance);
  const fornecedorId = typeof entrada.fornecedorId === 'string' && ID.test(entrada.fornecedorId) ? entrada.fornecedorId : '';
  const fornecedores = fornecedorId ? await tx.fornecedor.findMany({ where: { id: fornecedorId }, select: { id: true, nome: true, ativo: true } }) : [];
  const insumos = await insumosCitados(tx, [...entrada.itens.map((i) => i.insumoId), ...(atual?.itens.map((i) => i.insumoId ?? '') ?? [])], travar);
  const ctx: Contexto = {
    lojas: new Map(lojas.map((l) => [l.id, l])),
    fornecedores: new Map(fornecedores.map((f) => [f.id, f])),
    cadastro: insumos,
  };
  const lido = lerFormNota(entrada, new Map(Array.from(insumos.values()).map((i) => [i.id, paraCompra(i)])), {
    hoje: hojeNoRio(),
    lojas: ctx.lojas,
    fornecedores: ctx.fornecedores,
    jaNaNota: atual
      ? {
          insumoIds: new Set(atual.itens.map((i) => i.insumoId ?? '').filter(Boolean)),
          variantes: new Set(atual.itens.map((i) => i.varianteId ?? '').filter(Boolean)),
          lojaId: atual.lojaId,
          fornecedorId: atual.fornecedorId ?? undefined,
        }
      : undefined,
  });
  return { lido, ctx };
}

// ================================================================ nota: gravar

/** A mesma nota (fornecedor + número + série) já lançada? Frase com link quando quem tenta pode vê-la. */
async function conferirDuplicada(tx: ClienteDoParceiro, alcance: Alcance, d: DadosDaNota, ignorar?: string): Promise<void> {
  const outra = await tx.notaEntrada.findFirst({
    where: { fornecedorId: d.fornecedorId, numero: d.numero, serie: d.serie, status: { not: 'CANCELADA' }, ...(ignorar ? { NOT: { id: ignorar } } : {}) },
    select: { id: true, lojaId: true, entradaEm: true, loja: { select: { nome: true } } },
  });
  if (!outra) return;
  const ve = pode(alcance, 'compras.ver', { lojaId: outra.lojaId });
  throw new Recusa({
    ok: false,
    erros: {
      numero: ve
        ? `Esta nota já foi lançada (${rotuloDaNota(d)}, ${outra.loja.nome}, ${formatarData(outra.entradaEm)}). A mesma nota não entra duas vezes.`
        : `Esta nota já foi lançada em outra loja (${rotuloDaNota(d)}). A mesma nota não entra duas vezes.`,
    },
    duplicadaId: ve ? outra.id : undefined,
  });
}

const MENSAGEM_CORRIDA = 'Esta nota acabou de ser lançada (por outra pessoa ou por um clique duplo). Abra a lista de notas; nada foi gravado de novo.';

function dadosDosItens(tx: ClienteDoParceiro, notaId: string, d: DadosDaNota): Prisma.NotaEntradaItemCreateManyInput[] {
  return d.itens.map((i, ordem) => ({
    parceiroId: tx.parceiroId,
    notaId,
    insumoId: i.insumoId,
    varianteId: i.varianteId,
    descricaoNota: `${i.insumoNome} · ${i.embalagem}`,
    insumoNomeSnapshot: i.insumoNome,
    unidadeSnapshot: i.unidade,
    embalagemSnapshot: i.embalagem,
    embalagensMilesimos: i.embalagensMilesimos,
    conteudoMilesimos: i.conteudoMilesimos,
    quantidadeMilesimos: i.quantidadeMilesimos,
    valorTotalCentavos: i.valorCentavos,
    freteRateadoCentavos: i.freteRateadoCentavos,
    ordem,
  }));
}

const dataDoBanco = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Lança a nota (status LANCADA): vale para o custo na hora. No estoque: entra
 * na mesma transação se a loja já está aberta (decisão 68); senão, não mexe
 * (a contagem de abertura inclui).
 */
export async function lancarNota(cliente: ClienteDoParceiro, alcance: Alcance, entrada: EntradaDaNota, autorNome = 'Sistema'): Promise<ResultadoCompras> {
  try {
    return await cliente.transacao(async (tx) => {
      // 2.2b (decisão 155): a nota cai num período pela data de entrada. A trava compartilhada do período
      // é a PRIMEIRA coisa da transação: ou a nota termina antes do fechamento (e entra nele), ou espera e é recusada.
      await travarParaEscrever(tx);
      const { lido, ctx } = await lerNota(tx, alcance, entrada, true);
      if (!lido.ok) throw new Recusa(lido);
      const d = lido.dados;
      // Segunda trava (a action já conferiu sem a loja): lançar NESTA loja.
      const negado = recusa(alcance, 'compras.lancar', { lojaId: d.lojaId });
      if (negado) throw new Recusa({ ok: false, erros: { lojaId: negado } });
      const fechado = (await datasEmPeriodoFechado(tx, [d.entradaEm])).get(d.entradaEm);
      if (fechado) throw new Recusa({ ok: false, erros: { data: fraseDoPeriodoFechado(fechado) } });
      await conferirDuplicada(tx, alcance, d);
      // 1.6: trava a abertura da loja ANTES de marcar a hora do lançamento.
      await travarAberturas(tx, [d.lojaId]);
      const fornecedor = ctx.fornecedores.get(d.fornecedorId)!.nome;
      const nota = await tx.notaEntrada.create({
        data: {
          parceiroId: tx.parceiroId,
          lojaId: d.lojaId,
          fornecedorId: d.fornecedorId,
          fornecedorNomeSnapshot: fornecedor,
          numero: d.numero,
          serie: d.serie,
          entradaEm: dataDoBanco(d.entradaEm),
          freteCentavos: d.freteCentavos,
          totalCentavos: d.totalCentavos,
          status: 'LANCADA',
          origem: 'MANUAL',
          lancadaEm: new Date(),
        },
        select: { id: true },
      });
      await tx.notaEntradaItem.createMany({ data: dadosDosItens(tx, nota.id, d) });
      await aplicarNotaNoEstoque(tx, nota.id, '');
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'NotaEntrada',
          entidadeId: nota.id,
          acao: 'CRIOU',
          depois: retratoDaNota(d, { loja: ctx.lojas.get(d.lojaId)!.nome, fornecedor }),
          autorNome,
        },
      });
      return { ok: true as const, id: nota.id, mudou: [] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { numero: MENSAGEM_CORRIDA } };
    throw e;
  }
}

const SELECAO_DA_NOTA_GRAVADA = {
  id: true,
  lojaId: true,
  fornecedorId: true,
  fornecedorNomeSnapshot: true,
  numero: true,
  serie: true,
  entradaEm: true,
  freteCentavos: true,
  totalCentavos: true,
  status: true,
  lancadaEm: true,
  atualizadoEm: true,
  loja: { select: { nome: true } },
  itens: {
    orderBy: { ordem: 'asc' as const },
    select: {
      insumoId: true,
      varianteId: true,
      insumoNomeSnapshot: true,
      unidadeSnapshot: true,
      embalagemSnapshot: true,
      embalagensMilesimos: true,
      conteudoMilesimos: true,
      quantidadeMilesimos: true,
      valorTotalCentavos: true,
      freteRateadoCentavos: true,
    },
  },
} as const;

type NotaGravada = Prisma.NotaEntradaGetPayload<{ select: typeof SELECAO_DA_NOTA_GRAVADA }>;

/** A nota gravada no formato do leitor (para comparar e para o histórico). */
function dadosGravados(n: NotaGravada): DadosDaNota {
  return {
    lojaId: n.lojaId,
    fornecedorId: n.fornecedorId ?? '',
    numero: n.numero ?? '',
    serie: n.serie,
    entradaEm: n.entradaEm.toISOString().slice(0, 10),
    freteCentavos: n.freteCentavos,
    totalCentavos: n.totalCentavos,
    itens: n.itens.map((i) => ({
      insumoId: i.insumoId ?? '',
      varianteId: i.varianteId,
      insumoNome: i.insumoNomeSnapshot ?? '?',
      unidade: i.unidadeSnapshot ?? 'UN',
      embalagem: i.embalagemSnapshot ?? '',
      embalagensMilesimos: i.embalagensMilesimos,
      conteudoMilesimos: i.conteudoMilesimos,
      quantidadeMilesimos: i.quantidadeMilesimos,
      valorCentavos: i.valorTotalCentavos,
      freteRateadoCentavos: i.freteRateadoCentavos,
    })),
  };
}

/** Nota deste parceiro nas lojas do alcance (fora: não existe para quem pede). */
async function notaVisivel(tx: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, id: string) {
  if (!ID.test(id)) return null;
  return tx.notaEntrada.findFirst({ where: { id, lojaId: filtroDeLojas(alcance) }, select: SELECAO_DA_NOTA_GRAVADA });
}

/**
 * Edita a nota lançada (itens trocados por inteiro). `entrada.versao` = o
 * `atualizadoEm` lido; o custo acompanha sozinho (derivado).
 */
export async function editarNota(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  id: string,
  entrada: EntradaDaNota & { versao?: unknown },
  autorNome = 'Sistema',
): Promise<ResultadoCompras> {
  const versao = new Date(typeof entrada.versao === 'string' ? entrada.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: MENSAGEM_CONFLITO_NOTA }, conflito: true };
  try {
    return await cliente.transacao(async (tx) => {
      await travarParaEscrever(tx);
      const atual = await notaVisivel(tx, alcance, id);
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Nota não encontrada.' }, naoEncontrado: true });
      const negadoAntes = recusa(alcance, 'compras.lancar', { lojaId: atual.lojaId });
      if (negadoAntes) throw new Recusa({ ok: false, erros: { geral: negadoAntes } });
      if (atual.status !== 'LANCADA') throw new Recusa({ ok: false, erros: { geral: MENSAGEM_NOTA_CANCELADA } });
      if (atual.atualizadoEm.getTime() !== versao.getTime()) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_NOTA }, conflito: true });
      const { lido, ctx } = await lerNota(tx, alcance, entrada, true, atual);
      if (!lido.ok) throw new Recusa(lido);
      const d = lido.dados;
      const negado = recusa(alcance, 'compras.lancar', { lojaId: d.lojaId });
      if (negado) throw new Recusa({ ok: false, erros: { lojaId: negado } });
      // 2.2b: a data de ANTES e a de DEPOIS não podem cair em período fechado (mover para dentro ou para fora).
      const dataAntes = atual.entradaEm.toISOString().slice(0, 10);
      const fechadas = await datasEmPeriodoFechado(tx, [dataAntes, d.entradaEm]);
      if (fechadas.has(dataAntes)) throw new Recusa({ ok: false, erros: { geral: fraseDoPeriodoFechado(fechadas.get(dataAntes)!) } });
      if (fechadas.has(d.entradaEm)) throw new Recusa({ ok: false, erros: { data: fraseDoPeriodoFechado(fechadas.get(d.entradaEm)!) } });
      const fornecedor = ctx.fornecedores.get(d.fornecedorId)!.nome;
      const nomesAntes = { loja: atual.loja.nome, fornecedor: atual.fornecedorNomeSnapshot ?? '' };
      const nomesDepois = { loja: ctx.lojas.get(d.lojaId)!.nome, fornecedor };
      const mudanca = diferenca(retratoDaNota(dadosGravados(atual), nomesAntes), retratoDaNota(d, nomesDepois));
      if (!mudanca) return { ok: true as const, id, mudou: [] };
      await conferirDuplicada(tx, alcance, d, id);
      await travarAberturas(tx, [atual.lojaId, d.lojaId]);
      const r = await tx.notaEntrada.updateMany({
        where: { id, atualizadoEm: versao, status: 'LANCADA' },
        data: {
          lojaId: d.lojaId,
          fornecedorId: d.fornecedorId,
          fornecedorNomeSnapshot: fornecedor,
          numero: d.numero,
          serie: d.serie,
          entradaEm: dataDoBanco(d.entradaEm),
          freteCentavos: d.freteCentavos,
          totalCentavos: d.totalCentavos,
        },
      });
      if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO_NOTA }, conflito: true });
      await tx.notaEntradaItem.deleteMany({ where: { notaId: id } });
      await tx.notaEntradaItem.createMany({ data: dadosDosItens(tx, id, d) });
      // 1.6: o estoque acompanha — estorna o que valia e entra o novo, se o efeito mudou.
      await aplicarNotaNoEstoque(tx, id, `${rotuloDaNota(d)} alterada`);
      await tx.historicoAlteracao.create({
        data: { parceiroId: tx.parceiroId, entidade: 'NotaEntrada', entidadeId: id, acao: 'ALTEROU', antes: mudanca.antes, depois: mudanca.depois, autorNome },
      });
      return { ok: true as const, id, mudou: mudanca.campos };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { numero: MENSAGEM_CORRIDA } };
    throw e;
  }
}

/** Cancela (não apaga): sai do custo na hora; a última vira a anterior. Motivo obrigatório. */
export async function cancelarNota(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  id: string,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoCompras> {
  const motivo = motivoLimpo(motivoTexto);
  if (!motivo || motivo.length < 3) return { ok: false, erros: { motivo: 'Diga por que a nota sai (ex.: digitada em dobro, devolvida).' } };
  try {
    return await cliente.transacao(async (tx) => {
      await travarParaEscrever(tx);
      const atual = await notaVisivel(tx, alcance, id);
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Nota não encontrada.' }, naoEncontrado: true });
      const negado = recusa(alcance, 'compras.lancar', { lojaId: atual.lojaId });
      if (negado) throw new Recusa({ ok: false, erros: { geral: negado } });
      const dataDaNota = atual.entradaEm.toISOString().slice(0, 10);
      const fechado = (await datasEmPeriodoFechado(tx, [dataDaNota])).get(dataDaNota);
      if (fechado) throw new Recusa({ ok: false, erros: { geral: fraseDoPeriodoFechado(fechado) } });
      await travarAberturas(tx, [atual.lojaId]);
      const r = await tx.notaEntrada.updateMany({
        where: { id, status: 'LANCADA' },
        data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: motivo },
      });
      if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: 'Esta nota já estava cancelada.' }, conflito: true });
      const nome = rotuloDaNota({ numero: atual.numero, serie: atual.serie });
      // 1.6: o que a nota tinha posto no estoque sai por estorno (nunca UPDATE no razão).
      await aplicarNotaNoEstoque(tx, id, `${nome} cancelada: ${motivo}`);
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'NotaEntrada',
          entidadeId: id,
          acao: 'CANCELOU',
          antes: { nome, situacao: 'LANCADA' },
          depois: { nome, situacao: 'CANCELADA' },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id, mudou: ['situacao'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (e instanceof ErroDeTeto) return { ok: false, erros: { geral: e.message } };
    throw e;
  }
}

// ================================================================ nota: prévia do impacto

export interface ImpactoNoInsumo {
  insumoId: string;
  nome: string;
  antes: string;
  depois: string;
  /** 'sobe' | 'desce' | 'igual' | 'primeira' (sem preço → com preço) | 'nao-muda' (há nota mais nova). */
  efeito: 'sobe' | 'desce' | 'igual' | 'primeira' | 'nao-muda';
  /** Quando não muda: a data da nota que vale ("16/10/2026"). */
  vale?: string;
}

export interface ImpactoNaFicha {
  id: string;
  nome: string;
  tipo: string;
  porQue: string;
  antes: string;
  depois: string;
  sobe: boolean;
  /** Quanto muda por porção/kg, em centavos (arredondado; negativo = desce): ordena a prévia. */
  variacaoCentavos: number;
}

export interface PreviaDaNota {
  itens: {
    nome: string;
    embalagem: string;
    quantidade: string;
    valorCentavos: number;
    freteRateadoCentavos: number;
    custo: string;
  }[];
  somaItensCentavos: number;
  freteCentavos: number;
  totalCentavos: number;
  custos: ImpactoNoInsumo[];
  fichas: ImpactoNaFicha[];
  /** Fichas afetadas que ficaram de fora da lista (teto da tela). */
  maisFichas: number;
  /** 1.6: o que a nota faz no estoque da loja (entra, ou por que não). */
  estoque: { movimenta: boolean; frase: string };
  /** 2.5: o que a nota faz no orçamento de compra da loja (aviso, nunca bloqueio); nulo = a pessoa não vê o orçamento. */
  orcamento: OrcamentoNaNota | null;
}

/** Custo efetivo do insumo: a última compra (do mapa) ou o preço cadastrado. */
const efetivo = (i: InsumoLido, compra: UltimaCompra | undefined) => compra?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos);

const TETO_DE_FICHAS_NA_PREVIA = 30;

/**
 * O que acontece se esta nota for lançada (ou editada assim), SEM gravar: o
 * total conferido, o frete de cada item, o custo de cada insumo antes → depois
 * ("Cheddar: R$ 42,51/kg → R$ 44,90/kg") e as fichas que mudam, em cascata.
 * Mesmo leitor e mesma regra do lançamento.
 */
export async function previaDaNota(
  cliente: ClienteDoParceiro,
  alcance: Alcance,
  entrada: EntradaDaNota,
  notaId?: string,
  /** O dia de hoje para o orçamento (2.5); os testes fixam. */
  hoje?: string,
): Promise<{ ok: true; previa: PreviaDaNota } | Recusada> {
  return cliente.transacao(async (tx) => {
    const atual = notaId ? await notaVisivel(tx, alcance, notaId) : null;
    if (notaId && !atual) return { ok: false, erros: { geral: 'Nota não encontrada.' }, naoEncontrado: true };
    const { lido, ctx } = await lerNota(tx, alcance, entrada, false, atual ?? undefined);
    if (!lido.ok) return lido;
    const d = lido.dados;
    const afetados = Array.from(new Set([...d.itens.map((i) => i.insumoId), ...(atual?.itens.map((i) => i.insumoId ?? '').filter(Boolean) ?? [])]));
    const agora = await ultimasCompras(tx, afetados);
    const semEsta = atual ? await ultimasCompras(tx, afetados, { semNota: atual.id }) : agora;
    const candidata = { notaId: atual?.id ?? '~nova', entradaEm: d.entradaEm, lancadaEm: atual?.lancadaEm?.getTime() ?? Date.now() };

    const novos = new Map<string, CustoExato | null>();
    const custos: ImpactoNoInsumo[] = [];
    for (const insumoId of afetados) {
      const ins = ctx.cadastro.get(insumoId);
      if (!ins) continue;
      const antes = efetivo(ins, agora.get(insumoId));
      const base = semEsta.get(insumoId);
      const daNota = d.itens.filter((i) => i.insumoId === insumoId);
      const vence =
        daNota.length > 0 &&
        (!base || compararCompras(candidata, { notaId: base.notaId, entradaEm: base.entradaEm, lancadaEm: base.lancadaEm.getTime() }) > 0);
      const depois = vence ? custoDaCompra(daNota) : efetivo(ins, base);
      novos.set(insumoId, depois);
      const comparado = antes && depois ? compararCustos(depois, antes) : null;
      custos.push({
        insumoId,
        nome: ins.nome,
        antes: formatarCusto(antes, ins.unidade),
        depois: formatarCusto(depois, ins.unidade),
        efeito: !vence && daNota.length > 0 ? 'nao-muda' : !antes && depois ? 'primeira' : comparado === null || comparado === 0 ? 'igual' : comparado > 0 ? 'sobe' : 'desce',
        ...(!vence && daNota.length > 0 && base ? { vale: formatarData(base.entradaEm) } : {}),
      });
    }
    custos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const mudaram = custos.filter((i) => i.efeito === 'sobe' || i.efeito === 'desce' || i.efeito === 'primeira').map((i) => i.insumoId);
    const { fichas, mais } = await fichasAfetadas(tx, mudaram, novos, custos);

    const somaItens = d.itens.reduce((s, i) => s + i.valorCentavos, 0);
    const estoque = await efeitoPrevistoDaNota(tx, { lojaId: d.lojaId, lojaNome: ctx.lojas.get(d.lojaId)?.nome ?? 'loja', lancadaEm: atual?.lancadaEm ?? null, entradaEm: d.entradaEm });
    // 2.5: o orçamento da loja SEM a versão gravada desta nota (na edição) e com ela como está na tela. Aviso, nunca bloqueio.
    const orcamento = await orcamentoNaNota(tx, alcance, { lojaId: d.lojaId, entradaEm: d.entradaEm, notaCentavos: somaItens + d.freteCentavos, semNotaId: atual?.id, hoje });
    return {
      ok: true as const,
      previa: {
        itens: d.itens.map((i) => ({
          nome: i.insumoNome,
          embalagem: i.embalagem,
          quantidade: `${(i.embalagensMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} = ${formatarQtd(i.quantidadeMilesimos, i.unidade)}`,
          valorCentavos: i.valorCentavos,
          freteRateadoCentavos: i.freteRateadoCentavos,
          custo: formatarCusto(custoDaCompra([i]), i.unidade),
        })),
        somaItensCentavos: somaItens,
        freteCentavos: d.freteCentavos,
        totalCentavos: d.totalCentavos,
        custos,
        fichas,
        maisFichas: mais,
        estoque,
        orcamento,
      },
    };
  });
}


/**
 * Fichas que usam os insumos que mudam (direto ou por pré-preparos, até o
 * fundo), com o custo por porção/kg antes e depois. Leitura por nível, como a
 * cascata: uma consulta de ligações por nível, uma leitura da cascata, duas
 * contas em memória (com o custo de hoje e com o novo).
 */
async function fichasAfetadas(
  tx: ClienteDoParceiro,
  insumoIds: string[],
  novos: ReadonlyMap<string, CustoExato | null>,
  impactos: readonly ImpactoNoInsumo[],
): Promise<{ fichas: ImpactoNaFicha[]; mais: number }> {
  if (insumoIds.length === 0) return { fichas: [], mais: 0 };
  const ids = new Set<string>();
  let fronteira = (await tx.fichaItem.findMany({ where: { insumoId: { in: insumoIds } }, select: { fichaId: true } })).map((x) => x.fichaId);
  for (let nivel = 0; nivel <= PROFUNDIDADE_MAXIMA && fronteira.length > 0; nivel++) {
    const novas = fronteira.filter((id) => !ids.has(id));
    for (const id of novas) ids.add(id);
    if (novas.length === 0) break;
    fronteira = (await tx.fichaItem.findMany({ where: { subfichaId: { in: novas } }, select: { fichaId: true } })).map((x) => x.fichaId);
  }
  if (ids.size === 0) return { fichas: [], mais: 0 };
  const lidas = await lerCascata(tx, Array.from(ids));
  const hoje = cascataDeCusto(lidas);
  const trocado = new Map<string, FichaDaCascata>();
  for (const [id, f] of Array.from(lidas)) {
    trocado.set(id, {
      ...f,
      itens: f.itens.map((i) => {
        const insumoId = (i.insumo as { id?: string } | null)?.id;
        return insumoId && novos.has(insumoId) && i.insumo ? { ...i, insumo: { ...i.insumo, ultimaCompra: novos.get(insumoId) ?? null } } : i;
      }),
    });
  }
  const depois = cascataDeCusto(trocado);
  const nomePorInsumo = new Map(impactos.map((i) => [i.insumoId, i.nome]));
  const out: ImpactoNaFicha[] = [];
  for (const id of Array.from(ids)) {
    const f = lidas.get(id);
    if (!f || !f.ativa) continue;
    const a = hoje.custo(id) as CustoDaFicha | null;
    const b = depois.custo(id) as CustoDaFicha | null;
    if (!a || !b || compararFracoes(a.porRendimento, b.porRendimento) === 0) continue;
    const diretos = f.itens.map((i) => (i.insumo as { id?: string } | null)?.id).filter((x): x is string => !!x && nomePorInsumo.has(x));
    const porQue = diretos.length ? diretos.map((x) => nomePorInsumo.get(x)!).join(', ') : 'pré-preparo';
    const por = porUnidadeDeRendimento(f.unidadeRendimento, f.tipo);
    out.push({
      id,
      nome: f.nome,
      tipo: TIPOS_DE_FICHA[f.tipo],
      porQue: `${porQue} · rende ${formatarRendimento(f.rendimentoMilesimos, f.unidadeRendimento, f.tipo)}`,
      antes: `${formatarFracao(a.porRendimento)} ${por}`,
      depois: `${formatarFracao(b.porRendimento)} ${por}`,
      sobe: compararFracoes(b.porRendimento, a.porRendimento) > 0,
      variacaoCentavos: Number(centavosDaFracao(b.porRendimento) - centavosDaFracao(a.porRendimento)),
    });
  }
  // Maior alta primeiro (é o que pede atenção); empate, pelo nome.
  out.sort((x, y) => y.variacaoCentavos - x.variacaoCentavos || x.nome.localeCompare(y.nome, 'pt-BR'));
  return { fichas: out.slice(0, TETO_DE_FICHAS_NA_PREVIA), mais: Math.max(0, out.length - TETO_DE_FICHAS_NA_PREVIA) };
}

// ================================================================ nota: lista e detalhe

/**
 * Página de notas das lojas do alcance. Loja pedida fora do alcance = lista
 * vazia (nunca a de outra loja). Total do período = soma das lançadas.
 */
export async function listarNotas(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, filtros: Partial<FiltrosDeNota> = {}) {
  const f: FiltrosDeNota = { ...FILTROS_DE_NOTA_PADRAO, ...filtros };
  const doAlcance = filtroDeLojas(alcance);
  const lojaId = f.lojaId ? (doAlcance && !doAlcance.in.includes(f.lojaId) ? { in: [] as string[] } : f.lojaId) : doAlcance;
  const where: Prisma.NotaEntradaWhereInput = {
    lojaId,
    ...(f.fornecedorId ? { fornecedorId: f.fornecedorId } : {}),
    ...(f.de || f.ate ? { entradaEm: { ...(f.de ? { gte: dataDoBanco(f.de) } : {}), ...(f.ate ? { lte: dataDoBanco(f.ate) } : {}) } } : {}),
    status: f.situacao === 'lancadas' ? 'LANCADA' : f.situacao === 'canceladas' ? 'CANCELADA' : { in: ['LANCADA', 'CANCELADA'] },
  };
  return cliente.transacao(async (tx) => {
    const total = await tx.notaEntrada.count({ where });
    const soma = await tx.notaEntrada.aggregate({ where: { ...where, status: 'LANCADA' }, _sum: { totalCentavos: true } });
    const paginas = Math.max(1, Math.ceil(total / NOTAS_POR_PAGINA));
    const pagina = Math.min(Math.max(1, f.pagina), paginas);
    const lidas = await tx.notaEntrada.findMany({
      where,
      orderBy: [{ entradaEm: 'desc' }, { lancadaEm: 'desc' }, { id: 'desc' }],
      skip: (pagina - 1) * NOTAS_POR_PAGINA,
      take: NOTAS_POR_PAGINA,
      select: {
        id: true,
        numero: true,
        serie: true,
        entradaEm: true,
        totalCentavos: true,
        freteCentavos: true,
        status: true,
        fornecedorId: true,
        fornecedorNomeSnapshot: true,
        loja: { select: { id: true, nome: true } },
        _count: { select: { itens: true } },
      },
    });
    return {
      linhas: lidas.map((n) => ({
        id: n.id,
        numero: n.numero,
        serie: n.serie,
        entradaEm: n.entradaEm.toISOString().slice(0, 10),
        totalCentavos: n.totalCentavos,
        freteCentavos: n.freteCentavos,
        cancelada: n.status === 'CANCELADA',
        fornecedorId: n.fornecedorId,
        fornecedor: n.fornecedorNomeSnapshot ?? '—',
        loja: n.loja.nome,
        itens: n._count.itens,
      })),
      total,
      somaCentavos: soma._sum.totalCentavos ?? 0,
      pagina,
      paginas,
    };
  });
}

export type LinhaDeNota = Awaited<ReturnType<typeof listarNotas>>['linhas'][number];

/** Opções dos filtros da lista: lojas do alcance e fornecedores (com nota ou ativos). */
export async function opcoesDosFiltrosDeNota(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>) {
  return cliente.transacao(async (tx) => ({
    lojas: await tx.loja.findMany({ where: { id: filtroDeLojas(alcance) }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    fornecedores: await tx.fornecedor.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
  }));
}

/** Detalhe da nota (nas lojas do alcance): itens com o custo de cada um, se ela é a que vale no custo de cada insumo, alterações. */
export async function obterNota(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>, id: string) {
  return cliente.transacao(async (tx) => {
    if (!ID.test(id)) return null;
    const n = await tx.notaEntrada.findFirst({
      where: { id, lojaId: filtroDeLojas(alcance) },
      select: {
        ...SELECAO_DA_NOTA_GRAVADA,
        canceladaEm: true,
        motivoCancelamento: true,
        criadoEm: true,
        fornecedor: { select: { id: true, nome: true, documento: true } },
        itens: { ...SELECAO_DA_NOTA_GRAVADA.itens, select: { ...SELECAO_DA_NOTA_GRAVADA.itens.select, id: true, insumo: { select: { id: true, nome: true, ativo: true } } } },
      },
    });
    if (!n) return null;
    const insumoIds = n.itens.map((i) => i.insumoId ?? '').filter(Boolean);
    const valem = await ultimasCompras(tx, insumoIds);
    const historico = await listarHistorico(tx, { de: [{ entidade: 'NotaEntrada', ids: [id] }], limite: 10, verPrecos: false });
    const somaItens = n.itens.reduce((s, i) => s + i.valorTotalCentavos, 0);
    const estoque = await estoqueDaNota(tx, { id: n.id, lojaId: n.lojaId, loja: n.loja.nome, status: n.status, lancadaEm: n.lancadaEm, entradaEm: n.entradaEm.toISOString().slice(0, 10) });
    return {
      id: n.id,
      rotulo: rotuloDaNota(n),
      numero: n.numero,
      serie: n.serie,
      entradaEm: n.entradaEm.toISOString().slice(0, 10),
      lojaId: n.lojaId,
      loja: n.loja.nome,
      fornecedor: n.fornecedor ? { id: n.fornecedor.id, nome: n.fornecedor.nome, documento: n.fornecedor.documento } : null,
      fornecedorNome: n.fornecedorNomeSnapshot ?? '—',
      freteCentavos: n.freteCentavos,
      totalCentavos: n.totalCentavos,
      somaItensCentavos: somaItens,
      cancelada: n.status === 'CANCELADA',
      canceladaEm: n.canceladaEm,
      motivoCancelamento: n.motivoCancelamento,
      lancadaEm: n.lancadaEm,
      versao: n.atualizadoEm.toISOString(),
      itens: n.itens.map((i) => {
        const vale = i.insumoId ? valem.get(i.insumoId) : undefined;
        return {
          id: i.id,
          insumoId: i.insumoId,
          varianteId: i.varianteId,
          insumoAtivo: i.insumo?.ativo ?? false,
          nome: i.insumoNomeSnapshot ?? i.insumo?.nome ?? '?',
          /** O insumo foi renomeado depois: a nota mostra como era (snapshot) e diz o nome de hoje. */
          nomeHoje: i.insumo && i.insumo.nome !== i.insumoNomeSnapshot ? i.insumo.nome : null,
          unidade: (i.unidadeSnapshot ?? 'UN') as Unidade,
          embalagem: i.embalagemSnapshot ?? '',
          embalagensMilesimos: i.embalagensMilesimos,
          quantidadeMilesimos: i.quantidadeMilesimos,
          valorCentavos: i.valorTotalCentavos,
          freteRateadoCentavos: i.freteRateadoCentavos,
          custo: custoDaCompra([{ valorCentavos: i.valorTotalCentavos, freteRateadoCentavos: i.freteRateadoCentavos, quantidadeMilesimos: i.quantidadeMilesimos }]),
          /** Esta nota é a que dá o custo do insumo agora? Se não, a data da que vale. */
          valeNoCusto: vale?.notaId === n.id,
          valeOutra: vale && vale.notaId !== n.id ? formatarData(vale.entradaEm) : null,
        };
      }),
      historico,
      /** 1.6: o que a nota fez no estoque da loja (frase e movimentos, com os estornos). */
      estoque,
    };
  });
}

export type NotaDetalhada = NonNullable<Awaited<ReturnType<typeof obterNota>>>;

/** Para o formulário de edição: a nota como os campos esperam (texto). */
export function valoresDaNota(n: NotaDetalhada) {
  const dinheiro = (c: number) => `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;
  return {
    lojaId: n.lojaId,
    fornecedorId: n.fornecedor?.id ?? '',
    numero: n.numero ?? '',
    serie: n.serie,
    data: n.entradaEm,
    frete: n.freteCentavos ? dinheiro(n.freteCentavos) : '',
    total: dinheiro(n.totalCentavos),
    itens: n.itens.map((i) => ({
      insumoId: i.insumoId ?? '',
      embalagem: embalagemDoSnapshot(i),
      quantidade: (i.embalagensMilesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false }),
      valor: dinheiro(i.valorCentavos),
    })),
  };
}

/** Qual opção do seletor de embalagem a linha gravada era (variante pelo id; a granel pelo texto do snapshot). */
function embalagemDoSnapshot(i: { embalagem: string; varianteId: string | null }): string {
  if (i.varianteId) return `${PREFIXO_DA_EMBALAGEM}${i.varianteId}`;
  return i.embalagem.startsWith('A granel') ? A_GRANEL : EMBALAGEM_PADRAO;
}

