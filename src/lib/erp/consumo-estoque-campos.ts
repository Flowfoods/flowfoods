/**
 * Consumo e conciliação de estoque (L.4) — a parte PURA (sem banco, sem Next): em que coluna cai cada tipo de movimento, a conta
 * da ponte (saldo inicial + movimentos = saldo final), as lacunas que a tela precisa dizer, os filtros da URL, as frases e a
 * formatação com sinal. O banco fica em `consumo-estoque.ts`; a planilha, em `consumo-estoque-planilha.ts`; a tela, em
 * `src/components/erp/telas/estoque/consumo-*.tsx`.
 *
 * Regras que atravessam tudo (decisões 387 em diante):
 *  - a fonte é o LIVRO do estoque (`MovimentoEstoque`): quantidade em milésimos da unidade base e dinheiro em centavos, COM SINAL,
 *    do jeito que o livro gravou (nada é reprecificado). O relatório só LÊ: baixa de insumo é da requisição, nunca da geração do
 *    relatório nem da venda;
 *  - a data de um movimento é o dia do Rio em que ele entrou no LIVRO (não a data da nota): uma nota de 10/10 lançada em 12/10
 *    entra no estoque em 12/10;
 *  - cada movimento cai em UMA coluna só (a classificação é uma só, no SQL), então não há dupla contagem e a soma das colunas é
 *    exatamente o saldo final menos o inicial;
 *  - "Uso" é a REQUISIÇÃO REGISTRADA (a baixa que o estoque deu ao entregar), não o consumo medido na prateleira. A diferença da
 *    contagem é AJUSTE (sobra ou falta apurada), nunca consumo presumido nem perda presumida;
 *  - `null`/ausente é desconhecido: sem preço não vira R$ 0,00 como fato; sem contagem não vira "conferido".
 */

import { OPCOES_POR_PAGINA, POR_PAGINA_PADRAO, lerPorPagina } from './insumo-campos';
import { hojeNoRio, lerData } from './compra-campos';
import { atalhosDePeriodo, lerPagina, somarDias } from './compras-relatorio-campos';
import { formatarDinheiro, formatarQuantidade, type Unidade } from './unidades';

export { OPCOES_POR_PAGINA, POR_PAGINA_PADRAO, atalhosDePeriodo, somarDias };

// ---------------------------------------------------------------- as caixas do relatório

/** Onde um movimento do livro cai. A classificação mora no SQL (`consumo-estoque.ts`); aqui só os nomes e o que cada um quer dizer. */
export type BucketId =
  | 'abertura'
  | 'compra'
  | 'nota_corrigida'
  | 'nota_cancelada'
  | 'producao'
  | 'lote_estornado'
  | 'uso_producao'
  | 'uso_setor'
  | 'devolucao_producao'
  | 'devolucao_setor'
  | 'perda'
  | 'contagem_sobra'
  | 'contagem_falta'
  | 'ajuste'
  | 'estorno_outro'
  | 'transf_entrada'
  | 'transf_saida';

export const LISTA_DE_BUCKETS: BucketId[] = [
  'abertura',
  'compra',
  'nota_corrigida',
  'nota_cancelada',
  'producao',
  'lote_estornado',
  'uso_producao',
  'uso_setor',
  'devolucao_producao',
  'devolucao_setor',
  'perda',
  'contagem_sobra',
  'contagem_falta',
  'ajuste',
  'estorno_outro',
  'transf_entrada',
  'transf_saida',
];

/** As colunas da tela. Transferência não tem coluna: ainda não existe no sistema (as linhas reservadas aparecem no detalhe e no CSV). */
export type ColunaId = 'compras' | 'produzido' | 'uso' | 'perdas' | 'devolucoes' | 'estornos' | 'ajustes' | 'transferencias';
export const COLUNAS_DA_TELA: ColunaId[] = ['compras', 'produzido', 'uso', 'perdas', 'devolucoes', 'estornos', 'ajustes'];
/** O que um número da tabela pode abrir: o saldo de antes, uma coluna ou o saldo de depois. */
export type ColunaDeLink = 'inicial' | ColunaId | 'final';
export const LISTA_DE_LINKS: ColunaDeLink[] = ['inicial', 'compras', 'produzido', 'uso', 'perdas', 'devolucoes', 'estornos', 'ajustes', 'transferencias', 'final'];

export interface DefinicaoDoBucket {
  coluna: ColunaId;
  rotulo: string;
  /** Sinal esperado: entra (+), sai (−) ou pode ser os dois (±). */
  sinal: 'entra' | 'sai' | 'ambos';
  /** De onde vem o movimento (a "origem" que a tela diz). */
  origem: string;
  explica: string;
}

export const BUCKETS: Record<BucketId, DefinicaoDoBucket> = {
  abertura: { coluna: 'ajustes', rotulo: 'Abertura do estoque', sinal: 'entra', origem: 'a 1ª contagem da loja', explica: 'O que se contou na abertura do estoque da loja: vira o saldo inicial dela. Não é compra.' },
  compra: { coluna: 'compras', rotulo: 'Notas lançadas (compra)', sinal: 'entra', origem: 'nota de compra lançada', explica: 'Entrada de uma nota de compra lançada. Entrada de nota não é uso: o insumo só sai pela requisição.' },
  nota_corrigida: { coluna: 'estornos', rotulo: 'Notas corrigidas', sinal: 'ambos', origem: 'nota editada depois de lançada', explica: 'Nota editada: o sistema desfaz a entrada antiga e lança a nova. Aqui entra só a diferença que a correção fez.' },
  nota_cancelada: { coluna: 'estornos', rotulo: 'Notas canceladas', sinal: 'sai', origem: 'nota cancelada', explica: 'Entrada de nota desfeita porque a nota foi cancelada. O movimento original continua no livro; este o desfaz.' },
  producao: { coluna: 'produzido', rotulo: 'Lotes produzidos', sinal: 'entra', origem: 'lote de produção concluído', explica: 'O lote produzido entra no estoque como o insumo que a ficha produz. Não é compra de fora.' },
  lote_estornado: { coluna: 'estornos', rotulo: 'Lotes desfeitos', sinal: 'sai', origem: 'lote estornado', explica: 'Entrada de um lote desfeita (estorno do lote). Os insumos que o lote já gastou continuam como uso.' },
  uso_producao: { coluna: 'uso', rotulo: 'Requisição para produção', sinal: 'sai', origem: 'requisição de um lote', explica: 'Insumos entregues para fazer um lote. A baixa é da requisição do lote.' },
  uso_setor: { coluna: 'uso', rotulo: 'Requisição para setores', sinal: 'sai', origem: 'requisição de um setor', explica: 'Insumos entregues a um setor (cozinha, salão...) por uma requisição avulsa.' },
  devolucao_producao: { coluna: 'devolucoes', rotulo: 'Devolução de requisição de lote', sinal: 'entra', origem: 'requisição de lote devolvida', explica: 'O que voltou ao estoque depois de entregue para um lote.' },
  devolucao_setor: { coluna: 'devolucoes', rotulo: 'Devolução de requisição de setor', sinal: 'entra', origem: 'requisição de setor devolvida', explica: 'O que voltou ao estoque depois de entregue a um setor.' },
  perda: { coluna: 'perdas', rotulo: 'Perdas lançadas', sinal: 'sai', origem: 'perda lançada com motivo', explica: 'Descarte ou vencimento lançado. Ainda não há tela para lançar perda: a coluna aparece vazia até existir.' },
  contagem_sobra: { coluna: 'ajustes', rotulo: 'Sobra na contagem', sinal: 'entra', origem: 'contagem aplicada', explica: 'A contagem achou mais do que o livro dizia. É ajuste de inventário, não compra.' },
  contagem_falta: { coluna: 'ajustes', rotulo: 'Falta na contagem', sinal: 'sai', origem: 'contagem aplicada', explica: 'A contagem achou menos do que o livro dizia. É ajuste de inventário: pode ser consumo sem baixa, perda ou erro, e o sistema não decide qual.' },
  ajuste: { coluna: 'ajustes', rotulo: 'Ajustes manuais', sinal: 'ambos', origem: 'ajuste com motivo', explica: 'Ajuste de saldo feito à mão, com motivo. Ainda não há tela para lançar.' },
  estorno_outro: { coluna: 'estornos', rotulo: 'Outros estornos', sinal: 'ambos', origem: 'movimento desfeito', explica: 'Qualquer outro movimento do livro que foi desfeito por um estorno.' },
  transf_entrada: { coluna: 'transferencias', rotulo: 'Transferências recebidas de outra loja', sinal: 'entra', origem: 'ainda não existe', explica: 'Transferência entre lojas ainda não existe no sistema. Quando existir, entra aqui e não conta como compra nem como consumo da rede.' },
  transf_saida: { coluna: 'transferencias', rotulo: 'Transferências enviadas a outra loja', sinal: 'sai', origem: 'ainda não existe', explica: 'Transferência entre lojas ainda não existe no sistema. Quando existir, sai aqui e não conta como consumo.' },
};

export const BUCKETS_DA_COLUNA: Record<ColunaId, BucketId[]> = {
  compras: ['compra'],
  produzido: ['producao'],
  uso: ['uso_producao', 'uso_setor'],
  perdas: ['perda'],
  devolucoes: ['devolucao_producao', 'devolucao_setor'],
  estornos: ['nota_cancelada', 'nota_corrigida', 'lote_estornado', 'estorno_outro'],
  ajustes: ['abertura', 'contagem_sobra', 'contagem_falta', 'ajuste'],
  transferencias: ['transf_entrada', 'transf_saida'],
};

export const ROTULO_DA_COLUNA: Record<ColunaId, string> = {
  compras: 'Compras',
  produzido: 'Produzido',
  uso: 'Uso',
  perdas: 'Perdas',
  devolucoes: 'Devoluções',
  estornos: 'Estornos',
  ajustes: 'Ajustes',
  transferencias: 'Transferências',
};

/** A frase de uma linha só que a tela põe sob o título da coluna (ajuda a ler sem manual). */
export const DICA_DA_COLUNA: Record<ColunaDeLink, string> = {
  inicial: 'O saldo do livro na virada do dia anterior ao início do período.',
  compras: 'Notas de compra lançadas no período (bruto, antes de cancelamento).',
  produzido: 'Lotes da produção que entraram no estoque como este insumo.',
  uso: 'Requisição registrada: o que o estoque entregou. Não é o consumo medido.',
  perdas: 'Descarte e vencimento lançados. Ainda sem tela para lançar.',
  devolucoes: 'O que voltou ao estoque depois de entregue por requisição.',
  estornos: 'Notas canceladas ou corrigidas e lotes desfeitos.',
  ajustes: 'Abertura, sobra e falta apuradas na contagem e ajustes à mão.',
  transferencias: 'Transferência entre lojas ainda não existe no sistema.',
  final: 'O saldo do livro no fim do último dia do período.',
};

export const ROTULO_DO_LINK: Record<ColunaDeLink, string> = { ...ROTULO_DA_COLUNA, inicial: 'Saldo inicial', final: 'Saldo final' };

/** Os baldes que cada link abre (os movimentos). `inicial` e `final` abrem os que formam o saldo (tudo até o dia anterior / até o fim). */
export function bucketsDoLink(l: ColunaDeLink): BucketId[] | null {
  return l === 'inicial' || l === 'final' ? null : BUCKETS_DA_COLUNA[l];
}

// ---------------------------------------------------------------- somas e conciliação

/** O que o banco soma por balde: quantos movimentos, a quantidade (milésimos, com sinal) e o dinheiro (centavos, com sinal). */
export interface Soma {
  n: number;
  q: number;
  v: number;
}
export type SomasPorBucket = Partial<Record<BucketId, Soma>>;
export const SOMA_VAZIA: Soma = Object.freeze({ n: 0, q: 0, v: 0 }) as Soma;

export function somaDoBucket(s: SomasPorBucket, b: BucketId): Soma {
  return s[b] ?? SOMA_VAZIA;
}

export function somaDaColuna(s: SomasPorBucket, c: ColunaId): Soma {
  return BUCKETS_DA_COLUNA[c].reduce((t, b) => ({ n: t.n + somaDoBucket(s, b).n, q: t.q + somaDoBucket(s, b).q, v: t.v + somaDoBucket(s, b).v }), { n: 0, q: 0, v: 0 });
}

export function somaDeTudo(s: SomasPorBucket): Soma {
  return LISTA_DE_BUCKETS.reduce((t, b) => ({ n: t.n + somaDoBucket(s, b).n, q: t.q + somaDoBucket(s, b).q, v: t.v + somaDoBucket(s, b).v }), { n: 0, q: 0, v: 0 });
}

export interface Conferencia {
  /** inicial + soma dos movimentos = final (em quantidade). */
  fecha: boolean;
  /** final − (inicial + movimentos), em milésimos. Zero quando fecha. */
  diferencaMilesimos: number;
}

/** A ponte: o saldo final tem de ser o inicial mais tudo o que se moveu. Final lido por uma segunda soma, direta no livro. */
export function conferirPonte(inicialMilesimos: number, somas: SomasPorBucket, finalMilesimos: number): Conferencia {
  const diferenca = finalMilesimos - (inicialMilesimos + somaDeTudo(somas).q);
  return { fecha: diferenca === 0, diferencaMilesimos: diferenca };
}

/** Bruto e líquido de uma família de movimentos (compras e uso). Bruto = o que foi lançado; líquido = bruto + o que desfez. */
export interface BrutoELiquido {
  bruto: Soma;
  desfeito: Soma;
  liquido: Soma;
}
const junta = (a: Soma, b: Soma): Soma => ({ n: a.n + b.n, q: a.q + b.q, v: a.v + b.v });

/** Compras: notas lançadas (bruto), notas canceladas ou corrigidas (desfeito) e o que vale (líquido). */
export function comprasBrutaELiquida(s: SomasPorBucket): BrutoELiquido {
  const bruto = somaDoBucket(s, 'compra');
  const desfeito = junta(somaDoBucket(s, 'nota_cancelada'), somaDoBucket(s, 'nota_corrigida'));
  return { bruto, desfeito, liquido: junta(bruto, desfeito) };
}

/** Uso: requisitado (bruto, negativo), devolvido (desfeito, positivo) e o uso líquido. */
export function usoBrutoELiquido(s: SomasPorBucket): BrutoELiquido {
  const bruto = junta(somaDoBucket(s, 'uso_producao'), somaDoBucket(s, 'uso_setor'));
  const desfeito = junta(somaDoBucket(s, 'devolucao_producao'), somaDoBucket(s, 'devolucao_setor'));
  return { bruto, desfeito, liquido: junta(bruto, desfeito) };
}

// ---------------------------------------------------------------- lacunas

export type LacunaId = 'sem-contagem' | 'negativo-final' | 'negativo-no-meio' | 'sem-origem' | 'livro-diverge' | 'sem-valor' | 'unidade-mudou';

export interface Lacuna {
  chave: LacunaId;
  /** Curta, para o selo. */
  rotulo: string;
  /** A frase inteira (o que significa e o que fazer). */
  texto: string;
  /** Dura = algo que o livro não deveria ter (negativo, sem origem, não bate). Informativa = falta de conferência. */
  dura: boolean;
}

export interface DadosParaLacunas {
  unidade: Unidade;
  finalMilesimos: number;
  minSaldoMilesimos: number | null;
  movimentosNoPeriodo: number;
  semOrigem: number;
  semValor: number;
  unidades: number;
  saldoGuardadoMilesimos: number;
  totalDoLivroMilesimos: number;
  contadoNoPeriodo: boolean;
  ultimaContagemEm: string | null;
  /** Mostra R$? (a lacuna "sem valor" só fala de dinheiro para quem o vê.) */
  verValores: boolean;
}

const br = (d: string) => d.split('-').reverse().join('/');

export function lacunasDaLinha(d: DadosParaLacunas): Lacuna[] {
  const saida: Lacuna[] = [];
  if (d.finalMilesimos < 0) {
    saida.push({
      chave: 'negativo-final',
      rotulo: 'Saldo negativo',
      texto: `O livro termina o período com ${quantidadeLimpa(d.finalMilesimos, d.unidade)}: saiu mais do que entrou. Quase sempre é nota ainda não lançada ou contagem desatualizada.`,
      dura: true,
    });
  } else if (d.minSaldoMilesimos !== null && d.minSaldoMilesimos < 0) {
    saida.push({
      chave: 'negativo-no-meio',
      rotulo: 'Ficou negativo',
      texto: `O saldo chegou a ${quantidadeLimpa(d.minSaldoMilesimos, d.unidade)} dentro do período e voltou: baixa registrada antes da nota entrar.`,
      dura: true,
    });
  }
  if (d.semOrigem > 0) {
    saida.push({
      chave: 'sem-origem',
      rotulo: 'Sem origem',
      texto: `${pl(d.semOrigem, 'movimento não aponta', 'movimentos não apontam')} nota, requisição, contagem ou lote (nem motivo escrito): não dá para dizer de onde veio.`,
      dura: true,
    });
  }
  if (d.saldoGuardadoMilesimos !== d.totalDoLivroMilesimos) {
    saida.push({
      chave: 'livro-diverge',
      rotulo: 'Saldo não bate',
      texto: `O saldo guardado (${quantidadeLimpa(d.saldoGuardadoMilesimos, d.unidade)}) é diferente da soma do livro (${quantidadeLimpa(d.totalDoLivroMilesimos, d.unidade)}). Não deveria acontecer: avise o suporte.`,
      dura: true,
    });
  }
  if (d.unidades > 1) {
    saida.push({
      chave: 'unidade-mudou',
      rotulo: 'Unidade mudou',
      texto: 'O livro tem movimentos em unidades diferentes para este insumo: as quantidades não se somam. Confira o cadastro do insumo.',
      dura: true,
    });
  }
  if (d.movimentosNoPeriodo > 0 && !d.contadoNoPeriodo) {
    saida.push({
      chave: 'sem-contagem',
      rotulo: 'Sem contagem no período',
      texto: `Nenhuma contagem aplicada pegou este insumo no período: o saldo final é o do livro, não foi conferido na prateleira.${d.ultimaContagemEm ? ` A última contagem foi em ${br(d.ultimaContagemEm)}.` : ' Nenhuma contagem até aqui.'}`,
      dura: false,
    });
  }
  if (d.semValor > 0 && d.verValores) {
    saida.push({
      chave: 'sem-valor',
      rotulo: 'Sem valor',
      texto: `${pl(d.semValor, 'movimento tem quantidade e valor zero', 'movimentos têm quantidade e valor zero')} (insumo sem preço na época): o R$ desta linha está incompleto.`,
      dura: false,
    });
  }
  return saida;
}

export const temLacunaDura = (l: readonly Lacuna[]) => l.some((x) => x.dura);

// ---------------------------------------------------------------- formatação

export const sp = (n: number) => n.toLocaleString('pt-BR');
export const pl = (n: number, um: string, varios: string) => `${sp(n)} ${n === 1 ? um : varios}`;
const MENOS = '−';

/** "12,5 kg" ou "−2 kg" (negativo com o sinal tipográfico; a lib de quantidade não trata negativo). */
export function quantidadeLimpa(milesimos: number, unidade: Unidade): string {
  return milesimos < 0 ? `${MENOS}${formatarQuantidade(-milesimos, unidade)}` : formatarQuantidade(milesimos, unidade);
}

/** "+12,5 kg", "−2 kg" ou "0 kg": o sinal sempre, para quem lê não depender de cor. */
export function quantidadeComSinal(milesimos: number, unidade: Unidade): string {
  if (milesimos === 0) return formatarQuantidade(0, unidade);
  return milesimos < 0 ? `${MENOS}${formatarQuantidade(-milesimos, unidade)}` : `+${formatarQuantidade(milesimos, unidade)}`;
}

/** "+R$ 42,50", "−R$ 6,25" ou "R$ 0,00". */
export function dinheiroComSinal(centavos: number): string {
  if (centavos === 0) return formatarDinheiro(0);
  return `${centavos > 0 ? '+' : MENOS}${formatarDinheiro(Math.abs(centavos))}`;
}

export function dinheiroLimpo(centavos: number): string {
  return centavos < 0 ? `${MENOS}${formatarDinheiro(-centavos)}` : formatarDinheiro(centavos);
}

/** Quantidade para a planilha: vírgula decimal, sinal "-" ASCII, sem a unidade (ela tem coluna). */
export function quantidadeParaPlanilha(milesimos: number): string {
  const abs = Math.abs(milesimos);
  const inteiro = Math.trunc(abs / 1000);
  const resto = abs % 1000;
  const t = resto ? `${inteiro},${String(resto).padStart(3, '0').replace(/0+$/, '')}` : String(inteiro);
  return milesimos < 0 ? `-${t}` : t;
}

/** Reais para a planilha, COM sinal ("-6,25"): o `reaisParaPlanilha` da L.2 só serve para valor positivo. */
export function reaisComSinalParaPlanilha(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- filtros da URL

export type FiltroDeAtencao = '' | 'atencao' | 'semcontagem';

export interface FiltrosDoConsumo {
  /** Vazio = todas as lojas do acesso com `estoque.ver`. Loja pedida fora do acesso NUNCA amplia: o relatório sai vazio. */
  lojaIds: string[];
  insumoId: string;
  /** Busca pelo nome (ou marca) do insumo; ignora caixa e acento. */
  q: string;
  categoriaId: string;
  de: string;
  ate: string;
  /** "atencao" = só linhas com lacuna dura (negativo, sem origem, saldo que não bate); "semcontagem" = só as sem contagem no período. */
  so: FiltroDeAtencao;
  /** Na tela dos movimentos: o número que se abriu (coluna). Vazio na tela principal. */
  col: '' | ColunaDeLink;
  /** Na tela dos movimentos: só esta caixa dentro da coluna (a linha a linha do detalhe). */
  bucket: '' | BucketId;
  pagina: number;
  porPagina: number;
  periodoInvalido: string | null;
  /** De onde a pessoa veio (só caminho interno; a página confere com `caminhoDeVolta`). */
  volta: string;
}

type Params = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const todos = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const idOuNada = (v: string) => (/^[a-z0-9]{1,64}$/i.test(v) ? v : '');
const ANO_MINIMO = '2000-01-01';
const ANO_MAXIMO = '2100-12-31';
/** O período mais longo que o relatório lê (um ano e um pouco): mais que isso a tela pede para encurtar, em frase. */
export const DIAS_MAXIMOS = 400;

export function diasDoIntervalo(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;
}

export function lerFiltrosDoConsumo(sp: Params, hoje = hojeNoRio()): FiltrosDoConsumo {
  const de = lerData(um(sp.de)) ?? `${hoje.slice(0, 7)}-01`;
  const ate = lerData(um(sp.ate)) ?? hoje;
  let periodoInvalido: string | null = null;
  if (ate < de) periodoInvalido = 'A data final vem antes da inicial. Corrija o período para ver o consumo.';
  else if (de < ANO_MINIMO || ate > ANO_MAXIMO) periodoInvalido = 'Escolha datas entre 2000 e 2100.';
  else if (diasDoIntervalo(de, ate) > DIAS_MAXIMOS) periodoInvalido = `O período passa de ${DIAS_MAXIMOS} dias. Escolha um período menor (um mês ou um trimestre dá a leitura mais clara).`;
  const so = um(sp.so);
  const col = um(sp.col);
  const bucket = um(sp.bucket);
  return {
    lojaIds: Array.from(new Set(todos(sp.loja).map(idOuNada).filter(Boolean))).slice(0, 100),
    insumoId: idOuNada(um(sp.insumo)),
    q: um(sp.q).trim().slice(0, 80),
    categoriaId: idOuNada(um(sp.categoria)),
    de,
    ate,
    so: so === 'atencao' || so === 'semcontagem' ? so : '',
    col: (LISTA_DE_LINKS as string[]).includes(col) ? (col as ColunaDeLink) : '',
    bucket: (LISTA_DE_BUCKETS as string[]).includes(bucket) ? (bucket as BucketId) : '',
    pagina: lerPagina(um(sp.pagina)),
    porPagina: lerPorPagina(um(sp.por)),
    periodoInvalido,
    volta: /^\/[^\s]{0,1999}$/.test(um(sp.volta)) ? um(sp.volta) : '',
  };
}

/** A URL com estes filtros (e as mudanças pedidas). Sempre leva as datas: o endereço não muda com o dia. */
export function queryDoConsumo(f: FiltrosDoConsumo, mudar: Partial<FiltrosDoConsumo> = {}, opcoes: { semPagina?: boolean } = {}): string {
  const x = { ...f, ...mudar };
  const q = new URLSearchParams();
  for (const l of x.lojaIds) q.append('loja', l);
  if (x.insumoId) q.set('insumo', x.insumoId);
  if (x.q) q.set('q', x.q);
  if (x.categoriaId) q.set('categoria', x.categoriaId);
  q.set('de', x.de);
  q.set('ate', x.ate);
  if (x.so) q.set('so', x.so);
  if (x.col) q.set('col', x.col);
  if (x.bucket) q.set('bucket', x.bucket);
  if (x.porPagina !== POR_PAGINA_PADRAO) q.set('por', String(x.porPagina));
  if (!opcoes.semPagina && x.pagina > 1) q.set('pagina', String(x.pagina));
  if (x.volta) q.set('volta', x.volta);
  return q.toString();
}

/** "Saldos do livro, de 01/10/2026 a 31/10/2026" (a mesma frase na tela, na impressão e no CSV). */
export function fraseDoPeriodoDoConsumo(f: Pick<FiltrosDoConsumo, 'de' | 'ate'>): string {
  return f.de === f.ate ? `Movimentos do livro do estoque em ${br(f.de)}` : `Movimentos do livro do estoque de ${br(f.de)} a ${br(f.ate)}`;
}

export const NOTA_DA_DATA = 'A data de um movimento é o dia em que ele entrou no livro do estoque, pelo relógio do Rio de Janeiro. Uma nota com data de 10/10 lançada em 12/10 entra no estoque em 12/10 (a data da nota continua valendo em Compras › Relatórios).';
export const NOTA_DO_USO = 'Uso é a requisição registrada: o que o estoque entregou. Não é o consumo medido na prateleira — para isso há a contagem e as Divergências. A baixa de insumo acontece só ao entregar a requisição; este relatório apenas lê, nunca dá baixa.';
export const NOTA_DA_TRANSFERENCIA = 'Transferência entre lojas ainda não existe no sistema. Quando existir, não será compra de fora nem consumo da rede: terá linhas próprias de entrada e de saída aqui.';
export const NOTA_DO_BRUTO = 'Bruto é o que foi lançado (nota lançada, insumo requisitado). Cancelamentos e correções de nota, lotes desfeitos e devoluções ficam em colunas à parte, nunca somados em silêncio. Líquido é o bruto mais o que foi desfeito.';
export const NOTA_DO_AJUSTE = 'A diferença da contagem entra como ajuste (sobra ou falta apurada), nunca como consumo nem como perda presumidos: pode ser entrada sem nota, consumo sem requisição, perda ou erro de contagem.';

// ---------------------------------------------------------------- avisos

export interface AvisoDoConsumo {
  chave: string;
  texto: string;
}

export interface DadosParaAvisos {
  de: string;
  ate: string;
  hoje: string;
  verValores: boolean;
  /** Lojas do recorte que ainda não abriram o estoque (nada a mostrar nelas). */
  lojasSemEstoque: string[];
  /** Notas fiscais (XML) que aguardam conferência e ficam fora até virarem nota lançada. */
  aguardando: number;
  /** Contagens em andamento (não aplicadas) nas lojas do recorte: os números ainda não entraram no livro. */
  contagensEmAndamento: number;
  /** Linhas do recorte por lacuna. */
  linhas: number;
  comLacunaDura: number;
  semContagem: number;
  semValor: number;
  /** Quantos movimentos sem origem, no total. */
  movimentosSemOrigem: number;
}

/** Todos os avisos do relatório (tela, CSV e impressão dizem as mesmas frases). */
export function avisosDoConsumo(d: DadosParaAvisos): AvisoDoConsumo[] {
  const a: AvisoDoConsumo[] = [];
  if (d.ate > d.hoje) a.push({ chave: 'andamento', texto: 'O período termina depois de hoje: só entram os movimentos já gravados no livro.' });
  if (d.lojasSemEstoque.length) {
    a.push({
      chave: 'sem-estoque',
      texto: `${d.lojasSemEstoque.length === 1 ? 'A loja' : 'As lojas'} ${d.lojasSemEstoque.join(', ')} ${d.lojasSemEstoque.length === 1 ? 'ainda não abriu o estoque' : 'ainda não abriram o estoque'}: sem abertura (primeira contagem) não há saldo nem movimento para mostrar.`,
    });
  }
  if (d.aguardando > 0) {
    a.push({ chave: 'aguardando', texto: `${pl(d.aguardando, 'nota fiscal recebida (XML) aguarda', 'notas fiscais recebidas (XML) aguardam')} conferência e ${d.aguardando === 1 ? 'fica' : 'ficam'} fora: só vira entrada de estoque depois de lançada como nota.` });
  }
  if (d.contagensEmAndamento > 0) {
    a.push({ chave: 'contagem-aberta', texto: `${pl(d.contagensEmAndamento, 'contagem está em andamento', 'contagens estão em andamento')} e ainda não ${d.contagensEmAndamento === 1 ? 'foi aplicada' : 'foram aplicadas'}: o que foi contado só entra no livro quando a contagem é aplicada.` });
  }
  if (d.comLacunaDura > 0) a.push({ chave: 'lacunas', texto: `${pl(d.comLacunaDura, 'insumo tem', 'insumos têm')} lacuna que merece olhar (saldo negativo, movimento sem origem ou saldo que não bate com o livro). Use “Só o que pede atenção”.` });
  if (d.semContagem > 0 && d.linhas > 0) a.push({ chave: 'sem-contagem', texto: `${pl(d.semContagem, 'insumo teve movimento e nenhuma contagem aplicada', 'insumos tiveram movimento e nenhuma contagem aplicada')} no período: o saldo final deles é o do livro, não foi conferido na prateleira.` });
  if (d.semValor > 0 && d.verValores) a.push({ chave: 'sem-valor', texto: `${pl(d.semValor, 'movimento tem quantidade e valor zero', 'movimentos têm quantidade e valor zero')} (insumo sem preço na época): o R$ está incompleto nessas linhas.` });
  return a;
}
