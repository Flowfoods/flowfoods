/** Contrato transversal de 29/10: histórico acessível, recolhido ao entrar. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { HistoricoRecolhivel } from '@/components/erp/telas/historico/historico-recolhivel';

vi.mock('next/navigation', () => ({ usePathname: () => '/erp/insumos/insumo-1' }));

describe('Históricos recolhidos por padrão', () => {
  it('o HTML inicial entrega registros intactos e conteúdo recolhido, com acionador nativo acessível', () => {
    const html = renderToStaticMarkup(createElement(HistoricoRecolhivel, {
      chave: 'parceiro-1/insumo-1', titulo: 'Últimas alterações', quantidade: 1,
    }, createElement('ol', null, createElement('li', null, 'Ana · 29/10/2026 · 1 kg para 2 kg'))));
    expect(html).toContain('<details>');
    expect(html).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    expect(html).toMatch(/<summary[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"/);
    const controlado = html.match(/aria-controls="([^"]+)"/)![1];
    expect(html).toContain(`id="${controlado}"`);
    expect(html).toContain('Ver histórico');
    expect(html).toContain('1 registro exibido');
    expect(html).toContain('Ana · 29/10/2026 · 1 kg para 2 kg');
    expect(html).not.toContain('Ocultar histórico');
  });

  it('acesso ao histórico completo fica fora do summary, sem controles interativos aninhados', () => {
    const html = renderToStaticMarkup(createElement(HistoricoRecolhivel, {
      chave: 'parceiro-1/equipe', titulo: 'Mudanças na equipe', quantidade: 0,
      acessorio: createElement('a', { href: '/erp/historico' }, 'Ver o histórico completo'),
    }, createElement('p', null, 'Nada registrado ainda.')));
    expect(html.slice(html.indexOf('<summary'), html.indexOf('</summary>'))).not.toContain('<a');
    expect(html.indexOf('href="/erp/historico"')).toBeGreaterThan(html.indexOf('</details>'));
    expect(html).toContain('0 registros exibidos');
    expect(html).toContain('Nada registrado ainda.');
  });

  it('conteúdo de erro ou carregamento não abre automaticamente nem desaparece do HTML', () => {
    for (const mensagem of ['Carregando histórico…', 'Não foi possível carregar. Tentar novamente']) {
      const html = renderToStaticMarkup(createElement(HistoricoRecolhivel, {
        chave: 'parceiro-1/nota-1',
      }, createElement('p', null, mensagem)));
      expect(html).toContain(mensagem);
      expect(html).toContain('<details>');
      expect(html).toContain('aria-expanded="false"');
    }
  });

  it('toda chamada da lista de auditoria está dentro do wrapper, inclusive novas telas', () => {
    const semWrapper: string[] = [];
    const varrer = (pasta: string) => {
      for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
        const arquivo = join(pasta, entrada.name);
        if (entrada.isDirectory()) { varrer(arquivo); continue; }
        if (!arquivo.endsWith('.tsx')) continue;
        const texto = readFileSync(arquivo, 'utf8');
        if (!texto.includes('<ListaHistorico')) continue;
        const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const visitar = (no: ts.Node) => {
          if ((ts.isJsxSelfClosingElement(no) || ts.isJsxOpeningElement(no)) && no.tagName.getText(fonte) === 'ListaHistorico') {
            let pai: ts.Node | undefined = no.parent;
            while (pai && !(ts.isJsxElement(pai) && pai.openingElement.tagName.getText(fonte) === 'HistoricoRecolhivel')) pai = pai.parent;
            if (!pai) semWrapper.push(relative(process.cwd(), arquivo));
          }
          ts.forEachChild(no, visitar);
        };
        visitar(fonte);
      }
    };
    varrer(join(process.cwd(), 'src'));
    expect(semWrapper).toEqual([]);
  });
});
