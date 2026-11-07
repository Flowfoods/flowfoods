import { describe, expect, it } from 'vitest';
import { hashDoEnvioDaFicha } from '@/lib/erp/ficha-envio';
import type { EntradaFichaUnificada } from '@/lib/erp/ficha-unificada-campos';

const entrada = (): EntradaFichaUnificada => ({
  nome: 'Prato de teste', tipo: 'PRATO', rendimento: '10', consumoImediato: 'sim',
  descricao: 'Descrição', passos: ['Separar.', 'Misturar.'],
  itens: [{ insumoId: 'ingrediente-a', quantidade: '10', unidade: 'un', fator: '1' }, { subfichaId: 'preparo-b', quantidade: '2', unidade: 'kg', fator: '1,1' }],
  materiais: { versao: '', linhas: [{ canal: 'DELIVERY_PROPRIO', insumoId: 'caixa-a', quantidade: '1', unidade: 'un' }, { canal: 'IFOOD', insumoId: 'sacola-b', quantidade: '2', unidade: 'un' }] },
});

describe('3C · fingerprint do pedido anterior ao catálogo e aos arquivos', () => {
  it('é SHA256 estável e não depende da chave de transporte, versão de edição ou propriedade extra', () => {
    const a = entrada(), b = { ...a, chaveEnvio: 'outra-chave', versao: 'outra-versao', de: 'fichas?q=outro', precoAtual: 50000 };
    expect(hashDoEnvioDaFicha(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoEnvioDaFicha(b)).toBe(hashDoEnvioDaFicha(a));
  });
  it('considera números equivalentes, Unicode composto e ordem não semântica dos materiais', () => {
    const a = entrada(), b = entrada();
    a.nome = 'Pão'; b.nome = '  Pa\u0303o  '; b.rendimento = '10,000';
    b.itens[0] = { ...b.itens[0], quantidade: '10,000', fator: '1,000' };
    b.materiais!.linhas = [...b.materiais!.linhas].reverse().map(l => ({ ...l, quantidade: `${l.quantidade},000` }));
    expect(hashDoEnvioDaFicha(b)).toBe(hashDoEnvioDaFicha(a));
  });
  it.each([
    ['nome', (a: EntradaFichaUnificada) => { a.nome = 'Outro prato'; }],
    ['rendimento', (a: EntradaFichaUnificada) => { a.rendimento = '11'; }],
    ['quantidade da receita', (a: EntradaFichaUnificada) => { a.itens[0].quantidade = '11'; }],
    ['fator de correção', (a: EntradaFichaUnificada) => { a.itens[0].fator = '1,2'; }],
    ['ordem da receita', (a: EntradaFichaUnificada) => { a.itens.reverse(); }],
    ['ordem do preparo', (a: EntradaFichaUnificada) => { a.passos = ['Misturar.', 'Separar.']; }],
    ['validade', (a: EntradaFichaUnificada) => { a.validade = { principal: 'REFRIGERADO', linhas: { REFRIGERADO: { marcada: true, quantidade: '2', em: 'dias' } } }; }],
    ['classificação', (a: EntradaFichaUnificada) => { a.classificacao = { secao: { tipo: 'nova', nome: 'Cozinha' } }; }],
    ['materiais explícitos vazios', (a: EntradaFichaUnificada) => { a.materiais = { versao: '', linhas: [] }; }],
    ['materiais ausentes', (a: EntradaFichaUnificada) => { delete a.materiais; }],
    ['quantidade do material', (a: EntradaFichaUnificada) => { a.materiais = { versao: '', linhas: [{ canal: 'IFOOD', insumoId: 'sacola-b', quantidade: '3', unidade: 'un' }] }; }],
  ] as const)('muda quando muda %s; não declara outro pedido como replay', (_nome, mudar) => {
    const a = entrada(), b = entrada(); mudar(b); expect(hashDoEnvioDaFicha(b)).not.toBe(hashDoEnvioDaFicha(a));
  });
  it('omissão e vazio explícito são pedidos distintos mesmo sem material prévio', () => {
    const a = entrada(), b = entrada(); delete a.materiais; b.materiais = { versao: '', linhas: [] };
    expect(hashDoEnvioDaFicha(a)).not.toBe(hashDoEnvioDaFicha(b));
  });
  it('objeto recebido não pode forjar o marcador interno de campo ausente', () => {
    const a = entrada(), b = entrada(); b.classificacao = { ausente: true };
    expect(hashDoEnvioDaFicha(a)).not.toBe(hashDoEnvioDaFicha(b));
  });
  it('foto pendente entra por identidade; bytes diretos entram por conteúdo sem precisar de arquivo existente', () => {
    const a = entrada(), tokenA = `${'a'.repeat(32)}.jpg`, tokenB = `${'b'.repeat(32)}.jpg`;
    expect(hashDoEnvioDaFicha(a, { tipo: 'enviada', arquivo: tokenA })).toBe(hashDoEnvioDaFicha(a, { tipo: 'enviada', arquivo: tokenA }));
    expect(hashDoEnvioDaFicha(a, { tipo: 'enviada', arquivo: tokenA })).not.toBe(hashDoEnvioDaFicha(a, { tipo: 'enviada', arquivo: tokenB }));
    expect(hashDoEnvioDaFicha(a, { tipo: 'trocar', bytes: Uint8Array.of(1, 2) })).toBe(hashDoEnvioDaFicha(a, { tipo: 'trocar', bytes: Uint8Array.of(1, 2) }));
    expect(hashDoEnvioDaFicha(a, { tipo: 'trocar', bytes: Uint8Array.of(1, 2) })).not.toBe(hashDoEnvioDaFicha(a, { tipo: 'trocar', bytes: Uint8Array.of(1, 3) }));
    expect(hashDoEnvioDaFicha(a, { tipo: 'remover' })).not.toBe(hashDoEnvioDaFicha(a, { tipo: 'manter' }));
  });
});
