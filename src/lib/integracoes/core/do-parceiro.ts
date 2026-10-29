/**
 * Integrações do parceiro (INT-1.8, segunda parte; decisão 491) — o que a pessoa do parceiro lê na tela dela: as lojas do iFood
 * ligadas às lojas do alcance dela e o estado de cada módulo, em linguagem simples. Só lê, pelo portão do tenant (RLS); nunca
 * toca a tabela global de apps nem o token, e não importa quem grava (`conexoes.ts`, `apps.ts`): a guarda de
 * `integracao-fundacao` reprova (e o papel do tenant nem lê as tabelas globais).
 *
 * A tela só existe com o módulo Integração liberado para o parceiro e com a permissão `integracao.ver` da pessoa.
 */

import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { filtroDeLojas, type Alcance } from '@/lib/erp/permissoes';
import type { EstadoDoModulo } from './estados';
import type { Modulo } from './campos';

/** O nome de cada módulo para quem não programa. */
export const MODULO_PARA_O_PARCEIRO: Record<Modulo, string> = {
  ANALYTICS: 'Números de venda',
  FINANCIAL: 'Financeiro',
  REVIEW: 'Avaliações',
  MERCHANT: 'Status da loja',
};

/** O que cada estado quer dizer para a loja, com o que fazer quando depende dela. */
export const SITUACAO_PARA_O_PARCEIRO: Record<EstadoDoModulo, { rotulo: string; tom: 'ok' | 'alerta' | 'erro' | 'neutro'; explicacao: string }> = {
  NAO_SOLICITADO: { rotulo: 'Em preparação', tom: 'neutro', explicacao: 'A FlowFoods ainda vai pedir este acesso ao iFood.' },
  SOLICITADO: {
    rotulo: 'Esperando a loja aprovar',
    tom: 'alerta',
    explicacao: 'Quem administra esta loja no Portal do Parceiro do iFood precisa aprovar o app da FlowFoods, na parte de integrações e aplicativos do portal.',
  },
  AUTORIZADO: { rotulo: 'Aprovado pela loja', tom: 'neutro', explicacao: 'A loja aprovou. A FlowFoods ativa em seguida.' },
  ATIVO: { rotulo: 'Ativo', tom: 'ok', explicacao: 'Ligado. Os números entram sozinhos quando a busca diária começar.' },
  PAUSADO: { rotulo: 'Pausado', tom: 'alerta', explicacao: 'A FlowFoods pausou. Nada é buscado nesta loja até voltar.' },
  ERRO_PERMISSAO: {
    rotulo: 'O iFood recusou o acesso',
    tom: 'erro',
    explicacao: 'Confira no Portal do Parceiro do iFood se o app da FlowFoods continua aprovado nesta loja e avise a FlowFoods.',
  },
};

export interface ModuloParaOParceiro {
  id: string;
  rotulo: string;
  situacao: (typeof SITUACAO_PARA_O_PARCEIRO)[EstadoDoModulo];
}

export interface IntegracaoParaOParceiro {
  id: string;
  loja: string;
  marca: string | null;
  nomeNoIfood: string;
  teste: boolean;
  ligadaEm: Date;
  modulos: ModuloParaOParceiro[];
}

/** As lojas do iFood ligadas (só as ativas) às lojas que a pessoa alcança, com os módulos. Só lê. */
export async function integracoesParaOParceiro(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>): Promise<IntegracaoParaOParceiro[]> {
  const lojas = filtroDeLojas(alcance);
  const linhas = await cliente.integracaoConexao.findMany({
    where: { estado: 'ATIVA', ...(lojas ? { lojaId: lojas } : {}) },
    select: {
      id: true,
      ambiente: true,
      nomeExterno: true,
      criadoEm: true,
      loja: { select: { nome: true } },
      marca: { select: { nome: true } },
      modulos: { select: { id: true, modulo: true, estado: true }, orderBy: { modulo: 'asc' } },
    },
    orderBy: [{ criadoEm: 'asc' }],
  });
  return linhas.map((c) => ({
    id: c.id,
    loja: c.loja.nome,
    marca: c.marca?.nome ?? null,
    nomeNoIfood: c.nomeExterno,
    teste: c.ambiente === 'TEST',
    ligadaEm: c.criadoEm,
    modulos: c.modulos.map((m) => ({ id: m.id, rotulo: MODULO_PARA_O_PARCEIRO[m.modulo as Modulo], situacao: SITUACAO_PARA_O_PARCEIRO[m.estado as EstadoDoModulo] })),
  }));
}
