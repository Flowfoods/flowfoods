/**
 * Importação do pacote do `ledsflowfoods`.
 *
 * As colunas NÃO são renomeadas: são exatamente as de `COLS` no
 * `scripts/montar_pacote.py`. Se a planilha mudar, o mapa muda aqui e o
 * `COLUNAS` abaixo é a lista conferida contra o script.
 *
 * A função é pura: recebe linhas e o estado atual (opt-outs, leads já
 * existentes) e devolve DECISÕES. Quem grava é a camada de cima. Assim o teste
 * de importação roda sem banco, e as regras que importam — opt-out sobrevive,
 * conflito bloqueia, reimportação atualiza — ficam verificáveis de verdade.
 */

import { canalDoTelefone, normalizarTelefone, type Canal } from '../barney/telefone';
import { checarConflito } from '../barney/conflito';
import { classificar, nomeCurto, pontuar, scoreFinal, type Tier } from '../barney/scoring';

/** Cabeçalhos exatos do XLSX/CSV gerado pela skill. Ordem preservada. */
export const COLUNAS = [
  'Tier',
  'Score Base (0-70)',
  'Nome',
  'Bairro',
  'Bloco',
  'Categoria',
  'Endereco',
  'Telefone/WhatsApp',
  'Link WhatsApp',
  'Nota Google',
  'Avaliacoes',
  'Capacidade (35)',
  'Acesso decisor (20)',
  'Territorio (15)',
  'Gap Digital (30)',
  'Score Final (100)',
  'iFood?',
  'Instagram',
  'Responde avaliacoes?',
  'Fidelidade?',
  'Nome do dono',
  'Status contato',
  'Data contato',
  'Observacoes',
] as const;

export type LinhaPlanilha = Partial<Record<(typeof COLUNAS)[number], string | number | null>>;

export type ResultadoLinha =
  | 'NOVO'
  | 'ATUALIZADO'
  | 'BLOQUEADO_OPT_OUT'
  | 'BLOQUEADO_CONFLITO'
  | 'SEM_TELEFONE'
  | 'INVALIDO';

export interface LeadImportado {
  resultado: ResultadoLinha;
  motivo?: string;
  /** Presente exceto quando a linha é irrecuperável (sem nome). */
  lead?: {
    nome: string;
    nomeCurto: string;
    bairro: string;
    bloco: string;
    categoria: string;
    endereco?: string;
    telefoneOriginal?: string;
    telefoneNormalizado?: string;
    tipoTelefone: 'CELULAR' | 'FIXO' | 'INVALIDO';
    canal: Canal;
    nota: number;
    avaliacoes: number;
    capacidade: number;
    acessoDecisor: number;
    territorio: number;
    scoreBase: number;
    gapDigital: number | null;
    scoreTotal: number | null;
    tier: Tier;
    instagram?: string;
    ifoodUrl?: string;
    donoNome?: string;
    obs?: string;
    status: 'NOVO' | 'CONFLITO' | 'OPT_OUT';
    lote: string;
  };
}

export interface EstadoImportacao {
  /** E.164 já em opt-out. Sobrevive a qualquer reimportação. */
  optOuts: Set<string>;
  /** E.164 → id do lead que já existe. */
  existentes: Map<string, string>;
}

export interface OpcoesImportacao {
  lote: string;
  /** `--somente-celular` do script: descarta fixo da cadência. */
  somenteCelular?: boolean;
}

export interface RelatorioImportacao {
  total: number;
  novos: number;
  atualizados: number;
  bloqueadosOptOut: number;
  bloqueadosConflito: number;
  semTelefone: number;
  invalidos: number;
  porTier: Record<Tier, number>;
  porBloco: Record<string, number>;
  comCelular: number;
  /** Leads com flag em Observacoes — precisam de olhada antes da abordagem. */
  flagados: string[];
  linhas: LeadImportado[];
}

const texto = (v: unknown): string => (v == null ? '' : String(v).trim());

const numero = (v: unknown): number => {
  if (v == null || v === '') return 0;
  // A planilha grava nota em pt-BR ("4,8"); o CSV pode trazer ponto.
  const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** "Sim"/"Não"/"" da planilha → boolean | undefined. */
const simNao = (v: unknown): boolean | undefined => {
  const t = texto(v).toLowerCase();
  if (!t) return undefined;
  if (['sim', 's', 'true', '1'].includes(t)) return true;
  if (['nao', 'não', 'n', 'false', '0'].includes(t)) return false;
  return undefined;
};

export function importarLinha(
  linha: LinhaPlanilha,
  estado: EstadoImportacao,
  opts: OpcoesImportacao,
): LeadImportado {
  const nome = texto(linha['Nome']);
  if (!nome) return { resultado: 'INVALIDO', motivo: 'linha sem Nome' };

  const bairro = texto(linha['Bairro']);
  const bloco = texto(linha['Bloco']) || 'C';
  const categoria = texto(linha['Categoria']);
  const endereco = texto(linha['Endereco']);
  const telefoneOriginal = texto(linha['Telefone/WhatsApp']);
  const nota = numero(linha['Nota Google']);
  const avaliacoes = Math.trunc(numero(linha['Avaliacoes']));
  const obs = texto(linha['Observacoes']);

  const tel = normalizarTelefone(telefoneOriginal);
  const canal = canalDoTelefone(telefoneOriginal);

  // Score sempre recalculado. Confiar na coluna da planilha deixaria o portal
  // discordar de si mesmo depois do enriquecimento.
  const { capacidade, acessoDecisor, territorio, base } = pontuar(
    nota,
    avaliacoes,
    telefoneOriginal,
    bloco,
  );

  const gapBruto = linha['Gap Digital (30)'];
  const gapDigital = texto(gapBruto) === '' ? null : Math.trunc(numero(gapBruto));
  const tier = classificar(base, opts.somenteCelular === true);

  const comum = {
    nome,
    nomeCurto: nomeCurto(nome),
    bairro,
    bloco,
    categoria,
    endereco: endereco || undefined,
    telefoneOriginal: telefoneOriginal || undefined,
    telefoneNormalizado: tel.e164 || undefined,
    tipoTelefone: tel.tipo,
    canal,
    nota,
    avaliacoes,
    capacidade,
    acessoDecisor,
    territorio,
    scoreBase: base,
    gapDigital,
    scoreTotal: scoreFinal(base, gapDigital),
    tier,
    instagram: texto(linha['Instagram']) || undefined,
    ifoodUrl: texto(linha['iFood?']) || undefined,
    donoNome: texto(linha['Nome do dono']) || undefined,
    obs: obs || undefined,
    lote: opts.lote,
  };

  // 1. Conflito de interesse. Antes de tudo: nem entra na lista de abordagem.
  const conflito = checarConflito({ categoria, bairro, endereco, nome });
  if (conflito.emConflito) {
    return {
      resultado: 'BLOQUEADO_CONFLITO',
      motivo: conflito.motivo,
      lead: { ...comum, status: 'CONFLITO' },
    };
  }

  // 2. Opt-out. Checado pelo TELEFONE, que é o que sobrevive à reimportação —
  //    apagar o lead e subir a planilha de novo não devolve ninguém para a fila.
  if (tel.e164 && estado.optOuts.has(tel.e164)) {
    return {
      resultado: 'BLOQUEADO_OPT_OUT',
      motivo: 'Telefone em opt-out permanente. Não entra em cadência.',
      lead: { ...comum, status: 'OPT_OUT' },
    };
  }

  // 3. Sem canal de WhatsApp: não é lead ruim, é canal errado.
  if (tel.tipo !== 'CELULAR') {
    return {
      resultado: 'SEM_TELEFONE',
      motivo:
        tel.tipo === 'FIXO'
          ? 'Fixo — vai para a lista Visita / Instagram.'
          : `Sem celular válido (${tel.motivo ?? 'indefinido'}).`,
      lead: { ...comum, status: 'NOVO' },
    };
  }

  // 4. Reimportação atualiza o lead existente em vez de duplicar.
  const jaExiste = estado.existentes.has(tel.e164);
  return {
    resultado: jaExiste ? 'ATUALIZADO' : 'NOVO',
    lead: { ...comum, status: 'NOVO' },
  };
}

export function importarPlanilha(
  linhas: LinhaPlanilha[],
  estado: EstadoImportacao,
  opts: OpcoesImportacao,
): RelatorioImportacao {
  const rel: RelatorioImportacao = {
    total: linhas.length,
    novos: 0,
    atualizados: 0,
    bloqueadosOptOut: 0,
    bloqueadosConflito: 0,
    semTelefone: 0,
    invalidos: 0,
    porTier: { T1: 0, T2: 0, T3: 0 },
    porBloco: {},
    comCelular: 0,
    flagados: [],
    linhas: [],
  };

  for (const linha of linhas) {
    const r = importarLinha(linha, estado, opts);
    rel.linhas.push(r);

    switch (r.resultado) {
      case 'NOVO':
        rel.novos += 1;
        break;
      case 'ATUALIZADO':
        rel.atualizados += 1;
        break;
      case 'BLOQUEADO_OPT_OUT':
        rel.bloqueadosOptOut += 1;
        break;
      case 'BLOQUEADO_CONFLITO':
        rel.bloqueadosConflito += 1;
        break;
      case 'SEM_TELEFONE':
        rel.semTelefone += 1;
        break;
      case 'INVALIDO':
        rel.invalidos += 1;
        break;
    }

    if (!r.lead) continue;

    rel.porTier[r.lead.tier] += 1;
    rel.porBloco[r.lead.bloco] = (rel.porBloco[r.lead.bloco] ?? 0) + 1;
    if (r.lead.tipoTelefone === 'CELULAR') rel.comCelular += 1;
    if (r.lead.obs) rel.flagados.push(r.lead.nomeCurto);

    // Leads novos aceitos entram no mapa: a mesma planilha com a linha repetida
    // conta como atualização na segunda vez, não como dois leads.
    if (r.resultado === 'NOVO' && r.lead.telefoneNormalizado) {
      estado.existentes.set(r.lead.telefoneNormalizado, 'pendente');
    }
  }

  return rel;
}

export { simNao };
