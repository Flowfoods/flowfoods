/**
 * Central de Integrações (INT-1.8, primeira parte; decisão 490) — o que a tela do nível 1 lê e grava além dos serviços da
 * INT-1.1: a validade do token guardado de cada app (nunca o token), as últimas leituras de teste (do registro de auditoria do
 * comando da INT-1.4) e a marca de "parceiro de homologação".
 *
 * Só o nível 1 chama (a página e as ações de /rodolfo/integracoes). Nada aqui chama o iFood: a única chamada continua sendo o
 * comando da leitura TEST.
 */

import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';

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
 * hora de ligar). Recusa a troca com loja ligada (decisão 481: o banco não trava a troca depois; a tela trava). Repetir não
 * grava nada. Quem chama grava o registro de auditoria.
 */
export async function marcarParceiroDeHomologacao(parceiroId: string, valor: unknown): Promise<ResultadoDaMarca> {
  if (typeof valor !== 'boolean') return { ok: false, erro: 'Diga se é para marcar ou desmarcar.' };
  if (typeof parceiroId !== 'string' || !parceiroId || parceiroId.length > 60) return { ok: false, erro: 'Parceiro não encontrado.' };
  const parceiro = await prisma.parceiroFlow.findUnique({ where: { id: parceiroId }, select: { id: true, homologacaoDeIntegracao: true } });
  if (!parceiro) return { ok: false, erro: 'Parceiro não encontrado.' };
  if (parceiro.homologacaoDeIntegracao === valor) return { ok: true, mudou: false };
  const ligadas = await doParceiro(parceiroId, undefined, { somenteLeitura: true }).integracaoConexao.count({ where: { estado: 'ATIVA' } });
  if (ligadas > 0) return { ok: false, erro: MENSAGEM_TROCA_COM_LOJA_LIGADA };
  // A gravação confere o valor que foi lido: dois cliques opostos ao mesmo tempo não se sobrescrevem.
  const r = await prisma.parceiroFlow.updateMany({ where: { id: parceiroId, homologacaoDeIntegracao: !valor }, data: { homologacaoDeIntegracao: valor } });
  if (r.count !== 1) return { ok: false, erro: 'Alguém mudou esta marca agora há pouco. Recarregue a página para ver como ficou; nada foi gravado.' };
  return { ok: true, mudou: true };
}
