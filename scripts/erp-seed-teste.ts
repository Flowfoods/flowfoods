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
 * A Casa Alfa (1.1) tem insumo com frete, embalagem em g, outras embalagens
 * de compra, um "Sem preço" e um desativado.
 *
 * I.1a: as dez categorias padrão nascem antes dos insumos e cada insumo entra com a categoria que o nome sugere (a categoria
 * é obrigatória no cadastro). Se o client do Prisma estiver desatualizado (esquema novo sem `npx prisma generate`), o seed para
 * antes de começar dizendo isso, em vez de quebrar no meio.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { doParceiro, MODELOS_DE_TENANT } from '@/lib/erp/tenant';
import { garantirCategoriasPadrao, sugestaoParaInsumo } from '@/lib/erp/categorias';
import { cadastrarInsumo, mudarSituacaoInsumo } from '@/lib/erp/insumos';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { cadastrarLoja, cadastrarMarca } from '@/lib/erp/estrutura';
import { criarParceiro, mudarStatusParceiro } from '@/lib/erp/parceiros';

const AUTOR = 'Seed de teste';

const PARCEIROS: {
  slug: string;
  nome: string;
  lojas: string[];
  marcas: string[];
  suspender?: string;
  itens: Record<string, string>[];
  /** Outras embalagens de compra (nome do insumo → embalagens). */
  embalagens?: Record<string, Record<string, string>[]>;
  /** Insumos que nascem desativados (com o motivo). */
  desativar?: Record<string, string>;
}[] = [
  {
    slug: 'teste-casa-alfa',
    nome: 'Teste · Casa Alfa',
    lojas: ['Vila da Penha', 'Vila da Penha · Delivery'],
    marcas: ['Alfa Burger', 'Alfa Gourmet'],
    itens: [
      { nome: 'Blend bovino 180 g', unidade: 'UN', conservacao: 'CONGELADO', conteudo: '20', preco: '119,80' },
      { nome: 'Pão brioche', unidade: 'UN', conservacao: 'SECO', conteudo: '12', preco: '18,00' },
      { nome: 'Queijo cheddar fatiado', unidade: 'KG', conservacao: 'REFRIGERADO', conteudo: '2,27', preco: '96,50' },
      { nome: 'Bacon em cubos', unidade: 'KG', conservacao: 'REFRIGERADO', conteudo: '1', preco: '42,90' },
      { nome: 'Cebola roxa', unidade: 'KG', conservacao: 'SECO', conteudo: '20', preco: '79,90', frete: '6,00' },
      { nome: 'Molho especial da casa', unidade: 'KG', conservacao: 'REFRIGERADO', conteudo: '750', escala: 'menor', preco: '28,50' },
      { nome: 'Óleo de soja', unidade: 'L', conservacao: 'SECO', conteudo: '900', escala: 'menor', preco: '8,49', frete: '0,40' },
      { nome: 'Caixa kraft hambúrguer', tipo: 'EMBALAGEM', unidade: 'UN', conservacao: 'SECO', conteudo: '100', preco: '74,00', frete: '4,00' },
      { nome: 'Picles de pepino', unidade: 'KG', conservacao: 'REFRIGERADO', conteudo: '2', preco: '', semPreco: 'on' },
      { nome: 'Batata palha', unidade: 'KG', conservacao: 'SECO', conteudo: '1', preco: '24,90' },
      // Custo abaixo de 1 centavo por unidade: R$ 0,004/un (R$ 4,00 o milheiro).
      { nome: 'Guardanapo de papel', tipo: 'EMBALAGEM', unidade: 'UN', conservacao: 'SECO', conteudo: '1000', preco: '4,00' },
      // I.1b: material de limpeza e uso (não entra em ficha), com marca de referência.
      { nome: 'Detergente neutro', tipo: 'MATERIAL', unidade: 'L', conservacao: 'SECO', conteudo: '5', preco: '18,90', marcaReferencia: 'Ypê' },
    ],
    embalagens: {
      'Cebola roxa': [{ nome: 'Saco 10 kg (feira)', conteudo: '10', preco: '35,00', frete: '3,00' }],
      'Óleo de soja': [{ nome: 'Caixa 20 × 900 ml', conteudo: '18', preco: '159,80', frete: '6,00', codigoBarras: '7891107101621' }],
      'Caixa kraft hambúrguer': [{ nome: 'Fardo 500 un', conteudo: '500', preco: '335,00', frete: '12,00' }],
      'Guardanapo de papel': [{ nome: 'Fardo 5000 un', conteudo: '5000', preco: '15,00' }],
    },
    desativar: { 'Batata palha': 'Saiu do cardápio de inverno' },
  },
  {
    slug: 'teste-casa-beta',
    nome: 'Teste · Casa Beta',
    lojas: ['Tijuca'],
    marcas: ['Beta Açaí'],
    itens: [
      { nome: 'Polpa de açaí', unidade: 'KG', conservacao: 'CONGELADO', conteudo: '10', preco: '189,00' },
      { nome: 'Leite integral', unidade: 'L', conservacao: 'REFRIGERADO', conteudo: '12', preco: '59,88' },
      { nome: 'Granola', unidade: 'KG', conservacao: 'SECO', marcaReferencia: 'Jasmine', conteudo: '0,800', preco: '21,40' },
    ],
  },
  {
    slug: 'teste-casa-gama',
    nome: 'Teste · Casa Gama',
    lojas: ['Botafogo'],
    marcas: ['Gama Poke'],
    suspender: 'Teste de parceiro suspenso',
    itens: [{ nome: 'Salmão', unidade: 'KG', conservacao: 'REFRIGERADO', conteudo: '1', preco: '89,90' }],
  },
];

function linha(nome: string, r: { ok: true } | { ok: false; erros: Record<string, string | undefined> }) {
  console.log(`  ${nome}: ${r.ok ? 'criado' : Object.values(r.erros).join(', ')}`);
}

/** O client gerado conhece todos os modelos de tenant? Senão o portão estoura com um erro que não diz o motivo. */
function conferirClientGerado() {
  const conhecidos = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
  const faltam = MODELOS_DE_TENANT.filter((m) => !conhecidos.has(m[0].toUpperCase() + m.slice(1)));
  if (faltam.length > 0) {
    throw new Error(`O client do Prisma está desatualizado (falta: ${faltam.join(', ')}). Rode "npx prisma generate" (e "npx prisma migrate deploy" no banco local) e tente de novo.`);
  }
}

async function main() {
  conferirClientGerado();
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
    await garantirCategoriasPadrao(cliente, { autorNome: AUTOR });
    for (const i of p.itens) {
      const sugestao = await sugestaoParaInsumo(cliente, i.nome, i.tipo);
      linha(i.nome, await cadastrarInsumo(cliente, { ...i, categoriaId: sugestao.categoriaId ?? '' }, AUTOR));
    }
    for (const [nomeDoInsumo, lista] of Object.entries(p.embalagens ?? {})) {
      const insumo = await cliente.insumo.findFirst({ where: { nome: nomeDoInsumo }, select: { id: true } });
      for (const e of insumo ? lista : []) {
        linha(`  embalagem ${e.nome}`, await cadastrarVariante(cliente, insumo!.id, e, AUTOR));
      }
    }
    for (const [nomeDoInsumo, motivo] of Object.entries(p.desativar ?? {})) {
      const insumo = await cliente.insumo.findFirst({ where: { nome: nomeDoInsumo, ativo: true }, select: { id: true } });
      if (insumo) linha(`  desativado ${nomeDoInsumo}`, await mudarSituacaoInsumo(cliente, insumo.id, false, motivo, AUTOR));
    }
    if (novo && p.suspender) {
      const r = await mudarStatusParceiro(parceiro.id, 'SUSPENSO', p.suspender, AUTOR);
      if (!r.ok) throw new Error(`${p.nome}: não suspendeu: ${JSON.stringify(r.erros)}`);
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
