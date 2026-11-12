import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CartaoModulo, HubDeModulos, type CartaoDoHub } from '@/components/erp/ui/hub';

/**
 * Opções complementares dos cards de módulos — recolhidas por padrão (pedido de Rodolfo, 30/10/2026). O HTML que chega
 * do servidor já vem recolhido: botão real "Ver atalhos de …" com aria-expanded=false ligado à região oculta; os links
 * continuam no HTML com os mesmos destinos; nada de botão dentro de link; card sem atalhos não ganha botão vazio.
 */
const compras: CartaoDoHub = {
  chave: 'compras',
  nome: 'Compras e Fornecedores',
  subtitulo: 'Notas lançadas, quem vende e o preço pago',
  icone: 'compras',
  cor: '#2563eb',
  href: '/erp/compras',
  abas: [
    { rotulo: 'Compras', href: '/erp/compras' },
    { rotulo: 'Fornecedores', href: '/erp/fornecedores' },
    { rotulo: 'Histórico do insumo', href: '/erp/compras/historico' },
  ],
};
const html = (c: CartaoDoHub) => renderToStaticMarkup(createElement(CartaoModulo, { c }));

describe('cards de módulos: atalhos recolhidos por padrão', () => {
  it('chega recolhido: botão real com aria-expanded=false, aria-controls apontando para a região oculta', () => {
    const h = html(compras);
    const botao = /<button type="button" aria-expanded="false" aria-controls="([^"]+)"[^>]*>([\s\S]*?)<\/button>/.exec(h);
    expect(botao).not.toBeNull();
    const [, controla, conteudo] = botao!;
    expect(conteudo).toContain('Ver atalhos');
    expect(conteudo).toContain('<span class="sr-only"> de Compras e Fornecedores</span>');
    // A região controlada existe, está oculta e contém a lista com os mesmos links.
    const regiao = new RegExp(`<div id="${controla.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" hidden=""[^>]*>([\\s\\S]*?)</div>`).exec(h);
    expect(regiao).not.toBeNull();
    expect(regiao![1]).toContain('aria-label="Abas de Compras e Fornecedores"');
    expect([...regiao![1].matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/erp/compras', '/erp/fornecedores', '/erp/compras/historico']);
  });

  it('título, descrição e entrada principal continuam visíveis, com o mesmo destino', () => {
    const h = html(compras);
    expect(h).toMatch(/<a class="ff-cartao-titulo[^"]*" href="\/erp\/compras">Compras e Fornecedores<\/a>/);
    expect(h).toContain('Notas lançadas, quem vende e o preço pago');
  });

  it('sem controles aninhados: nenhum botão dentro de link e nenhum link dentro do botão', () => {
    const h = html(compras);
    for (const [link] of h.matchAll(/<a [\s\S]*?<\/a>/g)) expect(link).not.toContain('<button');
    const botao = /<button[\s\S]*?<\/button>/.exec(h)![0];
    expect(botao).not.toContain('<a ');
  });

  it('card sem atalhos, só com entrada principal, ou "Em breve": nenhum botão vazio', () => {
    expect(html({ ...compras, abas: [] })).not.toContain('<button');
    expect(html({ ...compras, abas: undefined })).not.toContain('Ver atalhos');
    const futuro = html({ ...compras, href: null, abas: undefined });
    expect(futuro).toContain('Em breve');
    expect(futuro).not.toContain('<button');
  });

  it('a grade alinha os cards ao topo (abrir um não estica os vizinhos) e cada card tem o próprio botão', () => {
    const outro: CartaoDoHub = { ...compras, chave: 'estoque', nome: 'Estoque', href: '/erp/estoque', abas: [{ rotulo: 'Contagens', href: '/erp/estoque/contagens' }] };
    const h = renderToStaticMarkup(createElement(HubDeModulos, { secoes: [{ rotulo: 'Operação', cartoes: [compras, outro] }] }));
    expect(h).toMatch(/<ul class="grid [^"]*min-\[600px\]:items-start/);
    // Seção sem atalhos mantém a altura igual por linha.
    const semAtalhos = renderToStaticMarkup(createElement(HubDeModulos, { secoes: [{ rotulo: 'Fases', cartoes: [{ ...compras, abas: undefined }] }] }));
    expect(/<ul class="(grid [^"]*)"/.exec(semAtalhos)![1]).not.toContain('items-start');
    expect(h.match(/aria-expanded="false"/g)).toHaveLength(2);
    const ids = [...h.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    expect(h).toContain('<span class="sr-only"> de Estoque</span>');
  });
});
