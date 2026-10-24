/**
 * UX.9 — navegação por ÁREAS, sem banco:
 *
 * - hub: um card por área (nome, descrição, abas em texto), nunca uma ação;
 *   futuros desabilitados e sem link; área sem aba permitida some do hub, do
 *   menu, do seletor e do ⌘K;
 * - papéis (dono, gerente, gerente de loja, operador, perfil próprio) × áreas,
 *   abas e ações; o ⌘K só lista ação de área visível E permitida;
 * - itemAtivo acende a aba certa em TODA rota profunda, no /erp e no nível 1;
 * - abas: nav com nome acessível e aria-current; trilha Início › Área › Aba;
 * - URLs antigas e a única rota nova (/estoque/contagens) existem no /erp e no
 *   espelho do nível 1, cada uma com a sua porta de permissão;
 * - guardas estáticas: um botão primário por cabeçalho, busca sem custo/margem,
 *   abas em src/components/erp/ui, sem rota de "visão geral de área".
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ALCANCE_FLOWFOODS, resolverAlcance, type Alcance, type VinculoDePermissao } from '@/lib/erp/permissoes';
import {
  abasDaArea,
  acoesDaNavegacao,
  itemAtivo,
  modulosDoParceiro,
  montarTrilha,
  navegacaoDoParceiro,
  telasDaNavegacao,
  type Navegacao,
} from '@/lib/erp/modulos';
import { comParceiroAtual, navegacaoDoNivel1 } from '@/lib/rodolfo/modulos';
import { HubDoParceiro } from '@/components/erp/telas/hub-do-parceiro';
import { Abas } from '@/components/erp/ui/abas';

const vinculo = (v: Partial<VinculoDePermissao>): VinculoDePermissao => ({
  perfilBase: 'OPERADOR',
  perfilProprio: null,
  permissoesExtras: [],
  permissoesRemovidas: [],
  redeInteira: true,
  lojaIds: [],
  ...v,
});
const alcance = (v: Partial<VinculoDePermissao>) => resolverAlcance(vinculo(v));
const DONO = alcance({ perfilBase: 'DONO' });
const GERENTE = alcance({ perfilBase: 'GERENTE' });
const GERENTE_N3 = alcance({ perfilBase: 'GERENTE', redeInteira: false, lojaIds: ['l1'] });
const OPERADOR = alcance({ perfilBase: 'OPERADOR' });
const proprio = (permissoes: string[]) => alcance({ perfilBase: null, perfilProprio: permissoes as never });

// 3.1: Produção virou área. 3.4: Etiquetas também (não sobra módulo "em breve").
const AREAS = ['Cadastros e Cardápio', 'Compras e Fornecedores', 'Estoque e Movimentações', 'Produção', 'Etiquetas', 'Faturamento e DRE', 'Rede e Equipe'];
const FUTUROS: string[] = [];
const ACOES = ['Novo insumo', 'Nova ficha', 'Importar planilha', 'Lançar nota', 'Importar XML', 'Novo fornecedor', 'Nova produção', 'Lançar o dia', 'Importar faturamento', 'Lançar despesa'];
// O operador produz (planeja o lote), então "Nova produção" é a única ação que ele tem.
const ACOES_SEM_O_OPERADOR = ACOES.filter((a) => a !== 'Nova produção');

const emUso = (a: Alcance) => modulosDoParceiro(a).filter((m) => m.href);
const abasPorArea = (a: Alcance) => Object.fromEntries(emUso(a).map((m) => [m.nome, m.grupos.flatMap((g) => g.itens.map((i) => i.rotulo))]));
const acoesPorArea = (a: Alcance) => Object.fromEntries(emUso(a).map((m) => [m.nome, m.acoes.map((x) => x.rotulo)]));

// ---------------------------------------------------------------- papéis × áreas
describe('UX.9 · papéis × áreas, abas e ações', () => {
  it('Dono: 7 áreas, as abas de cada uma e as 10 ações; nenhum futuro', () => {
    expect(emUso(DONO).map((m) => m.nome)).toEqual(AREAS);
    expect(abasPorArea(DONO)).toEqual({
      'Cadastros e Cardápio': ['Insumos', 'Fichas técnicas', 'Precificação'],
      'Compras e Fornecedores': ['Compras', 'Notas recebidas', 'Orçamento', 'Fornecedores', 'Histórico do insumo', 'Compras do período', 'Comparar fornecedores', 'Comparar períodos'],
      'Estoque e Movimentações': ['Visão geral', 'Contagens', 'Requisições', 'Divergências', 'Consumo e conciliação'],
      Produção: ['Lista do dia', 'Tarefas', 'Lotes', 'Histórico', 'Indicadores'],
      Etiquetas: ['Imprimir', 'Abrir embalagem', 'Histórico', 'Impressora'],
      'Faturamento e DRE': ['Faturamento', 'Despesas', 'DRE', 'CMV por categoria', 'Períodos', 'Plano e metas', 'Metas por categoria'],
      'Rede e Equipe': ['Lojas e marcas', 'Equipe', 'Histórico', 'Seu acesso'],
    });
    expect(acoesPorArea(DONO)).toEqual({
      'Cadastros e Cardápio': ['Novo insumo', 'Nova ficha', 'Importar planilha'],
      'Compras e Fornecedores': ['Lançar nota', 'Importar XML', 'Novo fornecedor'],
      'Estoque e Movimentações': [],
      Produção: ['Nova produção'],
      Etiquetas: [],
      'Faturamento e DRE': ['Lançar o dia', 'Importar faturamento', 'Lançar despesa'],
      'Rede e Equipe': [],
    });
    expect(modulosDoParceiro(DONO).filter((m) => !m.href).map((m) => m.nome)).toEqual(FUTUROS);
  });

  it('Gerente (rede): Precificação visível (ver preços), sem Equipe; ações de cadastro e de compra', () => {
    expect(abasPorArea(GERENTE)).toEqual({
      'Cadastros e Cardápio': ['Insumos', 'Fichas técnicas', 'Precificação'],
      'Compras e Fornecedores': ['Compras', 'Notas recebidas', 'Orçamento', 'Fornecedores', 'Histórico do insumo', 'Compras do período', 'Comparar fornecedores', 'Comparar períodos'],
      'Estoque e Movimentações': ['Visão geral', 'Contagens', 'Requisições', 'Divergências', 'Consumo e conciliação'],
      Produção: ['Lista do dia', 'Tarefas', 'Lotes', 'Histórico', 'Indicadores'],
      Etiquetas: ['Imprimir', 'Abrir embalagem', 'Histórico', 'Impressora'],
      // 2.2a: o gerente vê e lança despesa, vê o DRE e o período; plano de contas e período são do dono (rede inteira).
      'Faturamento e DRE': ['Faturamento', 'Despesas', 'DRE', 'CMV por categoria', 'Períodos'],
      'Rede e Equipe': ['Lojas e marcas', 'Histórico', 'Seu acesso'],
    });
    expect(emUso(GERENTE).flatMap((m) => m.acoes.map((a) => a.rotulo))).toEqual(ACOES);
    expect(modulosDoParceiro(GERENTE).filter((m) => !m.href)).toHaveLength(0);
  });

  it('Gerente de loja (N3): igual ao gerente, sem Histórico (exige a rede inteira)', () => {
    const r = abasPorArea(GERENTE_N3);
    expect(r['Rede e Equipe']).toEqual(['Lojas e marcas', 'Seu acesso']);
    expect(r['Estoque e Movimentações']).toEqual(['Visão geral', 'Contagens', 'Requisições', 'Divergências', 'Consumo e conciliação']);
  });

  it('Operador: sem a área Compras, sem Precificação, sem Divergências, e a única ação dele é planejar a produção', () => {
    expect(emUso(OPERADOR).map((m) => m.nome)).toEqual(['Cadastros e Cardápio', 'Estoque e Movimentações', 'Produção', 'Etiquetas', 'Rede e Equipe']);
    expect(abasPorArea(OPERADOR)).toEqual({
      'Cadastros e Cardápio': ['Insumos', 'Fichas técnicas'],
      'Estoque e Movimentações': ['Visão geral', 'Contagens', 'Requisições', 'Consumo e conciliação'],
      // 3.3: a cozinha pega as tarefas e lê o histórico; os indicadores por pessoa são da gerência.
      Produção: ['Lista do dia', 'Tarefas', 'Lotes', 'Histórico'],
      // 3.4: a cozinha imprime a etiqueta e registra a embalagem aberta (etiquetas.imprimir, por loja).
      Etiquetas: ['Imprimir', 'Abrir embalagem', 'Histórico', 'Impressora'],
      'Rede e Equipe': ['Lojas e marcas', 'Seu acesso'],
    });
    expect(acoesDaNavegacao(navegacaoDoParceiro(OPERADOR)).map((a) => a.rotulo)).toEqual(['Nova produção']);
    // 3.3: a cozinha entra na Produção pelas Tarefas; a gerência continua entrando pela Lista do dia (decisão 225).
    expect(modulosDoParceiro(OPERADOR).find((m) => m.chave === 'producao')!.href).toBe('/erp/producao/tarefas');
    expect(modulosDoParceiro(GERENTE).find((m) => m.chave === 'producao')!.href).toBe('/erp/producao/lista');
    // Um chefe (operador + "definir a lista do dia") entra pela lista, como a gerência.
    expect(modulosDoParceiro(proprio(['producao.ver', 'producao.registrar', 'producao.planejar'])).find((m) => m.chave === 'producao')!.href).toBe('/erp/producao/lista');
    expect(modulosDoParceiro(OPERADOR).filter((m) => !m.href).map((m) => m.nome)).toEqual([]);
  });

  it('Rede e Equipe sempre aparece (Seu acesso é livre), mesmo num perfil sem nada', () => {
    const vazio = proprio([]);
    expect(emUso(vazio).map((m) => m.nome)).toEqual(['Rede e Equipe']);
    expect(abasPorArea(vazio)).toEqual({ 'Rede e Equipe': ['Seu acesso'] });
  });

  it('perfil sem nenhuma aba de uma área: a área some do hub, do seletor, do menu e do ⌘K, e a ação some com ela', () => {
    // "Lançar nota" e "cadastrar fornecedor" sem "ver compras": nenhuma aba de Compras e Fornecedores é permitida.
    const a = proprio(['compras.lancar', 'fornecedores.editar', 'lojas.ver']);
    const nav = navegacaoDoParceiro(a);
    expect(nav.modulos.map((m) => m.nome)).not.toContain('Compras e Fornecedores');
    expect(telasDaNavegacao(nav).map((t) => t.href)).not.toContain('/erp/compras');
    expect(acoesDaNavegacao(nav).map((x) => x.rotulo)).toEqual([]);
    expect(nav.modulos.flatMap((m) => m.grupos.map((g) => g.rotulo))).not.toContain('Compras');
    // Idem para "Novo insumo" sem "ver insumos" nem "ver fichas".
    const b = navegacaoDoParceiro(proprio(['insumos.editar', 'lojas.ver']));
    expect(b.modulos.map((m) => m.nome)).toEqual(['Rede e Equipe']);
    expect(acoesDaNavegacao(b)).toEqual([]);
  });

  it('"Lançar o dia" e "Importar faturamento" só com ver E lançar: lançar sozinho não abre a área nem a ação', () => {
    const lancaSo = navegacaoDoParceiro(proprio(['faturamento.lancar', 'lojas.ver']));
    expect(lancaSo.modulos.map((m) => m.nome)).not.toContain('Faturamento e DRE');
    expect(acoesDaNavegacao(lancaSo).map((x) => x.rotulo)).toEqual([]);
    const ve = navegacaoDoParceiro(proprio(['faturamento.ver']));
    expect(telasDaNavegacao(ve).map((t) => t.href)).toContain('/erp/faturamento');
    expect(acoesDaNavegacao(ve).map((x) => x.rotulo)).toEqual([]);
    const ambos = navegacaoDoParceiro(proprio(['faturamento.ver', 'faturamento.lancar']));
    expect(acoesDaNavegacao(ambos).map((x) => x.rotulo)).toEqual(['Lançar o dia', 'Importar faturamento']);
  });

  it('ação só com a área visível E a permissão dela: ver sem editar não traz ação', () => {
    const verSo = navegacaoDoParceiro(proprio(['insumos.ver', 'fichas.ver']));
    expect(acoesDaNavegacao(verSo)).toEqual([]);
    const lanca = navegacaoDoParceiro(proprio(['compras.ver', 'compras.lancar']));
    expect(acoesDaNavegacao(lanca).map((x) => x.rotulo)).toEqual(['Lançar nota', 'Importar XML']);
  });

  it('⌘K: o Dono acha "Novo fornecedor", "Lançar nota" e "Lançar o dia"; o Operador só acha "Nova produção"; cada ação diz a área', () => {
    const dono = acoesDaNavegacao(navegacaoDoParceiro(DONO));
    expect(dono.map((x) => x.rotulo)).toEqual(ACOES);
    expect(dono.find((x) => x.rotulo === 'Lançar nota')).toMatchObject({ href: '/erp/compras/nova', modulo: 'Compras e Fornecedores' });
    expect(dono.find((x) => x.rotulo === 'Novo fornecedor')?.href).toBe('/erp/compras/fornecedores/novo');
    expect(dono.find((x) => x.rotulo === 'Lançar o dia')).toMatchObject({ href: '/erp/faturamento/lancar', modulo: 'Faturamento e DRE' });
    const operador = acoesDaNavegacao(navegacaoDoParceiro(OPERADOR)).map((x) => x.rotulo);
    for (const r of ACOES_SEM_O_OPERADOR) expect(operador).not.toContain(r);
    expect(dono.find((x) => x.rotulo === 'Nova produção')).toMatchObject({ href: '/erp/producao/nova', modulo: 'Produção' });
    // O detalhe de uma aba é "Área · subtítulo".
    const t = telasDaNavegacao(navegacaoDoParceiro(DONO)).find((x) => x.href === '/erp/estoque/contagens')!;
    expect(t.modulo).toBe('Estoque e Movimentações');
  });

  it('nenhum texto do menu, do hub e do ⌘K carrega dinheiro, custo ou margem', () => {
    const nav = navegacaoDoParceiro(DONO);
    const textos = [
      ...nav.modulos.flatMap((m) => [m.nome, m.subtitulo, ...m.grupos.flatMap((g) => g.itens.flatMap((i) => [i.rotulo, i.subtitulo])), ...m.acoes.flatMap((a) => [a.rotulo, a.subtitulo])]),
    ];
    for (const t of textos) expect(t, t).not.toMatch(/R\$|%|margem de \d|\d/);
  });

  it('Rede ↔ loja nunca muda quais áreas e abas aparecem (só o que as telas leem)', () => {
    // A navegação nasce SÓ do alcance e da base: `modulosDoParceiro(alcance, base)` não recebe a visão.
    expect(modulosDoParceiro.length).toBe(1); // (alcance, base = '/erp')
    expect(modulosDoParceiro(GERENTE_N3).map((m) => m.nome)).toEqual([...AREAS, ...FUTUROS]);
  });
});

// ---------------------------------------------------------------- hub
const html = (a: Alcance, base?: string) =>
  renderToStaticMarkup(
    createElement(HubDoParceiro, { titulo: 'Áreas da Rede', subtitulo: 'Casa', modulos: modulosDoParceiro(a, base), semAcesso: false }),
  );
const secao = (h: string, rotulo: string) => {
  const m = new RegExp(`<section aria-label="${rotulo}">([\\s\\S]*?)</section>`).exec(h);
  return m ? m[1] : '';
};
// Cada card é um <li class="min-w-0"> da grade (as abas dentro do card também são <li>, com outra classe).
const cartoes = (s: string) => s.split('<li class="min-w-0">').slice(1);
const nomeDoCartao = (c: string) => /ff-cartao-titulo[^"]*"[^>]*>([^<]+)</.exec(c)![1];
const abasDoCartao = (c: string) =>
  [...(/<ul aria-label="Abas de [^"]*"[^>]*>([\s\S]*?)<\/ul>/.exec(c)?.[1] ?? '').matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({ rotulo: m[2], href: m[1] }));
const texto = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('UX.9 · hub: um card por área, nunca uma ação', () => {
  it('Dono: "Em uso" tem exatamente 7 cards de área e "Chegam nas próximas fases" some (3.4: nenhum futuro)', () => {
    const h = html(DONO);
    const uso = cartoes(secao(h, 'Em uso'));
    expect(uso).toHaveLength(7);
    uso.forEach((c, n) => {
      expect(texto(c)).toContain(AREAS[n]);
      expect(c).toMatch(/<a [^>]*href="\/erp\//);
    });
    const futuros = cartoes(secao(h, 'Chegam nas próximas fases'));
    expect(futuros).toHaveLength(0);
    expect(h).not.toContain('Chegam nas próximas fases');
    futuros.forEach((c, n) => {
      expect(texto(c)).toContain(FUTUROS[n]);
      expect(c).not.toContain('href=');
      expect(c).toContain('aria-disabled="true"');
      expect(texto(c)).toContain('Em breve');
    });
  });

  it('o card é a entrada da área: leva à primeira aba permitida', () => {
    const uso = cartoes(secao(html(DONO), 'Em uso')).map((c) => /href="([^"]+)"/.exec(c)![1]);
    expect(uso).toEqual(['/erp/insumos', '/erp/compras', '/erp/estoque', '/erp/producao/lista', '/erp/etiquetas', '/erp/faturamento', '/erp/lojas']);
    // Sem "ver insumos", a entrada de Cadastros é a ficha.
    const semInsumos = cartoes(secao(html(proprio(['fichas.ver'])), 'Em uso')).map((c) => /href="([^"]+)"/.exec(c)![1]);
    expect(semInsumos[0]).toBe('/erp/fichas');
  });

  it('nenhum card, em nenhum papel, tem rótulo de ação ou de aba solta como NOME', () => {
    const proibidos = [...ACOES, 'Fornecedores', 'Contagens', 'Requisições'];
    for (const a of [DONO, GERENTE, GERENTE_N3, OPERADOR]) {
      for (const c of cartoes(secao(html(a), 'Em uso'))) {
        // O nome do card (o título, link principal) nunca é uma ação nem uma aba: é uma das áreas.
        const nome = nomeDoCartao(c);
        expect(AREAS, nome).toContain(nome);
        expect(proibidos, nome).not.toContain(nome);
      }
    }
  });

  it('o card mostra nome, descrição e as abas permitidas, cada uma um link próprio; sem número, R$ nem %', () => {
    const uso = cartoes(secao(html(OPERADOR), 'Em uso'));
    expect(uso).toHaveLength(5);
    const t = uso.map(texto);
    expect(t[0]).toContain('Cadastros e Cardápio');
    expect(t[0]).toContain('Do insumo à ficha técnica e ao preço de venda');
    expect(abasDoCartao(uso[0]).map((a) => a.rotulo)).toEqual(['Insumos', 'Fichas técnicas']);
    expect(abasDoCartao(uso[1]).map((a) => a.rotulo)).toEqual(['Visão geral', 'Contagens', 'Requisições', 'Consumo e conciliação']);
    expect(t[0]).not.toContain('Precificação');
    expect(t[1]).not.toContain('Divergências');
    for (const x of cartoes(secao(html(DONO), 'Em uso')).map(texto)) expect(x).not.toMatch(/R\$|%|\d/);
  });

  it('as abas do card levam direto à aba (Contagens → /estoque/contagens) e o título leva à primeira; nunca link dentro de link', () => {
    const uso = cartoes(secao(html(DONO), 'Em uso'));
    const estoque = uso[2];
    expect(abasDoCartao(estoque)).toEqual([
      { rotulo: 'Visão geral', href: '/erp/estoque' },
      { rotulo: 'Contagens', href: '/erp/estoque/contagens' },
      { rotulo: 'Requisições', href: '/erp/estoque/requisicoes' },
      { rotulo: 'Divergências', href: '/erp/estoque/divergencias' },
      { rotulo: 'Consumo e conciliação', href: '/erp/estoque/relatorios/consumo' },
    ]);
    expect(/href="([^"]+)"/.exec(estoque)![1]).toBe('/erp/estoque');
    for (const c of uso) {
      // Abre e fecha de um em um: o título fecha antes de a primeira aba abrir.
      expect(c.indexOf('</a>')).toBeLessThan(c.indexOf('<a ', c.indexOf('<a ') + 1));
      let fundo = 0;
      for (const m of c.matchAll(/<(\/?)a[ >]/g)) {
        fundo += m[1] ? -1 : 1;
        expect(fundo).toBeLessThanOrEqual(1);
      }
      expect(c).toContain('aria-label="Abas de ');
    }
  });

  it('o resumo do seletor de área é curto (não corta no menu de 232 px) e existe em toda área', () => {
    for (const m of modulosDoParceiro(DONO).filter((x) => x.href)) {
      expect(m.resumo, m.nome).toBeTruthy();
      expect(m.resumo!.length, m.resumo).toBeLessThanOrEqual(20);
    }
    for (const m of navegacaoDoNivel1().modulos) expect(m.resumo!.length, m.nome).toBeLessThanOrEqual(20);
  });

  it('Operador não vê a área Compras no hub; perfil sem aba de uma área não a vê', () => {
    expect(texto(secao(html(OPERADOR), 'Em uso'))).not.toContain('Compras e Fornecedores');
    expect(texto(secao(html(proprio(['lojas.ver'])), 'Em uso'))).not.toContain('Cadastros e Cardápio');
    expect(secao(html(proprio(['lojas.ver'])), 'Chegam nas próximas fases')).toBe('');
  });

  it('nível 1 dentro do parceiro: mesmos 7 cards, sob a base dele, com Cadastro do parceiro em Rede e Equipe', () => {
    const h = html(ALCANCE_FLOWFOODS, '/rodolfo/erp/valentins');
    const uso = cartoes(secao(h, 'Em uso'));
    expect(uso).toHaveLength(7);
    expect(uso.map((c) => /href="([^"]+)"/.exec(c)![1])).toEqual([
      '/rodolfo/erp/valentins/insumos',
      '/rodolfo/erp/valentins/compras',
      '/rodolfo/erp/valentins/estoque',
      '/rodolfo/erp/valentins/producao/lista',
      '/rodolfo/erp/valentins/etiquetas',
      '/rodolfo/erp/valentins/faturamento',
      '/rodolfo/erp/valentins/lojas',
    ]);
    expect(texto(uso[6])).toContain('Cadastro do parceiro');
    expect(texto(uso[6])).not.toContain('Seu acesso');
  });
});

// ---------------------------------------------------------------- itemAtivo em rota profunda
const LOJA = 'cl0ja';
const ROTAS_ATIVAS: [string, string][] = [
  ['/insumos', 'Insumos'],
  ['/insumos/novo', 'Insumos'],
  ['/insumos/i1', 'Insumos'],
  ['/insumos/i1/editar', 'Insumos'],
  ['/insumos/i1/embalagens/nova', 'Insumos'],
  ['/insumos/i1/embalagens/v1', 'Insumos'],
  ['/fichas', 'Fichas técnicas'],
  ['/fichas/nova', 'Fichas técnicas'],
  ['/fichas/importar', 'Fichas técnicas'],
  ['/fichas/f1', 'Fichas técnicas'],
  ['/fichas/f1/editar', 'Fichas técnicas'],
  ['/fichas/f1/canais', 'Fichas técnicas'],
  ['/fichas/canais', 'Precificação'],
  ['/compras', 'Compras'],
  ['/compras/nova', 'Compras'],
  ['/compras/n1', 'Compras'],
  ['/compras/n1/editar', 'Compras'],
  ['/compras/fornecedores', 'Fornecedores'],
  ['/compras/fornecedores/novo', 'Fornecedores'],
  ['/compras/fornecedores/f1', 'Fornecedores'],
  ['/compras/fornecedores/f1/editar', 'Fornecedores'],
  ['/estoque', 'Visão geral'],
  [`/estoque/${LOJA}`, 'Visão geral'],
  [`/estoque/${LOJA}/abertura`, 'Visão geral'],
  [`/estoque/${LOJA}/abertura/conferir`, 'Visão geral'],
  ['/estoque/contagens', 'Contagens'],
  [`/estoque/${LOJA}/periodo`, 'Contagens'],
  [`/estoque/${LOJA}/contagens/nova`, 'Contagens'],
  [`/estoque/${LOJA}/contagens/c1`, 'Contagens'],
  [`/estoque/${LOJA}/contagens/c1/conferir`, 'Contagens'],
  ['/estoque/requisicoes', 'Requisições'],
  [`/estoque/${LOJA}/requisicoes`, 'Requisições'],
  [`/estoque/${LOJA}/requisicoes/nova`, 'Requisições'],
  [`/estoque/${LOJA}/requisicoes/r1`, 'Requisições'],
  [`/estoque/${LOJA}/requisicoes/r1/atender`, 'Requisições'],
  ['/estoque/divergencias', 'Divergências'],
  [`/estoque/${LOJA}/divergencias`, 'Divergências'],
  ['/lojas', 'Lojas e marcas'],
  ['/equipe', 'Equipe'],
  ['/historico', 'Histórico'],
  ['/faturamento', 'Faturamento'],
  ['/faturamento/lancar', 'Faturamento'],
  ['/faturamento/importar', 'Faturamento'],
  [`/faturamento/${LOJA}/2026-10-14`, 'Faturamento'],
  // 2.2a: a área ganhou Despesas, DRE, Períodos e Plano de contas (2.2b: Plano e metas); rota funda acende a aba mais específica.
  ['/dre', 'DRE'],
  ['/dre/despesas', 'Despesas'],
  ['/dre/despesas/nova', 'Despesas'],
  ['/dre/despesas/d1', 'Despesas'],
  ['/dre/despesas/d1/editar', 'Despesas'],
  ['/dre/periodos', 'Períodos'],
  ['/dre/plano', 'Plano e metas'],
  // I.2a: o CMV por categoria e as metas por categoria têm aba própria.
  ['/dre/cmv-categorias', 'CMV por categoria'],
  ['/dre/metas-categorias', 'Metas por categoria'],
  // 2.2b: o período e o fechamento dele acendem a aba Períodos.
  ['/dre/periodos/2026-10-01', 'Períodos'],
  // 3.1: a produção — o quadro da loja, o planejamento, o lote e a conclusão acendem a aba Lotes (a trilha não repete "Produção › Produção").
  ['/producao', 'Lotes'],
  ['/producao/nova', 'Lotes'],
  [`/producao/${LOJA}`, 'Lotes'],
  [`/producao/${LOJA}/nova`, 'Lotes'],
  [`/producao/${LOJA}/o1`, 'Lotes'],
  [`/producao/${LOJA}/o1/concluir`, 'Lotes'],
  // 3.2: a lista do dia (a entrada e a de uma loja) acende a aba dela, não a de Lotes.
  ['/producao/lista', 'Lista do dia'],
  [`/producao/lista/${LOJA}`, 'Lista do dia'],
  // 3.3: as tarefas da cozinha, o histórico e os indicadores da produção acendem as abas deles (não a de Lotes).
  ['/producao/tarefas', 'Tarefas'],
  [`/producao/tarefas/${LOJA}`, 'Tarefas'],
  // Polimento da 3.3: quem chega ao Concluir pelas Tarefas continua na aba Tarefas.
  [`/producao/tarefas/${LOJA}/o1/concluir`, 'Tarefas'],
  ['/producao/historico', 'Histórico'],
  [`/producao/historico/${LOJA}`, 'Histórico'],
  ['/producao/indicadores', 'Indicadores'],
  [`/producao/indicadores/${LOJA}`, 'Indicadores'],
  // 3.4: Etiquetas. A loja, o lote, a emissão e o papel acendem Imprimir; a abertura acende Abrir embalagem.
  ['/etiquetas', 'Imprimir'],
  [`/etiquetas/${LOJA}`, 'Imprimir'],
  [`/etiquetas/${LOJA}/lote/o1`, 'Imprimir'],
  [`/etiquetas/${LOJA}/e1`, 'Imprimir'],
  [`/etiquetas/${LOJA}/e1/papel`, 'Imprimir'],
  ['/etiquetas/abrir', 'Abrir embalagem'],
  [`/etiquetas/${LOJA}/abrir`, 'Abrir embalagem'],
  [`/etiquetas/${LOJA}/aberta/a1`, 'Abrir embalagem'],
  ['/etiquetas/historico', 'Histórico'],
  [`/etiquetas/historico/${LOJA}`, 'Histórico'],
  ['/etiquetas/impressora', 'Impressora'],
  // O lote do fornecedor mora na nota (Compras).
  ['/compras/n1/lotes', 'Compras'],
];

describe('UX.9 · itemAtivo acende a aba certa em cada rota profunda', () => {
  const nav = navegacaoDoParceiro(DONO);
  it.each(ROTAS_ATIVAS)('/erp%s → %s', (rota, aba) => {
    expect(itemAtivo(nav, `/erp${rota}`)?.item.rotulo).toBe(aba);
  });

  it('o mesmo vale sob /rodolfo/erp/<slug> (nível 1), com a área dentro de Parceiros Flow', () => {
    const n1 = comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/v/insumos', [{ slug: 'v', nome: 'V' }]);
    for (const [rota, aba] of ROTAS_ATIVAS) {
      const a = itemAtivo(n1, `/rodolfo/erp/v${rota}`);
      expect(a?.item.rotulo, rota).toBe(aba);
      expect(a?.modulo.chave, rota).toBe('parceiros');
    }
    expect(itemAtivo(n1, '/rodolfo/erp/v/cadastro')?.item.rotulo).toBe('Cadastro do parceiro');
    expect(itemAtivo(n1, '/rodolfo/erp/v')?.item.rotulo).toBe('Áreas da Rede');
  });

  it('o hub e a página de "Seu acesso": hub não acende aba; Seu acesso acende a dele', () => {
    expect(itemAtivo(nav, '/erp')).toBeNull();
    expect(itemAtivo(nav, '/erp/acesso')?.item.rotulo).toBe('Seu acesso');
  });

  it('TODA página do /erp e do espelho do nível 1 acende uma aba (nenhuma rota fica sem lugar no menu)', () => {
    const paginas = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? paginas(p) : n === 'page.tsx' ? [p] : [];
      });
    const rota = (arquivo: string, raiz: string) =>
      '/' + arquivo.slice(raiz.length + 1).split('/').slice(0, -1).map((s) => (s.startsWith('[') ? 'x' : s)).join('/');
    const nivel1 = comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/v/insumos', [{ slug: 'v', nome: 'V' }]);
    const parceiro = join('src', 'app', 'erp');
    for (const f of paginas(parceiro)) {
      const r = `/erp${rota(f, parceiro) === '/' ? '' : rota(f, parceiro)}`;
      if (r === '/erp') continue; // o hub
      expect(itemAtivo(nav, r), r).not.toBeNull();
    }
    const espelho = join('src', 'app', 'rodolfo', '(painel)', 'erp', '[slug]');
    for (const f of paginas(espelho)) {
      const r = rota(f, espelho);
      if (r === '/') continue; // o hub do parceiro
      expect(itemAtivo(nivel1, `/rodolfo/erp/v${r}`), r).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------- URLs: nenhuma antiga some; a nova existe nos dois níveis
describe('UX.9 · URLs antigas continuam, e a única rota nova existe no /erp e no espelho do nível 1', () => {
  const ANTIGAS = [
    '/insumos', '/insumos/novo', '/fichas', '/fichas/nova', '/fichas/importar', '/fichas/canais',
    '/compras', '/compras/nova', '/compras/fornecedores', '/compras/fornecedores/novo',
    '/estoque', '/estoque/requisicoes', '/estoque/divergencias',
    '/lojas', '/equipe', '/historico',
  ];
  const profundas = [
    '/insumos/[id]', '/insumos/[id]/editar', '/fichas/[id]', '/fichas/[id]/canais', '/compras/[id]', '/compras/[id]/editar',
    '/compras/fornecedores/[id]', '/estoque/[lojaId]', '/estoque/[lojaId]/periodo', '/estoque/[lojaId]/abertura',
    '/estoque/[lojaId]/contagens/nova', '/estoque/[lojaId]/requisicoes', '/estoque/[lojaId]/divergencias',
  ];
  const parceiro = (r: string) => join('src', 'app', 'erp', ...r.split('/').filter(Boolean), 'page.tsx');
  const espelho = (r: string) => join('src', 'app', 'rodolfo', '(painel)', 'erp', '[slug]', ...r.split('/').filter(Boolean), 'page.tsx');

  it.each([...ANTIGAS, ...profundas, '/estoque/contagens', '/estoque/relatorios/consumo', '/compras/orcamento', '/compras/recebidas', '/compras/recebidas/importar', '/compras/relatorios/insumo', '/compras/relatorios/periodo', '/compras/relatorios/comparar-fornecedores', '/compras/relatorios/comparar-periodos', '/insumos/categorias', '/insumos/classificar',
    // 3.4: Etiquetas e o lote do fornecedor na nota.
    '/etiquetas', '/etiquetas/abrir', '/etiquetas/historico', '/etiquetas/impressora', '/etiquetas/[lojaId]', '/etiquetas/[lojaId]/lote/[ordemId]',
    '/etiquetas/[lojaId]/abrir', '/etiquetas/[lojaId]/aberta/[aberturaId]', '/etiquetas/[lojaId]/[etiquetaId]', '/etiquetas/[lojaId]/[etiquetaId]/papel',
    '/etiquetas/historico/[lojaId]', '/compras/[id]/lotes'])('%s existe no /erp e no nível 1', (r) => {
    expect(existsSync(parceiro(r)), `/erp${r}`).toBe(true);
    expect(existsSync(espelho(r)), `/rodolfo/erp/<slug>${r}`).toBe(true);
  });

  it('/estoque/contagens exige "ver o estoque" no servidor, nos dois níveis (e o nível 1 pela mesma porta do parceiro)', () => {
    const a = readFileSync(parceiro('/estoque/contagens'), 'utf8');
    expect(a).toMatch(/exigirPermissaoNaPagina\(ctx, 'estoque\.ver'\)/);
    const b = readFileSync(espelho('/estoque/contagens'), 'utf8');
    expect(b).toMatch(/exigirParceiro\(params\.slug\)/);
    expect(b).toMatch(/exigirPermissao\(ctx, 'estoque\.ver'\)/);
  });

  it('não há rota de "visão geral de área" (/erp/cadastros, /erp/rede...): a entrada da área é a primeira aba', () => {
    for (const nome of ['cadastros', 'cardapio', 'areas', 'rede', 'movimentacoes', 'fornecedores']) {
      expect(existsSync(join('src', 'app', 'erp', nome)), nome).toBe(false);
    }
  });

  it('as abas e as ações nascem de modulos.ts: nenhuma rota nova além de /estoque/contagens, das categorias e da classificação (I.1a) e das das fases 2.1, 2.2a, 2.5, 3.1, 3.2, 3.3 e 3.4 (faturamento, DRE, despesas, orçamento, produção, a lista do dia, as tarefas, o histórico e os indicadores da produção, as etiquetas)', () => {
    const todas = [...emUso(DONO)].flatMap((m) => [...m.grupos.flatMap((g) => g.itens), ...m.acoes]).map((i) => i.href.replace('/erp', ''));
    const novas = todas.filter((r) => !ANTIGAS.includes(r) && r !== '/acesso');
    // 2.5: o orçamento de compra é aba da área Compras.
    // F4: Categorias e Classificar saíram do menu (painel ao lado da lista); as páginas continuam (teste acima).
    expect(novas).toEqual(['/compras/recebidas', '/compras/orcamento', '/compras/relatorios/insumo', '/compras/relatorios/periodo', '/compras/relatorios/comparar-fornecedores', '/compras/relatorios/comparar-periodos', '/compras/recebidas/importar', '/estoque/contagens', '/estoque/relatorios/consumo', '/producao/lista', '/producao/tarefas', '/producao', '/producao/historico', '/producao/indicadores', '/producao/nova', '/etiquetas', '/etiquetas/abrir', '/etiquetas/historico', '/etiquetas/impressora', '/faturamento', '/dre/despesas', '/dre', '/dre/cmv-categorias', '/dre/periodos', '/dre/plano', '/dre/metas-categorias', '/faturamento/lancar', '/faturamento/importar', '/dre/despesas/nova']);
  });
});

// ---------------------------------------------------------------- abas e trilha
describe('UX.9 · abas (nav com nome acessível, aria-current) e trilha', () => {
  const nav = navegacaoDoParceiro(DONO);
  const marcado = (rota: string) => {
    const ativo = itemAtivo(nav, rota);
    const r = abasDaArea(nav, ativo)!;
    return renderToStaticMarkup(
      createElement(Abas, { rotulo: `Seções de ${r.area}`, abas: r.abas.map((a) => ({ href: a.href, rotulo: a.rotulo, ativa: a.href === ativo!.item.href })) }),
    );
  };

  it('a barra de abas é <nav aria-label="Seções de …"> e só a aba atual leva aria-current="page"', () => {
    const h = marcado('/erp/estoque/cl0ja/periodo');
    expect(h).toMatch(/^<nav aria-label="Seções de Estoque e Movimentações"/);
    expect((h.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(h).toMatch(/<a [^>]*aria-current="page"[^>]*>Contagens<\/a>/);
    expect(h).not.toContain('role="tablist"');
    expect((h.match(/<a /g) ?? []).length).toBe(5);
  });

  it('as abas saem das mesmas abas do menu, na mesma ordem (nunca divergem)', () => {
    for (const m of emUso(DONO)) {
      const doMenu = m.grupos.flatMap((g) => g.itens.map((i) => i.href));
      const barra = abasDaArea(nav, { item: m.grupos[0].itens[0] });
      // Uma aba sozinha (Faturamento e DRE, 2.1) não vira barra: o menu e o hub levam a ela.
      if (doMenu.length < 2) expect(barra, m.nome).toBeNull();
      else expect(barra!.abas.map((a) => a.href), m.nome).toEqual(doMenu);
    }
  });

  it('uma aba sozinha não vira barra de abas; fora de área (Comercial, lista de parceiros) não há abas', () => {
    const so = navegacaoDoParceiro(proprio(['lojas.ver']));
    expect(abasDaArea(so, itemAtivo(so, '/erp/acesso'))).not.toBeNull(); // Lojas + Seu acesso
    const um = navegacaoDoParceiro(proprio([]));
    expect(abasDaArea(um, itemAtivo(um, '/erp/acesso'))).toBeNull();
    const n1 = navegacaoDoNivel1();
    expect(abasDaArea(n1, itemAtivo(n1, '/rodolfo/leads'))).toBeNull();
    expect(abasDaArea(n1, itemAtivo(n1, '/rodolfo/erp'))).toBeNull();
  });

  it('no nível 1 as abas da área saem do grupo do parceiro (Cadastro do parceiro entra em Rede e Equipe)', () => {
    const n1 = comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/v/lojas', [{ slug: 'v', nome: 'V' }]);
    const r = abasDaArea(n1, itemAtivo(n1, '/rodolfo/erp/v/lojas'))!;
    expect(r.area).toBe('Rede e Equipe');
    expect(r.abas.map((a) => a.rotulo)).toEqual(['Lojas e marcas', 'Equipe', 'Histórico', 'Cadastro do parceiro', 'Custo médio por loja']);
  });

  it('trilha: /erp/insumos/novo = Início › Cadastros e Cardápio › Insumos › Novo insumo, com a área e a aba como links', () => {
    const ativo = itemAtivo(nav, '/erp/insumos/novo');
    expect(montarTrilha(ativo, [{ rotulo: 'Novo insumo' }])).toEqual([
      { rotulo: 'Cadastros e Cardápio', href: '/erp/insumos' },
      { rotulo: 'Insumos', href: '/erp/insumos' },
      { rotulo: 'Novo insumo' },
    ]);
    // Sem passo extra, a aba é a página atual (não é link).
    expect(montarTrilha(itemAtivo(nav, '/erp/compras'), [])).toEqual([
      { rotulo: 'Compras e Fornecedores', href: '/erp/compras' },
      { rotulo: 'Compras', href: undefined },
    ]);
    expect(montarTrilha(null, [{ rotulo: 'x' }])).toEqual([{ rotulo: 'x' }]);
  });

  it('trilha do nível 1 continua Parceiros Flow › aba', () => {
    const n1 = comParceiroAtual(navegacaoDoNivel1(), '/rodolfo/erp/v/insumos', [{ slug: 'v', nome: 'V' }]);
    expect(montarTrilha(itemAtivo(n1, '/rodolfo/erp/v/insumos'), []).map((p) => p.rotulo)).toEqual(['Parceiros Flow', 'Insumos']);
  });
});

// ---------------------------------------------------------------- guardas estáticas
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('UX.9 · guardas estáticas', () => {
  const tsx = arquivos('src').filter((f) => f.endsWith('.tsx'));

  it('cada cabeçalho (PageHeader) tem no máximo 1 botão primário', () => {
    const excesso: string[] = [];
    for (const f of tsx) {
      const t = readFileSync(f, 'utf8');
      let i = 0;
      while ((i = t.indexOf('<PageHeader', i)) >= 0) {
        let d = 0;
        let fim = t.length;
        for (let j = i; j < t.length; j++) {
          const c = t[j];
          if (c === '{') d++;
          else if (c === '}') d--;
          else if (c === '>' && d === 0 && t[j - 1] !== '=') {
            fim = j;
            break;
          }
        }
        const primarios = (t.slice(i, fim).match(/primario/g) ?? []).length;
        if (primarios > 1) excesso.push(`${f}@${i}: ${primarios}`);
        i = fim;
      }
    }
    expect(excesso).toEqual([]);
  });

  it('as abas moram em src/components/erp/ui/abas.tsx e o shell as usa (não há outro componente de abas)', () => {
    expect(existsSync(join('src', 'components', 'erp', 'ui', 'abas.tsx'))).toBe(true);
    expect(existsSync(join('src', 'app', 'erp', 'abas.tsx'))).toBe(false);
    expect(readFileSync(join('src', 'components', 'erp', 'shell', 'Shell.tsx'), 'utf8')).toMatch(/<Abas\b/);
  });

  it('a busca do ⌘K não seleciona custo, preço nem margem (achar não mostra dinheiro)', () => {
    for (const [arquivo, funcao] of [
      [join('src', 'lib', 'erp', 'insumos.ts'), 'buscarInsumos'],
      [join('src', 'lib', 'erp', 'fichas.ts'), 'buscarFichas'],
    ]) {
      const t = readFileSync(arquivo, 'utf8');
      const ini = t.indexOf(`export async function ${funcao}`);
      expect(ini, funcao).toBeGreaterThan(-1);
      const corpo = t.slice(ini, t.indexOf('\n}\n', ini));
      expect(corpo, funcao).not.toMatch(/custo|preco|preço|margem|frete|Centavos/i);
    }
  });

  it('a navegação por áreas não usa rótulo de ação como card nem como aba (Novo…, Lançar…, Importar…)', () => {
    for (const a of [DONO, GERENTE, OPERADOR]) {
      const abas = modulosDoParceiro(a).flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => i.rotulo)));
      for (const r of ACOES) expect(abas).not.toContain(r);
    }
  });

  it('nenhuma tela declara na trilha o mesmo rótulo da aba em que já está (o "Fornecedores" repetido não volta)', () => {
    const abas = new Set(
      emUso(DONO)
        .flatMap((m) => m.grupos.flatMap((g) => g.itens.map((i) => i.rotulo)))
        .concat(['Início']),
    );
    const repetidos: string[] = [];
    for (const f of tsx) {
      const t = readFileSync(f, 'utf8');
      for (const m of t.matchAll(/<TrilhaDaPagina itens=\{(.*)\} \/>/g)) {
        const primeiro = /rotulo: '([^']+)'/.exec(m[1]);
        if (primeiro && abas.has(primeiro[1])) repetidos.push(`${f}: ${primeiro[1]}`);
      }
    }
    expect(repetidos).toEqual([]);
  });

  it('o título da tela é o da aba (Compras, Visão geral, Precificação)', () => {
    const lista = readFileSync(join('src', 'components', 'erp', 'telas', 'compras', 'lista-notas.tsx'), 'utf8');
    expect(lista).toMatch(/titulo="Compras"/);
    const estoque = readFileSync(join('src', 'components', 'erp', 'telas', 'estoque', 'situacao.tsx'), 'utf8');
    expect(estoque).toMatch(/titulo="Visão geral"/);
    const canais = readFileSync(join('src', 'components', 'erp', 'telas', 'fichas', 'canais.tsx'), 'utf8');
    expect(canais).toMatch(/titulo="Precificação"/);
  });

  it('"Margem de cada prato" só aparece com "ver fichas" (o atalho leva à lista de fichas, que recusaria)', () => {
    const canais = readFileSync(join('src', 'components', 'erp', 'telas', 'fichas', 'canais.tsx'), 'utf8');
    expect(canais).toMatch(/podeVerFichas \? \(\s*<Link href=\{`\$\{base\}\?tipo=PRATO`\}/);
    expect(readFileSync(join('src', 'app', 'erp', 'fichas', 'canais', 'page.tsx'), 'utf8')).toMatch(/podeVerFichas=\{pode\(ctx\.alcance, 'fichas\.ver'\)\}/);
  });

  it('o texto do destino de quem abre tela fora do acesso diz "Áreas da Rede" (contexto.ts)', () => {
    expect(readFileSync(join('src', 'lib', 'erp', 'contexto.ts'), 'utf8')).not.toContain('Módulos da Rede');
  });

  it('as telas de ação declaram a própria trilha (eram itens do menu e perderam o rótulo)', () => {
    const exige: [string, RegExp][] = [
      [join('src', 'components', 'erp', 'telas', 'insumos', 'paginas.tsx'), /rotulo: 'Novo insumo'/],
      [join('src', 'components', 'erp', 'telas', 'fichas', 'paginas.tsx'), /rotulo: 'Nova ficha'/],
      [join('src', 'components', 'erp', 'telas', 'fichas', 'paginas.tsx'), /rotulo: 'Importar planilha'/],
      [join('src', 'components', 'erp', 'telas', 'compras', 'paginas.tsx'), /rotulo: 'Lançar nota'/],
      [join('src', 'components', 'erp', 'telas', 'compras', 'paginas.tsx'), /rotulo: 'Novo fornecedor'/],
    ];
    for (const [f, re] of exige) expect(readFileSync(f, 'utf8'), `${f} ${re}`).toMatch(re);
  });
});
