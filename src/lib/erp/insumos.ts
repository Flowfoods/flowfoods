/**
 * Insumos (1.1) — regra de negócio com banco, sem tela. Recebe sempre um
 * `ClienteDoParceiro`: não existe função aqui que consiga tocar em insumo de
 * outro parceiro. A leitura do formulário, o custo e o retrato do histórico
 * são puros (`insumo-campos.ts`, `unidades.ts`).
 *
 * - toda gravação leva o histórico (antes/depois só do que mudou) na MESMA
 *   transação: ou ficam os dois, ou nenhum;
 * - editar é condicional à versão lida (`atualizadoEm`): duas abas editando, a
 *   segunda recebe "alguém alterou" e nada é sobrescrito;
 * - desativar não apaga (insumo tem uso em ficha, nota, estoque...);
 * - trocar a unidade só sem outra embalagem e sem uso (conferido com a linha
 *   travada, dentro da transação);
 * - I.1a: categoria obrigatória no servidor (criar e editar), conferida dentro da transação (existe, é do parceiro, está
 *   ativa); nome único sem diferenciar maiúscula nem acento; e idempotência de criar pela chave de envio (reenvio com a mesma
 *   chave e o mesmo conteúdo devolve o insumo já criado como sucesso).
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from './tenant';
import { checkVioladoDe, ehErroDeUnicidade } from './tenant';
import { listarHistorico } from './historico';
import {
  CATEGORIAS_QUE_COSTUMAM_SER_FRIAS,
  conservacaoAConfirmar,
  diferenca,
  FILTRO_A_CONFIRMAR,
  FILTROS_PADRAO,
  lerChaveDeEnvio,
  FILTRO_SEM_MARCA,
  lerFormInsumo,
  lerPorPagina,
  marcado,
  motivosDoCadastro,
  retratoDoInsumo,
  versaoDaVariante,
  type Conservacao,
  type DadosInsumo,
  type Erros,
  type FiltrosDeInsumo,
  type MotivoIncompleto,
  type TipoInsumo,
} from './insumo-campos';
import { pode, type Alcance } from './permissoes';
import { ACENTUADAS, CHAVE_DO_SISTEMA, chaveDoNome, SEM_ACENTO } from './categoria-campos';
import { sugerirCategoria } from './categoria-sugestao';
import { categoriaParaClassificar } from './categorias';
import { compararFracoes, custoDaEmbalagem, custoPorUnidade, type CustoExato, type Fracao, type Unidade } from './unidades';
import { contaDaFicha, custoIncompleto, type CustoDaFicha } from './ficha-campos';
import { custosEmCascata } from './ficha-custos';
import { resumoDosVinculos, vinculosDoInsumo } from './insumo-remocao';
import { comprasDoInsumo, ultimasCompras, type UltimaCompra } from './compras-custo';
import { colunasDaValidade, COLUNA_DA_VALIDADE, SELECAO_DA_VALIDADE, validadesDaLinha, type ColunasDaValidade, type Validades } from './validade';

export type ResultadoCadastro =
  | {
      ok: true;
      id: string;
      nome: string;
      mudou: string[];
      /** I.1a: o mesmo envio chegou de novo (clique repetido, resposta perdida): devolve o insumo que já existe, sem criar outro. */
      repetido?: boolean;
    }
  | {
      ok: false;
      erros: Erros;
      /** Alguém gravou depois da leitura desta tela. */
      conflito?: boolean;
      /** Nome repetido de um insumo desativado: dá para reativar em vez de criar. */
      desativadoId?: string;
      /** I.1a: o insumo ATIVO que já tem este nome (ou um escrito de outro jeito): abrir em vez de cadastrar de novo. */
      existenteId?: string;
      naoEncontrado?: boolean;
    };

export const MENSAGEM_CONFLITO = 'Alguém alterou este insumo agora há pouco. Recarregue a página para ver a versão nova; nada foi gravado.';

export const MENSAGEM_DESATIVADO = 'Insumo desativado: reative antes de editar.';

/** Insumo produzido por pré-preparo (1.3): nome, unidade, situação e custo vêm da ficha. */
const mensagemDoPreparo = (nome: string, ficha: string) =>
  `“${nome}” é pré-preparo: muda junto com a ficha técnica “${ficha}” (nome, rendimento, situação e custo).`;

/** Recusa no meio da transação: desfaz tudo e vira mensagem. */
class Recusa extends Error {
  constructor(readonly resultado: Extract<ResultadoCadastro, { ok: false }>) {
    super('recusa');
  }
}

/**
 * O banco recusou por um CHECK (herança a da 1.4): frase em vez de 500. Com os
 * CHECKs validados (migration 20261018000000) uma linha antiga fora da regra
 * não existe mais; se aparecer (gravada por fora), a pessoa sabe o que fazer.
 */
export function erroDoCheck(e: unknown): Extract<ResultadoCadastro, { ok: false }> | null {
  const check = checkVioladoDe(e);
  if (!check) return null;
  const geral = /validade/i.test(check)
    ? 'A validade gravada neste insumo está fora da regra (a conservação principal precisa ter validade, até 730 dias). Corrija em Editar, no bloco “Conservação e prazo de uso após abertura”, e tente de novo. Nada foi gravado.'
    : 'O banco recusou estes valores (fora da faixa permitida). Confira os números e tente de novo. Nada foi gravado.';
  return { ok: false, erros: { geral } };
}

/** Trava os nomes de insumo deste parceiro: duas pessoas cadastrando "Farinha" e "farinha" ao mesmo tempo esperam uma à outra. */
async function travarNomes(tx: ClienteDoParceiro) {
  await tx.sql`SELECT 1 AS "ok" FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ff:insumo-nomes:${tx.parceiroId}`}, 0))) AS "trava"`;
}

/** O insumo que já tem este nome sem diferenciar maiúscula nem acento (fora o próprio, ao renomear). */
async function insumoComNomeParecido(tx: ClienteDoParceiro, nome: string, exceto: string | null) {
  const achados = await tx.sql<{ id: string; nome: string; ativo: boolean }>`
    SELECT "id", "nome", "ativo" FROM "Insumo"
    WHERE "parceiroId" = ${tx.parceiroId}
      AND lower(translate(normalize("nome", NFC), ${ACENTUADAS}, ${SEM_ACENTO})) = ${chaveDoNome(nome)}
      AND "id" <> ${exceto ?? ''}
    ORDER BY ("nome" = ${nome}) DESC, "ativo" DESC
    LIMIT 1`;
  return achados[0] ?? null;
}

/** A frase do nome que já existe: o mesmo nome, ou o mesmo nome escrito de outro jeito (caixa, acento). */
function erroDeNomeRepetido(achado: { id: string; nome: string; ativo: boolean }, digitado: string): Extract<ResultadoCadastro, { ok: false }> {
  const igual = achado.nome === digitado;
  if (!achado.ativo) {
    return {
      ok: false,
      erros: { nome: `Já existe “${achado.nome}” desativado${igual ? '' : ' (o mesmo nome, escrito de outro jeito)'}. Reative em vez de cadastrar de novo.` },
      desativadoId: achado.id,
    };
  }
  return {
    ok: false,
    erros: { nome: igual ? 'Já existe um insumo com esse nome.' : `Já existe “${achado.nome}” (o mesmo nome, escrito de outro jeito). Abra esse insumo em vez de cadastrar de novo.` },
    existenteId: achado.id,
  };
}

/** I.1b: o insumo já está numa receita ou na embalagem de um prato; virar material de limpeza e uso quebraria essas fichas. */
export const FRASE_MATERIAL_EM_USO = 'Este insumo já está em uma ficha técnica ou na embalagem de um prato, e material de limpeza e uso não entra em ficha. Tire-o de lá antes de mudar o tipo.';

const FRASE_ENVIO_TORTO = 'O envio deste formulário não tem uma chave válida. Recarregue a página e tente de novo; nada foi gravado.';
const FRASE_ENVIO_DIFERENTE = (nome: string) =>
  `Este envio já cadastrou “${nome}” e agora chegou com dados diferentes. Recarregue a página para cadastrar de novo; nada foi gravado.`;

/** A impressão do conteúdo do envio: mesma chave com impressão diferente é outro pedido, não um reenvio. */
export function hashDoEnvio(d: DadosInsumo): string {
  const r = retratoDoInsumo(d);
  return createHash('sha256').update(JSON.stringify([d.nome, d.tipo, d.unidade, d.categoriaId ?? null, r.conservacao, r.prazoAposAbertura, d.conteudoMilesimos, d.precoEmbalagemCentavos, d.taxaEntregaCentavos, d.marcaReferencia])).digest('hex');
}

/**
 * Como a categoria foi escolhida: igual à sugestão pelo nome = SUGESTAO (e, se a sugestão foi "Outros" por dúvida, o motivo
 * fica para a fila de revisão); qualquer outra = MANUAL. A conta é refeita aqui, na gravação: o que o navegador diz não vale.
 */
function comoClassificou(nome: string, tipo: TipoInsumo, chaveDaEscolhida: string | null) {
  const s = sugerirCategoria(nome, tipo);
  if (chaveDaEscolhida !== null && chaveDaEscolhida === s.chave) {
    return { classificadoPor: 'SUGESTAO' as const, classificacaoMotivo: s.chave === CHAVE_DO_SISTEMA ? s.motivo : null };
  }
  return { classificadoPor: 'MANUAL' as const, classificacaoMotivo: null };
}

// ------------------------------------------------------------ cadastrar

/**
 * Valida o texto do formulário e grava. Toda conversão para inteiro acontece no
 * servidor: o navegador manda texto, nunca o número já calculado.
 *
 * I.1a: nome, categoria e unidade base são obrigatórios (cada falta volta no campo dela); a categoria é conferida dentro da
 * transação; o nome não repete nem por maiúscula ou acento; e `entrada.envio` (a chave do formulário) faz o reenvio voltar
 * como o mesmo insumo, sem criar outro.
 */
export async function cadastrarInsumo(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
  /** Quem envia (id do usuário): a chave de envio é POR PESSOA, então a chave de um não reconhece nem revela o envio de outro. */
  pessoaId = '',
): Promise<ResultadoCadastro> {
  const lido = lerFormInsumo(entrada);
  const envio = lerChaveDeEnvio(entrada.envio);
  if (!lido.ok) return lido;
  if (!envio.ok) return { ok: false, erros: { geral: FRASE_ENVIO_TORTO }, conflito: true };
  const d = lido.dados;
  const chave = envio.chave ? createHash('sha256').update(`${pessoaId}|${envio.chave}`).digest('hex').slice(0, 40) : null;
  const hash = chave ? hashDoEnvio(d) : null;
  try {
    return await cliente.transacao(async (tx) => {
      await travarNomes(tx);
      if (chave) {
        const j = await tx.insumo.findFirst({ where: { chaveEnvio: chave }, select: { id: true, nome: true, hashEnvio: true } });
        if (j) {
          if (j.hashEnvio === hash) return { ok: true as const, id: j.id, nome: j.nome, mudou: [], repetido: true };
          throw new Recusa({ ok: false, erros: { geral: FRASE_ENVIO_DIFERENTE(j.nome) }, conflito: true });
        }
      }
      const cat = await categoriaParaClassificar(tx, d.categoriaId!);
      if (!cat.ok) throw new Recusa({ ok: false, erros: { categoriaId: cat.erro } });
      const parecido = await insumoComNomeParecido(tx, d.nome, null);
      if (parecido) throw new Recusa(erroDeNomeRepetido(parecido, d.nome));
      const como = comoClassificou(d.nome, d.tipo, cat.categoria.chave);
      const novo = await tx.insumo.create({
        data: {
          parceiroId: tx.parceiroId,
          nome: d.nome,
          tipo: d.tipo,
          unidade: d.unidade,
          conservacao: d.conservacao,
          ...colunasDaValidade(d.validades),
          conteudoMilesimos: d.conteudoMilesimos,
          precoEmbalagemCentavos: d.precoEmbalagemCentavos,
          taxaEntregaCentavos: d.taxaEntregaCentavos,
          marcaReferencia: d.marcaReferencia,
          // A conservação foi ESCOLHIDA (o servidor não assume mais Seco): já nasce confirmada por uma pessoa.
          conservacaoConfirmadaEm: new Date(),
          categoriaId: cat.categoria.id,
          ...como,
          classificadoEm: new Date(),
          ...(chave ? { chaveEnvio: chave, hashEnvio: hash } : {}),
        },
        select: { id: true, nome: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: novo.id,
          acao: 'CRIOU',
          depois: { ...retratoDoInsumo({ ...d, categoriaId: cat.categoria.id, categoriaNome: cat.categoria.nome }), classificadoPor: como.classificadoPor },
          autorNome,
        },
      });
      return { ok: true as const, ...novo, mudou: [] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) {
      // A chave ou o nome já existiam (outra aba, ao mesmo tempo): se é o mesmo envio, é sucesso; senão, o nome.
      if (chave) {
        const j = await cliente.insumo.findFirst({ where: { chaveEnvio: chave }, select: { id: true, nome: true, hashEnvio: true } });
        if (j && j.hashEnvio === hash) return { ok: true, id: j.id, nome: j.nome, mudou: [], repetido: true };
      }
      const existente = await cliente.insumo.findFirst({ where: { nome: d.nome }, select: { id: true, nome: true, ativo: true } });
      if (existente) return erroDeNomeRepetido(existente, d.nome);
      return { ok: false, erros: { nome: 'Já existe um insumo com esse nome.' } };
    }
    const check = erroDoCheck(e);
    if (check) return check;
    throw e;
  }
}

// --------------------------------------------------------------- editar

const SELECAO_DE_USO = {
  _count: {
    select: {
      variantes: true,
      usosEmFichas: true,
      usosComoEmbalagem: true,
      notaItens: true,
      saldos: true,
      movimentos: true,
      contagemItens: true,
      requisicaoItens: true,
      producoes: true,
      etiquetas: true,
    },
  },
  fichaQueProduz: { select: { id: true } },
} as const;

/**
 * Por que a unidade NÃO pode mudar (null = pode). Com outra embalagem ou
 * qualquer uso, os milésimos gravados ali passariam a significar outra coisa.
 */
export async function motivoDaUnidadeTravada(
  cliente: ClienteDoParceiro,
  id: string,
  { peloPreparo = false }: { /** Quem muda é a ficha que o produz (1.3): ela não conta como uso. */ peloPreparo?: boolean } = {},
): Promise<string | null> {
  const i = await cliente.insumo.findUnique({ where: { id }, select: SELECAO_DE_USO });
  if (!i) return null;
  if (i._count.variantes > 0) return 'A unidade não muda: este insumo tem outra embalagem cadastrada.';
  const { variantes: _v, ...usos } = i._count;
  const emUso = Object.values(usos).some((n) => n > 0) || (!!i.fichaQueProduz && !peloPreparo);
  return emUso ? 'A unidade não muda: este insumo já é usado em ficha, compra ou estoque.' : null;
}

function dadosDe(
  i: {
    nome: string;
    tipo: TipoInsumo;
    unidade: Unidade;
    conservacao: Conservacao;
    conteudoMilesimos: number;
    precoEmbalagemCentavos: number;
    taxaEntregaCentavos: number;
    categoriaId?: string | null;
    categoria?: { nome: string } | null;
    marcaReferencia?: string | null;
  } & ColunasDaValidade,
): DadosInsumo {
  return {
    nome: i.nome,
    tipo: i.tipo,
    marcaReferencia: i.marcaReferencia ?? null,
    ...(i.categoriaId ? { categoriaId: i.categoriaId, categoriaNome: i.categoria?.nome ?? null } : {}),
    unidade: i.unidade,
    conservacao: i.conservacao,
    validades: validadesDaLinha(i)!,
    conteudoMilesimos: i.conteudoMilesimos,
    precoEmbalagemCentavos: i.precoEmbalagemCentavos,
    taxaEntregaCentavos: i.taxaEntregaCentavos,
  };
}

/** L.1: o que a tela mandou já é exatamente o que está gravado (e não pede uma confirmação de conservação que ainda falta)? */
function jaEstaGravado(
  atual: Parameters<typeof dadosDe>[0] & { categoriaId: string | null; conservacaoConfirmadaEm: Date | null },
  d: DadosInsumo,
  pedeConfirmar: boolean,
): boolean {
  if (pedeConfirmar && !atual.conservacaoConfirmadaEm) return false;
  const mesmaCategoria = d.categoriaId === atual.categoriaId;
  const recebido = { ...d, categoriaNome: mesmaCategoria ? (atual.categoria?.nome ?? null) : d.categoriaNome };
  return mesmaCategoria && diferenca(retratoDoInsumo(dadosDe(atual)), retratoDoInsumo(recebido)) === null;
}

/**
 * `entrada.versao` = o `atualizadoEm` que a tela leu (ISO). A gravação só
 * acontece se a linha ainda estiver nessa versão.
 */
export async function editarInsumo(
  cliente: ClienteDoParceiro,
  id: string,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  const versao = new Date(typeof entrada.versao === 'string' ? entrada.versao : '');
  if (Number.isNaN(versao.getTime())) return { ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true };

  const atual = await cliente.insumo.findUnique({
    where: { id },
    include: { fichaQueProduz: { select: { nome: true } }, categoria: { select: { nome: true } } },
  });
  if (!atual) return { ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true };
  if (atual.fichaQueProduz) return { ok: false, erros: { geral: mensagemDoPreparo(atual.nome, atual.fichaQueProduz.nome) } };
  // A tela esconde "Editar" de desativado; quem decide é aqui.
  if (!atual.ativo) return { ok: false, erros: { geral: MENSAGEM_DESATIVADO } };
  const versaoVelha = atual.atualizadoEm.getTime() !== versao.getTime();

  // I.1a: o insumo antigo sem categoria também a recebe ao ser editado (o formulário já vem com a sugestão marcada). Quem chama
  // sem o campo `categoriaId` (importação, rotina de preço) e edita um insumo que JÁ tem categoria a mantém; mandar o campo
  // vazio, ou editar um insumo sem categoria sem mandá-la, é recusado com a frase.
  // I.1b: o mesmo vale para a conservação e a marca de referência: o campo AUSENTE mantém o que está gravado (nunca vira Seco);
  // o campo presente e vazio é recusado (conservação) ou apaga a marca.
  const completa: Record<string, unknown> = { ...entrada };
  if (!('categoriaId' in entrada) && atual.categoriaId) completa.categoriaId = atual.categoriaId;
  if (!('conservacao' in entrada)) completa.conservacao = atual.conservacao;
  if (!('marcaReferencia' in entrada) && atual.marcaReferencia) completa.marcaReferencia = atual.marcaReferencia;
  const lido = lerFormInsumo(completa, atual.tipo);
  if (versaoVelha) {
    // L.1: a resposta da edição se perdeu e a pessoa salvou de novo (ou duas abas mandaram o mesmo): se o que chegou É o que já está
    // gravado, o resultado que ela queria existe, então é sucesso ("Nada mudou"), não "alguém alterou". Qualquer diferença segue conflito.
    if (lido.ok && jaEstaGravado(atual, lido.dados, marcado(entrada.conservacaoConfirmada))) return { ok: true, id, nome: atual.nome, mudou: [] };
    return { ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true };
  }
  if (!lido.ok) return lido;
  const d = lido.dados;
  const trocouDeCategoria = d.categoriaId !== atual.categoriaId;
  // I.1b: salvar NÃO confirma a conservação sozinho. Só confirma quem a trocou ou marcou "Confirmo que a conservação é esta".
  const confirma = marcado(entrada.conservacaoConfirmada) || d.conservacao !== atual.conservacao;

  try {
    return await cliente.transacao(async (tx) => {
      if (d.nome !== atual.nome) await travarNomes(tx);
      const cat = await categoriaParaClassificar(tx, d.categoriaId!, atual.categoriaId);
      if (!cat.ok) throw new Recusa({ ok: false, erros: { categoriaId: cat.erro } });
      d.categoriaNome = cat.categoria.nome;
      if (d.nome !== atual.nome) {
        const parecido = await insumoComNomeParecido(tx, d.nome, id);
        if (parecido) throw new Recusa(erroDeNomeRepetido(parecido, d.nome));
      }
      const como = trocouDeCategoria ? comoClassificou(d.nome, d.tipo, cat.categoria.chave) : null;
      const antesRetrato = retratoDoInsumo(dadosDe(atual));
      const depoisRetrato = retratoDoInsumo(d);
      if (como) {
        // O "como foi classificado" entra no histórico só quando a categoria mudou.
        antesRetrato.classificadoPor = atual.classificadoPor ?? null;
        depoisRetrato.classificadoPor = como.classificadoPor;
      }
      const mudanca = diferenca(antesRetrato, depoisRetrato);
      if (!mudanca) {
        // I.1b: sem mudar nada, só marcar "Confirmo que a conservação é esta" confirma a de um insumo que ninguém confirmou.
        if (!atual.conservacaoConfirmadaEm && confirma) return confirmarNaTransacao(tx, id, atual.nome, d.conservacao, versao, autorNome);
        return { ok: true as const, id, nome: atual.nome, mudou: [] };
      }

      // Condicional: a linha só muda se ainda está na versão que a tela leu.
      // O UPDATE trava a linha até o fim da transação.
      const r = await tx.insumo.updateMany({
        // `ativo: true`: desativar no meio do caminho também conta como conflito.
        where: { id, atualizadoEm: versao, ativo: true },
        data: {
          nome: d.nome,
          tipo: d.tipo,
          unidade: d.unidade,
          conservacao: d.conservacao,
          ...colunasDaValidade(d.validades),
          conteudoMilesimos: d.conteudoMilesimos,
          precoEmbalagemCentavos: d.precoEmbalagemCentavos,
          taxaEntregaCentavos: d.taxaEntregaCentavos,
          marcaReferencia: d.marcaReferencia,
          ...(atual.conservacaoConfirmadaEm || !confirma ? {} : { conservacaoConfirmadaEm: new Date() }),
          // Mexeu na categoria: a classificação passa a ser desta pessoa e sai do lote da classificação assistida (a reversão
          // do lote não a desfaz mais). Salvou outra coisa, sem trocar a categoria: o insumo também sai do lote (uma pessoa o
          // revisou depois da máquina), mas a categoria e o "como foi classificada" ficam como estavam.
          ...(como
            ? { categoriaId: cat.categoria.id, ...como, classificacaoLote: null, classificadoEm: new Date() }
            : atual.classificacaoLote
              ? { classificacaoLote: null }
              : {}),
        },
      });
      if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true });
      if (d.tipo === 'MATERIAL' && atual.tipo !== 'MATERIAL') {
        // I.1b: material de limpeza e uso não entra em ficha nem na embalagem de um prato. Com a linha travada pelo UPDATE
        // (a ficha que cita o insumo o trava em FOR SHARE), conferir o uso aqui não perde uma ficha que está sendo salva agora.
        const usos = await tx.insumo.findUnique({ where: { id }, select: { _count: { select: { usosEmFichas: true, usosComoEmbalagem: true } } } });
        if (usos && usos._count.usosEmFichas + usos._count.usosComoEmbalagem > 0) throw new Recusa({ ok: false, erros: { tipo: FRASE_MATERIAL_EM_USO } });
      }
      if (d.unidade !== atual.unidade) {
        // Com a linha travada: uma embalagem nova (que trava a linha em FOR
        // SHARE) ou um uso não entra no meio desta conferência.
        const motivo = await motivoDaUnidadeTravada(tx, id);
        if (motivo) throw new Recusa({ ok: false, erros: { unidade: motivo } });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: id,
          acao: 'ALTEROU',
          antes: mudanca.antes,
          depois: mudanca.depois,
          autorNome,
        },
      });
      return { ok: true as const, id, nome: d.nome, mudou: mudanca.campos };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    if (ehErroDeUnicidade(e)) {
      const existente = await cliente.insumo.findFirst({ where: { nome: d.nome, NOT: { id } }, select: { id: true, nome: true, ativo: true } });
      if (existente) return erroDeNomeRepetido(existente, d.nome);
      return { ok: false, erros: { nome: 'Já existe um insumo com esse nome.' } };
    }
    const check = erroDoCheck(e);
    if (check) return check;
    throw e;
  }
}

// ------------------------------------------------ conservação a confirmar

/** Dentro da transação: grava a confirmação (só se ainda não houver) e o registro no histórico. */
async function confirmarNaTransacao(tx: ClienteDoParceiro, id: string, nome: string, conservacao: Conservacao, versao: Date | null, autorNome: string) {
  const r = await tx.insumo.updateMany({
    where: { id, ativo: true, conservacaoConfirmadaEm: null, ...(versao ? { atualizadoEm: versao } : {}) },
    data: { conservacaoConfirmadaEm: new Date() },
  });
  if (r.count === 0) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_CONFLITO }, conflito: true });
  await tx.historicoAlteracao.create({
    data: {
      parceiroId: tx.parceiroId,
      entidade: 'Insumo',
      entidadeId: id,
      acao: 'CONFIRMOU',
      antes: { nome, conservacao },
      depois: { nome, conservacao },
      autorNome,
    },
  });
  return { ok: true as const, id, nome, mudou: ['conservacao'] };
}

/**
 * I.1b: "Confirmar Seco" (ou a conservação que está gravada): uma pessoa diz que o que está lá é o certo. Não muda a
 * conservação nem o prazo; só grava a confirmação e o registro. Confirmar de novo o que já foi confirmado é sem efeito.
 */
export async function confirmarConservacao(cliente: ClienteDoParceiro, id: string, autorNome = 'Sistema'): Promise<ResultadoCadastro> {
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await tx.insumo.findUnique({
        where: { id },
        select: { nome: true, ativo: true, conservacao: true, conservacaoConfirmadaEm: true, fichaQueProduz: { select: { nome: true } } },
      });
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true });
      if (atual.fichaQueProduz) throw new Recusa({ ok: false, erros: { geral: mensagemDoPreparo(atual.nome, atual.fichaQueProduz.nome) } });
      if (!atual.ativo) throw new Recusa({ ok: false, erros: { geral: MENSAGEM_DESATIVADO } });
      if (atual.conservacaoConfirmadaEm) return { ok: true as const, id, nome: atual.nome, mudou: [] };
      return confirmarNaTransacao(tx, id, atual.nome, atual.conservacao as Conservacao, null, autorNome);
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    throw e;
  }
}

/** Quantos insumos ativos estão com a conservação a confirmar (a lista mostra o aviso e o filtro). */
export async function contarConservacaoAConfirmar(cliente: ClienteDoParceiro): Promise<number> {
  return cliente.insumo.count({ where: filtroDaConfirmacao() });
}

function filtroDaConfirmacao(): Prisma.InsumoWhereInput {
  return { ativo: true, ...filtroDaConfirmacaoDaSituacao() };
}

/** A confirmação pendente em si, sem olhar se o insumo está ativo (a situação escolhida na lista é outro filtro). */
function filtroDaConfirmacaoDaSituacao(): Prisma.InsumoWhereInput {
  return {
    tipo: { not: 'PRE_PREPARO' },
    conservacao: 'SECO',
    conservacaoConfirmadaEm: null,
    categoria: { is: { chave: { in: [...CATEGORIAS_QUE_COSTUMAM_SER_FRIAS] } } },
  };
}

/** L.1: cadastro incompleto = qualquer motivo de `motivosDoCadastro` (a mesma lista, em SQL). Um teste confere os dois lados. */
function filtroDoIncompleto(): Prisma.InsumoWhereInput {
  return {
    OR: [
      { categoriaId: null },
      { categoria: { is: { chave: CHAVE_DO_SISTEMA } } },
      filtroDaConfirmacaoDaSituacao(),
      { fichaQueProduz: { isNot: null }, validadeSecoMin: null, validadePistaFriaMin: null, validadeRefrigeradoMin: null, validadeCongeladoMin: null },
    ],
  };
}

// --------------------------------------------------- desativar/reativar

/**
 * Desativar não apaga: o insumo sai da lista padrão e do ⌘K fica marcado.
 * Condicional à situação lida (desativar o que já está desativado é recusado).
 */
export async function mudarSituacaoInsumo(
  cliente: ClienteDoParceiro,
  id: string,
  ativo: boolean,
  motivoTexto: unknown,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  const motivo = typeof motivoTexto === 'string' ? motivoTexto.trim().replace(/\s+/g, ' ').slice(0, 200) || null : null;
  try {
    return await cliente.transacao(async (tx) => {
      const atual = await tx.insumo.findUnique({ where: { id }, select: { nome: true, ativo: true, fichaQueProduz: { select: { nome: true } } } });
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true });
      if (atual.fichaQueProduz) throw new Recusa({ ok: false, erros: { geral: mensagemDoPreparo(atual.nome, atual.fichaQueProduz.nome) } });
      const r = await tx.insumo.updateMany({ where: { id, ativo: !ativo }, data: { ativo } });
      if (r.count === 0) {
        throw new Recusa({
          ok: false,
          erros: { geral: ativo ? 'Este insumo já está ativo.' : 'Este insumo já estava desativado.' },
          conflito: true,
        });
      }
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: id,
          acao: ativo ? 'REATIVOU' : 'DESATIVOU',
          antes: { nome: atual.nome, ativo: !ativo },
          depois: { nome: atual.nome, ativo },
          motivo,
          autorNome,
        },
      });
      return { ok: true as const, id, nome: atual.nome, mudou: ['ativo'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    const check = erroDoCheck(e);
    if (check) return check;
    throw e;
  }
}

// ------------------------------------------------------------------ excluir

export const FRASE_CONFIRMAR_EXCLUSAO = 'Marque que você entendeu: excluir de vez apaga o cadastro e não dá para desfazer.';

/**
 * L.1: exclusão DEFINITIVA, só de insumo sem NENHUM vínculo (ficha, embalagem de prato, nota, nota fiscal, memória do fornecedor,
 * estoque, movimento, contagem, requisição, produção, etiqueta, outra embalagem, mudança de custo no histórico). Com vínculo a
 * resposta é a frase que manda desativar e nada é apagado.
 *
 * Seguro contra a corrida: a linha é travada com `FOR UPDATE` e os vínculos são contados DEPOIS da trava. Quem está vinculando
 * agora (a FK pede `FOR KEY SHARE`) termina antes de a contagem rodar e então a vê; quem tentar vincular depois da trava espera, e
 * se a exclusão vence a FK dele recusa (nada fica apontando para um insumo que não existe). Movimentos e fichas nunca são apagados:
 * o `DELETE` só roda com zero referências, e as FKs `Restrict` do banco são a última palavra.
 */
export async function excluirInsumo(
  cliente: ClienteDoParceiro,
  id: string,
  confirmou: boolean,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  if (!confirmou) return { ok: false, erros: { confirmo: FRASE_CONFIRMAR_EXCLUSAO } };
  try {
    return await cliente.transacao(async (tx) => {
      const trava = await tx.sql<{ id: string }>`
        SELECT "id" FROM "Insumo" WHERE "parceiroId" = ${tx.parceiroId} AND "id" = ${id} FOR UPDATE`;
      if (trava.length === 0) throw new Recusa({ ok: false, erros: { geral: 'Insumo não encontrado. Pode ser que ele já tenha sido excluído.' }, naoEncontrado: true });
      const atual = await tx.insumo.findUnique({ where: { id }, include: { categoria: { select: { nome: true } } } });
      if (!atual) throw new Recusa({ ok: false, erros: { geral: 'Insumo não encontrado.' }, naoEncontrado: true });
      const v = await vinculosDoInsumo(tx, id);
      if (v?.preparo) throw new Recusa({ ok: false, erros: { geral: mensagemDoPreparo(atual.nome, v.preparo.nome) } });
      if (v && v.total > 0) {
        throw new Recusa({
          ok: false,
          erros: {
            geral: `“${atual.nome}” tem registros ligados a ele (${resumoDosVinculos(v.vinculos)}): não dá para excluir de vez. Desative o insumo: ele sai da lista e da busca padrão e tudo o que já aconteceu fica como está.`,
          },
          conflito: true,
        });
      }
      const apagou = await tx.insumo.deleteMany({ where: { id } });
      if (apagou.count !== 1) throw new Recusa({ ok: false, erros: { geral: 'Não deu para excluir agora. Nada foi apagado; abra a lista e tente de novo.' }, conflito: true });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: id,
          acao: 'EXCLUIU',
          antes: { ...retratoDoInsumo(dadosDe(atual)), ativo: atual.ativo },
          motivo: 'Excluído de vez (sem nenhum registro ligado a ele)',
          autorNome,
        },
      });
      return { ok: true as const, id, nome: atual.nome, mudou: ['excluido'] };
    });
  } catch (e) {
    if (e instanceof Recusa) return e.resultado;
    // A FK (Restrict) é a última palavra: algo passou a apontar para o insumo no meio do caminho.
    if (/foreign key|violates|23001|23503|P2003/i.test(e instanceof Error ? e.message + ((e as { code?: string }).code ?? '') : '')) {
      return { ok: false, erros: { geral: 'Este insumo passou a ter registros ligados a ele agora há pouco: não dá para excluir. Nada foi apagado. Desative o insumo, se for o caso.' }, conflito: true };
    }
    throw e;
  }
}

// --------------------------------------------------------------- listar

export interface LinhaDeInsumo {
  id: string;
  nome: string;
  tipo: TipoInsumo;
  unidade: Unidade;
  /** I.1a: nula = o insumo antigo ainda sem categoria. */
  categoria: { id: string; nome: string; ativa: boolean; chave: string | null } | null;
  /** Por que está em "Outros / a classificar" (ambíguo), quando está. */
  classificacaoMotivo: string | null;
  /** I.1b: marca de referência (texto informativo), quando tem. */
  marcaReferencia: string | null;
  /** I.1b: Seco que ninguém confirmou, numa categoria que costuma ser fria: a conservação precisa ser confirmada. */
  conservacaoAConfirmar: boolean;
  /** L.1: por que o cadastro está incompleto (vazio = completo). Custo não informado não conta: é `custo === null`. */
  motivosIncompleto: MotivoIncompleto[];
  conservacao: Conservacao;
  /** 1.4: principal + validade em cada conservação aceita (minutos). */
  validades: Validades;
  /** Insumo de pré-preparo cuja ficha não diz a validade: a conservação também não foi dita. */
  conservacaoInformada: boolean;
  conteudoMilesimos: number;
  precoEmbalagemCentavos: number;
  taxaEntregaCentavos: number;
  /**
   * Custo de referência exato: o da última compra lançada (1.5) ou, sem
   * compra, o do preço cadastrado; null = "Sem preço" (custo incompleto).
   * Pré-preparo: ver `preparo`.
   */
  custo: CustoExato | null;
  /** 1.5: a data da última compra lançada (de onde vem o custo), quando há. Nota, fornecedor e loja ficam no módulo de compras. */
  ultimaCompra: { entradaEm: string } | null;
  /** Outras embalagens ativas. */
  variantes: number;
  ativo: boolean;
  /** Produzido por um pré-preparo (1.3): o custo por unidade vem da ficha, em cascata. */
  preparo: { fichaId: string; porUnidade: Fracao; incompleto: boolean } | null;
}

function filtroDoBanco(f: FiltrosDeInsumo): Prisma.InsumoWhereInput {
  // O texto da busca é literal: `%` e `_` não são curingas do LIKE (o Prisma não os escapa em `contains`).
  const q = f.q.trim().slice(0, 80).replace(/[\\%_]/g, '\\$&');
  // Os filtros que se combinam vão em AND (cada um com o seu OR/campo), para um nunca apagar o outro.
  const e: Prisma.InsumoWhereInput[] = [];
  // I.1a: 'sem' = sem categoria; 'revisar' = sem categoria ou em "Outros / a classificar"; senão, uma categoria.
  if (f.categoria === 'sem') e.push({ categoriaId: null });
  else if (f.categoria === 'revisar') e.push({ OR: [{ categoriaId: null }, { categoria: { is: { chave: CHAVE_DO_SISTEMA } } }] });
  else if (f.categoria) e.push({ categoriaId: f.categoria });
  // 1.4: "conservação X" = os que ficam em X (a principal ou com validade nela). I.1b: "a confirmar" = os Seco que ninguém
  // confirmou, em Proteína, Laticínios ou Hortifruti (a situação escolhida na lista continua valendo).
  if (f.conservacao === FILTRO_A_CONFIRMAR) e.push(filtroDaConfirmacaoDaSituacao());
  else if (f.conservacao) e.push({ OR: [{ conservacao: f.conservacao }, { [COLUNA_DA_VALIDADE[f.conservacao]]: { not: null } }] });
  // L.1: a busca acha pelo nome OU pela marca de referência; "marca" é filtro à parte (sem diferenciar caixa).
  if (q) e.push({ OR: [{ nome: { contains: q, mode: 'insensitive' } }, { marcaReferencia: { contains: q, mode: 'insensitive' } }] });
  if (f.marca === FILTRO_SEM_MARCA) e.push({ marcaReferencia: null });
  else if (f.marca) e.push({ marcaReferencia: { equals: f.marca, mode: 'insensitive' } });
  if (f.incompleto) e.push(filtroDoIncompleto());
  return {
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(e.length ? { AND: e } : {}),
    ...(f.situacao === 'ativos' ? { ativo: true } : f.situacao === 'desativados' ? { ativo: false } : {}),
    // "Sem custo informado" é quem precisa de custo digitado: o pré-preparo tem custo da ficha.
    // 1.5: com nota lançada, o insumo tem o preço da compra.
    ...(f.semPreco ? { precoEmbalagemCentavos: 0, fichaQueProduz: { is: null }, notaItens: { none: { nota: { status: 'LANCADA' as const } } } } : {}),
  };
}

const SELECAO_DA_LINHA = {
  id: true,
  nome: true,
  tipo: true,
  unidade: true,
  // I.1a: a categoria que a lista mostra (a coluna e o filtro) e o motivo de estar em "Outros".
  categoria: { select: { id: true, nome: true, ativa: true, chave: true } },
  classificacaoMotivo: true,
  marcaReferencia: true,
  conservacaoConfirmadaEm: true,
  ...SELECAO_DA_VALIDADE,
  conteudoMilesimos: true,
  precoEmbalagemCentavos: true,
  taxaEntregaCentavos: true,
  ativo: true,
  _count: { select: { variantes: { where: { ativo: true } } } },
  fichaQueProduz: { select: { id: true } },
} as const;

type LinhaDoBanco = Prisma.InsumoGetPayload<{ select: typeof SELECAO_DA_LINHA }>;

/**
 * Banco → linha. Pré-preparo: custo da ficha que o produz, por unidade (o
 * rendimento é na unidade do insumo), lido em cascata para a página inteira
 * de uma vez (`custosDosPreparos`).
 */
function paraLinha(i: LinhaDoBanco, preparos: ReadonlyMap<string, CustoDaFicha>, compras: ReadonlyMap<string, UltimaCompra>): LinhaDeInsumo {
  const { _count, fichaQueProduz, validadeSecoMin: _s, validadePistaFriaMin: _p, validadeRefrigeradoMin: _r, validadeCongeladoMin: _g, conservacaoConfirmadaEm, ...resto } = i;
  const c = fichaQueProduz ? preparos.get(fichaQueProduz.id) : undefined;
  const validades = validadesDaLinha(i)!;
  const compra = fichaQueProduz ? undefined : compras.get(i.id);
  return {
    ...resto,
    validades,
    conservacaoAConfirmar: conservacaoAConfirmar({ tipo: i.tipo, conservacao: i.conservacao, conservacaoConfirmadaEm, categoriaChave: i.categoria?.chave ?? null }),
    motivosIncompleto: motivosDoCadastro({
      tipo: i.tipo,
      categoriaChave: i.categoria?.chave ?? null,
      temCategoria: !!i.categoria,
      conservacao: i.conservacao,
      conservacaoConfirmadaEm,
      preparoSemValidade: !!fichaQueProduz && Object.keys(validades.minutos).length === 0,
    }),
    conservacaoInformada: !fichaQueProduz || Object.keys(validades.minutos).length > 0,
    custo: fichaQueProduz ? null : (compra?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos)),
    ultimaCompra: compra ? { entradaEm: compra.entradaEm } : null,
    variantes: _count.variantes,
    preparo: fichaQueProduz && c ? { fichaId: fichaQueProduz.id, porUnidade: c.porRendimento, incompleto: custoIncompleto(c) } : null,
  };
}

async function custosDosPreparos(tx: ClienteDoParceiro, linhas: LinhaDoBanco[]): Promise<Map<string, CustoDaFicha>> {
  const ids = linhas.map((l) => l.fichaQueProduz?.id).filter((x): x is string => !!x);
  if (ids.length === 0) return new Map();
  const c = await custosEmCascata(tx, ids);
  return new Map(ids.map((id) => [id, c.custo(id)!]));
}

/** 1.5: a última compra de cada insumo comprado da página (uma consulta). */
function comprasDasLinhas(tx: ClienteDoParceiro, linhas: LinhaDoBanco[]) {
  return ultimasCompras(
    tx,
    linhas.filter((l) => !l.fichaQueProduz).map((l) => l.id),
  );
}

/** Custo por unidade para ordenar (exato); null = sem preço (vai para o fim). */
const custoParaOrdenar = (l: LinhaDeInsumo): Fracao | null => l.preparo?.porUnidade ?? (l.custo ? custoPorUnidade(l.custo) : null);

/** L.1: quantos insumos o parceiro tem no cadastro (todos e só os ativos), para a lista dizer "no cadastro" × "nos filtros". */
export interface TotalDoCadastro {
  todos: number;
  ativos: number;
}

/**
 * Página da lista com o total. Filtros, ordem e tamanho da página vêm da URL (`lerFiltros`), o servidor filtra e valida. Por
 * custo: o custo é derivado (nunca gravado), então a ordenação é feita aqui pelo custo exato (multiplicação cruzada), e "Sem
 * preço" fica sempre no fim. Contagens e página na mesma transação (o total bate com a página).
 *
 * L.1: `porPagina` só vale 10, 25, 50 ou 100 (outro valor volta ao padrão); a página pedida além da última é ajustada à última
 * e 0 resultado dá 1 página vazia (nunca divide por zero). A ordem tem desempate por id: nenhuma linha pula nem repete entre
 * páginas. `totalDoCadastro` é o do parceiro (nunca de outro): "no cadastro" × "correspondem aos filtros" são números diferentes.
 */
export async function listarInsumos(
  cliente: ClienteDoParceiro,
  filtros: Partial<FiltrosDeInsumo> = {},
): Promise<{ linhas: LinhaDeInsumo[]; total: number; pagina: number; paginas: number; porPagina: number; totalDoCadastro: TotalDoCadastro }> {
  const f: FiltrosDeInsumo = { ...FILTROS_PADRAO, ...filtros };
  const porPagina = lerPorPagina(f.porPagina);
  const where = filtroDoBanco(f);
  return cliente.transacao(async (tx) => {
    const total = await tx.insumo.count({ where });
    const todos = await tx.insumo.count();
    const ativos = await tx.insumo.count({ where: { ativo: true } });
    const totalDoCadastro = { todos, ativos };
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    const pagina = Math.min(Math.max(1, Math.trunc(f.pagina) || 1), paginas);
    if (f.ordem === 'nome') {
      const linhas = await tx.insumo.findMany({
        where,
        orderBy: [{ nome: f.direcao }, { id: 'asc' }],
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        select: SELECAO_DA_LINHA,
      });
      const preparos = await custosDosPreparos(tx, linhas);
      const compras = await comprasDasLinhas(tx, linhas);
      return { linhas: linhas.map((l) => paraLinha(l, preparos, compras)), total, pagina, paginas, porPagina, totalDoCadastro };
    }
    const lidas = await tx.insumo.findMany({ where, orderBy: [{ nome: 'asc' }, { id: 'asc' }], select: SELECAO_DA_LINHA });
    const preparos = await custosDosPreparos(tx, lidas);
    const compras = await comprasDasLinhas(tx, lidas);
    const todas = lidas.map((l) => paraLinha(l, preparos, compras));
    const sinal = f.direcao === 'asc' ? 1 : -1;
    // Empate de custo: nome e id (a lista já vem nessa ordem e o sort é estável), então a ordem é a mesma em toda página.
    todas.sort((a, b) => {
      const x = custoParaOrdenar(a);
      const y = custoParaOrdenar(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      // Exato (multiplicação cruzada): R$ 0,004/un vem antes de R$ 0,005/un.
      return sinal * compararFracoes(x, y);
    });
    return { linhas: todas.slice((pagina - 1) * porPagina, pagina * porPagina), total, pagina, paginas, porPagina, totalDoCadastro };
  });
}

/**
 * L.1: as marcas de referência em uso no cadastro do parceiro (para o filtro "Marca"): a grafia mais comum de cada uma, sem
 * diferenciar caixa, da mais usada para a menos. No máximo 100.
 */
export async function marcasEmUso(cliente: ClienteDoParceiro): Promise<{ marca: string; n: number }[]> {
  return cliente.sql<{ marca: string; n: number }>`
    SELECT min("marcaReferencia") AS "marca", count(*)::int AS "n" FROM "Insumo"
    WHERE "parceiroId" = ${cliente.parceiroId} AND "marcaReferencia" IS NOT NULL
    GROUP BY lower("marcaReferencia")
    ORDER BY count(*) DESC, lower(min("marcaReferencia")) ASC
    LIMIT 100`;
}

// ---------------------------------------------------------------- obter

/**
 * Detalhe do insumo. `alcance`: quem pede. O custo de referência (último
 * preço, número derivado) é da rede e vem sempre; nota, série, fornecedor,
 * loja, quantidade, valor e frete de cada compra só nas lojas em que a pessoa
 * tem "ver compras e notas" (o resto nem sai do servidor).
 */
export async function obterInsumo(cliente: ClienteDoParceiro, id: string, alcance: Alcance) {
  return cliente.transacao(async (tx) => {
    const i = await tx.insumo.findUnique({
      where: { id },
      include: {
        variantes: { orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] },
        fichaQueProduz: { select: { id: true, nome: true, tipo: true, rendimentoMilesimos: true, unidadeRendimento: true } },
        categoria: { select: { id: true, nome: true, ativa: true, chave: true } },
      },
    });
    if (!i) return null;
    const ficha = i.fichaQueProduz;
    const custoDaFicha = ficha ? (await custosEmCascata(tx, [ficha.id])).custo(ficha.id)! : null;
    const travaDaUnidade = await motivoDaUnidadeTravada(tx, id);
    // 1.5: o custo vem da última compra lançada, quando há; o histórico de preços e o último de cada fornecedor.
    const ultima = ficha ? undefined : (await ultimasCompras(tx, [id])).get(id);
    const compras = ficha ? { compras: [], fornecedores: [] } : await comprasDoInsumo(tx, id, alcance);
    const veUltima = !!ultima && pode(alcance, 'compras.ver', { lojaId: ultima.lojaId });
    const lojaDaUltima = ultima && veUltima ? ((await tx.loja.findUnique({ where: { id: ultima.lojaId }, select: { nome: true } }))?.nome ?? null) : null;
    const historico = await listarHistorico(tx, {
      de: [
        { entidade: 'Insumo', ids: [id] },
        { entidade: 'InsumoVariante', ids: i.variantes.map((v) => v.id) },
      ],
      limite: 10,
      // Insumo não tem campo de preço por canal (o preço de compra é do cadastro).
      verPrecos: false,
    });
    return {
      id: i.id,
      nome: i.nome,
      tipo: i.tipo,
      unidade: i.unidade,
      /** I.1a: a categoria (nula = ainda sem), como foi escolhida e, se ficou em "Outros", por quê. */
      categoria: i.categoria,
      classificadoPor: i.classificadoPor,
      classificacaoMotivo: i.classificacaoMotivo,
      /** I.1b: marca de referência (texto informativo; não é fornecedor nem bloqueia compra). */
      marcaReferencia: i.marcaReferencia,
      conservacao: i.conservacao,
      /** I.1b: Seco que ninguém confirmou, numa categoria que costuma ser fria. */
      conservacaoAConfirmar: conservacaoAConfirmar({ tipo: i.tipo, conservacao: i.conservacao, conservacaoConfirmadaEm: i.conservacaoConfirmadaEm, categoriaChave: i.categoria?.chave ?? null }),
      validades: validadesDaLinha(i)!,
      conteudoMilesimos: i.conteudoMilesimos,
      precoEmbalagemCentavos: i.precoEmbalagemCentavos,
      taxaEntregaCentavos: i.taxaEntregaCentavos,
      /** O custo que vale: última compra ou, sem ela, o preço cadastrado. */
      custo: ultima?.custo ?? custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos),
      /** O do preço cadastrado (embalagem padrão), sempre. */
      custoCadastrado: custoDaEmbalagem(i.precoEmbalagemCentavos, i.taxaEntregaCentavos, i.conteudoMilesimos),
      ultimaCompra: ultima
        ? {
            custo: ultima.custo,
            entradaEm: ultima.entradaEm,
            /** De que compra veio: só para quem vê compras naquela loja (null = só o custo). */
            detalhe: veUltima
              ? {
                  notaId: ultima.notaId,
                  numero: ultima.numero,
                  serie: ultima.serie,
                  lojaId: ultima.lojaId,
                  lojaNome: lojaDaUltima,
                  fornecedor: ultima.fornecedor,
                  valorCentavos: ultima.valorCentavos,
                  freteCentavos: ultima.freteCentavos,
                  quantidadeMilesimos: ultima.quantidadeMilesimos,
                }
              : null,
          }
        : null,
      compras: compras.compras,
      precoPorFornecedor: compras.fornecedores,
      ativo: i.ativo,
      versao: i.atualizadoEm.toISOString(),
      travaDaUnidade,
      preparo:
        ficha && custoDaFicha
          ? {
              fichaId: ficha.id,
              nome: ficha.nome,
              porUnidade: custoDaFicha.porRendimento,
              incompleto: custoIncompleto(custoDaFicha),
              conta: contaDaFicha(custoDaFicha, ficha.rendimentoMilesimos, ficha.unidadeRendimento, ficha.tipo),
            }
          : null,
      variantes: i.variantes.map((v) => ({
        id: v.id,
        nome: v.nome,
        conteudoMilesimos: v.conteudoMilesimos,
        precoEmbalagemCentavos: v.precoEmbalagemCentavos,
        taxaEntregaCentavos: v.taxaEntregaCentavos,
        custo: custoDaEmbalagem(v.precoEmbalagemCentavos, v.taxaEntregaCentavos, v.conteudoMilesimos),
        codigoBarras: v.codigoBarras,
        ativo: v.ativo,
        versao: versaoDaVariante(v),
      })),
      historico,
    };
  });
}

export type InsumoDetalhado = NonNullable<Awaited<ReturnType<typeof obterInsumo>>>;

// --------------------------------------------------------------- buscar

/**
 * Busca do ⌘K: insumos DESTE parceiro (o cliente é do portão) cujo nome
 * contém o texto, sem diferenciar maiúscula. Desativados vêm marcados.
 */
export async function buscarInsumos(cliente: ClienteDoParceiro, texto: string, limite = 8) {
  const q = texto.trim().slice(0, 80);
  if (q.length < 2) return [];
  return cliente.insumo.findMany({
    where: { nome: { contains: q, mode: 'insensitive' } },
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    take: limite,
    select: { id: true, nome: true, unidade: true, ativo: true },
  });
}
