import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CamposDeClassificacao, type ContextoClassificacao } from '@/components/erp/telas/fichas/campos-classificacao';
import { FiltrosDasFichas, type ClassificacaoDosFiltros } from '@/components/erp/telas/fichas/filtros';
import { classificacaoVazia, type RegistroDeClassificacao } from '@/lib/erp/ficha-secoes-campos';
import { lerFiltrosDeFicha } from '@/lib/erp/ficha-campos';

const secao: RegistroDeClassificacao = { nivel: 'secao', registro: { id: 'secaoA', nome: 'Pratos', ativa: true, versao: 'v1' } };
const subsecao: RegistroDeClassificacao = { nivel: 'subsecao', registro: { id: 'subA', secaoId: 'secaoA', nome: 'Assados', ativa: true, secaoAtiva: true, versao: 'v1' } };
const vazia = { itens: [], selecionados: [], proximoCursor: null };
const contexto: ContextoClassificacao = {
  atual: { secao: null, subsecao: null }, secoesIniciais: vazia, subsecoesIniciais: null,
  buscar: vi.fn(async () => ({ ok: true as const, pagina: vazia })), gerir: vi.fn(async () => null),
};
const campos = (props: Partial<ComponentProps<typeof CamposDeClassificacao>> = {}) => renderToStaticMarkup(createElement(CamposDeClassificacao, {
  contexto, valor: classificacaoVazia(), aoMudar: vi.fn(), registros: [], excluidos: [], erros: {}, bloqueio: false, aoGerenciar: vi.fn(), ...props,
}));
const filtros = (props: Partial<ComponentProps<typeof FiltrosDasFichas>> = {}) => renderToStaticMarkup(createElement(FiltrosDasFichas, {
  base: '/erp/fichas', filtros: lerFiltrosDeFicha({}), verCustos: false,
  classificacao: { secoesIniciais: vazia, subsecoesIniciais: null, buscar: contexto.buscar, gerir: contexto.gerir }, ...props,
}));
function botao(html: string, nome: string) {
  const encontrado = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([s]) => s.endsWith(`${nome}</button>`))?.[0];
  expect(encontrado, nome).toBeDefined();
  return encontrado!;
}
function input(html: string, id: string) {
  const encontrado = [...html.matchAll(/<input\b[^>]*>/g)].find(([s]) => s.includes(`id="${id}"`))?.[0];
  expect(encontrado, id).toBeDefined();
  return encontrado!;
}

describe('classificação: criação visível junto ao campo', () => {
  it('catálogo vazio oferece seção antes do seletor e explica subseção no próprio campo', () => {
    const html = campos(), novaSecao = botao(html, 'Nova seção'), novaSubsecao = botao(html, 'Nova subseção');
    expect(novaSecao).toContain('type="button"');
    expect(novaSecao).toContain('aria-controls="ficha-secao"');
    expect(novaSecao).toContain('<svg');
    expect(novaSecao).not.toContain('disabled=""');
    expect(html.indexOf(novaSecao)).toBeLessThan(html.indexOf(input(html, 'ficha-secao')));
    expect(novaSubsecao).toContain('disabled=""');
    expect(novaSubsecao).toContain('aria-describedby="ficha-subsecao-orientacao"');
    expect(input(html, 'ficha-subsecao')).toContain('aria-describedby="ficha-subsecao-orientacao"');
    expect(html).toContain('id="ficha-subsecao-orientacao"');
    expect(html).toContain('Escolha ou crie uma seção para adicionar uma subseção.');
    expect(html).not.toContain('<form');
  });

  it('edição com vínculos mantém IDs e oferece as duas criações sem abrir a busca', () => {
    const html = campos({ valor: { secao: { tipo: 'existente', id: 'secaoA' }, subsecao: { tipo: 'existente', id: 'subA' } }, registros: [secao, subsecao] });
    expect(html).toContain('name="secaoId" value="secaoA"');
    expect(html).toContain('name="subsecaoId" value="subA"');
    expect(html).toContain('value="Pratos"'); expect(html).toContain('value="Assados"');
    expect(botao(html, 'Nova seção')).not.toContain('disabled=""');
    expect(botao(html, 'Nova subseção')).not.toContain('disabled=""');
    expect(html).not.toContain('role="listbox"');
  });

  it('seção nova permite criar subseção local sem um ID prematuro', () => {
    const html = campos({ valor: { secao: { tipo: 'nova', nome: 'Vegetarianos' }, subsecao: { tipo: 'nenhuma' } } });
    expect(input(html, 'ficha-secao')).toContain('name="secaoNome"');
    expect(input(html, 'ficha-secao')).toContain('value="Vegetarianos"');
    expect(html).not.toContain('name="secaoId"');
    expect(botao(html, 'Nova subseção')).not.toContain('disabled=""');
    expect(input(html, 'ficha-subsecao')).toContain('disabled=""');
    expect(html).toContain('Use + Nova subseção para criá-la junto com a nova seção ao salvar a ficha.');
  });

  it('nomes locais e erro continuam no mesmo payload atômico; não autofocus ao recuperar rascunho', () => {
    const html = campos({ valor: { secao: { tipo: 'nova', nome: 'Vegetarianos' }, subsecao: { tipo: 'nova', nome: 'Grelhados' } }, erros: { subsecao: 'Confira este nome.' } });
    expect(html).toContain('name="classificacaoNoFormulario" value="sim"');
    for (const nivel of ['secao', 'subsecao']) expect(html).toContain(`name="${nivel}Modo" value="nova"`);
    expect(input(html, 'ficha-secao')).toContain('value="Vegetarianos"');
    expect(input(html, 'ficha-subsecao')).toContain('value="Grelhados"');
    expect(input(html, 'ficha-subsecao')).toContain('aria-invalid="true"');
    expect(input(html, 'ficha-subsecao')).toContain('ficha-subsecao-erro');
    expect(html.match(/será criada junto com a ficha ao salvar/g)).toHaveLength(2);
    expect(html).not.toMatch(/<form|autofocus|name="(?:secao|subsecao)Id"/);
    expect(contexto.gerir).not.toHaveBeenCalled();
  });

  it('pai arquivado continua legível e preservado, com recusa local de nova subseção', () => {
    const arquivada = { ...secao, registro: { ...secao.registro, ativa: false } };
    const html = campos({ valor: { secao: { tipo: 'existente', id: 'secaoA' }, subsecao: { tipo: 'nenhuma' } }, registros: [arquivada] });
    expect(html).toContain('Pratos · arquivada');
    expect(html).toContain('name="secaoId" value="secaoA"');
    expect(botao(html, 'Nova subseção')).toContain('disabled=""');
    expect(html).toContain('Escolha uma seção ativa para criar uma subseção.');
  });

  it.each(['nenhuma', 'nova'] as const)('bloqueio impede ações e nomes no estado %s', tipo => {
    const html = campos({ bloqueio: true, valor: tipo === 'nova' ? { secao: { tipo: 'nova', nome: 'Seção digitada' }, subsecao: { tipo: 'nova', nome: 'Subseção digitada' } } : classificacaoVazia() });
    expect(input(html, 'ficha-secao')).toContain('disabled=""');
    expect(input(html, 'ficha-subsecao')).toContain('disabled=""');
    for (const [b] of html.matchAll(/<button\b[^>]*>/g)) expect(b).toContain('disabled=""');
  });
});

describe('classificação: filtros preservam criação separada da aplicação do recorte', () => {
  it.each(['/erp/fichas', '/rodolfo/erp/casa/fichas'])('criação fica junto ao seletor, antes dos avançados, no filtro %s e mantém o GET', base => {
    const html = filtros({ base, filtros: lerFiltrosDeFicha({ q: 'Prato', cmv: ['IFOOD-acima'], faixaCmv: ['LOJA-favoravel'] }), verCustos: true });
    const nova = botao(html, 'Nova seção');
    expect(nova).toContain('type="button"'); expect(nova).toContain('aria-haspopup="dialog"');
    // FT-FILTROS-UX prioriza a seleção e mantém a criação visível como ação secundária.
    expect(html.indexOf(nova)).toBeGreaterThan(html.indexOf(input(html, 'filtros-secao')));
    expect(html.indexOf(nova)).toBeLessThan(html.indexOf(input(html, 'filtros-subsecao')));
    expect(html.indexOf(botao(html, 'Nova subseção'))).toBeGreaterThan(html.indexOf(input(html, 'filtros-subsecao')));
    expect(html.indexOf(botao(html, 'Nova subseção'))).toBeLessThan(html.indexOf('<details'));
    expect(botao(html, 'Nova subseção')).toContain('disabled=""');
    expect(html).toContain('Escolha uma seção para filtrar ou criar uma subseção.');
    expect(html).toContain(`action="${base}"`);
    expect(html).toContain('value="Prato"');
    const checks = [...html.matchAll(/<input\b[^>]*>/g)].map(([s]) => s).filter(s => s.includes('checked=""'));
    expect(checks).toHaveLength(2);
    expect(checks.filter(s => s.includes('name="cmv"') && s.includes('value="IFOOD-acima"'))).toHaveLength(1);
    expect(checks.filter(s => s.includes('name="faixaCmv"') && s.includes('value="LOJA-favoravel"'))).toHaveLength(1);
    expect(html.match(/<form\b/g)).toHaveLength(1);
  });

  it('leitor/bloqueado sem action de gestão recebe somente filtros e instrução de leitura', () => {
    const html = filtros({ classificacao: { secoesIniciais: vazia, subsecoesIniciais: null, buscar: contexto.buscar } });
    expect(html).not.toMatch(/Nova seção|Nova subseção|aria-haspopup="dialog"/);
    expect(html).toContain('Escolha uma seção para filtrar por subseção.');
    expect(html).not.toContain('ou criar');
  });

  it('seção arquivada ainda filtra vínculos históricos, mas não oferece criar filha nela', () => {
    const classificacao: ClassificacaoDosFiltros = { secoesIniciais: { ...vazia, selecionados: [{ ...secao, registro: { ...secao.registro, ativa: false } }] }, subsecoesIniciais: vazia, buscar: contexto.buscar, gerir: contexto.gerir };
    const html = filtros({ filtros: lerFiltrosDeFicha({ secao: 'secaoA' }), classificacao });
    expect(html).toContain('name="secao" value="secaoA"');
    expect(input(html, 'filtros-subsecao')).not.toContain('disabled=""');
    expect(botao(html, 'Nova subseção')).toContain('disabled=""');
    expect(html).toContain('Esta seção está arquivada. Escolha uma seção ativa para criar uma subseção.');
  });
});
