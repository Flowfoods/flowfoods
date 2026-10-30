import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { navegacaoDoParceiro } from '@/lib/erp/modulos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { NENHUM_MODULO_LIBERADO } from '@/lib/erp/liberacao';
import { comParceiroAtual, navegacaoDoNivel1 } from '@/lib/rodolfo/modulos';
import {
  atualizarMemoriaDoRetorno,
  resolverRetornoDaNavegacao,
  temVoltarNoShell,
  type MemoriaDoRetorno,
} from '@/lib/erp/voltar-navegacao';
import { VoltarDaNavegacao } from '@/components/erp/shell/VoltarDaNavegacao';
import { TelaDeDespesas } from '@/components/erp/telas/dre/despesas';

const rota = vi.hoisted(() => ({ caminho: '/erp/fichas', busca: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => rota.caminho,
  useSearchParams: () => new URLSearchParams(rota.busca),
}));
const doPerfil = (perfilBase: 'DONO' | 'OPERADOR') => navegacaoDoParceiro(resolverAlcance({
  perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [],
}), NENHUM_MODULO_LIBERADO);
const nav = doPerfil('DONO');
const retorno = (caminho: string, origens: string[] = [], navegacao = nav) =>
  resolverRetornoDaNavegacao({ caminho, origens, nav: navegacao });

describe('Voltar das listas: origem comprovada, hierarquia permitida e raiz', () => {
  it('preserva filtros da origem exata conhecida, sem considerar detalhe como permissão implícita', () => {
    expect(retorno('/erp/fichas', ['/erp/insumos?busca=arroz&pagina=3']).href).toBe('/erp/insumos?busca=arroz&pagina=3');
    expect(retorno('/erp/fichas', ['/erp/insumos/objeto-de-outra-loja']).href).toBe('/erp');
    expect(retorno('/erp/fichas', ['/erp/insumos/novo']).href).toBe('/erp');
  });

  it.each([
    'https://externo.test/erp/insumos', '//externo.test/erp/insumos', '/rodolfo/erp/outra/insumos',
    '/erp/../rodolfo', '/erp/%2f%2fexterno', '/erp/insumos\\fora', '/erp/insumos\n',
    '/erp/insumos\u200b', '/erp/insumos' + '?x='.repeat(1000),
  ])('recusa origem externa, fora do contexto ou malformada: %s', (origem) => {
    expect(retorno('/erp/fichas', [origem]).href).toBe('/erp');
  });

  it('ignora laço na própria tela, inclusive query diferente; usa a visita segura anterior', () => {
    expect(retorno('/erp/fichas', ['/erp/insumos?tipo=ingrediente', '/erp/fichas?busca=arroz']).href)
      .toBe('/erp/insumos?tipo=ingrediente');
    expect(retorno('/erp/fichas', ['/erp/fichas']).href).toBe('/erp');
  });

  it('entrada direta usa pai listado no nav e depois raiz; nunca corta segmentos para fabricar página', () => {
    expect(retorno('/erp/compras/fornecedores').href).toBe('/erp/compras');
    expect(retorno('/erp/producao/lista/loja-1').href).toBe('/erp/producao/lista');
    expect(retorno('/erp/insumos/categorias').href).toBe('/erp/insumos');
    expect(retorno('/erp/fichas').href).toBe('/erp');
  });

  it('operador não ganha retorno para Compras/Precificação/Integração por prefixo ou histórico antigo', () => {
    const operador = doPerfil('OPERADOR');
    for (const origem of ['/erp/compras', '/erp/fichas/canais', '/erp/integracoes']) {
      expect(retorno('/erp/fichas', [origem], operador).href).toBe('/erp');
    }
  });

  it('N1 dentro do parceiro só aceita destinos exatos daquele parceiro; troca não cruza tenants', () => {
    const n1 = comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/alfa/fichas', [{ slug: 'alfa', nome: 'Alfa' }, { slug: 'beta', nome: 'Beta' }]);
    expect(retorno('/rodolfo/erp/alfa/fichas', ['/rodolfo/erp/alfa/insumos?pagina=2'], n1).href)
      .toBe('/rodolfo/erp/alfa/insumos?pagina=2');
    for (const origem of ['/rodolfo/erp/beta/insumos', '/rodolfo/erp/alfabeta/insumos', '/erp/insumos', '/rodolfo/leads']) {
      expect(retorno('/rodolfo/erp/alfa/fichas', [origem], n1).href).toBe('/rodolfo/erp/alfa');
    }
  });

  it('nav sem raiz do contexto não inventa acesso e raiz direta fica inativa com explicação', () => {
    expect(retorno('/rodolfo/erp/desconhecido/fichas', [], navegacaoDoNivel1()).href).toBeNull();
    expect(retorno('/erp')).toMatchObject({ href: null, rotulo: 'Voltar', motivo: expect.any(String) });
    expect(retorno('/erp', ['/erp/insumos']).href).toBeNull();
    expect(retorno('/rodolfo', [], navegacaoDoNivel1()).href).toBeNull();
  });
});

describe('Memória transitória por pessoa/parceiro/loja, sem ciclos de retorno', () => {
  it('mantém query atualizada da lista sem inserir cada filtro na pilha', () => {
    let m = atualizarMemoriaDoRetorno(null, 'p1:u1:l1', '/erp/insumos?busca=a');
    m = atualizarMemoriaDoRetorno(m, 'p1:u1:l1', '/erp/insumos?busca=arroz&pagina=3');
    expect(m.anteriores).toEqual([]);
    m = atualizarMemoriaDoRetorno(m, 'p1:u1:l1', '/erp/fichas');
    expect(m.anteriores).toEqual(['/erp/insumos?busca=arroz&pagina=3']);
  });

  it('consome visitas anteriores ao voltar: fichas -> insumos -> raiz, sem pingue-pongue', () => {
    let m = atualizarMemoriaDoRetorno(null, 'p1:u1', '/erp');
    m = atualizarMemoriaDoRetorno(m, 'p1:u1', '/erp/insumos?busca=arroz');
    m = atualizarMemoriaDoRetorno(m, 'p1:u1', '/erp/fichas');
    expect(retorno('/erp/fichas', m.anteriores).href).toBe('/erp/insumos?busca=arroz');
    m = atualizarMemoriaDoRetorno(m, 'p1:u1', '/erp/insumos?busca=arroz');
    expect(m.anteriores).toEqual(['/erp']);
    m = atualizarMemoriaDoRetorno(m, 'p1:u1', '/erp');
    expect(m.anteriores).toEqual([]);
    expect(retorno('/erp', m.anteriores).href).toBeNull();
  });

  it('trocar pessoa, parceiro ou loja zera as origens e não altera o objeto anterior', () => {
    const m: MemoriaDoRetorno = { contexto: 'p1:u1:l1', atual: '/erp/fichas', anteriores: ['/erp/insumos?busca=privado'] };
    for (const contexto of ['p1:u2:l1', 'p2:u1:l1', 'p1:u1:l2']) {
      expect(atualizarMemoriaDoRetorno(m, contexto, '/erp/fichas').anteriores).toEqual([]);
    }
    expect(m.anteriores).toEqual(['/erp/insumos?busca=privado']);
  });

  it('entrada direta seguida do pai não oferece de novo a página filha como origem', () => {
    let m = atualizarMemoriaDoRetorno(null, 'p1:u1', '/erp/compras/fornecedores');
    m = atualizarMemoriaDoRetorno(m, 'p1:u1', '/erp/compras');
    expect(m.anteriores).toEqual([]);
    expect(retorno('/erp/compras', m.anteriores).href).toBe('/erp');
    m = atualizarMemoriaDoRetorno(m, 'p1:u1', '/erp');
    expect(retorno('/erp', m.anteriores).href).toBeNull();
  });
});

describe('Cobertura explícita e HTML do retorno complementar', () => {
  it('cobre listas/hubs e espelho sem duplicar detalhe/formulário/impressão/login/redirect puro', () => {
    for (const p of ['/erp', '/erp/insumos', '/erp/fichas', '/erp/compras', '/erp/compras/fornecedores', '/erp/producao/lista/l1']) {
      expect(temVoltarNoShell(p), p).toBe(true);
      expect(temVoltarNoShell(p.replace('/erp', '/rodolfo/erp/alfa')), p).toBe(true);
    }
    for (const p of ['/erp/insumos/novo', '/erp/insumos/i1', '/erp/fichas/f1/editar', '/erp/fichas/f1/imprimir',
      '/erp/etiquetas/l1/e1/papel', '/entrar', '/rodolfo/login', '/rodolfo/erp/alfa/integracoes']) {
      expect(temVoltarNoShell(p), p).toBe(false);
    }
  });

  it('entrada direta renderiza link interno com nome claro, sem history.back', () => {
    rota.caminho = '/erp/fichas';
    const h = renderToStaticMarkup(createElement(VoltarDaNavegacao, { nav, chaveDoContexto: 'p1:u1' }));
    expect(h).toContain('href="/erp"');
    expect(h).toContain('Voltar para Áreas da Rede');
  });

  it('relatórios e painéis temporais recebem retorno, sem duplicar impressão ou origem local validada', () => {
    for (const p of ['/erp/faturamento', '/erp/dre', '/erp/dre/cmv-categorias',
      '/erp/compras/relatorios/comparar-fornecedores', '/erp/compras/relatorios/comparar-periodos',
      '/erp/estoque/relatorios/consumo', '/erp/compras/relatorios/insumo', '/erp/compras/relatorios/periodo']) {
      expect(temVoltarNoShell(p, 'mes=2026-09'), p).toBe(true);
      expect(temVoltarNoShell(p, 'imprimir=1'), p).toBe(false);
    }
    expect(temVoltarNoShell('/erp/compras/relatorios/insumo', 'volta=' + encodeURIComponent('/erp/insumos/i1'))).toBe(false);
    expect(temVoltarNoShell('/erp/compras/relatorios/insumo', 'volta=' + encodeURIComponent('https://externo.test'))).toBe(true);
    expect(temVoltarNoShell('/rodolfo/erp/alfa/compras/relatorios/periodo', 'volta=' + encodeURIComponent('/rodolfo/erp/beta/dre'))).toBe(true);
  });

  it('raiz mantém botão visível inativo ligado à explicação; detalhe não duplica controle', () => {
    rota.caminho = '/erp';
    const h = renderToStaticMarkup(createElement(VoltarDaNavegacao, { nav, chaveDoContexto: 'p1:u1' }));
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby=/);
    expect(h).toContain('Você está no início deste contexto');
    expect(h).not.toContain('href="/erp"');
    rota.caminho = '/erp/insumos/i1';
    expect(renderToStaticMarkup(createElement(VoltarDaNavegacao, { nav }))).toBe('');
  });

  it('lista de despesas tem retorno permanente próprio sem conceder DRE a quem só lança despesas', () => {
    for (const podeVerDre of [false, true]) {
      const h = renderToStaticMarkup(createElement(TelaDeDespesas, {
        lista: { itens: [], total: 0, pagina: 1, porPagina: 50, aPagar: { vencidas: 0, venceLogo: 0, total: 0, totalCentavos: 0 } },
        base: '/erp/dre/despesas', raiz: '/erp', abrangencia: 'Casa', hoje: '2026-10-29', mes: '2026-10',
        situacao: 'todas', lojas: [], podeLancar: false, podeVerDre, faltaLancar: [], bloqueio: null,
      }));
      expect(h).toContain(podeVerDre ? 'Voltar para o DRE' : 'Voltar para as áreas da rede');
      if (!podeVerDre) expect(h).not.toContain('href="/erp/dre"');
      expect(temVoltarNoShell('/erp/dre/despesas')).toBe(false);
    }
  });
});
