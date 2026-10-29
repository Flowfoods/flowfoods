/**
 * Central de Integrações (INT-1.8, primeira parte; decisão 490) — o que a tela do nível 1 lê e grava além dos serviços da
 * INT-1.1: a validade do token guardado de cada app (nunca o token), as últimas leituras de teste (do registro de auditoria do
 * comando da INT-1.4) e a marca de "parceiro de homologação".
 *
 * Só o nível 1 chama (a página e as ações de /rodolfo/integracoes). Nada aqui chama o iFood: a única chamada continua sendo o
 * comando da leitura TEST.
 */

import { prisma } from '@/lib/db';
import { gravarParceiroFlowConferindo } from '@/lib/erp/tenant';

export interface ValidadeDoToken {
  emitidoEm: Date;
  expiraEm: Date;
}

/** Quando o token guardado de cada app vence (por id do app). Só as datas: o token cifrado não sai daqui. */
export async function validadeDosTokens(): Promise<Map<string, ValidadeDoToken>> {
  const linhas = await prisma.integracaoToken.findMany({ select: { appId: true, emitidoEm: true, expiraEm: true } });
  return new Map(linhas.map((l) => [l.appId, { emitidoEm: l.emitidoEm, expiraEm: l.expiraEm }]));
}

export interface PassoLido {
  nome: string;
  status: number | null;
  requestId: string | null;
}

export interface LeituraDeTeste {
  quando: Date;
  clientId: string;
  dia: string;
  loja: string | null;
  ok: boolean;
  passos: PassoLido[];
}

const texto = (x: unknown, max = 120): string | null => (typeof x === 'string' && x.length > 0 ? x.slice(0, max) : null);

/** Uma linha do registro do comando, conferida campo a campo (o JSON pode ter vindo de outra versão). */
export function lerRegistroDaLeitura(quando: Date, dados: unknown): LeituraDeTeste | null {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null;
  const d = dados as Record<string, unknown>;
  const clientId = texto(d.clientId, 100);
  const dia = texto(d.dia, 10);
  if (!clientId || !dia) return null;
  const passos = Array.isArray(d.passos)
    ? d.passos.flatMap((p): PassoLido[] => {
        if (!p || typeof p !== 'object') return [];
        const x = p as Record<string, unknown>;
        const nome = texto(x.nome, 60);
        if (!nome) return [];
        return [{ nome, status: typeof x.status === 'number' && Number.isInteger(x.status) ? x.status : null, requestId: texto(x.requestId, 80) }];
      })
    : [];
  return { quando, clientId, dia, loja: texto(d.loja, 60), ok: d.ok === true, passos };
}

/** As últimas leituras de teste (comando da INT-1.4), da mais nova para a mais antiga. */
export async function ultimasLeiturasDeTeste(limite = 5): Promise<LeituraDeTeste[]> {
  const linhas = await prisma.auditLog.findMany({
    where: { evento: 'integracao.leitura-test' },
    orderBy: { criadoEm: 'desc' },
    take: Math.min(Math.max(1, limite), 20),
    select: { criadoEm: true, dados: true },
  });
  return linhas.flatMap((l) => {
    const r = lerRegistroDaLeitura(l.criadoEm, l.dados);
    return r ? [r] : [];
  });
}

export type ResultadoDaMarca = { ok: true; mudou: boolean } | { ok: false; erro: string };

export const MENSAGEM_TROCA_COM_LOJA_LIGADA =
  'Este parceiro tem loja do iFood ligada. Desligue as lojas antes de trocar a marca de homologação: uma loja de teste não pode ficar num parceiro real, nem uma de produção no de testes.';

/**
 * Marca (ou desmarca) o parceiro de homologação: o único onde loja do ambiente de teste pode ser ligada (o banco confere na
 * hora de ligar). Numa transação só: grava a marca conferindo o valor lido (dois cliques opostos não se sobrescrevem; a trava
 * da linha faz esperar quem está ligando uma loja), conta as lojas ligadas já no contexto do parceiro e, havendo alguma,
 * desfaz (decisão 481: o banco não trava a troca depois; a Central trava). Grava o histórico do parceiro junto. Repetir não
 * grava nada. Quem chama grava o registro de auditoria e confere se o parceiro pode ser alterado.
 */
export async function marcarParceiroDeHomologacao(parceiroId: string, valor: unknown, autorNome: string): Promise<ResultadoDaMarca> {
  if (typeof valor !== 'boolean') return { ok: false, erro: 'Diga se é para marcar ou desmarcar.' };
  if (typeof parceiroId !== 'string' || !parceiroId || parceiroId.length > 60) return { ok: false, erro: 'Parceiro não encontrado.' };
  const autor = String(autorNome ?? '').trim().slice(0, 120);
  if (!autor) return { ok: false, erro: 'Falta quem fez a mudança.' };
  const r = await gravarParceiroFlowConferindo(
    async (pf) => {
      const gravou = await pf.updateMany({ where: { id: parceiroId, homologacaoDeIntegracao: !valor }, data: { homologacaoDeIntegracao: valor } });
      if (gravou.count !== 1) {
        const atual = await pf.findUnique({ where: { id: parceiroId }, select: { homologacaoDeIntegracao: true } });
        return { parceiroId, resultado: atual ? ('igual' as const) : ('sumiu' as const), historico: null };
      }
      return {
        parceiroId,
        resultado: 'mudou' as const,
        historico: {
          entidade: 'MarcaDeTestes',
          entidadeId: parceiroId,
          acao: 'ALTEROU',
          antes: { parceiroDeTestes: valor ? 'Não' : 'Sim' },
          depois: { parceiroDeTestes: valor ? 'Sim' : 'Não' },
          autorNome: autor,
        },
      };
    },
    async (sql, id) => {
      const [linha] = await sql<{ n: number }>`SELECT count(*)::int AS "n" FROM "IntegracaoConexao" WHERE "parceiroId" = ${id} AND "estado" = 'ATIVA'`;
      return Number(linha?.n ?? 0) > 0 ? MENSAGEM_TROCA_COM_LOJA_LIGADA : null;
    },
  );
  if (!r.ok) return r;
  if (r.resultado === 'sumiu') return { ok: false, erro: 'Parceiro não encontrado.' };
  return { ok: true, mudou: r.resultado === 'mudou' };
}
