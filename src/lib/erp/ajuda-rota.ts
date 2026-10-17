/**
 * Ajuda contextual (0.6) — o que atravessa para a tela, puro e sem Next.
 *
 * A chave da ajuda é a ROTA (relativa à base: `/erp` ou `/rodolfo/erp/<slug>`),
 * no padrão do Next (`estoque/[lojaId]`). A área só agrupa. Este arquivo é
 * seguro para o navegador: tipos, a decisão da caixa e o casamento da rota.
 */

export type AreaDaAjuda = 'inicio' | 'cadastros' | 'compras' | 'estoque' | 'producao' | 'dre' | 'rede';

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
}

/** O que a pessoa escolheu (lido junto com a sessão). */
export interface PreferenciaDeAjuda {
  dicasLigadas: boolean;
  /** Já respondeu à pergunta da 1ª vez (manter ou desligar). */
  escolhida: boolean;
  /** "chave@versão" das caixas que fechou. */
  fechadas: string[];
}

export const PREFERENCIA_INICIAL: PreferenciaDeAjuda = Object.freeze({ dicasLigadas: true, escolhida: false, fechadas: [] }) as PreferenciaDeAjuda;

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
