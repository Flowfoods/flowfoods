/**
 * Semeia as dez categorias de insumo padrão (I.1a) em cada parceiro ATIVO. Idempotente: a categoria que já existe (pela chave
 * estável) fica como está, inclusive com o nome que a casa mudou; rodar de novo cria 0. NUNCA é feito pela migration (migration
 * não lê nem grava dado de tenant): é este script, ou a primeira vez que alguém abre Categorias ou o formulário de insumo.
 *
 *   npm run erp:semear-categorias                    # todos os parceiros ativos
 *   npm run erp:semear-categorias -- --parceiro casa # só um (slug)
 *
 * Cada categoria criada vai para o histórico do parceiro ("Categoria padrão"). Parceiro suspenso ou aguardando liberação é
 * pulado (a escrita dele é recusada pelo portão); semeia quando for ativado.
 */

import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';
import { garantirCategoriasPadrao } from '@/lib/erp/categorias';

const AUTOR = 'Script erp:semear-categorias';

async function principal(): Promise<number> {
  const i = process.argv.indexOf('--parceiro');
  const slug = i >= 0 ? process.argv[i + 1] : undefined;
  const parceiros = await prisma.parceiroFlow.findMany({ where: { ...(slug ? { slug } : {}) }, select: { id: true, slug: true, nome: true, status: true }, orderBy: { slug: 'asc' } });
  if (parceiros.length === 0) {
    console.error(slug ? `Parceiro "${slug}" não existe.` : 'Nenhum parceiro.');
    return 1;
  }
  let total = 0;
  for (const p of parceiros) {
    if (p.status !== 'ATIVO') {
      console.log(`${p.nome} (${p.slug}): ${p.status.toLowerCase()}, pulado.`);
      continue;
    }
    const criadas = await garantirCategoriasPadrao(doParceiro(p.id), { completar: true, autorNome: AUTOR });
    total += criadas;
    console.log(`${p.nome} (${p.slug}): ${criadas === 0 ? 'já tinha as dez, nada a criar' : `${criadas} categorias criadas`}`);
  }
  console.log(`Total criado: ${total}.`);
  return 0;
}

principal()
  .then((c) => {
    process.exitCode = c;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
