/** Contrato transversal de 29/10: histórico acessível, recolhido ao entrar. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { HistoricoRecolhivel } from '@/components/erp/telas/historico/historico-recolhivel';
import { PedidosDaEmissao, pendenciasDosPedidos } from '@/components/erp/telas/etiquetas/emissao';
import type { PedidoDeImpressao } from '@/lib/erp/etiquetas';

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

  it('blocos de histórico que não usam ListaHistorico também ficam dentro do wrapper (decisão 516)', () => {
    // O título identifica o bloco: em qualquer tela, "Pedidos de impressão" só existe como HistoricoRecolhivel.
    const TITULOS = ['Pedidos de impressão'];
    const achados: string[] = [];
    const varrer = (pasta: string) => {
      for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
        const arquivo = join(pasta, entrada.name);
        if (entrada.isDirectory()) { varrer(arquivo); continue; }
        if (!arquivo.endsWith('.tsx')) continue;
        const texto = readFileSync(arquivo, 'utf8');
        if (!TITULOS.some((t) => texto.includes(t))) continue;
        const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const visitar = (no: ts.Node) => {
          if (ts.isJsxAttribute(no) && no.name.getText(fonte) === 'titulo' && no.initializer && ts.isStringLiteral(no.initializer) && TITULOS.includes(no.initializer.text)) {
            const tag = (no.parent.parent as ts.JsxOpeningLikeElement).tagName.getText(fonte);
            achados.push(`${relative(process.cwd(), arquivo)}: ${tag}`);
          }
          ts.forEachChild(no, visitar);
        };
        visitar(fonte);
      }
    };
    varrer(join(process.cwd(), 'src'));
    expect(achados.some((a) => a.includes('etiquetas/emissao.tsx'))).toBe(true);
    expect(achados.filter((a) => !a.endsWith(': HistoricoRecolhivel'))).toEqual([]);
  });
});

describe('Pedidos de impressão da etiqueta: recolhidos, sem esconder falha (decisão 516)', () => {
  const pedido = (id: string, p: Partial<PedidoDeImpressao>): PedidoDeImpressao => ({
    id, sequencia: 1, copias: 1, transporte: 'BROWSER_PRINT', situacao: 'ENVIADA', resolucao: 203, erro: null,
    solicitadaEm: new Date('2026-10-30T15:00:00Z'), solicitadaPorNome: 'Duda Lima', concluidaEm: null, confirmadaEm: null, confirmadaPorNome: null,
    ...p,
  });
  /** Como vêm do banco: o mais recente primeiro (sequência decrescente). */
  const recentesPrimeiro = (pedidos: PedidoDeImpressao[]) => pedidos.map((p, i) => ({ ...p, sequencia: pedidos.length - i }));
  const html = (pedidos: PedidoDeImpressao[], bloqueada = false) =>
    renderToStaticMarkup(createElement(PedidosDaEmissao, { chave: '/erp/etiquetas/loja-1/etiqueta-1', pedidos: recentesPrimeiro(pedidos), bloqueada }));
  const bloco = (h: string) => ({ ini: h.indexOf('<details'), fim: h.indexOf('</details>') });

  it('com falha e sem resultado: HTML inicial recolhido e a contagem à vista, fora do <details>; o motivo segue dentro', () => {
    const h = html([
      pedido('p3', { situacao: 'FALHOU', erro: 'Zebra sem papel' }),
      pedido('p2', { situacao: 'PREPARADA' }),
      pedido('p1', { situacao: 'PREPARADA', confirmadaEm: new Date('2026-10-30T15:10:00Z'), confirmadaPorNome: 'Ana' }),
      pedido('p0', { transporte: 'PAPEL', situacao: 'EXPORTADA' }),
    ]);
    const { ini, fim } = bloco(h);
    expect(h).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    expect(h).toMatch(/<summary[^>]*aria-expanded="false"/);
    expect(h).toContain('Pedidos de impressão');
    expect(h).toContain('4 registros exibidos');
    const aviso = h.indexOf('1 pedido de impressão falhou e 1 ficou sem resultado.');
    expect(aviso).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(ini);
    expect(h.slice(0, ini)).toContain('role="status"');
    expect(h.indexOf('Zebra sem papel')).toBeGreaterThan(ini);
    expect(h.indexOf('Zebra sem papel')).toBeLessThan(fim);
    // O "Já imprimi" de um pedido da Zebra sem resposta tira ele da conta.
    expect(pendenciasDosPedidos([pedido('a', { situacao: 'PREPARADA', confirmadaEm: new Date() })])).toEqual({ falharam: 0, semResultado: 0 });
  });

  it('o que um pedido resolvido depois já resolveu não conta; falha depois do resolvido continua contando', () => {
    const semAviso = (h: string) => {
      expect(h.startsWith('<section')).toBe(true);
      expect(h).not.toContain('role="status"');
    };
    // Mais recente primeiro. Reimpressão enviada depois da falha: nada a fazer.
    const reimpressa = html([pedido('b', { situacao: 'ENVIADA' }), pedido('a', { situacao: 'FALHOU', erro: 'Zebra sem papel' })]);
    semAviso(reimpressa);
    expect(reimpressa.indexOf('Zebra sem papel')).toBeGreaterThan(reimpressa.indexOf('<details'));
    // Zebra sem resposta, depois arquivo baixado e "Já imprimi": o "sem resultado" antigo não fica eterno.
    semAviso(html([pedido('b', { transporte: 'ARQUIVO_ZPL', situacao: 'EXPORTADA', confirmadaEm: new Date(), confirmadaPorNome: 'Ana' }), pedido('a', { situacao: 'PREPARADA' })]));
    // A reimpressão falhou DEPOIS de uma enviada: conta.
    const depois = html([pedido('b', { situacao: 'FALHOU', erro: 'Sem resposta da impressora.' }), pedido('a', { situacao: 'ENVIADA' })]);
    expect(depois.slice(0, depois.indexOf('<details'))).toContain('1 pedido de impressão falhou.');
    // A ordem vem da sequência, não da posição na lista.
    const fora = [pedido('x', { sequencia: 1, situacao: 'FALHOU' }), pedido('y', { sequencia: 2, situacao: 'ENVIADA' })];
    expect(pendenciasDosPedidos(fora)).toEqual({ falharam: 0, semResultado: 0 });
    expect(pendenciasDosPedidos([...fora].reverse())).toEqual({ falharam: 0, semResultado: 0 });
  });

  it('etiqueta bloqueada (vencida, lote estornado): sem aviso de falha, o motivo continua no histórico', () => {
    const h = html([pedido('a', { situacao: 'FALHOU', erro: 'Zebra sem papel' }), pedido('b', { situacao: 'PREPARADA' })], true);
    expect(h.startsWith('<section')).toBe(true);
    expect(h).not.toContain('role="status"');
    expect(h).toContain('Zebra sem papel');
  });

  it('só falhas, ou só sem resultado: a frase diz o que é, no singular ou no plural', () => {
    const duas = html([pedido('a', { situacao: 'FALHOU', erro: 'x' }), pedido('b', { situacao: 'FALHOU', erro: 'y' })]);
    expect(duas.slice(0, bloco(duas).ini)).toContain('2 pedidos de impressão falharam.');
    const uma = html([pedido('a', { situacao: 'PREPARADA' })]);
    expect(uma.slice(0, bloco(uma).ini)).toContain('1 pedido de impressão ficou sem resultado.');
    expect(uma.slice(0, bloco(uma).ini)).toContain('pode ter saído');
  });

  it('sem falhas: nenhum aviso falso; sem pedidos: o vazio continua no HTML, recolhido', () => {
    for (const pedidos of [
      [pedido('a', { situacao: 'ENVIADA' }), pedido('b', { transporte: 'ARQUIVO_ZPL', situacao: 'EXPORTADA' })],
      [],
    ]) {
      const h = html(pedidos);
      expect(h.startsWith('<section')).toBe(true);
      expect(h).not.toContain('role="status"');
      expect(h).not.toMatch(/falh|sem resultado/i);
      expect(h).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
    }
    expect(html([])).toContain('Esta etiqueta ainda não foi para a impressora.');
  });
});
