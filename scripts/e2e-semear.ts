/**
 * P-05 · massa sintética dos testes de permissão no navegador (`e2e/`). Só roda contra banco local (localhost): nunca em
 * produção. Roda DEPOIS de `scripts/erp-seed-teste.ts` (Casa Alfa e Casa Beta) e, como ele, é idempotente: rodar de novo
 * não duplica pessoa, perfil, ficha nem nota.
 *
 * Quatro perfis, os do QA de 25/11/2026 mais o perfil próprio:
 * - Dono da Alfa (rede inteira, duas lojas): o controle positivo;
 * - Gerente da Alfa só na loja Vila da Penha (cenário F);
 * - Operador da Casa Beta, outro parceiro (cenário G);
 * - Perfil próprio da Alfa, só "ver insumos" e "ver fichas".
 * Dados: uma ficha na Alfa (impressão), uma nota de compra em cada loja da Alfa e uma na Beta (exportação por loja).
 *
 * As senhas e os e-mails são fixtures públicas destes testes, nunca credenciais de aplicação. O resultado (ids e nomes que
 * os testes usam) vai para `e2e/.estado/dados.json`, fora do Git.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { criarAcesso, definirSenhaPeloLink, listarPerfis, salvarPerfil } from '@/lib/erp/credenciais';
import { cadastrarFicha } from '@/lib/erp/fichas';
import { cadastrarFornecedor, lancarNota } from '@/lib/erp/compras';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { PREFIXO_PERFIL_PROPRIO } from '@/lib/erp/equipe';

export const SENHA_E2E = 'permissoes p05 sintetico';
const AUTOR = 'Teste E2E P-05';
const DATA_DAS_NOTAS = '2026-11-02';

function exigir<T>(valor: T | null | undefined, oQue: string): T {
  if (valor === null || valor === undefined) throw new Error(`Falta ${oQue}: rode antes scripts/erp-seed-teste.ts.`);
  return valor;
}

async function pessoa(parceiroId: string, apelido: string, entrada: Record<string, unknown>) {
  const email = `e2e.${apelido}@teste.flow`;
  const r = await criarAcesso(parceiroId, { nome: `E2E ${apelido}`, email, ...entrada }, 'Rodolfo');
  if (r.ok && r.link) {
    const d = await definirSenhaPeloLink(r.link.token, SENHA_E2E, SENHA_E2E);
    if (!d.ok) throw new Error(`senha de ${apelido}: ${JSON.stringify(d)}`);
  } else if (!r.ok && !/já tem acesso/i.test(JSON.stringify(r.erros))) {
    throw new Error(`acesso de ${apelido}: ${JSON.stringify(r.erros)}`);
  }
  return email;
}

async function notaDeCompra(c: ClienteDoParceiro, lojaId: string, numero: string, fornecedor: string, insumoId: string, valor: string) {
  const ja = await c.notaEntrada.findFirst({ where: { lojaId, numero }, select: { id: true } });
  if (ja) return;
  let f = await c.fornecedor.findFirst({ where: { nome: fornecedor }, select: { id: true } });
  if (!f) {
    const r = await cadastrarFornecedor(c, { nome: fornecedor, semNotaFiscal: 'on', whatsapp: '(21) 99641-6060' }, AUTOR);
    if (!r.ok) throw new Error(`fornecedor ${fornecedor}: ${JSON.stringify(r)}`);
    f = { id: r.id };
  }
  const dono = resolverAlcance({ perfilBase: 'DONO', perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
  const r = await lancarNota(c, dono, {
    lojaId, fornecedorId: f.id, numero, serie: '', data: DATA_DAS_NOTAS, frete: '', total: valor,
    itens: [{ insumoId, embalagem: 'padrao', quantidade: '1', valor }],
  }, AUTOR);
  if (!r.ok) throw new Error(`nota ${numero}: ${JSON.stringify(r)}`);
}

async function main() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('A massa E2E só roda em banco local (localhost).');

  const alfa = exigir(await prisma.parceiroFlow.findUnique({ where: { slug: 'teste-casa-alfa' } }), 'a Casa Alfa');
  const beta = exigir(await prisma.parceiroFlow.findUnique({ where: { slug: 'teste-casa-beta' } }), 'a Casa Beta');
  const a = doParceiro(alfa.id);
  const b = doParceiro(beta.id);

  const lojaPenha = exigir(await a.loja.findFirst({ where: { nome: 'Vila da Penha' }, select: { id: true, nome: true } }), 'a loja Vila da Penha');
  const lojaDelivery = exigir(await a.loja.findFirst({ where: { nome: 'Vila da Penha · Delivery' }, select: { id: true, nome: true } }), 'a loja Delivery');
  const lojaBeta = exigir(await b.loja.findFirst({ select: { id: true, nome: true } }), 'uma loja da Beta');
  const cebola = exigir(await a.insumo.findFirst({ where: { nome: 'Cebola roxa' }, select: { id: true, nome: true } }), 'a Cebola roxa');
  const pao = exigir(await a.insumo.findFirst({ where: { nome: 'Pão brioche' }, select: { id: true, nome: true } }), 'o Pão brioche');
  const acai = exigir(await b.insumo.findFirst({ where: { nome: 'Polpa de açaí' }, select: { id: true, nome: true } }), 'a Polpa de açaí');

  // Perfil próprio: só ver insumos e fichas (nada de compras, estoque, faturamento ou equipe).
  let perfil: { id: string } | undefined = (await listarPerfis(alfa.id)).find((x) => x.nome === 'E2E Consulta');
  if (!perfil) {
    const r = await salvarPerfil(alfa.id, { nome: 'E2E Consulta', base: 'OPERADOR', permissoes: ['insumos.ver', 'fichas.ver'] }, 'Rodolfo');
    if (!r.ok) throw new Error(`perfil próprio: ${JSON.stringify(r)}`);
    perfil = { id: r.id };
  }

  const emails = {
    dono: await pessoa(alfa.id, 'dono', { perfil: 'DONO', lojas: 'rede' }),
    gerente: await pessoa(alfa.id, 'gerente', { perfil: 'GERENTE', lojas: 'escolhidas', lojaIds: [lojaPenha.id] }),
    operador: await pessoa(beta.id, 'operador', { perfil: 'OPERADOR', lojas: 'rede' }),
    proprio: await pessoa(alfa.id, 'proprio', { perfil: `${PREFIXO_PERFIL_PROPRIO}${perfil.id}`, lojas: 'rede' }),
  };

  let ficha = await a.fichaTecnica.findFirst({ where: { nome: 'E2E X-Burger' }, select: { id: true, nome: true } });
  if (!ficha) {
    const r = await cadastrarFicha(a, { nome: 'E2E X-Burger', tipo: 'PRATO', rendimento: '1', itens: [{ insumoId: pao.id, quantidade: '1', unidade: 'un' }] } as never, { tipo: 'manter' }, AUTOR);
    if (!r.ok) throw new Error(`ficha: ${JSON.stringify(r)}`);
    ficha = { id: r.id, nome: r.nome };
  }

  // Um fornecedor por loja, com nomes que só existem nela: a planilha de quem vê uma loja não pode ter o da outra.
  await notaDeCompra(a, lojaPenha.id, 'E2E-PENHA-1', 'E2E Hortifruti Penha', cebola.id, '79,90');
  await notaDeCompra(a, lojaDelivery.id, 'E2E-DELIVERY-1', 'E2E Hortifruti Delivery', cebola.id, '81,50');
  await notaDeCompra(b, lojaBeta.id, 'E2E-BETA-1', 'E2E Distribuidora Beta', acai.id, '189,00');

  const dados = {
    senha: SENHA_E2E,
    emails,
    alfa: {
      lojaPenha, lojaDelivery, insumo: cebola, ficha,
      fornecedorPenha: 'E2E Hortifruti Penha', fornecedorDelivery: 'E2E Hortifruti Delivery', valorPenha: '79,90', valorDelivery: '81,50',
    },
    beta: { loja: lojaBeta, insumo: acai, fornecedor: 'E2E Distribuidora Beta' },
    periodo: { de: '2026-11-01', ate: '2026-11-30' },
  };
  const pasta = join(process.cwd(), 'e2e', '.estado');
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'dados.json'), JSON.stringify(dados, null, 2));
  console.log('Massa E2E pronta:', Object.keys(emails).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
