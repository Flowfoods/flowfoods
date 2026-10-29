/**
 * INT-1.4 (decisão 486) — a primeira leitura oficial no ambiente TEST: com o app de teste, lista as lojas que o app enxerga e
 * consulta o Analytics na loja de teste. É a ÚNICA chamada ao iFood liberada antes da homologação, por comando no servidor
 * (`comando-leitura-test.ts`), nunca no CI.
 *
 * Contrato (skill iFood v3, referências Merchant e Analytics v1):
 *  - GET  /merchant/v1.0/merchants                          → lista das lojas autorizadas para o app (id, name);
 *  - POST /analytics/v1.0/merchants/{merchantId}/orders/kpis → leitura repetível; primeiro o payload mínimo da skill
 *    (diagnostica o acesso), depois a consulta diária do plano (seção 4), que alimenta o contrato da INT-1.5. Sem `sort`.
 *  - Cabeçalho de homologação só no TEST (o cliente confere antes de enviar).
 *
 * Regras:
 *  - só o app de TEST, categoria TEST, com Analytics: qualquer outro é recusado antes de chamar;
 *  - consulta só a loja que a lista do próprio app trouxe (consultar loja não autorizada é infração no iFood);
 *  - nada é gravado no banco do parceiro: a leitura é evidência (arquivo e registro de auditoria do comando), não dado publicado.
 */

import { lerIdDaLojaIfood } from '../core/campos';
import type { ChamadaIfood, ResultadoIfood } from './http';

export interface ClienteParaLeitura {
  chamar<T = unknown>(c: ChamadaIfood): Promise<ResultadoIfood<T>>;
}

export interface AppDaLeitura {
  id: string;
  nome: string;
  ambiente: 'TEST' | 'PRODUCAO';
  categoria: string;
  clientId: string;
  modulos: readonly string[];
}

export class ErroDaLeitura extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDaLeitura';
  }
}

export const CAMINHO_DAS_LOJAS = '/merchant/v1.0/merchants';
export const caminhoDosKpis = (loja: string) => `/analytics/v1.0/merchants/${loja}/orders/kpis`;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** O dia seguinte (fim exclusivo do filtro), ou null se não for uma data de verdade. */
export function diaSeguinte(dia: string): string | null {
  if (!DIA.test(dia)) return null;
  const d = new Date(`${dia}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) return null;
  return new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10);
}

/** "Ontem" no fuso de Brasília (o Analytics é D-1). */
export function ontemEmBrasilia(agora: number): string {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(agora));
  return new Date(Date.parse(`${hoje}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** O payload mínimo validado pela skill: GMV e contagem por status num dia. */
export function consultaMinima(dia: string) {
  return {
    filter: { referenceDate: { gte: dia, lt: diaSeguinte(dia) } },
    agg: { metrics: { gmv: ['sum'] }, terms: { orderStatus: ['count'] } },
    page: 1,
    size: 100,
  };
}

/** A consulta diária do plano (seção 4): grupos por status, canal, modelo logístico e categoria, com os valores do faturamento. */
export function consultaDoDia(dia: string) {
  return {
    filter: { referenceDate: { gte: dia, lt: diaSeguinte(dia) } },
    agg: {
      groupBy: { fields: ['orderStatus', 'salesChannel', 'deliveredBy', 'category'] },
      metrics: {
        gmv: ['sum'],
        gmvWithoutDelivery: ['sum'],
        netDeliveryFee: ['sum'],
        paymentTotalValue: ['sum'],
        benefitByTypePartnerTotalValue: ['sum'],
        refundedTotalValue: ['sum'],
      },
    },
    page: 1,
    size: 500,
  };
}

/** Por que este app não serve para a leitura TEST (null = serve). */
export function porQueOAppNaoServe(app: AppDaLeitura): string | null {
  if (app.ambiente !== 'TEST' || app.categoria !== 'TEST') return `O app "${app.nome}" não é o app de teste (ambiente ${app.ambiente}, categoria ${app.categoria}). A leitura deste comando é só no TEST.`;
  if (!app.modulos.includes('ANALYTICS')) return `O app "${app.nome}" não tem o módulo Analytics no cadastro.`;
  return null;
}

export interface ResumoDaPagina {
  currentPage: number | null;
  size: number | null;
  totalItems: number | null;
  totalPages: number | null;
  itensNaPagina: number | null;
}

export interface PassoDaLeitura {
  nome: 'lojas' | 'analytics-minimo' | 'analytics-do-dia';
  metodo: 'GET' | 'POST';
  caminho: string;
  corpo?: unknown;
  ok: boolean;
  status: number | null;
  requestId: string | null;
  tentativas: number;
  frase?: string;
  resposta?: unknown;
  resumo?: ResumoDaPagina;
}

export interface LeituraTest {
  quando: string;
  app: { id: string; nome: string; clientId: string; ambiente: 'TEST' };
  dia: string;
  lojasVistas: { id: string; nome: string | null }[];
  loja: string | null;
  passos: PassoDaLeitura[];
  ok: boolean;
  conclusao: string;
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function resumoDaPagina(dados: unknown): ResumoDaPagina | undefined {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return undefined;
  const d = dados as Record<string, unknown>;
  return { currentPage: num(d.currentPage), size: num(d.size), totalItems: num(d.totalItems), totalPages: num(d.totalPages), itensNaPagina: Array.isArray(d.data) ? d.data.length : null };
}

const DICA_DO_403 =
  '403 no Analytics: o token do app de teste não tem o módulo. Confira no Developer se o Analytics está marcado e salvo no app de teste; o token guardado foi descartado e a próxima execução pede outro. Se continuar, abra chamado com o exemplo oficial (request e response sem token).';

export async function lerTest(o: { app: AppDaLeitura; cliente: ClienteParaLeitura; dia: string; loja?: string | null; agora: number }): Promise<LeituraTest> {
  const recusa = porQueOAppNaoServe(o.app);
  if (recusa) throw new ErroDaLeitura(recusa);
  if (!diaSeguinte(o.dia)) throw new ErroDaLeitura('Dia inválido: use AAAA-MM-DD.');
  let pedida: string | null = null;
  if (o.loja !== undefined && o.loja !== null && o.loja !== '') {
    pedida = lerIdDaLojaIfood(o.loja);
    if (!pedida) throw new ErroDaLeitura('O id da loja do iFood é um UUID (copie do Developer ou do Portal do Parceiro).');
  }

  const leitura: LeituraTest = {
    quando: new Date(o.agora).toISOString(),
    app: { id: o.app.id, nome: o.app.nome, clientId: o.app.clientId, ambiente: 'TEST' },
    dia: o.dia,
    lojasVistas: [],
    loja: null,
    passos: [],
    ok: false,
    conclusao: '',
  };
  const fim = (conclusao: string) => {
    leitura.conclusao = conclusao;
    leitura.ok = leitura.passos.length === 3 && leitura.passos.every((p) => p.ok);
    return leitura;
  };
  const passo = async (nome: PassoDaLeitura['nome'], c: ChamadaIfood): Promise<PassoDaLeitura> => {
    const r = await o.cliente.chamar(c);
    const p: PassoDaLeitura = { nome, metodo: c.metodo as 'GET' | 'POST', caminho: c.caminho, ...(c.corpo !== undefined ? { corpo: c.corpo } : {}), ok: r.ok, status: r.status, requestId: r.requestId, tentativas: r.tentativas };
    if (r.ok) {
      p.resposta = r.dados;
      const resumo = resumoDaPagina(r.dados);
      if (resumo) p.resumo = resumo;
    } else {
      p.frase = r.frase;
    }
    leitura.passos.push(p);
    return p;
  };

  // 1. As lojas que o app enxerga.
  const lojas = await passo('lojas', { metodo: 'GET', caminho: CAMINHO_DAS_LOJAS, familia: 'merchant' });
  if (!lojas.ok) return fim(`A lista de lojas falhou (HTTP ${lojas.status ?? 'sem resposta'}): ${lojas.frase}`);
  if (!Array.isArray(lojas.resposta)) {
    lojas.ok = false;
    lojas.frase = 'A lista de lojas veio num formato inesperado (não é uma lista).';
    return fim(lojas.frase);
  }
  leitura.lojasVistas = (lojas.resposta as unknown[]).flatMap((m) => {
    const x = (m ?? {}) as Record<string, unknown>;
    const id = lerIdDaLojaIfood(x.id);
    return id ? [{ id, nome: typeof x.name === 'string' ? x.name.slice(0, 120) : null }] : [];
  });
  if (pedida) {
    if (!leitura.lojasVistas.some((l) => l.id === pedida)) {
      return fim(`A loja ${pedida} não está na lista que o app de teste enxerga (${leitura.lojasVistas.length} loja(s)). Nada foi consultado nela.`);
    }
    leitura.loja = pedida;
  } else if (leitura.lojasVistas.length === 1) {
    leitura.loja = leitura.lojasVistas[0].id;
  } else if (leitura.lojasVistas.length === 0) {
    return fim('O app de teste não enxerga nenhuma loja. Confira no Developer se a loja de teste está vinculada ao app.');
  } else {
    return fim(`O app de teste enxerga ${leitura.lojasVistas.length} lojas; diga qual consultar com --loja <id>: ${leitura.lojasVistas.map((l) => l.id).join(', ')}.`);
  }

  // 2. O Analytics, primeiro o mínimo (diagnostica o acesso); só com ele certo, a consulta do dia.
  const minimo = await passo('analytics-minimo', { metodo: 'POST', caminho: caminhoDosKpis(leitura.loja), familia: 'analytics', idempotente: true, corpo: consultaMinima(o.dia) });
  if (!minimo.ok) return fim(minimo.status === 403 ? DICA_DO_403 : `O Analytics falhou (HTTP ${minimo.status ?? 'sem resposta'}): ${minimo.frase}`);
  const doDia = await passo('analytics-do-dia', { metodo: 'POST', caminho: caminhoDosKpis(leitura.loja), familia: 'analytics', idempotente: true, corpo: consultaDoDia(o.dia) });
  if (!doDia.ok) return fim(`A consulta do dia falhou (HTTP ${doDia.status ?? 'sem resposta'}): ${doDia.frase}`);
  return fim(
    `Leitura TEST oficial com HTTP ${doDia.status}: ${leitura.lojasVistas.length} loja(s) na lista; Analytics na loja ${leitura.loja} em ${o.dia} (requestId ${minimo.requestId ?? 'não informado'} e ${doDia.requestId ?? 'não informado'}).`,
  );
}
