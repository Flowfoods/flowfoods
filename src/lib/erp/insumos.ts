/**
 * Insumos — regra de negócio, sem tela. Recebe sempre um `ClienteDoParceiro`:
 * não existe função aqui que consiga tocar em insumo de outro parceiro.
 */

import { z } from 'zod';
import type { ClienteDoParceiro } from './tenant';
import { ehErroDeUnicidade } from './tenant';
import { custoPorUnidadeBase, lerDinheiro, lerQuantidade, type Unidade } from './unidades';

export const formInsumo = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Dê um nome com pelo menos 2 letras.')
    .max(80, 'Nome longo demais (máx. 80).')
    .transform((s) => s.replace(/\s+/g, ' ')),
  unidade: z.enum(['KG', 'L', 'UN'], { message: 'Escolha a unidade.' }),
  conteudo: z.string(),
  preco: z.string(),
});

export type ResultadoCadastro =
  | { ok: true; id: string; nome: string }
  | { ok: false; erros: Partial<Record<'nome' | 'unidade' | 'conteudo' | 'preco' | 'geral', string>> };

/**
 * Valida o texto do formulário e grava. Toda conversão para inteiro acontece no
 * servidor: o navegador manda texto, nunca o número já calculado.
 */
export async function cadastrarInsumo(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autorNome = 'Sistema',
): Promise<ResultadoCadastro> {
  const r = formInsumo.safeParse(entrada);
  if (!r.success) {
    const erros: Record<string, string> = {};
    for (const i of r.error.issues) erros[String(i.path[0])] ??= i.message;
    return { ok: false, erros };
  }

  const conteudoMilesimos = lerQuantidade(r.data.conteudo);
  const precoEmbalagemCentavos = lerDinheiro(r.data.preco);
  const erros: Record<string, string> = {};
  if (!conteudoMilesimos) erros.conteudo = 'Quantidade inválida. Ex.: 5 ou 0,750.';
  if (precoEmbalagemCentavos === null) erros.preco = 'Preço inválido. Ex.: 89,90.';
  if (!conteudoMilesimos || precoEmbalagemCentavos === null) return { ok: false, erros };

  try {
    // Insumo e "depois" no histórico na mesma transação (alterações visíveis).
    const criado = await cliente.transacao(async (tx) => {
      const novo = await tx.insumo.create({
        data: {
          parceiroId: tx.parceiroId,
          nome: r.data.nome,
          unidade: r.data.unidade,
          conteudoMilesimos,
          precoEmbalagemCentavos,
        },
        select: { id: true, nome: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Insumo',
          entidadeId: novo.id,
          acao: 'CRIOU',
          depois: { nome: novo.nome, unidade: r.data.unidade, conteudoMilesimos, precoEmbalagemCentavos },
          autorNome,
        },
      });
      return novo;
    });
    return { ok: true, ...criado };
  } catch (e) {
    if (ehErroDeUnicidade(e)) {
      return { ok: false, erros: { nome: 'Já existe um insumo com esse nome.' } };
    }
    throw e;
  }
}

export interface InsumoLinha {
  id: string;
  nome: string;
  unidade: Unidade;
  conteudoMilesimos: number;
  precoEmbalagemCentavos: number;
  custoUnitarioCentavos: number;
  criadoEm: Date;
}

export async function listarInsumos(cliente: ClienteDoParceiro): Promise<InsumoLinha[]> {
  const linhas = await cliente.insumo.findMany({ orderBy: { nome: 'asc' } });
  return linhas.map((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: i.unidade,
    conteudoMilesimos: i.conteudoMilesimos,
    precoEmbalagemCentavos: i.precoEmbalagemCentavos,
    custoUnitarioCentavos: custoPorUnidadeBase(i.precoEmbalagemCentavos, i.conteudoMilesimos),
    criadoEm: i.criadoEm,
  }));
}
