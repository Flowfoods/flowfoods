/**
 * Parceiros Flow de TESTE, com lojas, marcas e insumos, para ver o ERP
 * funcionando e o isolamento a olho nu. Só roda contra banco local
 * (localhost): nunca em produção.
 *
 *   npm run erp:seed-teste
 *
 * Idempotente: rodar de novo não duplica nada (repetidos são recusados pela
 * própria regra de cadastro). Usa as mesmas regras das telas, então tudo entra
 * com histórico. "Casa Gama" nasce e é suspensa, para ver o modo leitura.
 */

import { prisma } from '@/lib/db';
import { doParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumo } from '@/lib/erp/insumos';
import { cadastrarLoja, cadastrarMarca } from '@/lib/erp/estrutura';
import { criarParceiro, mudarStatusParceiro } from '@/lib/erp/parceiros';

const AUTOR = 'Seed de teste';

const PARCEIROS: {
  slug: string;
  nome: string;
  lojas: string[];
  marcas: string[];
  suspender?: string;
  itens: { nome: string; unidade: string; conteudo: string; preco: string }[];
}[] = [
  {
    slug: 'teste-casa-alfa',
    nome: 'Teste · Casa Alfa',
    lojas: ['Vila da Penha', 'Vila da Penha · Delivery'],
    marcas: ['Alfa Burger', 'Alfa Gourmet'],
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
    lojas: ['Tijuca'],
    marcas: ['Beta Açaí'],
    itens: [
      { nome: 'Polpa de açaí', unidade: 'KG', conteudo: '10', preco: '189,00' },
      { nome: 'Leite integral', unidade: 'L', conteudo: '12', preco: '59,88' },
      { nome: 'Granola', unidade: 'KG', conteudo: '0,800', preco: '21,40' },
    ],
  },
  {
    slug: 'teste-casa-gama',
    nome: 'Teste · Casa Gama',
    lojas: ['Botafogo'],
    marcas: ['Gama Poke'],
    suspender: 'Teste de parceiro suspenso',
    itens: [{ nome: 'Salmão', unidade: 'KG', conteudo: '1', preco: '89,90' }],
  },
];

function linha(nome: string, r: { ok: true } | { ok: false; erros: Record<string, string | undefined> }) {
  console.log(`  ${nome}: ${r.ok ? 'criado' : Object.values(r.erros).join(', ')}`);
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://x').hostname;
  if (!['localhost', '127.0.0.1'].includes(host) || process.env.NODE_ENV === 'production') {
    throw new Error(`Seed de teste só roda em banco local (host atual: ${host}).`);
  }

  for (const p of PARCEIROS) {
    let parceiro = await prisma.parceiroFlow.findUnique({ where: { slug: p.slug } });
    const novo = !parceiro;
    if (!parceiro) {
      const r = await criarParceiro({ nome: p.nome, slug: p.slug, status: 'ATIVO' }, AUTOR);
      if (!r.ok) throw new Error(`${p.nome}: ${JSON.stringify(r.erros)}`);
      parceiro = await prisma.parceiroFlow.findUniqueOrThrow({ where: { id: r.id } });
    }
    console.log(p.nome);
    if (parceiro.status !== 'ATIVO') {
      console.log('  (não está ativo: nada a cadastrar)');
      continue;
    }
    const cliente = doParceiro(parceiro.id);
    for (const nome of p.lojas) linha(`loja ${nome}`, await cadastrarLoja(cliente, { nome }, AUTOR));
    for (const nome of p.marcas) linha(`marca ${nome}`, await cadastrarMarca(cliente, { nome }, AUTOR));
    for (const i of p.itens) linha(i.nome, await cadastrarInsumo(cliente, i, AUTOR));
    if (novo && p.suspender) {
      await mudarStatusParceiro(parceiro.id, 'SUSPENSO', p.suspender, AUTOR);
      console.log('  suspenso');
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
