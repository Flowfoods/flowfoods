/**
 * O plano de contas do DRE (2.2a, decisão 137) — PURO, sem banco e sem Next.
 *
 * A ESTRUTURA do DRE é fixa e mora aqui (a ordem dos grupos, quais linhas são
 * calculadas e a fórmula de cada resultado). Os NOMES das linhas de despesa são
 * da casa: o plano padrão nasce em código com um `codigo` estável por linha
 * (`aluguel`, `grupo:PESSOAL`), a casa renomeia, oculta e cria linhas, e a
 * linha renomeada continua sendo a mesma porque o vínculo é o código (e o id).
 *
 * Ordem do DRE (% sempre sobre a RECEITA BRUTA):
 *   Receita (Loja · Delivery próprio · iFood) → (−) Deduções → = Receita líquida
 *   → (−) CMV → (−) Variáveis → = Margem de contribuição → (−) Pessoal ·
 *   Ocupação · Utilidades · Administrativas · Marketing · Outras →
 *   = Resultado operacional → (−) Financeiras → = Resultado do período.
 *
 * Linha CALCULADA vem do sistema: não recebe despesa, não se renomeia nem se
 * oculta. A linha criada pela casa não tem código e nunca é calculada.
 */

import { limparTexto } from './texto-limpo';

export type GrupoDoDre =
  | 'RECEITA'
  | 'DEDUCAO'
  | 'CMV'
  | 'DESPESA_VARIAVEL'
  | 'PESSOAL'
  | 'OCUPACAO'
  | 'UTILIDADES'
  | 'ADMINISTRATIVA'
  | 'MARKETING'
  | 'OUTRAS'
  | 'FINANCEIRA'
  | 'RESULTADO';

export type SentidoDaLinha = 'MAIOR_MELHOR' | 'MENOR_MELHOR';

/** Os grupos na ordem em que aparecem no DRE (RESULTADO são as linhas de subtotal e de resultado, entre eles). */
export const GRUPOS_EM_ORDEM: readonly Exclude<GrupoDoDre, 'RESULTADO'>[] = [
  'RECEITA',
  'DEDUCAO',
  'CMV',
  'DESPESA_VARIAVEL',
  'PESSOAL',
  'OCUPACAO',
  'UTILIDADES',
  'ADMINISTRATIVA',
  'MARKETING',
  'OUTRAS',
  'FINANCEIRA',
];

export const ROTULO_DO_GRUPO: Record<GrupoDoDre, string> = {
  RECEITA: 'Receita bruta',
  DEDUCAO: 'Deduções da venda',
  CMV: 'CMV',
  DESPESA_VARIAVEL: 'Despesas variáveis',
  PESSOAL: 'Pessoal',
  OCUPACAO: 'Ocupação',
  UTILIDADES: 'Utilidades',
  ADMINISTRATIVA: 'Administrativas',
  MARKETING: 'Marketing',
  OUTRAS: 'Outras despesas',
  FINANCEIRA: 'Financeiras',
  RESULTADO: 'Resultado',
};

/** Os grupos onde a casa lança despesa e cria linha (Receita, CMV e Resultado são do sistema). */
export const GRUPOS_DE_DESPESA: readonly GrupoDoDre[] = ['DEDUCAO', 'DESPESA_VARIAVEL', 'PESSOAL', 'OCUPACAO', 'UTILIDADES', 'ADMINISTRATIVA', 'MARKETING', 'OUTRAS', 'FINANCEIRA'];
export const ehGrupoDeDespesa = (g: unknown): g is GrupoDoDre => typeof g === 'string' && (GRUPOS_DE_DESPESA as readonly string[]).includes(g);

/** Os grupos de custo que se subtraem em cada resultado, na ordem da fórmula. */
export const GRUPOS_ANTES_DA_MARGEM = ['DESPESA_VARIAVEL'] as const;
export const GRUPOS_ANTES_DO_OPERACIONAL = ['PESSOAL', 'OCUPACAO', 'UTILIDADES', 'ADMINISTRATIVA', 'MARKETING', 'OUTRAS'] as const;

export const CODIGO = {
  receitaLoja: 'receita-loja',
  receitaDelivery: 'receita-delivery',
  receitaIfood: 'receita-ifood',
  taxasIfood: 'taxas-ifood',
  cmv: 'cmv',
  receitaLiquida: 'receita-liquida',
  margem: 'margem-contribuicao',
  operacional: 'resultado-operacional',
  resultado: 'resultado-do-periodo',
} as const;

/** O código do subtotal de um grupo ("grupo:PESSOAL"). */
export const codigoDoSubtotal = (g: GrupoDoDre) => `grupo:${g}`;

export interface LinhaPadrao {
  codigo: string;
  nome: string;
  grupo: GrupoDoDre;
  calculada: boolean;
  sentido: SentidoDaLinha;
}

const lancavel = (codigo: string, nome: string, grupo: GrupoDoDre): LinhaPadrao => ({ codigo, nome, grupo, calculada: false, sentido: 'MENOR_MELHOR' });
const calc = (codigo: string, nome: string, grupo: GrupoDoDre, sentido: SentidoDaLinha = 'MENOR_MELHOR'): LinhaPadrao => ({ codigo, nome, grupo, calculada: true, sentido });
const subtotal = (g: Exclude<GrupoDoDre, 'RESULTADO'>): LinhaPadrao => calc(codigoDoSubtotal(g), ROTULO_DO_GRUPO[g], 'RESULTADO', g === 'RECEITA' ? 'MAIOR_MELHOR' : 'MENOR_MELHOR');

/**
 * O plano padrão, em código. A ordem do array é a ordem da tela dentro de cada
 * grupo (as linhas calculadas de subtotal e de resultado ficam fora dos grupos).
 */
export const PLANO_PADRAO: readonly LinhaPadrao[] = [
  calc(CODIGO.receitaLoja, 'Loja', 'RECEITA', 'MAIOR_MELHOR'),
  calc(CODIGO.receitaDelivery, 'Delivery próprio', 'RECEITA', 'MAIOR_MELHOR'),
  calc(CODIGO.receitaIfood, 'iFood', 'RECEITA', 'MAIOR_MELHOR'),
  subtotal('RECEITA'),
  calc(CODIGO.taxasIfood, 'Taxas do iFood', 'DEDUCAO'),
  lancavel('impostos', 'Impostos sobre a venda (DAS)', 'DEDUCAO'),
  lancavel('taxas-cartao', 'Taxas de cartão e apps', 'DEDUCAO'),
  subtotal('DEDUCAO'),
  calc(CODIGO.receitaLiquida, 'Receita líquida', 'RESULTADO', 'MAIOR_MELHOR'),
  calc(CODIGO.cmv, 'CMV', 'CMV'),
  lancavel('entregas', 'Entregas e motoboy', 'DESPESA_VARIAVEL'),
  lancavel('variaveis-outras', 'Outras variáveis', 'DESPESA_VARIAVEL'),
  subtotal('DESPESA_VARIAVEL'),
  calc(CODIGO.margem, 'Margem de contribuição', 'RESULTADO', 'MAIOR_MELHOR'),
  lancavel('salarios', 'Salários', 'PESSOAL'),
  lancavel('encargos', 'Encargos', 'PESSOAL'),
  lancavel('beneficios', 'Benefícios', 'PESSOAL'),
  lancavel('extras', 'Extras e freelas', 'PESSOAL'),
  lancavel('pro-labore', 'Pró-labore', 'PESSOAL'),
  subtotal('PESSOAL'),
  lancavel('aluguel', 'Aluguel', 'OCUPACAO'),
  lancavel('condominio', 'Condomínio', 'OCUPACAO'),
  lancavel('iptu', 'IPTU', 'OCUPACAO'),
  subtotal('OCUPACAO'),
  lancavel('energia', 'Energia', 'UTILIDADES'),
  lancavel('agua', 'Água', 'UTILIDADES'),
  lancavel('gas', 'Gás', 'UTILIDADES'),
  lancavel('internet', 'Internet e telefone', 'UTILIDADES'),
  subtotal('UTILIDADES'),
  lancavel('contabilidade', 'Contabilidade', 'ADMINISTRATIVA'),
  lancavel('sistemas', 'Sistemas', 'ADMINISTRATIVA'),
  lancavel('manutencao', 'Manutenção', 'ADMINISTRATIVA'),
  lancavel('adm-outras', 'Outras administrativas', 'ADMINISTRATIVA'),
  subtotal('ADMINISTRATIVA'),
  lancavel('marketing', 'Marketing e anúncios', 'MARKETING'),
  subtotal('MARKETING'),
  lancavel('diversas', 'Despesas diversas', 'OUTRAS'),
  subtotal('OUTRAS'),
  calc(CODIGO.operacional, 'Resultado operacional', 'RESULTADO', 'MAIOR_MELHOR'),
  lancavel('tarifas', 'Tarifas e antecipação', 'FINANCEIRA'),
  lancavel('juros', 'Juros', 'FINANCEIRA'),
  subtotal('FINANCEIRA'),
  calc(CODIGO.resultado, 'Resultado do período', 'RESULTADO', 'MAIOR_MELHOR'),
];

/** A linha do plano como a tela e o DRE a recebem: do banco, ou virtual (sem id) enquanto o parceiro não a gravou. */
export interface LinhaDoPlano {
  /** Nulo = ainda não gravada (parceiro novo ou suspenso: a leitura usa o padrão do código sem escrever). */
  id: string | null;
  codigo: string | null;
  nome: string;
  grupo: GrupoDoDre;
  calculada: boolean;
  sentido: SentidoDaLinha;
  ordem: number;
  ativa: boolean;
  /** O `atualizadoEm` lido ('' = linha virtual): a edição confere. */
  versao: string;
}

export interface LinhaDoBanco {
  id: string;
  codigo: string | null;
  nome: string;
  grupo: GrupoDoDre;
  calculada: boolean;
  sentido: SentidoDaLinha;
  ordem: number;
  ativa: boolean;
  atualizadoEm: Date;
}

/** O que a chave de uma linha vira no formulário: o código, ou `id:<id>` para linha criada pela casa. */
export const chaveDaLinha = (l: Pick<LinhaDoPlano, 'codigo' | 'id'>) => (l.codigo !== null ? l.codigo : `id:${l.id}`);

/**
 * O plano de verdade: cada linha do padrão (a gravada, se existe, senão a virtual) e as
 * linhas que a casa criou, depois das do padrão do mesmo grupo. A ordem é a do DRE.
 */
export function planoEfetivo(doBanco: readonly LinhaDoBanco[]): LinhaDoPlano[] {
  const porCodigo = new Map(doBanco.filter((l) => l.codigo !== null).map((l) => [l.codigo!, l]));
  const out: LinhaDoPlano[] = PLANO_PADRAO.map((p, i) => {
    const g = porCodigo.get(p.codigo);
    // Calculada nunca muda de nome nem some, mesmo se alguém mexeu no banco por fora.
    if (g && !p.calculada) return { id: g.id, codigo: p.codigo, nome: g.nome, grupo: g.grupo, calculada: false, sentido: g.sentido, ordem: g.ordem, ativa: g.ativa, versao: g.atualizadoEm.toISOString() };
    return { id: g?.id ?? null, codigo: p.codigo, nome: p.nome, grupo: p.grupo, calculada: p.calculada, sentido: p.sentido, ordem: (i + 1) * 10, ativa: true, versao: g ? g.atualizadoEm.toISOString() : '' };
  });
  const dasCasa = doBanco.filter((l) => l.codigo === null || !PLANO_PADRAO.some((p) => p.codigo === l.codigo));
  for (const l of dasCasa) {
    out.push({ id: l.id, codigo: l.codigo, nome: l.nome, grupo: l.grupo, calculada: l.calculada, sentido: l.sentido, ordem: l.ordem, ativa: l.ativa, versao: l.atualizadoEm.toISOString() });
  }
  return out;
}

/** As linhas lançáveis de um grupo, na ordem da tela: as do padrão primeiro (pela ordem do padrão), depois as da casa (por ordem e nome). */
export function linhasLancaveisDoGrupo(plano: readonly LinhaDoPlano[], grupo: GrupoDoDre): LinhaDoPlano[] {
  const doGrupo = plano.filter((l) => l.grupo === grupo && !l.calculada);
  const padrao = doGrupo.filter((l) => l.codigo !== null && PLANO_PADRAO.some((p) => p.codigo === l.codigo));
  const casa = doGrupo.filter((l) => !padrao.includes(l)).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  return [...padrao, ...casa];
}

// ------------------------------------------------------------------ nome da linha

export const LIMITE_DO_NOME_DA_LINHA = 60;

export function lerNomeDaLinha(texto: unknown): { ok: true; nome: string } | { ok: false; erro: string } {
  const nome = limparTexto(texto);
  if (nome.length === 0) return { ok: false, erro: 'Dê um nome para a linha.' };
  if (nome.length > LIMITE_DO_NOME_DA_LINHA) return { ok: false, erro: `O nome tem no máximo ${LIMITE_DO_NOME_DA_LINHA} letras.` };
  return { ok: true, nome };
}

/** Nome repetido, sem ligar para maiúscula, acento e espaço: "aluguel" e "Aluguel " são a mesma linha. */
export const chaveDoNome = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
