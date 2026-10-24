/**
 * Ajuda contextual (0.6) — o que atravessa para a tela, puro e sem Next.
 *
 * A chave da ajuda é a ROTA (relativa à base: `/erp` ou `/rodolfo/erp/<slug>`),
 * no padrão do Next (`estoque/[lojaId]`). A área só agrupa. Este arquivo é
 * seguro para o navegador: tipos, a decisão da caixa e o casamento da rota.
 */

export type AreaDaAjuda = 'inicio' | 'cadastros' | 'compras' | 'estoque' | 'producao' | 'etiquetas' | 'dre' | 'rede';

/** A entrada como a tela a recebe: o servidor já tirou os blocos que a pessoa não pode ler. */
export interface EntradaParaATela {
  chave: string;
  titulo: string;
  versao: number;
  area: AreaDaAjuda;
  /** A caixa nasce recolhida (tela de contar). */
  recolhida: boolean;
  rotas: string[];
  aula: string[];
  secoes: { id: string; titulo: string; blocos: string[] }[];
  /** Pontos de ajuda junto de campos e seções (card flutuante), já filtrados pela permissão. */
  pontos: PontoParaATela[];
}

/** Um ponto de ajuda como a tela o recebe. `id` completo: "chave.ponto". */
export interface PontoParaATela {
  id: string;
  titulo: string;
  blocos: string[];
  /** Seção da gaveta que o "Ver passo a passo" abre; null = sem ação extra. */
  secao: string | null;
}

/** O que a pessoa escolheu (lido junto com a sessão). */
export interface PreferenciaDeAjuda {
  dicasLigadas: boolean;
  /** Já respondeu à pergunta da 1ª vez (manter ou desligar). */
  escolhida: boolean;
  /** "chave@versão" das caixas que fechou. */
  fechadas: string[];
  /**
   * Pontos de ajuda: "chave.ponto=DIA" (dia da última vez que o card abriu
   * sozinho) ou "chave.ponto=x" (a pessoa pediu "Não mostrar novamente").
   */
  pontos: string[];
}

export const PREFERENCIA_INICIAL: PreferenciaDeAjuda = Object.freeze({ dicasLigadas: true, escolhida: false, fechadas: [], pontos: [] }) as PreferenciaDeAjuda;

// ------------------------------------------------------- pontos de ajuda

/**
 * Regra confirmada por Rodolfo em 23/10/2026: o card abre sozinho na primeira
 * visita ao contexto e volta a ficar elegível 7 dias depois da última vez que
 * abriu sozinho (semanal, não "7 dias de ausência"). Fechar no X só dispensa
 * agora; "Não mostrar novamente" corta a abertura automática. A ajuda manual
 * (o botão do campo) vale sempre.
 */
export const DIAS_PARA_VOLTAR = 7;

export const FORMATO_ID_DO_PONTO = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FORMATO_ITEM_DO_PONTO = /^([a-z0-9-]{1,60}\.[a-z0-9-]{1,40})=(x|[0-9]{1,6})$/;

/** Dia corrido (desde 1970) no horário de Brasília: a virada é à meia-noite do Rio, não de Londres. */
export function diaDe(data: Date): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
  return Math.floor(Date.parse(`${p}T00:00:00Z`) / 86_400_000);
}

export type EstadoDoPonto = 'elegivel' | 'visto' | 'nunca';

/** O ponto abre sozinho hoje? Sem preferência (nível 1) ou com as dicas desligadas: nunca abre sozinho. */
export function estadoDoPonto(id: string, p: PreferenciaDeAjuda | null, hoje: number): EstadoDoPonto {
  if (!p || !p.dicasLigadas) return 'nunca';
  for (const item of p.pontos) {
    const m = FORMATO_ITEM_DO_PONTO.exec(item);
    if (!m || m[1] !== id) continue;
    if (m[2] === 'x') return 'nunca';
    return hoje - Number(m[2]) >= DIAS_PARA_VOLTAR ? 'elegivel' : 'visto';
  }
  return 'elegivel';
}

/** Item a gravar: "chave.ponto=DIA" ou "chave.ponto=x". */
export function itemDoPonto(id: string, valor: number | 'x'): string {
  return `${id}=${valor}`;
}

/** Lê a lista guardada: só itens no formato, um por ponto (o último vence), no máximo 300. */
export function normalizarPontos(lista: readonly unknown[] | null | undefined): string[] {
  const porId = new Map<string, string>();
  for (const x of lista ?? []) {
    if (typeof x !== 'string' || x.length > 120) continue;
    const m = FORMATO_ITEM_DO_PONTO.exec(x);
    if (!m) continue;
    porId.delete(m[1]);
    porId.set(m[1], x);
  }
  return Array.from(porId.values()).slice(-300);
}

export function itemFechado(e: Pick<EntradaParaATela, 'chave' | 'versao'>): string {
  return `${e.chave}@${e.versao}`;
}

/**
 * A caixa desta tela aparece? Mesma conta no servidor e no navegador (sem
 * flash, sem diferença de hidratação). `mudou` = a pessoa tinha fechado uma
 * versão antiga do texto; `perguntar` = ainda não respondeu à 1ª pergunta.
 */
export function caixaDaTela(
  e: Pick<EntradaParaATela, 'chave' | 'versao'>,
  p: PreferenciaDeAjuda | null,
): { mudou: boolean; perguntar: boolean } | null {
  if (!p || !p.dicasLigadas) return null;
  if (p.fechadas.includes(itemFechado(e))) return null;
  const mudou = p.fechadas.some((f) => {
    const [chave, versao] = f.split('@');
    return chave === e.chave && Number(versao) < e.versao;
  });
  return { mudou, perguntar: !p.escolhida };
}

/** Da URL à rota relativa à base: `/erp/insumos/abc` vira `insumos/abc`, `/rodolfo/erp/casa/estoque` vira `estoque`; fora do ERP, null. */
export function rotaRelativa(caminho: string): string | null {
  const limpo = caminho.split(/[?#]/)[0].replace(/\/+$/, '');
  let resto: string | null = null;
  if (limpo === '/erp') resto = '';
  else if (limpo.startsWith('/erp/')) resto = limpo.slice('/erp/'.length);
  else {
    const m = /^\/rodolfo\/erp\/[^/]+(?:\/(.*))?$/.exec(limpo);
    if (m) resto = m[1] ?? '';
  }
  return resto;
}

function casa(padrao: string, rota: string): number {
  const p = padrao === '' ? [] : padrao.split('/');
  const r = rota === '' ? [] : rota.split('/');
  if (p.length !== r.length) return -1;
  let estaticos = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith('[')) {
      if (!r[i]) return -1;
    } else if (p[i] === r[i]) estaticos++;
    else return -1;
  }
  return estaticos;
}

/** A entrada que cobre o caminho: o padrão com mais trechos fixos vence (`insumos/novo` antes de `insumos/[id]`). */
export function entradaDoCaminho<T extends { rotas: readonly string[] }>(caminho: string, entradas: readonly T[]): T | null {
  const rota = rotaRelativa(caminho);
  if (rota === null) return null;
  let melhor: T | null = null;
  let pontos = -1;
  for (const e of entradas) {
    for (const padrao of e.rotas) {
      const n = casa(padrao, rota);
      if (n > pontos) {
        pontos = n;
        melhor = e;
      }
    }
  }
  return melhor;
}
