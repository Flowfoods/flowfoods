/**
 * Busca ⌘K com nomes curtos e sinônimos (plano de módulos de 11/11/2026, critério 3: "a busca considera nomes novos e
 * antigos; cada atalho aponta ao domínio existente correto"). Sem banco e sem navegador.
 *
 * - os sinônimos só ACRESCENTAM: em toda consulta, os resultados da busca de antes (copiada aqui como referência) vêm
 *   primeiro, na mesma ordem (o Enter abre o mesmo de antes), e o que só casa por sinônimo vem depois;
 * - o sinônimo casa pelo começo de uma palavra dele ("fin" acha Financeiro; "está" não acha Gestão);
 * - os nomes curtos do plano acham as telas que existem: Financeiro → Faturamento e DRE, Gestão → Rede e Equipe,
 *   Configurações → Lojas e marcas, Integrações e Equipe, iFood e Integração → Integrações, Analytics → o hub;
 * - quem não vê a tela não a acha; módulo sem tela ("Em breve", como CRM Clube) não vira resultado: nenhum link falso.
 */
import { describe, expect, it } from 'vitest';
import { filtrarLocais, locaisDaNavegacao, normalizarBusca, type LocalDaBusca } from '@/lib/erp/busca-local';
import { navegacaoDoParceiro, telasDaNavegacao } from '@/lib/erp/modulos';
import { resolverAlcance, type PerfilBase } from '@/lib/erp/permissoes';
import { NENHUM_MODULO_LIBERADO, TODOS_OS_MODULOS_COM_LIBERACAO } from '@/lib/erp/liberacao';
import { comParceiroAtual, navegacaoDoNivel1 } from '@/lib/rodolfo/modulos';

const alcance = (perfilBase: PerfilBase, redeInteira = true) =>
  resolverAlcance({ perfilBase, perfilProprio: null, permissoesExtras: [], permissoesRemovidas: [], redeInteira, lojaIds: redeInteira ? [] : ['l1'] });
const doParceiro = (perfil: PerfilBase, liberados = TODOS_OS_MODULOS_COM_LIBERACAO, redeInteira = true) =>
  locaisDaNavegacao(navegacaoDoParceiro(alcance(perfil, redeInteira), liberados), null);
const PARCEIROS = [{ slug: 'alfa', nome: 'Alfa', rotuloStatus: 'Ativo' }];
const doNivel1 = () => locaisDaNavegacao(comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/alfa', PARCEIROS), PARCEIROS);
const doNivel1ForaDoParceiro = () => locaisDaNavegacao(navegacaoDoNivel1(), PARCEIROS);
const rotulos = (r: { rotulo: string }[]) => r.map((x) => x.rotulo);
const hrefs = (r: { href: string }[]) => r.map((x) => x.href);
/**
 * A busca de antes dos sinônimos (9e573a1, `BuscaGlobal`), copiada aqui como referência fixa: nome e detalhe, sem acento,
 * na ordem do menu; sem termo, as telas. A regressão compara com ela, e não com a função nova, para que uma mudança no
 * casamento por nome também apareça.
 */
const normalizarDeAntes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const buscaDeAntes = (locais: LocalDaBusca[], q: string) => {
  const termo = normalizarDeAntes(q.trim());
  return termo ? locais.filter((r) => normalizarDeAntes(`${r.rotulo} ${r.detalhe}`).includes(termo)) : locais.filter((r) => r.tipo === 'tela');
};

const CENARIOS: [string, () => LocalDaBusca[]][] = [
  ['Dono', () => doParceiro('DONO')],
  ['Gerente', () => doParceiro('GERENTE')],
  ['Operador', () => doParceiro('OPERADOR')],
  ['Dono sem Integração liberada', () => doParceiro('DONO', NENHUM_MODULO_LIBERADO)],
  ['Gerente de uma loja', () => doParceiro('GERENTE', TODOS_OS_MODULOS_COM_LIBERACAO, false)],
  ['nível 1 no parceiro', doNivel1],
  ['nível 1 fora do parceiro', doNivel1ForaDoParceiro],
];

describe('busca ⌘K · os sinônimos só acrescentam', () => {
  it('em toda consulta (palavras, começos de palavra e pares de palavras dos nomes e detalhes), os resultados de antes vêm primeiro, na mesma ordem', () => {
    let consultas = 0;
    for (const [nome, locaisDe] of CENARIOS) {
      const locais = locaisDe();
      const palavras = new Set<string>();
      for (const l of locais) {
        const todas = normalizarBusca(`${l.rotulo} ${l.detalhe} ${l.termos ?? ''}`).split(/[^a-z0-9]+/).filter(Boolean);
        for (const p of todas) {
          for (let n = 2; n <= p.length; n++) palavras.add(p.slice(0, n));
        }
        // Consultas de duas palavras seguidas ("rede e", "lojas e marcas" vira "lojas e" e "e marcas").
        for (let i = 0; i + 1 < todas.length; i++) palavras.add(`${todas[i]} ${todas[i + 1]}`);
      }
      for (const q of palavras) {
        const agora = filtrarLocais(locais, q).map(({ rotulo, href, tipo }) => ({ rotulo, href, tipo }));
        const deAntes = buscaDeAntes(locais, q).map(({ rotulo, href, tipo }) => ({ rotulo, href, tipo }));
        expect(agora.slice(0, deAntes.length), `${nome}: "${q}"`).toEqual(deAntes);
        consultas++;
      }
    }
    expect(consultas).toBeGreaterThan(1000);
  });

  it('o primeiro resultado (o do Enter) dos nomes que já existiam não muda: Indicadores, Resultado, Cadastro', () => {
    expect(filtrarLocais(doParceiro('DONO'), 'indicadores')[0].href).toBe('/erp/producao/indicadores');
    expect(filtrarLocais(doNivel1(), 'indicadores')[0].href).toBe('/rodolfo/erp/alfa/producao/indicadores');
    expect(filtrarLocais(doParceiro('DONO'), 'resultado')[0].rotulo).toBe('DRE');
    expect(filtrarLocais(doParceiro('DONO'), 'cad')[0].href).not.toBe('/erp');
  });

  it('espaços repetidos contam como um só, na consulta e no texto: um parceiro gravado com espaço duplo continua achado', () => {
    const comEspacoDuplo = [{ slug: 'bar-do-ze', nome: 'Bar  do Zé', rotuloStatus: 'Ativo' }];
    const locais = locaisDaNavegacao(navegacaoDoNivel1(), comEspacoDuplo);
    for (const q of ['bar do', 'bar  do', 'BAR   DO ZE']) expect(rotulos(filtrarLocais(locais, q)), q).toEqual(['Bar  do Zé']);
    // Na consulta: com espaços repetidos, acha o mesmo que com um espaço só.
    const doDono = doParceiro('DONO');
    expect(filtrarLocais(doDono, 'lojas   e marcas')).toEqual(filtrarLocais(doDono, 'lojas e marcas'));
    expect(rotulos(filtrarLocais(doDono, 'lojas   e marcas'))).toContain('Lojas e marcas');
  });

  it('o sinônimo casa pelo começo de uma palavra dele, não por pedaço do meio', () => {
    // "fin" é o começo de Financeiro: acha Faturamento e DRE; "está" e "tão" são pedaços de Gestão: não acham por ela.
    expect(filtrarLocais(doParceiro('DONO'), 'fin').some((r) => r.detalhe.startsWith('Faturamento e DRE'))).toBe(true);
    for (const q of ['está', 'tão', 'ytics', 'food']) {
      const soPorSinonimo = filtrarLocais(doParceiro('DONO'), q).filter((r) => !normalizarBusca(`${r.rotulo} ${r.detalhe}`).includes(normalizarBusca(q)));
      expect(soPorSinonimo, q).toEqual([]);
    }
  });
});

describe('busca ⌘K · nomes curtos do plano', () => {
  it('sem acento e sem diferença de maiúsculas', () => {
    expect(normalizarBusca('Gestão')).toBe('gestao');
    expect(normalizarBusca('INTEGRAÇÃO')).toBe('integracao');
    expect(normalizarBusca('Configurações')).toBe('configuracoes');
  });

  it('Financeiro (e Financeiro e Resultados) acha só as telas e ações de Faturamento e DRE, para quem as vê', () => {
    for (const locais of [doParceiro('DONO'), doParceiro('GERENTE'), doNivel1()]) {
      for (const q of ['financeiro', 'Financeiro e Resultados', 'FINANCEIRO']) {
        const achou = filtrarLocais(locais, q);
        expect(achou.length, q).toBeGreaterThan(0);
        for (const r of achou) expect(r.detalhe.startsWith('Faturamento e DRE · '), `${q}: ${r.rotulo}`).toBe(true);
      }
    }
    expect(rotulos(filtrarLocais(doParceiro('DONO'), 'financeiro'))).toEqual(expect.arrayContaining(['Faturamento', 'DRE']));
    // O Operador não vê Faturamento e DRE: não acha nada.
    expect(filtrarLocais(doParceiro('OPERADOR'), 'financeiro')).toEqual([]);
  });

  it('Gestão acha Rede e Equipe; Configurações (e o singular) acha Lojas e marcas, Integrações e Equipe, e não o resto da área', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      const gestao = filtrarLocais(locais, 'gestão');
      expect(gestao.length).toBeGreaterThan(0);
      for (const r of gestao) expect(r.detalhe.startsWith('Rede e Equipe · '), r.rotulo).toBe(true);
      expect(rotulos(gestao)).toEqual(expect.arrayContaining(['Lojas e marcas', 'Equipe', 'Histórico']));
      for (const q of ['configurações', 'configuração', 'config']) {
        const achou = rotulos(filtrarLocais(locais, q));
        expect(achou, q).toEqual(expect.arrayContaining(['Lojas e marcas', 'Integrações', 'Equipe']));
        expect(achou, q).not.toContain('Histórico');
        expect(achou, q).not.toContain('Seu acesso');
      }
    }
  });

  it('iFood e Integração acham Integrações (no nível 1, também a Central)', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      expect(rotulos(filtrarLocais(locais, 'integração'))).toContain('Integrações');
      expect(rotulos(filtrarLocais(locais, 'ifood'))).toContain('Integrações');
    }
    expect(hrefs(filtrarLocais(doNivel1(), 'integração'))).toEqual(expect.arrayContaining(['/rodolfo/integracoes', '/rodolfo/erp/alfa/integracoes']));
    // Fora de um parceiro, o nível 1 acha a Central; Financeiro e Analytics não acham nada (não há área de parceiro aberta).
    expect(hrefs(filtrarLocais(doNivel1ForaDoParceiro(), 'integração'))).toEqual(['/rodolfo/integracoes']);
    expect(filtrarLocais(doNivel1ForaDoParceiro(), 'financeiro')).toEqual([]);
    expect(filtrarLocais(doNivel1ForaDoParceiro(), 'analytics')).toEqual([]);
  });

  it('decisão 539: o nome antigo continua achando — "Cadastros" acha Fichas técnicas e Insumos, "Cardápio" acha a Ficha Técnica', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      const cadastros = filtrarLocais(locais, 'cadastros');
      expect(rotulos(cadastros), 'cadastros').toEqual(expect.arrayContaining(['Fichas técnicas', 'Precificação', 'Insumos']));
      // Os Insumos moram no Estoque; a busca diz a área nova.
      expect(cadastros.find((r) => r.rotulo === 'Insumos')!.detalhe.startsWith('Estoque e Movimentações · ')).toBe(true);
      expect(cadastros.find((r) => r.rotulo === 'Fichas técnicas')!.detalhe.startsWith('Ficha Técnica · ')).toBe(true);
      const cardapio = filtrarLocais(locais, 'cardápio');
      expect(rotulos(cardapio)).toEqual(expect.arrayContaining(['Fichas técnicas', 'Precificação']));
      expect(rotulos(cardapio)).not.toContain('Insumos');
    }
    // Quem não vê fichas nem insumos não acha nada pelo nome antigo.
    expect(filtrarLocais(doParceiro('OPERADOR'), 'cadastros').map((r) => r.rotulo)).not.toContain('Precificação');
  });

  it('Analytics acha o hub, onde mora a Home analítica', () => {
    expect(hrefs(filtrarLocais(doParceiro('DONO'), 'analytics'))).toEqual(['/erp']);
    expect(hrefs(filtrarLocais(doNivel1(), 'analytics'))).toEqual(['/rodolfo/erp/alfa']);
  });

  it('os termos não mudam rótulo, detalhe, destino nem ordem da lista; sem termo, as telas como antes', () => {
    const nav = navegacaoDoParceiro(alcance('DONO'), TODOS_OS_MODULOS_COM_LIBERACAO);
    const locais = locaisDaNavegacao(nav, null);
    const telas = telasDaNavegacao(nav);
    expect(locais.filter((l) => l.tipo === 'tela').slice(1).map(({ rotulo, href }) => ({ rotulo, href }))).toEqual(telas.map(({ rotulo, href }) => ({ rotulo, href })));
    expect(filtrarLocais(locais, '')).toEqual(locais.filter((l) => l.tipo === 'tela'));
    expect(filtrarLocais(locais, '   ')).toEqual(locais.filter((l) => l.tipo === 'tela'));
    const integracoes = locais.find((l) => l.rotulo === 'Integrações')!;
    // Decisão 539: Integrações é a aba da área Integração; "Gestão" (o nome curto de Rede e Equipe) não vem mais junto.
    expect(integracoes.detalhe).toBe('Integração · Capacidades do iFood e situação das lojas');
    expect(integracoes.termos).toBe('iFood · Integração · Configurações · Configuração');
  });

  it('a busca encontra a Central informativa para o Dono antes da liberação e respeita a permissão do Operador', () => {
    expect(filtrarLocais(doParceiro('OPERADOR'), 'ifood')).toEqual([]);
    expect(rotulos(filtrarLocais(doParceiro('DONO', NENHUM_MODULO_LIBERADO), 'ifood'))).toContain('Integrações');
    expect(rotulos(filtrarLocais(doParceiro('DONO', NENHUM_MODULO_LIBERADO), 'integração'))).toContain('Integrações');
  });

  it('módulo sem tela não vira resultado (CRM Clube, Checklists, Flow Ads, Patrimônio); Delivery e Pessoas só acham telas que existem', () => {
    for (const locais of [doParceiro('DONO'), doNivel1()]) {
      for (const q of ['crm clube', 'crm', 'checklists', 'flow ads', 'patrimônio']) expect(filtrarLocais(locais, q), q).toEqual([]);
      // "Delivery" acha a Precificação (fala de delivery) e "Pessoas" acha a aba Equipe (pessoas e perfis), ambas pelo texto
      // que já estava na tela; nunca um módulo futuro.
      expect(rotulos(filtrarLocais(locais, 'delivery'))).toEqual(['Precificação']);
      expect(rotulos(filtrarLocais(locais, 'pessoas'))).toEqual(['Equipe']);
    }
  });
});
