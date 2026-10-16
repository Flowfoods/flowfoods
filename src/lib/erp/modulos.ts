/**
 * Módulos e navegação do shell do ERP — puro (sem Next, sem React), testável.
 *
 * O shell (menu lateral, hub, busca ⌘K, cabeçalho de página) é desenhado a
 * partir destes dados. A tela mostra só o que `pode(alcance, ...)` libera;
 * quem decide é o servidor (`exigirPermissaoNaPagina` em toda página e
 * `recusaDaAcao` em toda action). Esconder aqui é conforto, não trava.
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
  | 'config';

export interface ItemNav {
  href: string;
  rotulo: string;
  icone: ChaveIcone;
  /** Uma linha, no hub e na busca. */
  subtitulo: string;
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
  icone: ChaveIcone;
  /** Cor do módulo: só no quadrado do ícone (hub, seletor de módulo, cabeçalho). */
  cor: string;
  /** Primeira tela do módulo; null = ainda não construído. */
  href: string | null;
  /** Fase do plano em que chega (só nos não construídos). */
  fase?: string;
  grupos: GrupoNav[];
}

export interface Navegacao {
  /** Hub: a tela de entrada da área. */
  inicio: { href: string; titulo: string; subtitulo: string };
  /** "ERP" no /erp; "Barney" no /rodolfo. */
  rotuloDaArea: string;
  modulos: ModuloNav[];
}

/** Rodapé do menu lateral: a fase do plano que está no ar. */
export const VERSAO_DO_ERP = 'Barney ERP · fase 1.6';

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
  permissao: Permissao | null;
}

interface DefinicaoDeModulo {
  chave: ChaveDeCor;
  nome: string;
  subtitulo: string;
  icone: ChaveIcone;
  grupos: { rotulo: string; icone: ChaveIcone; telas: Tela[] }[];
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
 * Telas construídas do ERP do parceiro, relativas à base: `/erp` (a pessoa do
 * parceiro) ou `/rodolfo/erp/<slug>` (o nível 1 dentro do parceiro, que ganha
 * o Cadastro do parceiro e não tem "Seu acesso", que é da pessoa).
 */
function modulosConstruidos(base: string, nivel1: boolean): DefinicaoDeModulo[] {
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
      chave: 'insumo',
      nome: 'Insumos',
      subtitulo: 'Cadastro e custo por unidade',
      icone: 'insumo',
      grupos: [
        {
          rotulo: 'Cadastro',
          icone: 'insumo',
          telas: [
            {
              href: `${base}/insumos`,
              rotulo: 'Insumos',
              icone: 'insumo',
              subtitulo: 'Lista, embalagem e custo por unidade',
              permissao: 'insumos.ver',
            },
            {
              href: `${base}/insumos/novo`,
              rotulo: 'Novo insumo',
              icone: 'novo',
              subtitulo: 'Cadastrar com embalagem, preço e frete',
              permissao: 'insumos.editar',
            },
          ],
        },
      ],
    },
    {
      chave: 'fichas',
      nome: 'Ficha técnica',
      subtitulo: 'Receita, pré-preparo e custo',
      icone: 'fichas',
      grupos: [
        {
          rotulo: 'Receitas',
          icone: 'fichas',
          telas: [
            {
              href: `${base}/fichas`,
              rotulo: 'Fichas técnicas',
              icone: 'fichas',
              subtitulo: 'Foto, insumos e custo por porção',
              permissao: 'fichas.ver',
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
      ],
    },
    {
      chave: 'compras',
      nome: 'Compras',
      subtitulo: 'Notas, fornecedores e preço pago',
      icone: 'compras',
      grupos: [
        {
          rotulo: 'Notas',
          icone: 'compras',
          telas: [
            {
              href: `${base}/compras`,
              rotulo: 'Notas de compra',
              icone: 'compras',
              subtitulo: 'Por loja, com o total conferido',
              permissao: 'compras.ver',
            },
            {
              href: `${base}/compras/nova`,
              rotulo: 'Lançar nota',
              icone: 'novo',
              subtitulo: 'Itens, frete e o custo que muda',
              permissao: 'compras.lancar',
            },
          ],
        },
        {
          rotulo: 'Fornecedores',
          icone: 'fornecedor',
          telas: [
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
    },
    {
      chave: 'estoque',
      nome: 'Estoque',
      subtitulo: 'Saldo por loja, abertura e contagem',
      icone: 'estoque',
      grupos: [
        {
          rotulo: 'Estoque',
          icone: 'estoque',
          telas: [
            {
              href: `${base}/estoque`,
              rotulo: 'Estoque por loja',
              icone: 'estoque',
              subtitulo: 'Situação, saldo e valor de cada loja',
              permissao: 'estoque.ver',
            },
          ],
        },
      ],
    },
    {
      chave: 'rede',
      nome: 'Rede e equipe',
      subtitulo: 'Lojas, marcas e pessoas',
      icone: 'rede',
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
    },
  ];
}

/** Do plano (Notion "FlowFoods Barney — ERP"), ainda sem tela. */
export const MODULOS_FUTUROS: readonly ModuloFuturo[] = [
  {
    chave: 'dre',
    nome: 'Faturamento e DRE',
    subtitulo: 'Venda, CMV e resultado por loja',
    icone: 'dre',
    fase: '2.1',
    ver: ['faturamento.ver', 'dre.ver'],
  },
  {
    chave: 'producao',
    nome: 'Produção',
    subtitulo: 'Lista do dia e rendimento',
    icone: 'producao',
    fase: '3.1',
    ver: ['producao.ver'],
  },
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

/**
 * Módulos do ERP do parceiro para este alcance: os construídos com só as telas
 * que a pessoa pode (módulo sem tela permitida some) e os futuros que ela vai
 * poder ver, desabilitados.
 */
export function modulosDoParceiro(alcance: Alcance, base = '/erp'): ModuloNav[] {
  const construidos: ModuloNav[] = [];
  for (const m of modulosConstruidos(base, alcance.nivel === 'FLOWFOODS')) {
    const grupos = m.grupos
      .map((g) => ({
        rotulo: g.rotulo,
        icone: g.icone,
        itens: g.telas
          .filter((t) => t.permissao === null || pode(alcance, t.permissao))
          .map(({ permissao: _p, ...item }) => item),
      }))
      .filter((g) => g.itens.length > 0);
    if (grupos.length === 0) continue;
    construidos.push({
      chave: m.chave,
      nome: m.nome,
      subtitulo: m.subtitulo,
      icone: m.icone,
      cor: COR[m.chave],
      href: grupos[0].itens[0].href,
      grupos,
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
  }));
  return [...construidos, ...futuros];
}

/** Navegação do /erp (pessoa do parceiro). "Seu acesso" fica no menu do usuário e no hub. */
export function navegacaoDoParceiro(alcance: Alcance): Navegacao {
  return {
    inicio: { href: '/erp', titulo: 'Módulos da Rede', subtitulo: 'Tudo o que você usa no ERP' },
    rotuloDaArea: 'ERP',
    modulos: modulosDoParceiro(alcance, '/erp'),
  };
}

/** Todas as telas com link (para a busca ⌘K e a trilha do topo). */
export function telasDaNavegacao(nav: Navegacao): (ItemNav & { modulo: string })[] {
  return nav.modulos.flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => ({ ...i, modulo: m.nome }))));
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
        const casa = caminho === item.href || caminho.startsWith(`${item.href}/`);
        if (casa && (!melhor || item.href.length > melhor.item.href.length)) melhor = { modulo, item };
      }
    }
  }
  return melhor;
}

/** Iniciais para o avatar: "Rodolfo Cavalcante" → "RC". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const a = partes[0][0] ?? '';
  const b = partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] ?? '');
  return (a + b).toUpperCase();
}
