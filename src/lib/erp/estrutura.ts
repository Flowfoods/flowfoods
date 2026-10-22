/**
 * Estrutura do parceiro (N2 → N3): lojas e marcas. Regra de negócio sem tela;
 * recebe sempre um `ClienteDoParceiro`, então não há como cadastrar loja em
 * outro parceiro. Cada cadastro grava o "depois" em `HistoricoAlteracao` na
 * mesma transação.
 */

import { z } from 'zod';
import { formatarDocumento, lerCnpjDaLoja } from './compra-campos';
import { filtroDeLojas, type Alcance } from './permissoes';
import { gerarSlug } from './slug';
import { ehErroDeUnicidade, type ClienteDoParceiro } from './tenant';

const nome = (max: number) =>
  z
    .string()
    .trim()
    .min(2, 'Dê um nome com pelo menos 2 letras.')
    .max(max, `Nome longo demais (máx. ${max}).`)
    .transform((s) => s.replace(/\s+/g, ' '));

export type ResultadoEstrutura =
  | { ok: true; id: string; nome: string }
  | { ok: false; erros: Partial<Record<'nome' | 'geral', string>> };

function primeiroErro(issues: { message: string }[]): ResultadoEstrutura {
  return { ok: false, erros: { nome: issues[0]?.message ?? 'Nome inválido.' } };
}

export async function cadastrarLoja(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autorNome: string,
): Promise<ResultadoEstrutura> {
  const r = z.object({ nome: nome(60) }).safeParse(entrada);
  if (!r.success) return primeiroErro(r.error.issues);
  const slug = gerarSlug(r.data.nome, 40);
  if (slug.length < 2) return { ok: false, erros: { nome: 'Use letras ou números no nome da loja.' } };

  try {
    return await cliente.transacao(async (tx) => {
      // "Penha" e "Penha!" geram o mesmo link: diz isso, em vez de "nome repetido".
      const mesmoLink = await tx.loja.findFirst({ where: { slug }, select: { nome: true } });
      if (mesmoLink && mesmoLink.nome !== r.data.nome) {
        return {
          ok: false as const,
          erros: { nome: `Esse nome gera o mesmo link da loja “${mesmoLink.nome}” (${slug}). Diferencie o nome.` },
        };
      }
      const loja = await tx.loja.create({
        data: { parceiroId: tx.parceiroId, nome: r.data.nome, slug },
        select: { id: true, nome: true, slug: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Loja',
          entidadeId: loja.id,
          acao: 'CRIOU',
          depois: { nome: loja.nome, slug: loja.slug },
          autorNome,
        },
      });
      return { ok: true as const, id: loja.id, nome: loja.nome };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: 'Já existe uma loja com esse nome.' } };
    throw e;
  }
}

export async function cadastrarMarca(
  cliente: ClienteDoParceiro,
  entrada: Record<string, unknown>,
  autorNome: string,
): Promise<ResultadoEstrutura> {
  const r = z.object({ nome: nome(60) }).safeParse(entrada);
  if (!r.success) return primeiroErro(r.error.issues);

  try {
    return await cliente.transacao(async (tx) => {
      const marca = await tx.marca.create({
        data: { parceiroId: tx.parceiroId, nome: r.data.nome },
        select: { id: true, nome: true },
      });
      await tx.historicoAlteracao.create({
        data: {
          parceiroId: tx.parceiroId,
          entidade: 'Marca',
          entidadeId: marca.id,
          acao: 'CRIOU',
          depois: { nome: marca.nome },
          autorNome,
        },
      });
      return { ok: true as const, ...marca };
    });
  } catch (e) {
    if (ehErroDeUnicidade(e)) return { ok: false, erros: { nome: 'Já existe uma marca com esse nome.' } };
    throw e;
  }
}

/**
 * Lojas e marcas que quem está na tela alcança: rede inteira vê todas; quem
 * tem só algumas lojas vê só elas (o filtro vai na consulta, pelo portão —
 * loja de outro parceiro nem existe aqui). Marca é da rede (não é por loja).
 */
export async function listarEstrutura(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>) {
  const [lojas, marcas] = await Promise.all([
    cliente.loja.findMany({
      where: { id: filtroDeLojas(alcance) },
      orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
      select: { id: true, nome: true, slug: true, ativa: true, criadoEm: true, canaisDeVenda: true, cnpj: true },
    }),
    cliente.marca.findMany({
      orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
      select: { id: true, nome: true, ativa: true, criadoEm: true },
    }),
  ]);
  return { lojas, marcas };
}

/** Lojas no alcance (para escolher lojas de uma pessoa e para rótulos). */
export async function listarLojasDoAlcance(cliente: ClienteDoParceiro, alcance: Pick<Alcance, 'lojas'>) {
  return cliente.loja.findMany({
    where: { id: filtroDeLojas(alcance) },
    orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
    select: { id: true, nome: true, ativa: true },
  });
}

export type ResultadoDoCnpjDaLoja =
  | { ok: true; mudou: boolean; igualAoDeOutra: string | null }
  | { ok: false; erros: { cnpj?: string; geral?: string } };

const FRASE_CNPJ_CONFLITO = 'Alguém mudou o CNPJ desta loja agora há pouco. Recarregue a página; nada foi gravado.';

/**
 * F.1a — o CNPJ da loja (o destinatário das notas fiscais de compra). Com "cadastrar lojas" (rede inteira; quem chama já conferiu).
 * Vazio limpa. Condicional ao que a tela leu (`liaAntes`: duas abas não se atropelam), com antes e depois no histórico, na mesma
 * transação. NÃO é único: duas lojas podem operar no mesmo CNPJ (a conferência da nota pede a loja); quando acontece, o retorno diz qual.
 */
export async function salvarCnpjDaLoja(
  cliente: ClienteDoParceiro,
  lojaId: string,
  cnpjDigitado: string,
  liaAntes: string,
  autorNome: string,
): Promise<ResultadoDoCnpjDaLoja> {
  const lido = lerCnpjDaLoja(cnpjDigitado);
  if (!lido.ok) return { ok: false, erros: { cnpj: lido.erro } };
  const antesLido = liaAntes.replace(/\D/g, '') || null;
  return cliente.transacao(async (tx) => {
    const l = await tx.loja.findUnique({ where: { id: lojaId }, select: { id: true, nome: true, cnpj: true } });
    if (!l) return { ok: false as const, erros: { geral: 'Loja não encontrada.' } };
    if ((l.cnpj ?? null) !== antesLido) return { ok: false as const, erros: { geral: FRASE_CNPJ_CONFLITO } };
    if ((l.cnpj ?? null) === lido.cnpj) return { ok: true as const, mudou: false, igualAoDeOutra: null };
    const r = await tx.loja.updateMany({ where: { id: lojaId, cnpj: l.cnpj }, data: { cnpj: lido.cnpj } });
    if (r.count === 0) return { ok: false as const, erros: { geral: FRASE_CNPJ_CONFLITO } };
    await tx.historicoAlteracao.create({
      data: {
        parceiroId: tx.parceiroId,
        entidade: 'Loja',
        entidadeId: l.id,
        acao: 'ALTEROU',
        antes: { nome: l.nome, cnpj: formatarDocumento(l.cnpj) },
        depois: { nome: l.nome, cnpj: formatarDocumento(lido.cnpj) },
        autorNome,
      },
    });
    const outra = lido.cnpj ? await tx.loja.findFirst({ where: { cnpj: lido.cnpj, id: { not: lojaId } }, select: { nome: true } }) : null;
    return { ok: true as const, mudou: true, igualAoDeOutra: outra?.nome ?? null };
  });
}
