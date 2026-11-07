import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/erp/fichas/f/editar', useSearchParams: () => new URLSearchParams() }));
vi.mock('react-dom', async original => ({ ...await original<typeof import('react-dom')>(), useFormState: (_a: unknown, s: unknown) => [s, undefined], useFormStatus: () => ({ pending: false }) }));
import { previaDaReceita, type EscolhidoNaReceita, type LinhaDoItem } from '@/components/erp/telas/fichas/previa-da-receita';
import { CamposEmbalagens } from '@/components/erp/telas/fichas/campos-embalagens';
import { FormFicha, type ValoresDaFicha } from '@/components/erp/telas/fichas/form-ficha';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { contaDasEmbalagensNaTela } from '@/components/erp/telas/fichas/conta-das-embalagens';
import { custoDaFicha } from '@/lib/erp/ficha-campos';
import { formatarFracao } from '@/lib/erp/unidades';
import type { ContextoMateriaisDaFicha } from '@/lib/erp/ficha-unificada-campos';
import type { FichaNaTela } from '@/lib/erp/fichas';

const carne: EscolhidoNaReceita = { nome: 'Carne', unidade: 'KG', ativo: true, custo: { centavos: 2000, milesimos: 1000 }, porUnidade: null, preparo: false, incompleto: false };
const porId = new Map([['carne', carne]]);
const linha = (p: Partial<LinhaDoItem> = {}) => ({ chave: 0, escolha: 'carne', quantidade: '1', unidade: 'kg', fator: '', ...p });
const preco = { metaBp: 3000, precoCentavos: 4000, ofertado: true, cortesDoFarol: { aBp: 2000, bBp: 2500, cBp: 3500, dBp: 4000 } };
const materiais: ContextoMateriaisDaFicha = { versao: 'materiais-v1', linhas: [ { canal: 'DELIVERY_PROPRIO', insumoId: 'caixa', quantidade: '1', unidade: 'un' }, { canal: 'IFOOD', insumoId: 'sacola', quantidade: '1', unidade: 'un' } ],
  opcoes: [ { id: 'caixa', nome: 'Caixa', unidade: 'UN', ativo: true, embalagem: true, custo: { centavos: 200, milesimos: 1000 } }, { id: 'sacola', nome: 'Sacola', unidade: 'UN', ativo: true, embalagem: true, custo: { centavos: 300, milesimos: 1000 } } ],
  precos: { LOJA: preco, DELIVERY_PROPRIO: preco, IFOOD: preco } };
const inicial: ValoresDaFicha = { nome: 'Prato', tipo: 'PRATO', descricao: '', modoPreparo: '', rendimento: '2', rendimentoUnidade: 'porcao', itens: [linha()], validades: null };
const acao = async () => null;
const opcoes = [{ id: 'carne', nome: 'Carne', unidade: 'KG' as const, ativo: true, custo: carne.custo, categoria: null }];
const fichaComFoto: FichaNaTela = { id: 'f', nome: 'Ficha com foto', tipo: 'PRATO', descricao: null, modoPreparo: null, passosPreparo: [], rendimentoMilesimos: 1000, unidadeRendimento: 'UN', ativa: true, origem: 'MANUAL', versao: '2026-11-07T03:00:00.000Z', foto: 'foto-salva', fotosApoio: [], insumoProduzido: null, validades: null, consumoImediato: true, usadaEm: [], historico: [], classificacao: { secao: null, subsecao: null }, itens: [], custo: null, verCustos: false };

describe('3C · receita digitada no motor canônico', () => {
  it('oracle 10/12/13: rendimento corrente divide só a receita, cada canal recebe sua embalagem uma vez', () => {
    const p = previaDaReceita([linha()], porId, 'PRATO', '2', 'porcao');
    expect(p.pendencia).toBeNull();
    expect(formatarFracao(p.porRende!)).toBe('R$ 10,00');
    const canais = materiais.linhas.map(l => contaDasEmbalagensNaTela({ canal: l.canal, porcao: p.porRende!, faltaPreco: [], preco, embalagens: [{ ...materiais.opcoes.find(o => o.id === l.insumoId)!, quantidadeMilesimos: 1000 }] }));
    expect(canais.map(c => formatarFracao(c.fisico.valor))).toEqual(['R$ 12,00', 'R$ 13,00']);
    const dobro = previaDaReceita([linha()], porId, 'PRATO', '4', 'porcao');
    expect(formatarFracao(dobro.porRende!)).toBe('R$ 5,00');
    const html = renderToStaticMarkup(createElement(CamposEmbalagens, { opcoes: materiais.opcoes, linhas: materiais.linhas.map((l, chave) => ({ ...l, chave })), aoMudar: vi.fn(), gravadas: materiais.linhas, porcao: p.porRende, faltaPreco: [], precos: materiais.precos }));
    expect(html).toContain('R$ 12,00'); expect(html).toContain('R$ 13,00'); expect(html).not.toContain('<form');
  });
  it('preserva fração exata e fator do motor, sem arredondar entre receita e porção', () => {
    const custo = { centavos: 1001, milesimos: 3000 };
    const p = previaDaReceita([linha({ quantidade: '275', unidade: 'g', fator: '1,18' })], new Map([['carne', { ...carne, custo }]]), 'PRATO', '3', 'porcao');
    const motor = custoDaFicha([{ nome: 'Carne', custo, quantidadeMilesimos: 275, fatorCorrecaoMilesimos: 1180 }], 3000);
    expect(p.total).toEqual(motor.total); expect(p.porRende).toEqual(motor.porRendimento); expect(p.porLinha.get(0)?.custo).toEqual(motor.itens[0]);
  });
  it.each(['', '0', '1001', '1,5', 'abc'])('rendimento %j não reaproveita custo salvo nem acende faixa', rendimento => {
    const p = previaDaReceita([linha()], porId, 'PRATO', rendimento, 'porcao'); expect(p.pendencia).toBeTruthy(); expect(p.porRende).toBeNull();
  });
  it.each([{ quantidade: '0' }, { quantidade: 'x' }, { unidade: 'L' }, { fator: '0,9' }, { fator: '11' }, { escolha: '' }])('payload recusado fica pendente: %j', p => {
    const r = previaDaReceita([linha(p)], porId, 'PRATO', '2', 'porcao'); expect(r.pendencia).toBeTruthy(); expect(r.porRende).toBeNull();
  });
  it('duplicidade e limite de itens são os mesmos do parser', () => {
    expect(previaDaReceita([linha(), { ...linha(), chave: 1 }], porId, 'PRATO', '2', 'porcao').pendencia).toContain('já está');
    expect(previaDaReceita(Array.from({ length: 61 }, (_, chave) => ({ ...linha(), chave })), porId, 'PRATO', '2', 'porcao').pendencia).toContain('60');
  });
  it('pré-preparo incompleto mantém parte conhecida e pendência financeira até o canal', () => {
    const p = previaDaReceita([linha({ escolha: 'f:molho', quantidade: '0,5' })], new Map([['f:molho', { ...carne, nome: 'Molho', preparo: true, custo: null, porUnidade: { num: 1001n, den: 3n }, incompleto: true }]]), 'PRATO', '2', 'porcao');
    expect(p.incompletos).toEqual(['Molho']); expect(p.porRende).toEqual({ num: 1001n, den: 12n });
    const canal = contaDasEmbalagensNaTela({ canal: 'IFOOD', porcao: p.porRende!, faltaPreco: p.incompletos, preco, embalagens: [] });
    expect(canal.fisico.completo).toBe(false); expect(canal.farol.faixa).toBe('semDados');
  });
  it('ausência de custo não vira receita de custo zero completo; inativo só é mantido se já gravado', () => {
    const p = previaDaReceita([linha()], new Map([['carne', { ...carne, custo: null }]]), 'PRATO', '2', 'porcao'); expect(p.semPreco).toEqual(['Carne']);
    const inativo = new Map([['carne', { ...carne, ativo: false }]]);
    expect(previaDaReceita([linha()], inativo, 'PRATO', '2', 'porcao').pendencia).toContain('desativado');
    expect(previaDaReceita([linha()], inativo, 'PRATO', '2', 'porcao', new Set(['carne'])).pendencia).toBeNull();
  });
});

describe('3C · composição e permissões do formulário real', () => {
  it.each(['/erp/fichas', '/rodolfo/erp/casa/fichas'])('editor sem fichas.ver em %s mantém intenção da principal sem emitir imagem ou URL negada', base => {
    const html = renderToStaticMarkup(createElement(TelaFormFicha, { acao, ficha: fichaComFoto, base, contexto: 'Casa', opcoes: [], preparos: [], bloqueio: null, verCustos: false, verFichas: false, materiais: null }));
    expect(html).not.toContain('<img'); expect(html).not.toContain(`${base}/f/foto`); expect(html).not.toContain('foto-salva');
    expect(html).toContain('Foto salva. A visualização não está disponível neste acesso.'); expect(html).toContain('Trocar foto'); expect(html).toContain('Tirar a foto'); expect(html).toContain('name="removerFoto"');
    expect(html).not.toContain('Sem foto'); expect(html).not.toContain('name="fotoNova"');
  });
  it('acesso com fichas.ver conserva a prévia principal autorizada', () => {
    const html = renderToStaticMarkup(createElement(TelaFormFicha, { acao, ficha: fichaComFoto, base: '/erp/fichas', contexto: 'Casa', opcoes: [], preparos: [], bloqueio: null, verCustos: false, verFichas: true, materiais: null }));
    expect(html).toContain('<img'); expect(html).toContain('/erp/fichas/f/foto'); expect(html).not.toContain('visualização não está disponível');
  });
  it('um único form reúne receita e materiais, tokens próprios e atalho de preço autorizado', () => {
    const html = renderToStaticMarkup(createElement(FormFicha, { acao, modo: 'editar', base: '/erp/fichas', aqui: '/erp/fichas/f/editar', cancelar: '/erp/fichas/f', opcoes, inicial, verCustos: true, materiais, versao: 'receita-v1', podeConferirPrecos: true }));
    expect((html.match(/<form/g) ?? [])).toHaveLength(1); expect(html).toContain('name="materiaisNoFormulario"'); expect(html).toContain('value="materiais-v1"'); expect(html).toContain('value="receita-v1"'); expect(html).toContain('Salvar e conferir preços'); expect(html).toContain('R$ 12,00'); expect(html).toContain('R$ 13,00');
  });
  it('editor operacional não recebe campos materiais, custo ou destino de lista/detalhe', () => {
    const html = renderToStaticMarkup(createElement(TelaFormFicha, { acao, base: '/erp/fichas', contexto: 'Casa', opcoes: opcoes.map(o => ({ ...o, custo: null })), preparos: [], bloqueio: null, verCustos: false, verFichas: false, materiais: null }));
    expect(html).not.toContain('materiaisNoFormulario'); expect(html).not.toContain('Salvar e conferir preços'); expect(html).not.toContain('R$'); expect(html).toContain('href="/erp"'); expect(html).not.toContain('href="/erp/fichas"');
  });
});
