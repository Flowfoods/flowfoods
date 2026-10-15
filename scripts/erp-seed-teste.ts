/**
 * Dois Parceiros Flow de TESTE, com insumos, para ver o ERP funcionando e o
 * isolamento a olho nu. Só roda contra banco local (localhost): nunca em produção.
 *
 *   npm run erp:seed-teste
 *
 * Idempotente: rodar de novo não duplica nada.
 */

import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';

const PARCEIROS = [
  {
    slug: 'teste-casa-alfa',
    nome: 'Teste · Casa Alfa',
    itens: [
      { nome: 'Blend bovino 180 g', unidade: 'UN', conteudo: '20', preco: '119,80' },
      { nome: 'Pão brioche', unidade: 'UN', conteudo: '12', preco: '18,00' },
      { nome: 'Queijo cheddar fatiado', unidade: 'KG', conteudo: '2,27', preco: '96,50' },
      { nome: 'Bacon em cubos', unidade: 'KG', conteudo: '1', preco: '42,90' },
    ],
  },
  {
    slug: 'teste-casa-beta',
    nome: 'Teste · Casa Beta',
    itens: [
      { nome: 'Polpa de açaí', unidade: 'KG', conteudo: '10', preco: '189,00' },
      { nome: 'Leite integral', unidade: 'L', conteudo: '12', preco: '59,88' },
      { nome: 'Granola', unidade: 'KG', conteudo: '0,800', preco: '21,40' },
    ],
  },
];

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://x').hostname;
  if (!['localhost', '127.0.0.1'].includes(host) || process.env.NODE_ENV === 'production') {
    throw new Error(`Seed de teste só roda em banco local (host atual: ${host}).`);
  }

  for (const p of PARCEIROS) {
    const parceiro = await prisma.parceiroFlow.upsert({
      where: { slug: p.slug },
      update: {},
      create: { slug: p.slug, nome: p.nome, status: 'ATIVO' },
    });
    const cliente = doParceiro(parceiro.id);
    for (const i of p.itens) {
      const r = await cadastrarInsumo(cliente, i);
      console.log(`${p.nome} · ${i.nome}: ${r.ok ? 'criado' : Object.values(r.erros).join(', ')}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
