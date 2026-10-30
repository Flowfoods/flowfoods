/**
 * Retorno das listas/hubs inventariados em 29/10. Detalhes e formulários que
 * já têm Voltar conservam seu contrato próprio. A navegação recebida já vem
 * filtrada pelo servidor; prefixo de rota sozinho nunca concede um destino.
 */
import type { Navegacao } from './modulos';
import { caminhoDeVolta } from './volta';

/** Rotas sem retorno permanente no corpo; [lojaId] é um segmento, não um prefixo livre. */
export const LISTAS_COM_VOLTAR = [
  '', '/insumos', '/insumos/categorias', '/fichas', '/fichas/canais',
  '/compras', '/compras/fornecedores', '/compras/recebidas', '/compras/orcamento',
  '/compras/relatorios/insumo', '/compras/relatorios/periodo',
  '/compras/relatorios/comparar-fornecedores', '/compras/relatorios/comparar-periodos',
  '/faturamento', '/dre', '/dre/cmv-categorias', '/dre/metas-categorias', '/dre/periodos', '/dre/plano',
  '/equipe', '/historico', '/lojas', '/integracoes',
  '/estoque', '/estoque/contagens', '/estoque/divergencias', '/estoque/requisicoes',
  '/estoque/relatorios/consumo',
  '/etiquetas', '/etiquetas/[lojaId]', '/etiquetas/abrir',
  '/etiquetas/historico', '/etiquetas/historico/[lojaId]', '/etiquetas/impressora',
  '/producao', '/producao/[lojaId]', '/producao/historico', '/producao/historico/[lojaId]',
  '/producao/indicadores', '/producao/indicadores/[lojaId]', '/producao/lista',
  '/producao/lista/[lojaId]', '/producao/nova', '/producao/tarefas', '/producao/tarefas/[lojaId]',
] as const;

const LISTAS_NIVEL1 = new Set([
  '/rodolfo', '/rodolfo/barney', '/rodolfo/erp', '/rodolfo/hoje', '/rodolfo/inbox',
  '/rodolfo/integracoes', '/rodolfo/leads', '/rodolfo/metricas', '/rodolfo/onboarding',
  '/rodolfo/portal', '/rodolfo/visitas',
]);
const padroes = LISTAS_COM_VOLTAR.map((p) => new RegExp('^' + p.replace(/\[lojaId\]/g, '[^/]+') + '$'));

/** Raiz do contexto atual, sem escolher outro parceiro pela origem. */
export function raizDoRetorno(caminho: string): string | null {
  if (/^\/erp(?:\/|$)/.test(caminho)) return '/erp';
  const parceiro = /^\/rodolfo\/erp\/([^/]+)(?:\/|$)/.exec(caminho);
  if (parceiro) return '/rodolfo/erp/' + parceiro[1];
  return /^\/rodolfo(?:\/|$)/.test(caminho) ? '/rodolfo' : null;
}

export function temVoltarNoShell(caminho: string, consulta = ''): boolean {
  const raiz = raizDoRetorno(caminho);
  if (!raiz || /[?#\\\s]|%2f|%5c/i.test(caminho)) return false;
  const query = new URLSearchParams(consulta);
  // As variantes de impressão têm seus próprios controles, fora do papel.
  if (query.get('imprimir') === '1') return false;
  if (raiz === '/rodolfo') return LISTAS_NIVEL1.has(caminho);
  const parte = caminho.slice(raiz.length);
  // O relatório normal já desenha um Voltar quando recebe origem validada.
  if (/^\/compras\/relatorios\/(insumo|periodo)$/.test(parte)
    && caminhoDeVolta(query.get('volta'), raiz + '/', 2000)) return false;
  // O espelho de Integrações só redireciona à Central do parceiro.
  if (raiz !== '/erp' && parte === '/integracoes') return false;
  return padroes.some((r) => r.test(parte));
}

export interface MemoriaDoRetorno {
  contexto: string;
  atual: string;
  anteriores: string[];
}

/** Só memória da instância do shell: sem histórico global, cookie ou storage. */
export function atualizarMemoriaDoRetorno(
  memoria: MemoriaDoRetorno | null,
  contexto: string,
  atual: string,
): MemoriaDoRetorno {
  if (!memoria || memoria.contexto !== contexto) return { contexto, atual, anteriores: [] };
  if (memoria.atual === atual) return memoria;
  const caminho = atual.split('?')[0];
  if (memoria.atual.split('?')[0] === caminho) return { ...memoria, atual };
  const anterior = memoria.anteriores.findIndex((v) => v.split('?')[0] === caminho);
  // Retornar a uma visita anterior consome a pilha; não cria pingue-pongue entre duas listas.
  const subiuNaHierarquia = memoria.atual.split('?')[0].startsWith(caminho + '/');
  const anteriores = anterior >= 0
    ? memoria.anteriores.slice(0, anterior)
    : subiuNaHierarquia ? memoria.anteriores : [...memoria.anteriores, memoria.atual].slice(-16);
  return { contexto, atual, anteriores };
}

export interface RetornoDaNavegacao {
  href: string | null;
  rotulo: string;
  motivo?: string;
}

function destinosDaNavegacao(nav: Navegacao): Map<string, string> {
  return new Map([
    [nav.inicio.href, nav.inicio.titulo],
    ...nav.modulos.flatMap((m) => [
      ...(m.href ? [[m.href, m.nome] as [string, string]] : []),
      ...m.grupos.flatMap((g) => g.itens.map((i) => [i.href, i.rotulo] as [string, string])),
    ]),
  ]);
}

/**
 * Origem só vale se o pathname aparecer EXATAMENTE na navegação atual.
 * Não aceitar detalhe por ser descendente de uma aba: exige permissão própria.
 * Filtros são preservados, mas o servidor continua validando seus valores/lojas.
 */
export function resolverRetornoDaNavegacao({
  caminho,
  nav,
  origens = [],
}: {
  caminho: string;
  nav: Navegacao;
  /** Visitas já confirmadas no mesmo contexto, em ordem cronológica. */
  origens?: readonly string[];
}): RetornoDaNavegacao {
  const raiz = raizDoRetorno(caminho);
  const destinos = destinosDaNavegacao(nav);
  const indisponivel = {
    href: null,
    rotulo: 'Voltar',
    motivo: 'Você está no início deste contexto. Escolha uma área pelo menu.',
  };
  // A raiz encerra a volta: reoferecer a lista de onde ela veio criaria um ciclo.
  if (!raiz || !destinos.has(raiz) || caminho === raiz) return indisponivel;
  const permitido = (valor: string): string | null => {
    // caminhoDeVolta exige a barra depois da raiz; normalize só essa raiz conhecida.
    const entrada = valor === raiz || valor.startsWith(raiz + '?')
      ? raiz + '/' + valor.slice(raiz.length)
      : valor;
    const limpo = caminhoDeVolta(entrada, raiz + '/', 2000);
    if (!limpo) return null;
    const u = new URL(limpo, 'http://erp.interno');
    const pathname = u.pathname === raiz + '/' ? raiz : u.pathname;
    if (pathname === caminho || !destinos.has(pathname)) return null;
    return pathname + u.search;
  };
  for (const origem of [...origens].reverse()) {
    const href = permitido(origem);
    if (href) return { href, rotulo: 'Voltar para ' + destinos.get(href.split('?')[0]) };
  }
  const pais = [...destinos.keys()]
    .filter((d) => d !== raiz && d !== caminho && caminho.startsWith(d + '/'))
    .sort((a, b) => b.length - a.length);
  for (const pai of pais) {
    const href = permitido(pai);
    if (href) return { href, rotulo: 'Voltar para ' + destinos.get(pai) };
  }
  if (caminho !== raiz) return { href: raiz, rotulo: 'Voltar para ' + destinos.get(raiz) };
  return indisponivel;
}
