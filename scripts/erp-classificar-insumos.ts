/**
 * Classificação assistida dos insumos que já existiam (I.1a): a MESMA regra da tela "Classificar insumos", para quem prefere o
 * terminal. Nada mais muda: id, nome, preço, unidade, embalagem, saldo, ficha e movimento ficam como estão.
 *
 *   npm run erp:classificar-insumos -- --previa                    # lista, SEM gravar (é o padrão)
 *   npm run erp:classificar-insumos -- --aplicar                   # classifica só onde categoriaId é nulo; 1 lote por parceiro
 *   npm run erp:classificar-insumos -- --reverter lote-20261101-1432-a3f9
 *   (todos aceitam --parceiro <slug>; sem ele, todos os parceiros ativos)
 *
 * --aplicar é idempotente (a segunda vez muda 0) e grava o antes/depois de cada insumo no histórico. --reverter volta a "sem
 * categoria" só os que ainda são do lote. A prévia também lista os nomes que só diferem por caixa ou acento, para a casa juntar
 * ou renomear (a regra do nome único passou a valer só para os novos; nada existente é mexido).
 */

import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { aplicarClassificacao, nomesParecidos, previaDaClassificacao, reverterLote } from '@/lib/erp/classificar';
import { formatarDinheiro } from '@/lib/erp/unidades';

const AUTOR = 'Script erp:classificar-insumos';

const arg = (nome: string) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? '') : undefined;
};

async function principal(): Promise<number> {
  const aplicar = process.argv.includes('--aplicar');
  const lote = arg('--reverter');
  const slug = arg('--parceiro');
  const parceiros = await prisma.parceiroFlow.findMany({ where: { ...(slug ? { slug } : {}) }, select: { id: true, slug: true, nome: true, status: true }, orderBy: { slug: 'asc' } });
  if (parceiros.length === 0) {
    console.error(slug ? `Parceiro "${slug}" não existe.` : 'Nenhum parceiro.');
    return 1;
  }
  for (const p of parceiros) {
    if (p.status !== 'ATIVO') {
      console.log(`${p.nome} (${p.slug}): ${p.status.toLowerCase()}, pulado.`);
      continue;
    }
    const cliente = doParceiro(p.id);
    console.log(`\n${p.nome} (${p.slug})`);
    if (lote !== undefined) {
      const r = await reverterLote(cliente, lote, AUTOR);
      console.log(r.ok ? `  lote ${lote}: ${r.voltaram} voltaram a ficar sem categoria; ${r.mantidos} já tinham sido mexidos e ficaram como estão.` : `  ${r.erro}`);
      continue;
    }
    if (aplicar) {
      const r = await aplicarClassificacao(cliente, AUTOR);
      console.log(r.lote ? `  lote ${r.lote}: ${r.classificados} classificados, ${r.emOutros} em Outros / a classificar para revisar.` : '  nada a classificar: todos os insumos já têm categoria.');
      continue;
    }
    const previa = await previaDaClassificacao(cliente, ALCANCE_FLOWFOODS);
    if (previa.semCategoriasNaCasa) console.log('  (a casa ainda não tem categorias: aplicar semeia as dez padrão antes; rode npm run erp:semear-categorias para vê-las já)');
    console.log(`  PRÉVIA (nada foi gravado): ${previa.total} insumos sem categoria, ${previa.paraRevisar} iriam para Outros / a classificar.`);
    for (const c of previa.porCategoria) console.log(`    ${String(c.n).padStart(4)}  ${c.nome}`);
    for (const l of previa.linhas) {
      const valor = l.valorCentavos ? `  ${formatarDinheiro(l.valorCentavos)} em estoque` : '';
      console.log(`    - ${l.nome} → ${l.categoria}${l.motivo ? `  [${l.motivo}]` : ''}${valor}`);
    }
    const parecidos = await nomesParecidos(cliente);
    if (parecidos.length > 0) {
      console.log(`  NOMES PARECIDOS (só diferem por caixa, acento ou espaço; juntar ou renomear): ${parecidos.length}`);
      for (const g of parecidos) console.log(`    - ${g.itens.map((i) => `${i.nome}${i.ativo ? '' : ' (desativado)'}`).join(' | ')}`);
    }
  }
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
