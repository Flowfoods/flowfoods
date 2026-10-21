/**
 * Módulos e navegação do shell do ERP — puro (sem Next, sem React), testável.
 *
 * O shell (menu lateral, hub, busca ⌘K, cabeçalho de página) é desenhado a
 * partir destes dados. A tela mostra só o que `pode(alcance, ...)` libera;
 * quem decide é o servidor (`exigirPermissaoNaPagina` em toda página e
 * `recusaDaAcao` em toda action). Esconder aqui é conforto, não trava.
 *
 * UX.9: a navegação é por ÁREAS. Área = `ModuloNav` (um card no hub, uma
 * opção no seletor), aba = item do menu (1:1: o menu, as abas e o hub saem da
 * mesma estrutura e nunca divergem), ação ("Novo insumo", "Lançar nota"...) =
 * `acoes` da área: fora do menu e do hub, no cabeçalho da aba e no ⌘K.
 *
 * Módulos do plano que ainda não têm tela aparecem DESABILITADOS, com a fase
 * em que chegam, e nunca com link: não existe destino que leve a uma tela que
 * não existe. Só aparecem para quem vai poder usá-los (a permissão de ver já
 * está no catálogo da 0.4).
 */

import { pode, type Alcance, type Permissao } from './permissoes';

/** Chave do ícone: o desenho mora em `src/components/erp/shell/icones.tsx`. */
export type ChaveIcone =
  | 'inicio'
  | 'insumo'
  | 'novo'
  | 'importar'
  | 'fichas'
  | 'compras'
  | 'fornecedor'
  | 'estoque'
  | 'producao'
  | 'etiquetas'
  | 'dre'
  | 'rede'
  | 'lojas'
  | 'equipe'
  | 'historico'
  | 'acesso'
  | 'cadastro'
  | 'comercial'
  | 'hoje'
  | 'leads'
  | 'cadencia'
  | 'inbox'
  | 'visitas'
  | 'metricas'
  | 'clientes'
  | 'portal'
  | 'parceiros'
  | 'sistema'
  | 'config'
  // 1.9: canais de venda (loja, delivery, iFood) e a taxa do iFood.
  | 'canais';

export interface ItemNav {
  href: string;
  rotulo: string;
  icone: ChaveIcone;
  /** Uma linha, no hub e na busca. */
  subtitulo: string;
  /**
   * 1.8: o item também acende nestes caminhos (fonte de RegExp), com
   * prioridade sobre o prefixo: o quadro de uma loja
   * (`/estoque/<loja>/requisicoes`) é "Requisições", não "Estoque por loja".
   */
  ativoEm?: string;
  /**
   * UX.9: nome da área a que a aba (ou ação) pertence. É o que agrupa as abas
   * quando o item muda de módulo (no nível 1 as áreas do parceiro moram dentro
   * de "Parceiros Flow") e o que o ⌘K mostra antes do subtítulo.
   */
  area?: string;
}

export interface GrupoNav {
  rotulo: string;
  /** Âncora do grupo no menu (e o que sobra dele com o menu recolhido). */
  icone: ChaveIcone;
  itens: ItemNav[];
}

export interface ModuloNav {
  chave: string;
  nome: string;
  subtitulo: string;
  /**
   * Texto curto (até uns 18 caracteres) para o seletor de área do menu, que é
   * estreito e não pode cortar a frase: o `subtitulo` é do card do hub.
   */
  resumo?: string;
  icone: ChaveIcone;
  /** Cor do módulo: só no quadrado do ícone (hub, seletor de módulo, cabeçalho). */
  cor: string;
  /** Primeira tela do módulo; null = ainda não construído. */
  href: string | null;
  /** Fase do plano em que chega (só nos não construídos). */
  fase?: string;
  /** Abas: o que o menu lista (um item = uma aba da área). */
  grupos: GrupoNav[];
  /**
   * Ações da área que a pessoa pode fazer ("Novo insumo", "Lançar nota"): não
   * são abas nem cards; vão no cabeçalho da aba e no ⌘K. Vazio fora das áreas.
   */
  acoes: ItemNav[];
}

export interface Navegacao {
  /** Hub: a tela de entrada da área. */
  inicio: { href: string; titulo: string; subtitulo: string };
  /** "ERP" no /erp; "Barney" no /rodolfo. */
  rotuloDaArea: string;
  modulos: ModuloNav[];
}

/** Rodapé do menu lateral: a fase do plano que está no ar. */
export const VERSAO_DO_ERP = 'Barney ERP · fase 3.1';

/** Paleta dos módulos (fora do vermelho, que é o único acento de marca). */
export const COR = {
  insumo: '#2F7D5B',
  fichas: '#A16207',
  compras: '#2563A8',
  estoque: '#0F766E',
  producao: '#4C5A8A',
  etiquetas: '#57534E',
  dre: '#4D7C0F',
  rede: '#7E3A6B',
  comercial: '#2563A8',
  clientes: '#A16207',
  parceiros: '#57534E',
  sistema: '#4C5A8A',
  inicio: '#57534E',
} as const;

export type ChaveDeCor = keyof typeof COR;

interface Tela extends ItemNav {
  /** null = livre; lista = qualquer uma delas (1.8: requisições = quem pede OU quem atende). */
  permissao: Permissao | readonly Permissao[] | null;
}

interface DefinicaoDeArea {
  chave: string;
  nome: string;
  subtitulo: string;
  resumo: string;
  icone: ChaveIcone;
  cor: string;
  grupos: { rotulo: string; icone: ChaveIcone; telas: Tela[] }[];
  acoes: Tela[];
}

interface ModuloFuturo {
  chave: ChaveDeCor;
  nome: string;
  subtitulo: string;
  icone: ChaveIcone;
  fase: string;
  /** Aparece para quem tiver qualquer uma (é a permissão de ver o módulo). */
  ver: Permissao[];
}

/**
 * Áreas construídas do ERP do parceiro, relativas à base: `/erp` (a pessoa do
 * parceiro) ou `/rodolfo/erp/<slug>` (o nível 1 dentro do parceiro, que ganha
 * o Cadastro do parceiro e não tem "Seu acesso", que é da pessoa).
 *
 * Nenhuma rota mudou: a reorganização é só de rótulo e de agrupamento. As
 * telas de ação (`/insumos/novo`, `/compras/nova`...) continuam existindo e
 * acendem a aba da área por prefixo.
 */
function areasConstruidas(base: string, nivel1: boolean): DefinicaoDeArea[] {
  const pessoas: Tela[] = [
    {
      href: `${base}/equipe`,
      rotulo: 'Equipe',
      icone: 'equipe',
      subtitulo: 'Pessoas, perfis e lojas de cada uma',
      permissao: 'acessos.gerir',
    },
    {
      href: `${base}/historico`,
      rotulo: 'Histórico',
      icone: 'historico',
      subtitulo: 'Toda alteração, com antes e depois',
      permissao: 'historico.ver',
    },
  ];
  if (nivel1) {
    pessoas.push({
      href: `${base}/cadastro`,
      rotulo: 'Cadastro do parceiro',
      icone: 'cadastro',
      subtitulo: 'Nome, situação e histórico do parceiro',
      permissao: null,
    });
  } else {
    pessoas.push({ ...telaSeuAcesso(base), permissao: null });
  }
  return [
    {
      chave: 'cadastros',
      nome: 'Cadastros e Cardápio',
      subtitulo: 'Do insumo à ficha técnica e ao preço de venda',
      resumo: 'Insumos e fichas',
      icone: 'insumo',
      cor: COR.insumo,
      grupos: [
        {
          rotulo: 'Insumos',
          icone: 'insumo',
          telas: [
            {
              href: `${base}/insumos`,
              rotulo: 'Insumos',
              icone: 'insumo',
              subtitulo: 'Lista, embalagem e custo por unidade',
              permissao: 'insumos.ver',
            },
          ],
        },
        {
          rotulo: 'Cardápio',
          icone: 'fichas',
          telas: [
            {
              href: `${base}/fichas`,
              rotulo: 'Fichas e produtos',
              icone: 'fichas',
              subtitulo: 'Foto, insumos e custo por porção',
              permissao: 'fichas.ver',
            },
            {
              href: `${base}/fichas/canais`,
              rotulo: 'Precificação',
              icone: 'canais',
              subtitulo: 'Loja, delivery e iFood: o que entra no custo de cada um',
              permissao: 'precos.ver',
            },
          ],
        },
      ],
      acoes: [
        {
          href: `${base}/insumos/novo`,
          rotulo: 'Novo insumo',
          icone: 'novo',
          subtitulo: 'Cadastrar com embalagem, preço e frete',
          permissao: 'insumos.editar',
        },
        {
          href: `${base}/fichas/nova`,
          rotulo: 'Nova ficha',
          icone: 'novo',
          subtitulo: 'Montar a receita do zero',
          permissao: 'fichas.editar',
        },
        {
          href: `${base}/fichas/importar`,
          rotulo: 'Importar planilha',
          icone: 'importar',
          subtitulo: 'Várias fichas de uma vez, com prévia',
          permissao: 'fichas.editar',
        },
      ],
    },
    {
      chave: 'compras',
      nome: 'Compras e Fornecedores',
      subtitulo: 'Notas lançadas, quem vende e o preço pago',
      resumo: 'Compras e preços',
      icone: 'compras',
      cor: COR.compras,
      grupos: [
        {
          rotulo: 'Compras',
          icone: 'compras',
          telas: [
            {
              href: `${base}/compras`,
              rotulo: 'Compras',
              icone: 'compras',
              subtitulo: 'Notas por loja, com o total conferido',
              permissao: 'compras.ver',
            },
            {
              href: `${base}/compras/orcamento`,
              rotulo: 'Orçamento',
              icone: 'metricas',
              subtitulo: 'Quanto ainda cabe comprar sem furar a meta do CMV',
              permissao: 'compras.ver',
            },
            {
              href: `${base}/compras/fornecedores`,
              rotulo: 'Fornecedores',
              icone: 'fornecedor',
              subtitulo: 'Quem vende e por quanto',
              permissao: 'compras.ver',
            },
          ],
        },
      ],
      acoes: [
        {
          href: `${base}/compras/nova`,
          rotulo: 'Lançar nota',
          icone: 'novo',
          subtitulo: 'Itens, frete e o custo que muda',
          permissao: 'compras.lancar',
        },
        {
          href: `${base}/compras/fornecedores/novo`,
          rotulo: 'Novo fornecedor',
          icone: 'novo',
          subtitulo: 'Cadastrar quem vende',
          permissao: 'fornecedores.editar',
        },
      ],
    },
    {
      chave: 'estoque',
      nome: 'Estoque e Movimentações',
      subtitulo: 'Saldo por loja, contagem, requisição e divergência',
      resumo: 'Saldo e contagem',
      icone: 'estoque',
      cor: COR.estoque,
      grupos: [
        {
          rotulo: 'Estoque',
          icone: 'estoque',
          telas: [
            {
              href: `${base}/estoque`,
              rotulo: 'Visão geral',
              icone: 'estoque',
              subtitulo: 'Situação, saldo e valor de cada loja',
              permissao: 'estoque.ver',
            },
          ],
        },
        {
          rotulo: 'Movimentações',
          icone: 'estoque',
          telas: [
            {
              href: `${base}/estoque/contagens`,
              rotulo: 'Contagens',
              icone: 'estoque',
              subtitulo: 'Período, cobertura e contagem do dia a dia',
              permissao: 'estoque.ver',
              // A contagem mora dentro da loja (`<loja>/periodo`, `<loja>/contagens/...`): acende esta aba, não a Visão geral.
              ativoEm: `^${base}/estoque/[^/]+/(periodo|contagens)(/|$)`,
            },
            {
              href: `${base}/estoque/requisicoes`,
              rotulo: 'Requisições',
              icone: 'estoque',
              subtitulo: 'O setor pede, o estoque entrega e dá baixa',
              permissao: ['requisicao.pedir', 'requisicao.atender'],
              ativoEm: `^${base}/estoque/[^/]+/requisicoes(/|$)`,
            },
            {
              href: `${base}/estoque/divergencias`,
              rotulo: 'Divergências',
              icone: 'estoque',
              subtitulo: 'O que a contagem acusa sem requisição',
              permissao: 'estoque.ajustar',
              ativoEm: `^${base}/estoque/[^/]+/divergencias(/|$)`,
            },
          ],
        },
      ],
      // Nova requisição, Planejar contagem e Abrir estoque são da loja (já estão nas telas dela).
      acoes: [],
    },
    {
      chave: 'producao',
      nome: 'Produção',
      subtitulo: 'Planejar o lote pela ficha, dar baixa nos insumos pela requisição e pôr o pronto no estoque',
      resumo: 'Lotes e rendimento',
      icone: 'producao',
      cor: COR.producao,
      grupos: [
        {
          rotulo: 'Produção',
          icone: 'producao',
          telas: [
            {
              href: `${base}/producao`,
              rotulo: 'Lotes',
              icone: 'producao',
              subtitulo: 'Lotes planejados, em produção e concluídos, por loja',
              permissao: 'producao.ver',
            },
          ],
        },
      ],
      acoes: [
        {
          href: `${base}/producao/nova`,
          rotulo: 'Nova produção',
          icone: 'novo',
          subtitulo: 'Planejar um lote pela ficha do pré-preparo',
          permissao: 'producao.registrar',
        },
      ],
    },
    {
      chave: 'dre',
      nome: 'Faturamento e DRE',
      subtitulo: 'Venda, despesas e resultado da rede e de cada loja, do dia a dia ao período',
      resumo: 'Venda e resultado',
      icone: 'dre',
      cor: COR.dre,
      grupos: [
        {
          rotulo: 'Faturamento',
          icone: 'dre',
          telas: [
            {
              href: `${base}/faturamento`,
              rotulo: 'Faturamento',
              icone: 'dre',
              subtitulo: 'Venda, pedidos e clientes por loja e canal',
              permissao: 'faturamento.ver',
            },
          ],
        },
        {
          rotulo: 'Resultado',
          icone: 'dre',
          telas: [
            {
              href: `${base}/dre/despesas`,
              rotulo: 'Despesas',
              icone: 'compras',
              subtitulo: 'Aluguel, salário, luz e contas a pagar, por competência',
              permissao: ['dre.ver', 'despesas.lancar'],
            },
            {
              href: `${base}/dre`,
              rotulo: 'DRE',
              icone: 'dre',
              subtitulo: 'Resultado do período, até ontem, da rede e de cada loja',
              permissao: 'dre.ver',
            },
            {
              href: `${base}/dre/periodos`,
              rotulo: 'Períodos',
              icone: 'estoque',
              subtitulo: 'Como o período fecha (mensal, quinzenal ou semanal) e o fechamento de cada um',
              permissao: 'dre.ver',
            },
            {
              href: `${base}/dre/plano`,
              rotulo: 'Plano e metas',
              icone: 'cadastro',
              subtitulo: 'As linhas do DRE, os nomes que a casa usa e a meta de cada uma',
              permissao: 'metas.editar',
            },
          ],
        },
      ],
      acoes: [
        {
          href: `${base}/faturamento/lancar`,
          rotulo: 'Lançar o dia',
          icone: 'novo',
          subtitulo: 'Faturamento, pedidos e clientes de cada canal',
          permissao: 'faturamento.lancar',
        },
        {
          href: `${base}/faturamento/importar`,
          rotulo: 'Importar faturamento',
          icone: 'importar',
          subtitulo: 'Vários dias de uma vez, com prévia',
          permissao: 'faturamento.lancar',
        },
        {
          href: `${base}/dre/despesas/nova`,
          rotulo: 'Lançar despesa',
          icone: 'novo',
          subtitulo: 'Aluguel, salário, luz e outras, por dia, mês ou período',
          permissao: 'despesas.lancar',
        },
      ],
    },
    {
      chave: 'rede',
      nome: 'Rede e Equipe',
      subtitulo: 'Lojas, marcas, pessoas, perfis, histórico e acessos',
      resumo: 'Lojas e pessoas',
      icone: 'rede',
      cor: COR.rede,
      grupos: [
        {
          rotulo: 'Rede',
          icone: 'lojas',
          telas: [
            {
              href: `${base}/lojas`,
              rotulo: 'Lojas e marcas',
              icone: 'lojas',
              subtitulo: 'Onde a operação acontece',
              permissao: 'lojas.ver',
            },
          ],
        },
        { rotulo: 'Pessoas', icone: 'equipe', telas: pessoas },
      ],
      acoes: [],
    },
  ];
}

/** Do plano (Notion "FlowFoods Barney — ERP"), ainda sem tela. */
export const MODULOS_FUTUROS: readonly ModuloFuturo[] = [
  {
    chave: 'etiquetas',
    nome: 'Etiquetas',
    subtitulo: 'Validade impressa na hora',
    icone: 'etiquetas',
    fase: '3.4',
    ver: ['etiquetas.imprimir'],
  },
];

/** "Seu acesso": da própria pessoa (senha, rosto, o que ela pode). Sem permissão. */
export function telaSeuAcesso(base = '/erp'): ItemNav {
  return { href: `${base}/acesso`, rotulo: 'Seu acesso', icone: 'acesso', subtitulo: 'Senha, rosto e o que você pode' };
}

function liberada(alcance: Alcance, t: Tela) {
  return t.permissao === null || (typeof t.permissao === 'string' ? pode(alcance, t.permissao) : t.permissao.some((p) => pode(alcance, p)));
}

/**
 * Áreas do ERP do parceiro para este alcance: as construídas com só as abas e
 * as ações que a pessoa pode (área sem nenhuma aba permitida some, e com ela
 * as ações: ação só existe dentro de uma área visível) e os módulos futuros
 * que ela vai poder ver, desabilitados. A entrada da área é a primeira aba
 * permitida.
 */
export function modulosDoParceiro(alcance: Alcance, base = '/erp'): ModuloNav[] {
  const construidos: ModuloNav[] = [];
  for (const m of areasConstruidas(base, alcance.nivel === 'FLOWFOODS')) {
    const grupos = m.grupos
      .map((g) => ({
        rotulo: g.rotulo,
        icone: g.icone,
        itens: g.telas.filter((t) => liberada(alcance, t)).map(({ permissao: _p, ...item }) => ({ ...item, area: m.nome })),
      }))
      .filter((g) => g.itens.length > 0);
    if (grupos.length === 0) continue;
    construidos.push({
      chave: m.chave,
      nome: m.nome,
      subtitulo: m.subtitulo,
      resumo: m.resumo,
      icone: m.icone,
      cor: m.cor,
      href: grupos[0].itens[0].href,
      grupos,
      acoes: m.acoes.filter((t) => liberada(alcance, t)).map(({ permissao: _p, ...item }) => ({ ...item, area: m.nome })),
    });
  }
  const futuros: ModuloNav[] = MODULOS_FUTUROS.filter((f) => f.ver.some((p) => pode(alcance, p))).map((f) => ({
    chave: f.chave,
    nome: f.nome,
    subtitulo: f.subtitulo,
    icone: f.icone,
    cor: COR[f.chave],
    href: null,
    fase: f.fase,
    grupos: [],
    acoes: [],
  }));
  return [...construidos, ...futuros];
}

/** Navegação do /erp (pessoa do parceiro). "Seu acesso" fica no menu do usuário e no hub. */
export function navegacaoDoParceiro(alcance: Alcance): Navegacao {
  return {
    inicio: { href: '/erp', titulo: 'Áreas da Rede', subtitulo: 'Tudo o que você usa no ERP' },
    rotuloDaArea: 'ERP',
    modulos: modulosDoParceiro(alcance, '/erp'),
  };
}

/** Todas as telas com link (para a busca ⌘K e a trilha do topo): as abas do menu. */
export function telasDaNavegacao(nav: Navegacao): (ItemNav & { modulo: string })[] {
  return nav.modulos.flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => ({ ...i, modulo: i.area ?? m.nome }))));
}

/**
 * As ações das áreas que a pessoa vê (para o ⌘K). Já vêm filtradas por
 * `modulosDoParceiro`: ação de área que não aparece nem chega aqui.
 */
export function acoesDaNavegacao(nav: Navegacao): (ItemNav & { modulo: string })[] {
  return nav.modulos.flatMap((m) => m.acoes.map((a) => ({ ...a, modulo: a.area ?? m.nome })));
}

/**
 * As abas da área onde a pessoa está: os itens do menu que dividem a mesma
 * `area` do item ativo, na ordem do menu. Menos de duas abas = sem barra de
 * abas (uma aba sozinha não leva a lugar nenhum). Fora de uma área (Comercial,
 * Clientes, a lista de parceiros), null.
 */
export function abasDaArea(nav: Navegacao, ativo: { item: ItemNav } | null): { area: string; abas: ItemNav[] } | null {
  const area = ativo?.item.area;
  if (!area) return null;
  const abas = nav.modulos.flatMap((m) => m.grupos.flatMap((g) => g.itens)).filter((i) => i.area === area);
  return abas.length >= 2 ? { area, abas } : null;
}

/**
 * Onde a pessoa está: o item cujo endereço é o maior prefixo do caminho atual
 * (detalhe de lead acende "Leads"). Null no hub ou fora do menu.
 */
export function itemAtivo(nav: Navegacao, caminho: string): { modulo: ModuloNav; item: ItemNav } | null {
  let melhor: { modulo: ModuloNav; item: ItemNav } | null = null;
  for (const modulo of nav.modulos) {
    for (const g of modulo.grupos) {
      for (const item of g.itens) {
        if (item.ativoEm && new RegExp(item.ativoEm).test(caminho)) return { modulo, item };
        const casa = caminho === item.href || caminho.startsWith(`${item.href}/`);
        if (casa && (!melhor || item.href.length > melhor.item.href.length)) melhor = { modulo, item };
      }
    }
  }
  return melhor;
}

/** Um passo da trilha do topo (o "Início" vem de fora). */
export interface PassoDaTrilha {
  rotulo: string;
  href?: string;
}

/**
 * Trilha do topo: Área (link para a entrada dela) › aba (› o que a página
 * acrescenta: o insumo aberto, "Novo insumo", "Editar"...). A aba só vira link
 * quando há um passo depois dela; a página não repete a aba no que acrescenta.
 */
export function montarTrilha(ativo: { modulo: ModuloNav; item: ItemNav } | null, extra: readonly PassoDaTrilha[]): PassoDaTrilha[] {
  if (!ativo) return [...extra];
  return [
    { rotulo: ativo.modulo.nome, href: ativo.modulo.href ?? undefined },
    { rotulo: ativo.item.rotulo, href: extra.length ? ativo.item.href : undefined },
    ...extra,
  ];
}

/** Iniciais para o avatar: "Rodolfo Cavalcante" → "RC". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const a = partes[0][0] ?? '';
  const b = partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] ?? '');
  return (a + b).toUpperCase();
}
