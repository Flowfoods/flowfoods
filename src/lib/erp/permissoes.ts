/**
 * Permissões do ERP (0.4) — regras puras, sem banco e sem Next.
 *
 * - CATÁLOGO: permissões finas e nomeadas por módulo e ação (`insumos.editar`),
 *   versionado em código. Os módulos que ainda não têm tela já estão aqui
 *   (ficha técnica, compras, estoque, produção, etiquetas, faturamento, DRE,
 *   precificação): o dono já monta o perfil e ninguém precisa rever perfis
 *   quando a tela chegar. Rótulos humanos — é o que a tela mostra.
 * - PERFIS BASE (dono, gerente, operador): conjuntos definidos AQUI, não no
 *   banco. Perfil próprio do parceiro nasce copiando um base e guarda a lista
 *   COMPLETA (fotografia), não a diferença: permissão nova do catálogo não
 *   entra sozinha num perfil próprio (menor privilégio).
 * - AJUSTE POR PESSOA: extras (concedidas a mais) e removidas, por vínculo.
 *   Efetivas = (perfil ∪ extras) − removidas.
 * - LOJAS: rede inteira (inclusive lojas futuras) OU uma lista de lojas
 *   (gerente de unidade, sócio de uma loja). Permissão "por loja" checada com
 *   `lojaId` só passa se a loja estiver no alcance. `exigeRede` (cadastrar
 *   lojas, ver o histórico da rede) só vale para quem tem a rede inteira.
 * - 3 NÍVEIS: FLOWFOODS (N1, o Rodolfo: tudo, todo parceiro), REDE (N2:
 *   pessoa com a rede inteira) e LOJA (N3: pessoa com lojas escolhidas).
 * - SETORES (cozinha, salão...): atributo da pessoa, para filtrar e sugerir
 *   perfil. Setor NÃO concede nada sozinho (decisão 39).
 *
 * `exigirPermissao` é a ÚNICA checagem: páginas e server actions do ERP
 * chamam ela (ou `pode`, que é a mesma regra). A tela esconde o que não pode;
 * quem decide é o servidor.
 */

/**
 * Sobe quando o catálogo ganha permissão nova (perfil próprio guarda em que versão nasceu). 2 = 3.2, `producao.planejar`.
 * 3 = I.1a, `insumos.categorias`.
 */
export const VERSAO_DO_CATALOGO = 3;

export interface DefinicaoDePermissao {
  rotulo: string;
  /** Checada com `lojaId`: só passa se a loja estiver no alcance da pessoa. */
  porLoja?: boolean;
  /** Só vale para quem tem a rede inteira (mexe na estrutura da rede). */
  exigeRede?: boolean;
}

export interface ModuloDoCatalogo {
  chave: string;
  rotulo: string;
  /** Ainda sem tela: a permissão já existe para montar o perfil. */
  emBreve?: boolean;
  permissoes: Record<string, DefinicaoDePermissao>;
}

export const CATALOGO = [
  {
    chave: 'insumos',
    rotulo: 'Insumos',
    permissoes: {
      'insumos.ver': { rotulo: 'Ver insumos e custos' },
      'insumos.editar': { rotulo: 'Cadastrar e editar insumos' },
      // I.1a: a categoria é da REDE inteira (muda o CMV de todas as lojas): quem tem só lojas não gere. Classificar UM insumo
      // continua sendo `insumos.editar`; criar, renomear, reordenar, desativar e excluir categoria, e aplicar ou desfazer a
      // classificação assistida de todos, são desta.
      'insumos.categorias': { rotulo: 'Gerir categorias de insumos', exigeRede: true },
    },
  },
  {
    chave: 'estrutura',
    rotulo: 'Lojas e marcas',
    permissoes: {
      'lojas.ver': { rotulo: 'Ver lojas e marcas' },
      'lojas.gerir': { rotulo: 'Cadastrar lojas e marcas', exigeRede: true },
    },
  },
  {
    chave: 'equipe',
    rotulo: 'Equipe',
    permissoes: {
      'acessos.gerir': { rotulo: 'Cuidar da equipe: pessoas, perfis e lojas de cada um' },
      // O histórico da rede cita lojas e pessoas de todas as lojas: só com a rede inteira.
      'historico.ver': { rotulo: 'Ver o histórico de alterações', exigeRede: true },
    },
  },
  {
    chave: 'fichas',
    rotulo: 'Ficha técnica',
    permissoes: {
      'fichas.ver': { rotulo: 'Ver fichas técnicas' },
      'fichas.editar': { rotulo: 'Criar e editar fichas técnicas' },
    },
  },
  {
    chave: 'compras',
    rotulo: 'Compras',
    permissoes: {
      'compras.ver': { rotulo: 'Ver compras e notas', porLoja: true },
      'compras.lancar': { rotulo: 'Lançar nota de compra', porLoja: true },
      'fornecedores.editar': { rotulo: 'Cadastrar fornecedores' },
    },
  },
  {
    chave: 'estoque',
    rotulo: 'Estoque',
    permissoes: {
      'estoque.ver': { rotulo: 'Ver o estoque', porLoja: true },
      'estoque.contar': { rotulo: 'Fazer contagem', porLoja: true },
      'estoque.ajustar': { rotulo: 'Ajustar saldo e lançar perda', porLoja: true },
      'requisicao.pedir': { rotulo: 'Pedir requisição', porLoja: true },
      'requisicao.atender': { rotulo: 'Atender requisição e dar baixa', porLoja: true },
    },
  },
  {
    // 3.1: a produção saiu de "em breve" (planejar o lote, dar baixa pela requisição, concluir e pôr no estoque).
    // 3.2: a lista do dia. Quem DEFINE o que a loja produz no dia (e transforma a lista em lotes) é o gerente, não a
    // cozinha: "registrar produção" é do operador, então a lista ganhou permissão própria (decisão 219). Fica fora do
    // operador; dono e gerente recebem pelo perfil base; perfil próprio só se alguém der.
    chave: 'producao',
    rotulo: 'Produção',
    permissoes: {
      'producao.ver': { rotulo: 'Ver a produção e a lista do dia', porLoja: true },
      'producao.registrar': { rotulo: 'Registrar produção', porLoja: true },
      'producao.planejar': { rotulo: 'Definir a lista do dia (o que a loja produz)', porLoja: true },
    },
  },
  {
    // 3.4: a etiqueta do lote produzido e da embalagem aberta (abrir = registrar a abertura, que dá a validade). Já estava no
    // catálogo desde a 0.4 (o operador tem): sem permissão nova, o catálogo segue na versão 3 (decisão 405).
    chave: 'etiquetas',
    rotulo: 'Etiquetas',
    permissoes: {
      'etiquetas.imprimir': { rotulo: 'Imprimir etiquetas', porLoja: true },
    },
  },
  {
    chave: 'faturamento',
    rotulo: 'Faturamento e DRE',
    // 2.1: faturamento. 2.2a: DRE, despesas, plano de contas e período. Metas e farol chegam nas fases 2.2b a 2.4.
    permissoes: {
      'faturamento.ver': { rotulo: 'Ver faturamento', porLoja: true },
      'faturamento.lancar': { rotulo: 'Lançar faturamento', porLoja: true },
      'dre.ver': { rotulo: 'Ver DRE e CMV', porLoja: true },
      'despesas.lancar': { rotulo: 'Lançar despesas', porLoja: true },
      // Plano de contas, período e metas são da REDE inteira (mexem no DRE de todas as lojas): quem tem só lojas não define.
      'metas.editar': { rotulo: 'Definir metas, plano de contas e período do DRE', exigeRede: true },
    },
  },
  {
    chave: 'precos',
    rotulo: 'Precificação',
    // 1.9: custo por canal na ficha e a taxa do iFood (Canais de venda); o preço em si chega na 1.10.
    permissoes: {
      'precos.ver': { rotulo: 'Ver preços e margens' },
      'precos.editar': { rotulo: 'Mudar preços e margens' },
    },
  },
] as const satisfies readonly ModuloDoCatalogo[];

type ChavesDe<M> = M extends { permissoes: infer P } ? keyof P & string : never;
/** `'insumos.ver' | 'insumos.editar' | ...` — erro de digitação no nome não compila. */
export type Permissao = ChavesDe<(typeof CATALOGO)[number]>;

const DEFINICOES = new Map<string, DefinicaoDePermissao & { modulo: string }>(
  CATALOGO.flatMap((m) =>
    Object.entries(m.permissoes).map(([p, d]) => [p, { ...(d as DefinicaoDePermissao), modulo: m.rotulo }] as const),
  ),
);

export const TODAS_AS_PERMISSOES = Array.from(DEFINICOES.keys()) as Permissao[];

export function ehPermissao(p: unknown): p is Permissao {
  return typeof p === 'string' && DEFINICOES.has(p);
}

export function rotuloDaPermissao(p: string): string {
  return DEFINICOES.get(p)?.rotulo ?? p;
}

/** Só o que existe no catálogo, sem repetição, na ordem do catálogo. */
export function normalizarPermissoes(lista: readonly unknown[]): Permissao[] {
  const s = new Set(lista.filter(ehPermissao));
  return TODAS_AS_PERMISSOES.filter((p) => s.has(p));
}

// ---------------------------------------------------------------- perfis base

export type PerfilBase = 'DONO' | 'GERENTE' | 'OPERADOR';

const SEM_GERENTE = new Set<Permissao>(['acessos.gerir', 'lojas.gerir', 'metas.editar', 'precos.editar', 'insumos.categorias']);

const DO_OPERADOR: Permissao[] = [
  'insumos.ver',
  'lojas.ver',
  'fichas.ver',
  'estoque.ver',
  'estoque.contar',
  'requisicao.pedir',
  'producao.ver',
  'producao.registrar',
  'etiquetas.imprimir',
];

export const PERFIS_BASE: Record<PerfilBase, { rotulo: string; resumo: string; permissoes: readonly Permissao[] }> = {
  DONO: {
    rotulo: 'Dono',
    resumo: 'Tudo, inclusive cuidar da equipe.',
    permissoes: TODAS_AS_PERMISSOES,
  },
  GERENTE: {
    rotulo: 'Gerente',
    resumo: 'Toca a operação: cadastros, estoque, compras e números. Não mexe na equipe nem nos preços.',
    permissoes: TODAS_AS_PERMISSOES.filter((p) => !SEM_GERENTE.has(p)),
  },
  OPERADOR: {
    rotulo: 'Operador',
    resumo: 'O dia a dia da loja: consulta, conta estoque, pede requisição e registra produção.',
    permissoes: DO_OPERADOR,
  },
};

export const ORDEM_DOS_PERFIS_BASE: PerfilBase[] = ['DONO', 'GERENTE', 'OPERADOR'];

// -------------------------------------------------------------------- setores

export type Setor =
  | 'COZINHA'
  | 'SALAO'
  | 'ADMINISTRATIVO'
  | 'ESTOQUE'
  | 'CAIXA'
  | 'MOTOBOY'
  | 'FREELANCER'
  | 'COMPRAS'
  | 'MARKETING_CRM'
  | 'GERENCIA';

export const SETORES: Record<Setor, string> = {
  COZINHA: 'Cozinha',
  SALAO: 'Salão',
  ADMINISTRATIVO: 'Administrativo',
  ESTOQUE: 'Estoque',
  CAIXA: 'Caixa',
  MOTOBOY: 'Motoboy',
  FREELANCER: 'Freelancer',
  COMPRAS: 'Compras',
  MARKETING_CRM: 'Marketing e CRM',
  GERENCIA: 'Gerência',
};

export const LISTA_DE_SETORES = Object.keys(SETORES) as Setor[];

export function ehSetor(s: unknown): s is Setor {
  return typeof s === 'string' && s in SETORES;
}

export function normalizarSetores(lista: readonly unknown[]): Setor[] {
  const s = new Set(lista.filter(ehSetor));
  return LISTA_DE_SETORES.filter((x) => s.has(x));
}

// -------------------------------------------------------------------- alcance

export type Nivel = 'FLOWFOODS' | 'REDE' | 'LOJA';

/** Lojas que a pessoa alcança: 'todas' (rede inteira, inclusive as futuras) ou ids. */
export type LojasDoAlcance = 'todas' | readonly string[];

/** O que uma pessoa pode, num parceiro. Resolvido no servidor a cada requisição. */
export interface Alcance {
  nivel: Nivel;
  permissoes: ReadonlySet<Permissao>;
  lojas: LojasDoAlcance;
}

/** Nível 1 (FlowFoods): tudo, em todo parceiro. */
export const ALCANCE_FLOWFOODS: Alcance = Object.freeze({
  nivel: 'FLOWFOODS',
  permissoes: new Set(TODAS_AS_PERMISSOES),
  lojas: 'todas',
});

/** Como o vínculo pessoa × parceiro está gravado (colunas do AcessoParceiro + perfil próprio). */
export interface VinculoDePermissao {
  perfilBase: PerfilBase | null;
  /** Permissões do perfil próprio (quando `perfilBase` é nulo). */
  perfilProprio: readonly string[] | null;
  /** Versão do catálogo em que o perfil próprio foi salvo (ausente = 1; ver `permissoesNoCatalogoAtual`). */
  perfilCatalogoVersao?: number | null;
  permissoesExtras: readonly string[];
  permissoesRemovidas: readonly string[];
  redeInteira: boolean;
  lojaIds: readonly string[];
}

/** O que entrou no catálogo em cada versão (a 1 é a de nascença). */
const NOVAS_NA_VERSAO: Readonly<Record<number, readonly Permissao[]>> = { 2: ['producao.planejar'], 3: ['insumos.categorias'] };

/** O catálogo como era na versão `versao`: o de hoje menos o que entrou depois. */
function catalogoNaVersao(versao: number): Permissao[] {
  const depois = new Set<Permissao>();
  for (let v = versao + 1; v <= VERSAO_DO_CATALOGO; v++) for (const p of NOVAS_NA_VERSAO[v] ?? []) depois.add(p);
  return TODAS_AS_PERMISSOES.filter((p) => !depois.has(p));
}

/** O que entrou no catálogo depois da versão em que o perfil foi salvo (e que ele não tem): o que a Equipe pede para revisar. */
export function novasDesdeOPerfil(permissoes: readonly Permissao[], catalogoVersao: number): Permissao[] {
  const tem = new Set(permissoes);
  const fora = new Set(catalogoNaVersao(catalogoVersao));
  return TODAS_AS_PERMISSOES.filter((p) => !fora.has(p) && !tem.has(p));
}

/**
 * Perfil próprio salvo num catálogo antigo (decisão 219): o que tinha TODAS as permissões daquele catálogo (o "copiado do
 * Dono") ganha o que entrou depois — sem escalada, porque já tinha tudo, e sem isso deixaria de cobrir o Gerente e o Dono
 * base. Os demais ficam como estão (permissão nova não entra sozinha) e a Equipe avisa para revisar. A migration
 * `20261030010000_erp_catalogo_v2` grava isso no banco; a regra aqui cobre o perfil que o app antigo salvar durante o deploy.
 * `catalogoVersao` ausente = a versão 1 (o perfil gravado sem versão é anterior ao catálogo versionado).
 */
export function permissoesNoCatalogoAtual(lista: readonly unknown[], catalogoVersao = 1): Permissao[] {
  const atuais = normalizarPermissoes(lista);
  if (catalogoVersao >= VERSAO_DO_CATALOGO) return atuais;
  const tem = new Set(atuais);
  if (!catalogoNaVersao(catalogoVersao).every((p) => tem.has(p))) return atuais;
  return [...TODAS_AS_PERMISSOES];
}

/** Permissões do perfil (base ou próprio), já filtradas pelo catálogo (o próprio, levado ao catálogo de hoje). */
export function permissoesDoPerfil(v: Pick<VinculoDePermissao, 'perfilBase' | 'perfilProprio' | 'perfilCatalogoVersao'>): Permissao[] {
  if (v.perfilBase) return [...PERFIS_BASE[v.perfilBase].permissoes];
  return permissoesNoCatalogoAtual(v.perfilProprio ?? [], v.perfilCatalogoVersao ?? 1);
}

/**
 * Efetivas = (perfil ∪ extras) − removidas; sem a rede inteira, as que
 * `exigeRede` caem. Nome fora do catálogo é ignorado (catálogo é a verdade).
 */
export function resolverAlcance(v: VinculoDePermissao): Alcance {
  const efetivas = new Set<Permissao>([...permissoesDoPerfil(v), ...normalizarPermissoes(v.permissoesExtras)]);
  for (const p of normalizarPermissoes(v.permissoesRemovidas)) efetivas.delete(p);
  if (!v.redeInteira) for (const p of Array.from(efetivas)) if (DEFINICOES.get(p)?.exigeRede) efetivas.delete(p);
  const lojas: LojasDoAlcance = v.redeInteira ? 'todas' : Array.from(new Set(v.lojaIds));
  return { nivel: v.redeInteira ? 'REDE' : 'LOJA', permissoes: efetivas, lojas };
}

/** A loja está no alcance? */
export function alcancaLoja(alcance: Pick<Alcance, 'lojas'>, lojaId: string): boolean {
  return alcance.lojas === 'todas' || alcance.lojas.includes(lojaId);
}

/** Filtro de consulta: `undefined` = rede inteira (sem filtro); senão, só estas lojas. */
export function filtroDeLojas(alcance: Pick<Alcance, 'lojas'>): { in: string[] } | undefined {
  return alcance.lojas === 'todas' ? undefined : { in: [...alcance.lojas] };
}

// ------------------------------------------------------------------- checagem

export class ErroDePermissao extends Error {
  readonly permissao: string;
  constructor(permissao: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDePermissao';
    this.permissao = permissao;
  }
}

/** null = pode; senão, a frase para a pessoa. A regra de `pode` e de `exigirPermissao`. */
export function recusa(alcance: Alcance, permissao: Permissao, opcoes: { lojaId?: string } = {}): string | null {
  const def = DEFINICOES.get(permissao);
  if (!def) return 'Permissão desconhecida.';
  if (!alcance.permissoes.has(permissao)) {
    return `Seu acesso não inclui “${def.rotulo.toLowerCase()}”. Fale com quem cuida da equipe.`;
  }
  if (def.exigeRede && alcance.lojas !== 'todas') return 'Só quem tem acesso à rede inteira faz isso.';
  if (opcoes.lojaId !== undefined && !alcancaLoja(alcance, opcoes.lojaId)) {
    return 'Essa loja não está no seu acesso.';
  }
  return null;
}

export function pode(alcance: Alcance, permissao: Permissao, opcoes: { lojaId?: string } = {}): boolean {
  return recusa(alcance, permissao, opcoes) === null;
}

/**
 * A checagem única do servidor. Estoura `ErroDePermissao` (mensagem já em
 * PT-BR para a pessoa) se não pode; não devolve nada se pode.
 */
export function exigirPermissao(
  ctx: { alcance: Alcance },
  permissao: Permissao,
  opcoes: { lojaId?: string } = {},
): void {
  const motivo = recusa(ctx.alcance, permissao, opcoes);
  if (motivo) throw new ErroDePermissao(permissao, motivo);
}

/**
 * Para as server actions: a frase da recusa, ou null se pode. É
 * `exigirPermissao` com o erro virado em mensagem (qualquer outro erro sobe).
 */
export function recusaDaAcao(
  ctx: { alcance: Alcance },
  permissao: Permissao,
  opcoes: { lojaId?: string } = {},
): string | null {
  try {
    exigirPermissao(ctx, permissao, opcoes);
    return null;
  } catch (e) {
    if (e instanceof ErroDePermissao) return e.message;
    throw e;
  }
}

// -------------------------------------------------------- sem escalada

/**
 * `ator` cobre `alvo`? Todas as permissões do alvo o ator também tem, e as
 * lojas do alvo estão nas do ator (rede inteira só é coberta por rede
 * inteira). É a regra de "ninguém concede o que não tem": vale para o que a
 * pessoa TEM antes (não mexe em quem está acima) e para o que vai ter depois
 * (não sobe ninguém acima de si). Nível 1 cobre todo mundo.
 */
export function cobre(ator: Alcance, alvo: Pick<Alcance, 'permissoes' | 'lojas'>): boolean {
  if (ator.nivel === 'FLOWFOODS') return true;
  for (const p of Array.from(alvo.permissoes)) if (!ator.permissoes.has(p)) return false;
  if (ator.lojas === 'todas') return true;
  if (alvo.lojas === 'todas') return false;
  return alvo.lojas.every((l) => ator.lojas.includes(l));
}

/** O que falta ao ator para cobrir o alvo (para a mensagem). */
export function faltaParaCobrir(
  ator: Alcance,
  alvo: Pick<Alcance, 'permissoes' | 'lojas'>,
): {
  permissoes: Permissao[];
  lojas: boolean;
} {
  if (ator.nivel === 'FLOWFOODS') return { permissoes: [], lojas: false };
  const permissoes = TODAS_AS_PERMISSOES.filter((p) => alvo.permissoes.has(p) && !ator.permissoes.has(p));
  const lojas = ator.lojas !== 'todas' && (alvo.lojas === 'todas' || alvo.lojas.some((l) => !ator.lojas.includes(l)));
  return { permissoes, lojas };
}

/** Administrador da equipe: ativo, com "cuidar da equipe" e a rede inteira. */
export function ehAdministrador(alcance: Pick<Alcance, 'permissoes' | 'lojas'>): boolean {
  return alcance.permissoes.has('acessos.gerir') && alcance.lojas === 'todas';
}

/**
 * A mudança tira o último administrador? (Havia pelo menos um ativo antes e
 * não sobra nenhum depois.) Parceiro que nunca teve administrador não trava:
 * o nível 1 cria o primeiro.
 */
export function deixaSemAdministrador(
  antes: readonly Pick<Alcance, 'permissoes' | 'lojas'>[],
  depois: readonly Pick<Alcance, 'permissoes' | 'lojas'>[],
): boolean {
  return antes.some(ehAdministrador) && !depois.some(ehAdministrador);
}

// --------------------------------------------------------- texto para a tela

/** "Gerente", "Cozinha (perfil próprio)". */
export function rotuloDoPerfil(v: { perfilBase: PerfilBase | null; perfilNome?: string | null }): string {
  if (v.perfilBase) return PERFIS_BASE[v.perfilBase].rotulo;
  return v.perfilNome ?? 'Perfil próprio';
}

export function rotuloDasLojas(lojas: LojasDoAlcance, nomes: ReadonlyMap<string, string>): string {
  if (lojas === 'todas') return 'Rede inteira';
  const n = lojas.map((id) => nomes.get(id)).filter((x): x is string => !!x);
  if (n.length === 0) return 'Nenhuma loja';
  return n.join(', ');
}

export function rotuloDosSetores(setores: readonly string[]): string {
  const n = normalizarSetores(setores).map((s) => SETORES[s]);
  return n.length ? n.join(', ') : '—';
}

export function rotuloDasPermissoes(lista: readonly string[]): string {
  const n = normalizarPermissoes(lista).map(rotuloDaPermissao);
  return n.length ? n.join('; ') : '—';
}
