/**
 * Apoio dos testes da F.1b: o XML sintético (e variantes com a chave refeita, como um emitente de verdade faria) e o cenário
 * de dois parceiros com lojas, CNPJs e os três insumos do roteiro (muçarela, bacon e guardanapo, cada um com a embalagem que o
 * fornecedor vende).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { cadastrarLoja, salvarCnpjDaLoja } from '@/lib/erp/estrutura';
import { cadastrarVariante } from '@/lib/erp/variantes';
import { digitoDaChave } from '@/lib/erp/nfe-xml';
import { doParceiro, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { cadastrarInsumoDeTeste as cadastrarInsumo } from './erp-db-apoio';

export const BASE = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'nfe-sintetica.xml'), 'utf8');
export const CHAVE = '33261011222333000181550010000045211123456784';
export const bytes = (t: string) => new TextEncoder().encode(t);

/** O XML do roteiro com trocas de texto; `nNF` e `emit` refazem a chave inteira (e o dígito verificador). */
export function xmlDe(trocas: Array<[string | RegExp, string]> = [], nNF?: string, emit = '11222333000181'): string {
  let t = BASE;
  if (nNF || emit !== '11222333000181') {
    nNF ??= '4521';
    const corpo = `332610${emit}` + `55001${nNF.padStart(9, '0')}112345678`;
    const nova = `${corpo}${digitoDaChave(corpo)}`;
    t = t.split(CHAVE).join(nova).replace('<nNF>4521</nNF>', `<nNF>${nNF}</nNF>`).replace('<cDV>4</cDV>', `<cDV>${nova[43]}</cDV>`).replace('<nFat>4521</nFat>', `<nFat>${nNF}</nFat>`);
    if (emit !== '11222333000181') t = t.replace('<emit>\n        <CNPJ>11222333000181</CNPJ>', `<emit>\n        <CNPJ>${emit}</CNPJ>`);
  }
  for (const [de, para] of trocas) t = t.replace(de, para);
  return t;
}

export interface Cenario {
  A: { id: string; slug: string; nome: string; status: string };
  B: { id: string; slug: string; nome: string; status: string };
  a: ClienteDoParceiro;
  b: ClienteDoParceiro;
  ids: Record<string, string>;
}

/** Parceiros A (Vila da Penha com o CNPJ do roteiro; Centro com outro) e B (uma loja com o MESMO CNPJ da Penha), e os insumos de A. */
export async function montarCenario(db: PrismaClient, prefixo: string, sufixo: string): Promise<Cenario> {
  const A = await db.parceiroFlow.create({ data: { nome: `${prefixo} A`, slug: `${prefixo}-a-${sufixo}`, status: 'ATIVO' } });
  const B = await db.parceiroFlow.create({ data: { nome: `${prefixo} B`, slug: `${prefixo}-b-${sufixo}`, status: 'ATIVO' } });
  const a = doParceiro(A.id, db);
  const b = doParceiro(B.id, db);
  const ids: Record<string, string> = {};
  for (const [chave, nome, cnpj] of [['vp', 'Vila da Penha', '11.444.777/0001-61'], ['centro', 'Centro', '12.345.678/0001-95']] as const) {
    const r = await cadastrarLoja(a, { nome }, 'Marina');
    if (!r.ok) throw new Error(JSON.stringify(r));
    ids[chave] = r.id;
    const c = await salvarCnpjDaLoja(a, r.id, cnpj, '', 'Marina');
    if (!c.ok) throw new Error(JSON.stringify(c));
  }
  const lb = await cadastrarLoja(b, { nome: 'Loja B' }, 'Bia');
  if (!lb.ok) throw new Error(JSON.stringify(lb));
  ids.lojaB = lb.id;
  const cb = await salvarCnpjDaLoja(b, lb.id, '11.444.777/0001-61', '', 'Bia');
  if (!cb.ok) throw new Error(JSON.stringify(cb));
  const novo = async (nome: string, unidade: 'KG' | 'UN', variante: { nome: string; conteudo: string }) => {
    const i = await cadastrarInsumo(a, { nome, tipo: 'INGREDIENTE', unidade, escala: 'base', conteudo: '1', preco: '10,00' });
    if (!i.ok) throw new Error(JSON.stringify(i));
    const v = await cadastrarVariante(a, i.id, { nome: variante.nome, escala: 'base', conteudo: variante.conteudo, preco: '50,00' });
    if (!v.ok) throw new Error(JSON.stringify(v));
    return { insumo: i.id, variante: v.id };
  };
  const m = await novo('Muçarela', 'KG', { nome: 'Peça 2 kg', conteudo: '2' });
  const ba = await novo('Bacon', 'KG', { nome: 'Pacote 1 kg', conteudo: '1' });
  const g = await novo('Guardanapo', 'UN', { nome: 'Fardo 500 un', conteudo: '500' });
  Object.assign(ids, { mucarela: m.insumo, peca: m.variante, bacon: ba.insumo, pacote: ba.variante, guardanapo: g.insumo, fardo: g.variante });
  return { A, B, a, b, ids };
}
