/**
 * Busca ⌘K com nomes curtos e sinônimos (plano de módulos de 11/11/2026, critério 3: "a busca considera nomes novos e
 * antigos; cada atalho aponta ao domínio existente correto"). Sem banco e sem navegador.
 *
 * - os nomes curtos do launcher acham as telas que existem: Financeiro → Faturamento e DRE, Gestão e Configurações → Rede e
 *   Equipe, iFood e Integração → Integrações, Analytics → o hub; nomes canônicos (Fichas técnicas, Insumos) continuam;
 * - os termos só ajudam a achar: não mudam rótulo, destino, menu nem permissão; quem não vê a tela não a acha;
 * - módulo sem tela ("Em breve", como CRM Clube) não vira resultado: nenhum link falso.
 */
import { describe, expect, it } from 'vitest';
import { filtrarLocais, locaisDaNavegacao, normalizarBusca } from '@/lib/erp/busca-local';
import { navegacaoDoParceiro, telasDaNavegacao } from '@/lib/erp/modulos';
import { resolverAlcance } from '@/lib/erp/permissoes';
import { NENHUM_MODULO_LIBERADO, TODOS_OS_MODULOS_COM_LIBERACAO } from '@/lib/erp/liberacao';
import { comParceiroAtual, navegacaoDoNivel1 } from '@/lib/rodolfo/modulos';

const alcance = (perfilBase: 'DONO' | 'OPERADOR') =>
  resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira: true, lojaIds: [] });
const doParceiro = (perfil: 'DONO' | 'OPERADOR', liberados = TODOS_OS_MODULOS_COM_LIBERACAO) =>
  locaisDaNavegacao(navegacaoDoParceiro(alcance(perfil), liberados), null);
const PARCEIROS = [{ slug: 'alfa', nome: 'Alfa', rotuloStatus: 'Ativo' }];
const doNivel1 = () => locaisDaNavegacao(comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/alfa', PARCEIROS), PARCEIROS);
const rotulos = (r: { rotulo: string }[]) => r.map((x) => x.rotulo);
const hrefs = (r: { href: string }[]) => r.map((x) => x.href);

describe('busca ⌘K · nomes curtos e sinônimos do plano', () => {
  it('sem acento e sem diferença de maiúsculas', () => {
    expect(normalizarBusca('Gestão')).toBe('gestao');
    expect(normalizarBusca('INTEGRAÇÃO')).toBe('integracao');
    expect(normalizarBusca('Configurações')).toBe('configuracoes');
  });

  it('Financeiro (e Financeiro e Resultados) acha só as telas e ações de Faturamento e DRE', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      for (const q of ['financeiro', 'Financeiro e Resultados', 'FINANCEIRO']) {
        const achou = filtrarLocais(locais, q);
        expect(achou.length, q).toBeGreaterThan(0);
        for (const r of achou) expect(r.detalhe.startsWith('Faturamento e DRE · '), `${q}: ${r.rotulo}`).toBe(true);
      }
      expect(rotulos(filtrarLocais(locais, 'financeiro'))).toEqual(expect.arrayContaining(['Faturamento', 'DRE']));
    }
  });

  it('Gestão e Configurações acham Rede e Equipe; iFood e Integração acham Integrações', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      const gestao = filtrarLocais(locais, 'gestão');
      expect(gestao.length).toBeGreaterThan(0);
      for (const r of gestao) expect(r.detalhe.startsWith('Rede e Equipe · '), r.rotulo).toBe(true);
      expect(rotulos(gestao)).toEqual(expect.arrayContaining(['Lojas e marcas', 'Equipe']));
      expect(rotulos(filtrarLocais(locais, 'configuracoes'))).toEqual(expect.arrayContaining(['Lojas e marcas', 'Integrações']));
      expect(rotulos(filtrarLocais(locais, 'integração'))).toContain('Integrações');
      expect(rotulos(filtrarLocais(locais, 'ifood'))).toContain('Integrações');
    }
    // No nível 1, a Central de Integrações também responde aos dois nomes.
    expect(hrefs(filtrarLocais(doNivel1(), 'integração'))).toEqual(expect.arrayContaining(['/rodolfo/integracoes', '/rodolfo/erp/alfa/integracoes']));
  });

  it('Analytics acha o hub, onde mora a Home analítica', () => {
    expect(hrefs(filtrarLocais(doParceiro('DONO'), 'analytics'))).toEqual(['/erp']);
    expect(hrefs(filtrarLocais(doNivel1(), 'analytics'))).toEqual(['/rodolfo/erp/alfa']);
  });

  it('os nomes canônicos continuam achando: Fichas técnicas, Insumos, Cardápio, Compras, Estoque, Produção, Etiquetas', () => {
    const locais = doParceiro('DONO');
    expect(rotulos(filtrarLocais(locais, 'fichas técnicas'))).toContain('Fichas técnicas');
    expect(rotulos(filtrarLocais(locais, 'insumos'))).toContain('Insumos');
    for (const q of ['cardápio', 'compras', 'estoque', 'produção', 'etiquetas']) expect(filtrarLocais(locais, q).length, q).toBeGreaterThan(0);
  });

  it('os termos só ajudam a achar: rótulo, destino e ordem são os do menu; sem termo, as telas como antes', () => {
    const nav = navegacaoDoParceiro(alcance('DONO'), TODOS_OS_MODULOS_COM_LIBERACAO);
    const locais = locaisDaNavegacao(nav, null);
    const telas = telasDaNavegacao(nav);
    expect(locais.filter((l) => l.tipo === 'tela').slice(1).map(({ rotulo, href }) => ({ rotulo, href }))).toEqual(telas.map(({ rotulo, href }) => ({ rotulo, href })));
    expect(filtrarLocais(locais, '')).toEqual(locais.filter((l) => l.tipo === 'tela'));
    expect(filtrarLocais(locais, '   ')).toEqual(locais.filter((l) => l.tipo === 'tela'));
    // O termo nunca vira texto da tela: o rótulo e o detalhe não mudam.
    const integracoes = locais.find((l) => l.rotulo === 'Integrações')!;
    expect(integracoes.detalhe).toBe('Rede e Equipe · Lojas do iFood ligadas e o que está ativo');
    expect(integracoes.termos).toBe('Gestão · Configurações · iFood · Integração');
  });

  it('quem não vê a tela não a acha: o Operador e o parceiro sem Integração liberada', () => {
    const operador = doParceiro('OPERADOR');
    const doDono = rotulos(filtrarLocais(doParceiro('DONO'), 'financeiro'));
    const doOperador = rotulos(filtrarLocais(operador, 'financeiro'));
    for (const r of doOperador) expect(doDono).toContain(r);
    expect(filtrarLocais(operador, 'ifood')).toEqual([]);
    // Integração sem liberação para o parceiro: a aba não está no menu, então a busca não a acha.
    expect(rotulos(filtrarLocais(doParceiro('DONO', NENHUM_MODULO_LIBERADO), 'ifood'))).not.toContain('Integrações');
  });

  it('módulo sem tela não vira resultado: CRM Clube, Checklists, Flow Ads, Patrimônio; só telas do menu respondem', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      for (const q of ['crm clube', 'crm', 'checklists', 'flow ads', 'patrimônio']) expect(filtrarLocais(locais, q), q).toEqual([]);
      // "Delivery" (nome curto de módulos futuros) só acha tela que existe e fala de delivery (Precificação), nunca o futuro.
      const delivery = filtrarLocais(locais, 'delivery');
      const doMenu = new Set(hrefs(locais));
      for (const r of delivery) expect(doMenu.has(r.href) && !['Pedidos Próprios', 'Entregas', 'Pedidos na Cozinha (KDS)'].includes(r.rotulo), r.rotulo).toBe(true);
    }
  });
});
