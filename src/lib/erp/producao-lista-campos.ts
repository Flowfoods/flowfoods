/**
 * A lista do dia (3.2) — regras PURAS, sem banco e sem Next: ler o formulário da lista, o estado de cada linha, a conta
 * "vai usar / tem / comprar" (com a cascata dos pré-preparos), o custo estimado da compra, as frases e os textos do
 * histórico. `producao-lista.ts` (com banco) e as telas usam as mesmas funções.
 *
 * Princípios (decisões 218 a 227):
 * - a lista é o que a LOJA vai produzir num DIA; quem define é o gerente ("definir a lista do dia"); cada linha vira um lote
 *   pela regra da 3.1 (`planejarProducao`), e a baixa dos insumos continua sendo a requisição do lote: a lista não mexe no
 *   estoque;
 * - "vai usar" de uma linha que ainda não virou lote é a receita da ficha, BRUTA (com o fator de correção), arredondada como a
 *   requisição do lote vai pedir (`quantidadesDaFicha`, a mesma conta da 1.8/3.1): quando a linha vira lote, o "vai usar" não
 *   muda. Linha que virou lote conta só o que ainda falta SAIR pela requisição dele (o que já saiu está no saldo); lote
 *   concluído não conta (o que saiu e o que entrou já estão no saldo);
 * - pré-preparo dentro da receita (a base no molho) vem do estoque, pelo insumo que ele produz: primeiro o que TEM, depois o
 *   que a própria lista produz dele; o que ainda falta é "falta produzir" e entra em cascata na conta (a receita dele, com o
 *   fator, até o fundo), para quem compra enxergar a matéria-prima inteira;
 * - "comprar" = max(0, vai usar − tem), na unidade do insumo (kg, L, un), sem converter: a embalagem padrão só aparece como
 *   apoio quando ela tem conteúdo declarado diferente de 1 kg/1 L/1 un ("2 embalagens de 5 kg");
 * - saldo negativo é ALARME, não trava: entra na conta como está (o buraco do livro também precisa ser coberto) e a tela diz;
 * - loja sem saldo apurado (estoque não aberto ou em contagem de abertura): o "tem" e o "comprar" são uma FRASE, nunca 0.
 */

import { formatarData } from './compra-campos';
import { diasEntre, somarDias } from './contagem-campos';
import { quantidadesDaFicha } from './requisicao-campos';
import type { StatusDaProducao } from './producao-campos';
import { custoDoUso, lerQuantidadeNa, formatarQuantidade, somar, UNIDADES, ZERO, type Fracao, type Unidade } from './unidades';

const ID = /^[a-z0-9]{1,64}$/i;

/** Teto do "quanto produzir" de uma linha (milésimos): 10 mil kg/L/un. O mesmo de `TETO_DA_QUANTIDADE_DA_FICHA` (3.1); o teste confere. */
export const TETO_DA_LINHA = 10_000_000;

/** Até quantos pré-preparos numa lista (uma cozinha num dia). */
export const TETO_DE_LINHAS = 60;

/** Até quantos dias à frente se monta a lista: o mesmo "para quando" da requisição e do lote (hoje a 14 dias). */
export const DIAS_A_FRENTE_DA_LISTA = 14;

// ================================================================ o dia

/** O dia pedido na tela (`?dia=aaaa-mm-dd`); qualquer outra coisa é hoje. */
export function diaDaLista(texto: unknown, hoje: string): string {
  const t = typeof texto === 'string' ? texto.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return hoje;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return hoje;
  if (t < '2020-01-01') return hoje;
  return t;
}

/** Por que a lista deste dia não se edita (null = edita): dia que passou é consulta; a lista vai até 14 dias à frente. */
export function motivoDoDia(dia: string, hoje: string): string | null {
  if (dia < hoje) return 'Dia que já passou: a lista fica para consulta.';
  if (dia > somarDias(hoje, DIAS_A_FRENTE_DA_LISTA)) return `A lista se monta de hoje até ${DIAS_A_FRENTE_DA_LISTA} dias à frente.`;
  return null;
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "hoje, quarta 21/10", "amanhã, quinta 22/10", "ontem, terça 20/10", "sexta 24/10". */
export function rotuloDoDia(dia: string, hoje: string): string {
  const semana = SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
  const curto = `${semana} ${formatarData(dia, true)}`;
  const d = diasEntre(hoje, dia);
  if (d === 0) return `hoje, ${curto}`;
  if (d === 1) return `amanhã, ${curto}`;
  if (d === -1) return `ontem, ${curto}`;
  return dia.slice(0, 4) === hoje.slice(0, 4) ? curto : `${semana} ${formatarData(dia)}`;
}

/** O nome da lista no histórico: "Lista do dia 21/10/2026 · Vila da Penha". */
export const nomeDaLista = (dia: string, loja: string) => `Lista do dia ${formatarData(dia)} · ${loja}`;

// ================================================================ ler o formulário

/** O que a tela oferece para escolher: pré-preparos ativos que viram insumo do estoque. */
export interface FichaEscolhivel {
  id: string;
  nome: string;
  unidade: Unidade;
}

export interface LinhaLida {
  /** A linha que já existia (editar a quantidade), ou null (linha nova). */
  id: string | null;
  fichaId: string;
  nome: string;
  unidade: Unidade;
  quantidadeMilesimos: number;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Lê as linhas do formulário (listas paralelas, na ordem da tela). Linha sem pré-preparo e sem número é ignorada (a tela
 * deixa linha vazia). Erros por linha (`linha:<n>`, n contando as vazias) e o geral, em frase. Pré-preparo repetido é
 * recusado: some as quantidades numa linha só (a mesma ficha em duas linhas abertas viraria dois lotes sem querer).
 */
export function lerLinhasDaLista(
  f: { linhaIds: readonly unknown[]; fichaIds: readonly unknown[]; quantidades: readonly unknown[] },
  fichas: ReadonlyMap<string, FichaEscolhivel>,
): { ok: true; linhas: LinhaLida[] } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const linhas: LinhaLida[] = [];
  const vistas = new Map<string, number>();
  const n = Math.max(f.fichaIds.length, f.quantidades.length);
  for (let i = 0; i < n; i++) {
    const fichaId = texto(f.fichaIds[i]);
    const q = texto(f.quantidades[i]);
    const idTxt = texto(f.linhaIds[i]);
    if (!fichaId && !q) continue;
    const ficha = fichaId ? fichas.get(fichaId) : undefined;
    if (!fichaId) {
      erros[`linha:${i}`] = 'Escolha o pré-preparo.';
      continue;
    }
    if (!ficha) {
      erros[`linha:${i}`] = 'Esse pré-preparo não está mais disponível (desativado ou sem ficha ativa): escolha outro.';
      continue;
    }
    const u = UNIDADES[ficha.unidade];
    const exemplo = `número em ${u.sigla} (ex.: 2 ou 1,5)`;
    const lido = q ? lerQuantidadeNa(q, ficha.unidade, 'base') : null;
    if (lido === null || lido <= 0) {
      // A frase diz o que corrigir: o ponto como vírgula ("2.5" → "use vírgula: 2,5 kg") e o zero ("maior que zero").
      const comPonto = /^\d+\.\d+$/.test(q) && lido === null;
      erros[`linha:${i}`] = !q
        ? `Diga quanto produzir de ${ficha.nome}: ${exemplo}.`
        : comPonto
          ? `Quanto produzir de ${ficha.nome}: use vírgula: ${q.replace('.', ',')} ${u.sigla}.`
          : lido !== null && lido <= 0
            ? `Quanto produzir de ${ficha.nome}: maior que zero.`
            : `Quanto produzir de ${ficha.nome}: ${exemplo}.`;
      continue;
    }
    if (lido > TETO_DA_LINHA) {
      erros[`linha:${i}`] = `${ficha.nome}: até ${formatarQuantidade(TETO_DA_LINHA, ficha.unidade)} numa linha.`;
      continue;
    }
    if (vistas.has(ficha.id)) {
      erros[`linha:${i}`] = `“${ficha.nome}” já está na lista: some as quantidades numa linha só.`;
      continue;
    }
    vistas.set(ficha.id, i);
    linhas.push({ id: ID.test(idTxt) ? idTxt : null, fichaId: ficha.id, nome: ficha.nome, unidade: ficha.unidade, quantidadeMilesimos: lido });
  }
  if (linhas.length > TETO_DE_LINHAS) erros.geral = `Até ${TETO_DE_LINHAS} pré-preparos numa lista.`;
  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, linhas };
}

/** "Molho cheddar 5 kg · Base de cebola 300 g" (o histórico compara linha a linha); vazia = "nada". */
export function textoDaProducao(linhas: readonly { nome: string; unidade: Unidade; quantidadeMilesimos: number }[]): string {
  return linhas.length ? linhas.map((l) => `${l.nome} ${formatarQuantidade(l.quantidadeMilesimos, l.unidade)}`).join(' · ') : 'nada';
}

// ================================================================ o estado da linha

/**
 * NA_LISTA: ainda não virou lote (ou o lote dela foi cancelado: pode virar outro). EM_LOTE: o lote está planejado ou em
 * produção. FEITA: o lote foi concluído (o estornado é um lote cancelado, e a linha volta a NA_LISTA).
 */
export type EstadoDaLinha = 'NA_LISTA' | 'EM_LOTE' | 'FEITA';

export function estadoDaLinha(ordem: { status: StatusDaProducao } | null): EstadoDaLinha {
  if (!ordem || ordem.status === 'CANCELADA') return 'NA_LISTA';
  return ordem.status === 'CONCLUIDA' ? 'FEITA' : 'EM_LOTE';
}

/** A linha muda (quantidade, sair da lista)? Só sem lote vivo. */
export const linhaEditavel = (e: EstadoDaLinha) => e === 'NA_LISTA';

// ================================================================ a conta: vai usar / tem / comprar

/** A ficha como a conta lê: os itens (insumo OU pré-preparo), o rendimento e o insumo que ela produz. */
export interface FichaDaConta {
  id: string;
  nome: string;
  ativa: boolean;
  rendimentoMilesimos: number;
  unidade: Unidade;
  insumoProduzidoId: string | null;
  itens: readonly { insumoId: string | null; subfichaId: string | null; quantidadeMilesimos: number; fatorCorrecaoMilesimos: number }[];
}

export interface InsumoDaConta {
  id: string;
  nome: string;
  unidade: Unidade;
  ativo: boolean;
  /** Conteúdo da embalagem padrão (milésimos). */
  conteudoMilesimos: number;
  /** A ficha que produz este insumo (pré-preparo); null = é comprado. */
  fichaQueProduzId: string | null;
}

/** O que a loja produz no dia: as linhas da lista e os lotes do dia (inclusive os planejados fora dela). */
export interface ProducaoDoDia {
  nome: string;
  fichaId: string;
  /** O insumo que entra no estoque quando o lote fica pronto. */
  insumoProduzidoId: string | null;
  quantidadeMilesimos: number;
  estado: EstadoDaLinha;
  /** EM_LOTE: o que ainda falta SAIR pela requisição do lote, por insumo (o que já saiu está no saldo; zero também vem). */
  aSair?: ReadonlyMap<string, number>;
  /** FEITA: os insumos que a requisição do lote tirou (para o saldo que ficou abaixo de zero continuar à vista). */
  tocados?: readonly string[];
}

export type SaldoDaLoja = { apurado: true; saldos: ReadonlyMap<string, number> } | { apurado: false; motivo: string };

/** Uma linha de matéria-prima (o que se compra). */
export interface InsumoNaConta {
  insumoId: string;
  nome: string;
  unidade: Unidade;
  vaiUsarMilesimos: number;
  /** null = sem saldo apurado (a frase vem em `motivoSemSaldo`), nunca 0. */
  temMilesimos: number | null;
  /** max(0, vai usar − tem); null sem saldo apurado. */
  comprarMilesimos: number | null;
  /** O livro está abaixo de zero: alarme (a conta já cobre o buraco). */
  negativo: boolean;
  /** Em quais pré-preparos entra ("Molho cheddar", "Base de cebola (o que falta)"). */
  deOnde: string[];
  /** A embalagem padrão, só quando ela tem conteúdo diferente de 1 kg/1 L/1 un e há o que comprar. */
  embalagens: { quantas: number; conteudoMilesimos: number } | null;
}

/** Um pré-preparo que entra nas receitas da lista (o molho usa a base): vai usar / tem / a lista produz / falta produzir. */
export interface PreparoNaConta {
  insumoId: string;
  fichaId: string | null;
  nome: string;
  unidade: Unidade;
  vaiUsarMilesimos: number;
  temMilesimos: number | null;
  /** O que a própria lista (ou um lote do dia) produz dele. */
  naListaMilesimos: number;
  /** max(0, vai usar − tem − na lista); null sem saldo apurado. */
  faltaProduzirMilesimos: number | null;
  negativo: boolean;
  /** A ficha dele está desativada (ou não existe): o que falta não entra em cascata na compra. */
  semFicha: boolean;
  deOnde: string[];
}

export interface ContaDaLista {
  apurado: boolean;
  motivoSemSaldo: string | null;
  /** Matéria-prima: primeiro o que falta, depois o que dá (por nome). */
  materiaPrima: InsumoNaConta[];
  preparos: PreparoNaConta[];
  avisos: string[];
  resumo: { faltaComprar: number; da: number; negativos: number; faltaProduzir: number };
}

/**
 * Ordem de cálculo dos pré-preparos: quem USA antes de quem é usado (o molho antes da base), para a demanda de cada um
 * estar completa quando ele for olhado. Kahn sobre as fichas lidas; o que sobrar é círculo (forçado no banco por fora):
 * fica fora da cascata, com aviso.
 */
function ordemDosPreparos(fichas: ReadonlyMap<string, FichaDaConta>): { ordem: FichaDaConta[]; emCirculo: FichaDaConta[] } {
  const usadoPor = new Map<string, number>();
  for (const f of fichas.values()) usadoPor.set(f.id, usadoPor.get(f.id) ?? 0);
  const filhos = (f: FichaDaConta) => Array.from(new Set(f.itens.map((i) => i.subfichaId).filter((x): x is string => !!x && fichas.has(x))));
  for (const f of fichas.values()) for (const s of filhos(f)) usadoPor.set(s, (usadoPor.get(s) ?? 0) + 1);
  const fila = Array.from(fichas.values()).filter((f) => (usadoPor.get(f.id) ?? 0) === 0);
  const ordem: FichaDaConta[] = [];
  while (fila.length) {
    const f = fila.shift()!;
    ordem.push(f);
    for (const s of filhos(f)) {
      const n = (usadoPor.get(s) ?? 0) - 1;
      usadoPor.set(s, n);
      if (n === 0) fila.push(fichas.get(s)!);
    }
  }
  const feitos = new Set(ordem.map((f) => f.id));
  return { ordem, emCirculo: Array.from(fichas.values()).filter((f) => !feitos.has(f.id)) };
}

const nomeDaCascata = (nome: string) => `${nome} (o que falta)`;

/**
 * A conta da lista do dia. Entra o que a loja produz no dia (linhas e lotes), as fichas (as da lista e o que elas usam, até o
 * fundo), os insumos que aparecem nelas e o saldo da loja. Sai a matéria-prima (vai usar / tem / comprar) e os pré-preparos
 * que as receitas usam (vai usar / tem / na lista / falta produzir). Sem saldo apurado não há cascata nem "comprar".
 */
export function contaDaLista(p: {
  producao: readonly ProducaoDoDia[];
  fichas: ReadonlyMap<string, FichaDaConta>;
  /** O cadastro dos insumos que aparecem (das receitas, dos lotes e os que as fichas produzem). */
  cadastro: ReadonlyMap<string, InsumoDaConta>;
  saldo: SaldoDaLoja;
}): ContaDaLista {
  const demanda = new Map<string, number>();
  /** Insumos que os lotes do dia já tiraram (ou ainda tiram): com o saldo abaixo de zero, a linha fica, mesmo sem nada a usar. */
  const tocados = new Map<string, string>();
  const deOnde = new Map<string, Set<string>>();
  const naLista = new Map<string, number>();
  const avisos: string[] = [];
  const aviso = (t: string) => {
    if (!avisos.includes(t)) avisos.push(t);
  };
  const somarDemanda = (insumoId: string, q: number, origem: string) => {
    if (q <= 0) return;
    demanda.set(insumoId, (demanda.get(insumoId) ?? 0) + q);
    (deOnde.get(insumoId) ?? deOnde.set(insumoId, new Set()).get(insumoId)!).add(origem);
  };
  /** A receita da ficha para produzir `q`: a mesma lista (bruta, um arredondamento por insumo) que a requisição do lote pede. */
  const explodir = (f: FichaDaConta, q: number, origem: string) => {
    const r = quantidadesDaFicha(
      f,
      f.itens.map((i) => ({ insumoId: i.insumoId ?? (i.subfichaId ? (p.fichas.get(i.subfichaId)?.insumoProduzidoId ?? null) : null), quantidadeMilesimos: i.quantidadeMilesimos, fatorCorrecaoMilesimos: i.fatorCorrecaoMilesimos })),
      q,
    );
    if (r.semInsumo) aviso(`“${f.nome}” usa pré-preparo que ainda não aparece como insumo do estoque: salve a ficha dele de novo. Ele fica fora da conta.`);
    for (const it of r.itens) {
      const ins = p.cadastro.get(it.insumoId);
      if (!ins) continue;
      if (!ins.ativo) {
        aviso(`${ins.nome} está desativado: fica fora da requisição e da conta (receita de ${f.nome}).`);
        continue;
      }
      somarDemanda(it.insumoId, it.quantidadeMilesimos, origem);
    }
  };

  for (const x of p.producao) {
    if (x.estado === 'NA_LISTA') {
      const f = p.fichas.get(x.fichaId);
      if (!f || !f.ativa) {
        aviso(`A ficha de ${x.nome} está desativada: a linha fica fora da conta até alguém reativar ou tirar da lista.`);
        continue;
      }
      explodir(f, x.quantidadeMilesimos, x.nome);
      if (f.insumoProduzidoId) naLista.set(f.insumoProduzidoId, (naLista.get(f.insumoProduzidoId) ?? 0) + x.quantidadeMilesimos);
    } else if (x.estado === 'EM_LOTE') {
      for (const [insumoId, q] of Array.from(x.aSair ?? [])) {
        if (!p.cadastro.get(insumoId)) continue;
        if (!tocados.has(insumoId)) tocados.set(insumoId, x.nome);
        somarDemanda(insumoId, q, x.nome);
      }
      if (x.insumoProduzidoId) naLista.set(x.insumoProduzidoId, (naLista.get(x.insumoProduzidoId) ?? 0) + x.quantidadeMilesimos);
    } else {
      // FEITA: o que saiu e o que entrou já estão no saldo; só fica a lembrança do que ele tirou (o negativo à vista).
      for (const insumoId of x.tocados ?? []) if (p.cadastro.get(insumoId) && !tocados.has(insumoId)) tocados.set(insumoId, x.nome);
    }
  }

  const saldoDe = (insumoId: string): number | null => (p.saldo.apurado ? (p.saldo.saldos.get(insumoId) ?? 0) : null);

  // A cascata: o pré-preparo que falta (depois do que tem e do que a lista produz) entra pela receita dele.
  const emCascata = new Map<string, number>();
  if (p.saldo.apurado) {
    const { ordem, emCirculo } = ordemDosPreparos(p.fichas);
    for (const f of emCirculo) aviso(`“${f.nome}” está num círculo de pré-preparos: o que falta dele não entra em cascata na conta.`);
    for (const f of ordem) {
      const ins = f.insumoProduzidoId;
      if (!ins) continue;
      const d = demanda.get(ins) ?? 0;
      if (d === 0) continue;
      const falta = Math.max(0, d - (saldoDe(ins) ?? 0) - (naLista.get(ins) ?? 0));
      if (falta <= 0) continue;
      if (!f.ativa) {
        aviso(`A ficha de ${f.nome} está desativada: o que falta dele não entra na conta de compra.`);
        continue;
      }
      emCascata.set(ins, falta);
      explodir(f, falta, nomeDaCascata(f.nome));
    }
  }

  // Insumo que o lote do dia já tirou e ficou abaixo de zero continua na conta (vai usar 0, comprar = o buraco): entregar a
  // requisição não pode fazer o "comprar" sumir (é a mesma conta de antes da entrega, sem segunda baixa).
  for (const [insumoId, nome] of Array.from(tocados)) {
    if (demanda.has(insumoId)) continue;
    const tem = saldoDe(insumoId);
    if (tem !== null && tem < 0) {
      demanda.set(insumoId, 0);
      deOnde.set(insumoId, new Set([nome]));
    }
  }

  const materia: InsumoNaConta[] = [];
  const preparos: PreparoNaConta[] = [];
  for (const [insumoId, d] of Array.from(demanda)) {
    const ins = p.cadastro.get(insumoId);
    if (!ins) continue;
    const tem = saldoDe(insumoId);
    const origem = Array.from(deOnde.get(insumoId) ?? []).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (ins.fichaQueProduzId) {
      const f = p.fichas.get(ins.fichaQueProduzId);
      const lista = naLista.get(insumoId) ?? 0;
      preparos.push({
        insumoId,
        fichaId: ins.fichaQueProduzId,
        nome: ins.nome,
        unidade: ins.unidade,
        vaiUsarMilesimos: d,
        temMilesimos: tem,
        naListaMilesimos: lista,
        faltaProduzirMilesimos: tem === null ? null : Math.max(0, d - tem - lista),
        negativo: tem !== null && tem < 0,
        semFicha: !f || !f.ativa,
        deOnde: origem,
      });
      continue;
    }
    const comprar = tem === null ? null : Math.max(0, d - tem);
    const temEmbalagem = ins.conteudoMilesimos > 0 && ins.conteudoMilesimos !== 1000;
    materia.push({
      insumoId,
      nome: ins.nome,
      unidade: ins.unidade,
      vaiUsarMilesimos: d,
      temMilesimos: tem,
      comprarMilesimos: comprar,
      negativo: tem !== null && tem < 0,
      deOnde: origem,
      embalagens: comprar && temEmbalagem ? { quantas: Math.ceil(comprar / ins.conteudoMilesimos), conteudoMilesimos: ins.conteudoMilesimos } : null,
    });
  }
  const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');
  materia.sort((a, b) => Number((b.comprarMilesimos ?? 0) > 0) - Number((a.comprarMilesimos ?? 0) > 0) || porNome(a, b));
  preparos.sort(porNome);
  return {
    apurado: p.saldo.apurado,
    motivoSemSaldo: p.saldo.apurado ? null : p.saldo.motivo,
    materiaPrima: materia,
    preparos,
    avisos,
    resumo: {
      faltaComprar: materia.filter((i) => (i.comprarMilesimos ?? 0) > 0).length,
      da: materia.filter((i) => i.comprarMilesimos === 0).length,
      negativos: materia.filter((i) => i.negativo).length + preparos.filter((x) => x.negativo).length,
      faltaProduzir: preparos.filter((x) => (x.faltaProduzirMilesimos ?? 0) > 0).length,
    },
  };
}

// ================================================================ frases

/** A frase de quem não tem saldo para cruzar (nunca "tem 0"). */
export function fraseSemSaldo(estado: 'NAO_ABERTO' | 'EM_CONTAGEM', loja: string): string {
  return estado === 'EM_CONTAGEM'
    ? `O estoque da ${loja} está na contagem de abertura: o saldo nasce quando ela for concluída. Até lá a lista mostra só o que vai usar.`
    : `O estoque da ${loja} ainda não foi aberto: não há saldo para cruzar. A lista mostra o que vai usar; o "tem" e o "comprar" aparecem depois da contagem de abertura.`;
}

/** "2 embalagens de 5 kg", "1 embalagem de 12 un". */
export function textoDasEmbalagens(e: { quantas: number; conteudoMilesimos: number }, unidade: Unidade): string {
  return `${e.quantas.toLocaleString('pt-BR')} ${e.quantas === 1 ? 'embalagem' : 'embalagens'} de ${formatarQuantidade(e.conteudoMilesimos, unidade)}`;
}

/** "−200 g" para o saldo abaixo de zero; o número normal para o resto. */
export const quantidadeComSinal = (m: number, u: Unidade) => (m < 0 ? `−${formatarQuantidade(-m, u)}` : formatarQuantidade(m, u));

/** O resumo da matéria-prima numa linha: "2 insumos faltam · 5 dão" (com palavra; a cor só reforça). */
export function resumoDaConta(r: ContaDaLista['resumo']): string {
  const partes: string[] = [];
  if (r.faltaComprar) partes.push(`${r.faltaComprar} ${r.faltaComprar === 1 ? 'insumo falta' : 'insumos faltam'}`);
  if (r.da) partes.push(`${r.da} ${r.da === 1 ? 'dá' : 'dão'}`);
  if (r.faltaProduzir) partes.push(`${r.faltaProduzir} ${r.faltaProduzir === 1 ? 'pré-preparo falta produzir' : 'pré-preparos faltam produzir'}`);
  if (r.negativos) partes.push(`${r.negativos} abaixo de zero no livro`);
  return partes.join(' · ');
}

// ================================================================ o custo estimado da compra (só para quem vê custos)

export interface CustoDaCompra {
  /** Soma do que se compra, em fração exata de centavos (um arredondamento, na tela). */
  total: Fracao;
  /** Insumos a comprar sem preço: o total é INCOMPLETO (sem contar estes), nunca R$ 0,00 para eles. */
  semPreco: string[];
  porInsumo: Map<string, Fracao | null>;
}

/**
 * Quanto custa comprar o que falta, pelo custo de referência (o último preço pago, 1.5) por unidade: falta × custo, exato.
 * Só as linhas com algo a comprar.
 */
export function custoDaCompra(linhas: readonly Pick<InsumoNaConta, 'insumoId' | 'nome' | 'comprarMilesimos'>[], custos: ReadonlyMap<string, Fracao | null>): CustoDaCompra {
  let total = ZERO;
  const semPreco: string[] = [];
  const porInsumo = new Map<string, Fracao | null>();
  for (const i of linhas) {
    if (!i.comprarMilesimos) continue;
    const c = custos.get(i.insumoId) ?? null;
    if (!c) {
      semPreco.push(i.nome);
      porInsumo.set(i.insumoId, null);
      continue;
    }
    const v = custoDoUso(c, i.comprarMilesimos);
    porInsumo.set(i.insumoId, v);
    total = somar(total, v);
  }
  return { total, semPreco, porInsumo };
}

// ================================================================ o histórico

/** Os lotes que a lista gerou, para o histórico: "261021-01 Molho cheddar 5 kg · 261021-02 Base 3 kg". */
export function textoDosLotes(lotes: readonly { codigo: string; nome: string; unidade: Unidade; quantidadeMilesimos: number }[]): string {
  return lotes.map((l) => `${l.codigo} ${l.nome} ${formatarQuantidade(l.quantidadeMilesimos, l.unidade)}`).join(' · ');
}

/** Dentro da lista, o histórico fala do estado dela, não do verbo de quem fez. */
export const TITULO_NO_HISTORICO_DA_LISTA: Readonly<Record<string, string>> = {
  CRIOU: 'Montada',
  ALTEROU: 'Mudou',
  EXCLUIU: 'Apagada',
  GEROU_LOTES: 'Lotes gerados',
};

/**
 * O que falta para o dia, dito junto do "Gerar os lotes" (revisão de UX, E4): quem gera vê a falta antes de decidir. É a conta da
 * lista inteira do dia (as linhas em aberto e o que os lotes já gerados ainda vão tirar do estoque), não só do lote a gerar; por
 * isso a frase fala do dia e de "algum lote". Inclui o pré-preparo que falta produzir (a requisição vai pedi-lo). Gerar não compra
 * nem baixa nada: a frase só avisa. null = nada falta, ou a loja sem saldo apurado (a conta já diz). Até 3 nomes, o resto "e mais N".
 */
export function faltasDaConta(conta: Pick<ContaDaLista, 'apurado' | 'materiaPrima' | 'preparos'>): string | null {
  if (!conta.apurado) return null;
  const lista = (itens: { nome: string; unidade: Unidade; q: number }[]) => {
    const nomes = itens.slice(0, 3).map((i) => `${i.nome} (${formatarQuantidade(i.q, i.unidade)})`);
    return `${nomes.join(', ')}${itens.length > 3 ? ` e mais ${itens.length - 3}` : ''}`;
  };
  const comprar = conta.materiaPrima.filter((i) => (i.comprarMilesimos ?? 0) > 0).map((i) => ({ nome: i.nome, unidade: i.unidade, q: i.comprarMilesimos! }));
  const produzir = conta.preparos.filter((p) => (p.faltaProduzirMilesimos ?? 0) > 0).map((p) => ({ nome: p.nome, unidade: p.unidade, q: p.faltaProduzirMilesimos! }));
  if (comprar.length === 0 && produzir.length === 0) return null;
  const partes = [comprar.length ? `falta no estoque: ${lista(comprar)}` : null, produzir.length ? `falta produzir: ${lista(produzir)}` : null].filter(Boolean);
  return `Para a lista do dia, ${partes.join('; ')}. Se não chegar a tempo, algum lote pode render menos.`;
}
