/**
 * Módulos do nível 1 (o Rodolfo, FlowFoods) no shell — puro, testável.
 *
 * O Barney antigo (Hoje, Leads, Cadência, Inbox, Visitas, Métricas, Portal,
 * Config) e o ERP dos parceiros viram módulos do MESMO shell do /erp. As
 * telas continuam onde estavam (`/rodolfo/leads`...); só "Hoje" saiu de
 * `/rodolfo`, que agora é o hub. O nível 1 vê tudo: aqui não há filtro de
 * permissão (a sessão do /rodolfo já é o nível 1 — `exigirNivel1`).
 */

import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { COR, modulosDoParceiro, type GrupoNav, type ModuloNav, type Navegacao } from '@/lib/erp/modulos';

export const ROTULO_PARCEIROS = 'Parceiros Flow';

export function modulosDoNivel1(): ModuloNav[] {
  return [
    {
      chave: 'comercial',
      nome: 'Comercial',
      subtitulo: 'Prospecção com o Barney',
      resumo: 'Prospecção Barney',
      icone: 'comercial',
      cor: COR.comercial,
      href: '/rodolfo/hoje',
      acoes: [],
      grupos: [
        {
          rotulo: 'Prospecção',
          icone: 'leads',
          itens: [
            { href: '/rodolfo/hoje', rotulo: 'Hoje', icone: 'hoje', subtitulo: 'Se o envio está rodando, e por quê' },
            { href: '/rodolfo/leads', rotulo: 'Leads', icone: 'leads', subtitulo: 'Base, filtros e importação' },
            {
              href: '/rodolfo/barney',
              rotulo: 'Cadência',
              icone: 'cadencia',
              subtitulo: 'Lote do dia, fila e aprovação',
            },
          ],
        },
        {
          rotulo: 'Conversas',
          icone: 'inbox',
          itens: [
            {
              href: '/rodolfo/inbox',
              rotulo: 'Inbox',
              icone: 'inbox',
              subtitulo: 'Respostas classificadas, com rascunho',
            },
            { href: '/rodolfo/visitas', rotulo: 'Visitas', icone: 'visitas', subtitulo: 'Telefone fixo e Instagram' },
          ],
        },
        {
          rotulo: 'Resultado',
          icone: 'metricas',
          itens: [
            {
              href: '/rodolfo/metricas',
              rotulo: 'Métricas',
              icone: 'metricas',
              subtitulo: 'Funil, saúde do número e custo de IA',
            },
          ],
        },
      ],
    },
    {
      chave: 'clientes',
      nome: 'Clientes',
      subtitulo: 'Formulário inicial dos clientes',
      resumo: 'Formulário inicial',
      icone: 'clientes',
      cor: COR.clientes,
      href: '/rodolfo/portal',
      acoes: [],
      grupos: [
        {
          rotulo: 'Diagnóstico',
          icone: 'portal',
          itens: [
            {
              href: '/rodolfo/portal',
              rotulo: 'Portal do cliente',
              icone: 'portal',
              subtitulo: 'O que cada cliente já respondeu',
            },
          ],
        },
      ],
    },
    {
      chave: 'parceiros',
      nome: ROTULO_PARCEIROS,
      subtitulo: 'O ERP de cada parceiro',
      resumo: 'ERP dos parceiros',
      icone: 'parceiros',
      cor: COR.parceiros,
      href: '/rodolfo/erp',
      acoes: [],
      grupos: [
        {
          rotulo: 'Parceiros',
          icone: 'parceiros',
          itens: [
            {
              href: '/rodolfo/erp',
              rotulo: 'Todos os parceiros',
              icone: 'parceiros',
              subtitulo: 'Lista e situação de cada um',
            },
            {
              href: '/rodolfo/onboarding',
              rotulo: 'Aguardando liberação',
              icone: 'inbox',
              subtitulo: 'Pedidos do site: ativar ou recusar',
            },
          ],
        },
      ],
    },
    {
      chave: 'sistema',
      nome: 'Sistema',
      subtitulo: 'Ajustes do Barney',
      resumo: 'Ajustes do Barney',
      icone: 'sistema',
      cor: COR.sistema,
      href: '/rodolfo/config',
      acoes: [],
      grupos: [
        {
          rotulo: 'Ajustes',
          icone: 'config',
          itens: [
            {
              href: '/rodolfo/config',
              rotulo: 'Config',
              icone: 'config',
              subtitulo: 'Janela, tetos e chave de disparo',
            },
          ],
        },
      ],
    },
  ];
}

export function navegacaoDoNivel1(): Navegacao {
  return {
    inicio: { href: '/rodolfo', titulo: 'Módulos da FlowFoods', subtitulo: 'Comercial, clientes e parceiros' },
    rotuloDaArea: 'Barney',
    modulos: modulosDoNivel1(),
  };
}

/** Slug do parceiro aberto no caminho (`/rodolfo/erp/<slug>/...`), ou null. */
export function slugNoCaminho(caminho: string): string | null {
  const m = /^\/rodolfo\/erp\/([^/?#]+)/.exec(caminho);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Dentro de um parceiro, o módulo "Parceiros Flow" ganha o ERP DELE: o hub do
 * parceiro e as mesmas áreas que a pessoa do parceiro vê em /erp (com o
 * alcance do nível 1), UM GRUPO POR ÁREA com as abas dela. As ações das áreas
 * (Novo insumo, Lançar nota...) vêm junto, para o ⌘K. Fora de parceiro, a
 * navegação fica como está.
 */
export function comParceiroAtual(
  nav: Navegacao,
  caminho: string,
  parceiros: readonly { slug: string; nome: string }[],
): Navegacao {
  const slug = slugNoCaminho(caminho);
  const parceiro = slug ? parceiros.find((p) => p.slug === slug) : undefined;
  if (!parceiro) return nav;
  const base = `/rodolfo/erp/${parceiro.slug}`;
  const areas = modulosDoParceiro(ALCANCE_FLOWFOODS, base).filter((m) => m.href);
  const doParceiro: GrupoNav = {
    rotulo: parceiro.nome,
    icone: 'rede',
    itens: [{ href: base, rotulo: 'Áreas da Rede', icone: 'inicio', subtitulo: `Hub de ${parceiro.nome}` }],
  };
  const grupos: GrupoNav[] = areas.map((a) => ({ rotulo: a.nome, icone: a.icone, itens: a.grupos.flatMap((g) => g.itens) }));
  const acoes = areas.flatMap((a) => a.acoes);
  return {
    ...nav,
    modulos: nav.modulos.map((m) =>
      m.chave === 'parceiros' ? { ...m, grupos: [...m.grupos, doParceiro, ...grupos], acoes } : m,
    ),
  };
}
