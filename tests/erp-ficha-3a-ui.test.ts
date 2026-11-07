/** Render dos contratos de formulário/filtro/retorno. Interação e foco têm QA de navegador separado. */
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassificacaoDaFicha } from '@/lib/erp/ficha-secoes-campos';
import type { ValoresDaFicha } from '@/components/erp/telas/fichas/form-ficha';

const estado = vi.hoisted(() => ({ rascunho: null as ValoresDaFicha | null, erros: null as { ok: false; vez: number; erros: Record<string, string> } | null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/erp/fichas/fichaA/editar', useSearchParams: () => new URLSearchParams(), redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('react-dom', async (orig) => ({ ...(await orig<typeof import('react-dom')>()), useFormState: () => [estado.erros, undefined], useFormStatus: () => ({ pending: false }) }));
vi.mock('@/components/erp/telas/cadastro/rascunho', async (orig) => ({ ...(await orig<typeof import('@/components/erp/telas/cadastro/rascunho')>()), useRascunhoDaTela: () => ({ valores: estado.rascunho, chave: 'teste', descartar: vi.fn(), versaoMudou: false, insumoCriado: null }) }));

import { FormFicha } from '@/components/erp/telas/fichas/form-ficha';
import { CamposDeClassificacao, type ContextoClassificacao } from '@/components/erp/telas/fichas/campos-classificacao';
import { FiltrosDasFichas } from '@/components/erp/telas/fichas/filtros';
import { TelaFormFicha } from '@/components/erp/telas/fichas/paginas';
import { FormEmbalagens } from '@/components/erp/telas/fichas/form-embalagens';
import { concluirEtapaDaFicha } from '@/components/erp/telas/fichas/continuar';
import { TextoClassificacao } from '@/components/erp/telas/fichas/texto-classificacao';
import { TelaListaFichas, type LinhaNaTela } from '@/components/erp/telas/fichas/lista';
import { classificacaoParaCampos, classificacaoVazia } from '@/lib/erp/ficha-secoes-campos';
import { deSeguroDaFicha, lerFiltrosDeFicha, type FiltroDoCmv } from '@/lib/erp/ficha-campos';

const atual: ClassificacaoDaFicha = { secao: { id: 'secaoA', nome: 'Pratos da casa', ativa: false, versao: 'v1' }, subsecao: { id: 'subA', secaoId: 'secaoA', nome: 'Assados', ativa: true, secaoAtiva: false, versao: 'v1' } };
const contexto: ContextoClassificacao = {
  atual, secoesIniciais: { itens: [], selecionados: [{ nivel: 'secao', registro: atual.secao! }], proximoCursor: null },
  subsecoesIniciais: { itens: [], selecionados: [{ nivel: 'subsecao', registro: atual.subsecao! }], proximoCursor: null },
  buscar: async () => ({ ok: true, pagina: { itens: [], selecionados: [], proximoCursor: null } }), gerir: async () => null,
};
const inicial: ValoresDaFicha = { nome: 'Receita preenchida', descricao: 'Descrição preservada', tipo: 'PRATO', modoPreparo: '', passos: ['Misturar', 'Assar'], rendimento: '2', rendimentoUnidade: 'porcao', itens: [{ escolha: 'arroz', quantidade: '100', unidade: 'g', fator: '1,2' }], validades: null, consumoImediato: true, classificacao: classificacaoParaCampos(atual) };
const props: ComponentProps<typeof FormFicha> = { acao: async () => null, modo: 'editar', base: '/erp/fichas', aqui: '/erp/fichas/fichaA/editar', cancelar: '/erp/fichas/fichaA', opcoes: [{ id: 'arroz', nome: 'Arroz', unidade: 'KG', ativo: true, custo: null, categoria: null }], verCustos: false, inicial, classificacao: contexto, versao: 'v1' };
const render = (p: Partial<typeof props> = {}) => renderToStaticMarkup(createElement(FormFicha, { ...props, ...p }));
const campo = (html: string, nome: string) => [...html.matchAll(/<input\b[^>]*>/g)].find(([s]) => s.includes(`name="${nome}"`))?.[0];

beforeEach(() => { estado.rascunho = null; estado.erros = null; });

describe('3A formulário e rascunho', () => {
  it('vínculo arquivado continua visível e vai por ID; classificação não exige custos', () => {
    const h = render();
    expect(campo(h, 'secaoId')).toContain('value="secaoA"');
    expect(campo(h, 'subsecaoId')).toContain('value="subA"');
    expect(h).toContain('Pratos da casa · arquivada');
    expect(h).toContain('Assados · arquivada');
    expect(h).toContain('Vínculo arquivado. Pode ser mantido nesta ficha.');
    expect(h).toContain('Gerenciar seções');
    expect(h).not.toMatch(/R\$|name="preco/);
    expect(h.match(/<form\b/g)).toHaveLength(1);
    expect(campo(h, 'classificacaoNoFormulario')).toContain('value="sim"');
  });
  it('rascunho antigo herda classificação inicial sem apagar nome, itens ou etapas recuperados', () => {
    const { classificacao: _omitida, ...antigo } = inicial;
    estado.rascunho = { ...antigo, nome: 'Nome no rascunho', passos: ['Etapa local'], itens: [{ escolha: 'arroz', quantidade: '250', unidade: 'g', fator: '1,3' }] };
    const h = render();
    expect(campo(h, 'nome')).toContain('Nome no rascunho');
    expect(campo(h, 'secaoId')).toContain('secaoA');
    expect(campo(h, 'subsecaoId')).toContain('subA');
    expect(h).toContain('Etapa local');
    expect(h).toContain('value="250"');
    expect(h).toContain('value="1,3"');
  });
  it('nomes novos ficam locais no mesmo formulário e sobrevivem a erro de salvamento', () => {
    estado.rascunho = { ...inicial, classificacao: { secao: { tipo: 'nova', nome: 'Vegetarianos' }, subsecao: { tipo: 'nova', nome: 'Grelhados' } } };
    estado.erros = { ok: false, vez: 1, erros: { secao: 'Já existe uma seção com este nome.' } };
    const h = render();
    expect(campo(h, 'secaoModo')).toContain('value="nova"');
    expect(campo(h, 'secaoNome')).toContain('Vegetarianos');
    expect(campo(h, 'subsecaoNome')).toContain('Grelhados');
    expect(campo(h, 'secaoId')).toBeUndefined();
    expect(h.match(/Será criada ao salvar a ficha/g)).toHaveLength(2);
    expect(h).toContain('Já existe uma seção com este nome.');
    expect(h).toContain('Receita preenchida');
    expect(h).toContain('Misturar');
    expect(h.match(/<form\b/g)).toHaveLength(1);
  });
  it('sem seção desabilita subseção; o componente de campos não cria outro form', () => {
    const h = renderToStaticMarkup(createElement(CamposDeClassificacao, { valor: classificacaoVazia(), aoMudar: vi.fn(), contexto, registros: [], excluidos: [], erros: {}, bloqueio: false, aoGerenciar: vi.fn() }));
    expect(h).not.toContain('<form');
    expect(h.match(/<input[^>]*id="ficha-subsecao"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(campo(h, 'subsecaoModo')).toContain('value="nenhuma"');
  });
});

describe('3A filtros e apresentação', () => {
  const filtros = lerFiltrosDeFicha({ cmv: ['IFOOD-acima', 'LOJA-dentro'], secao: 'secaoA', subsecao: 'subA', q: 'Prato' });
  it('CMV usa checkboxes por par, duas escolhas exatas e chips removíveis, sem controle de 3B', () => {
    const h = renderToStaticMarkup(createElement(FiltrosDasFichas, { base: '/erp/fichas', filtros }));
    const selecionados = [...h.matchAll(/<input\b[^>]*name="cmv"[^>]*>/g)].map(([s]) => s).filter((s) => s.includes('checked=""'));
    expect(selecionados).toHaveLength(2);
    expect(selecionados.join('')).toContain('value="IFOOD-acima"');
    expect(selecionados.join('')).toContain('value="LOJA-dentro"');
    expect(h).toContain('Comparação com a meta (2)');
    expect(h).toContain('Limpar comparação');
    expect(h).toContain('aria-label="Tirar');
    expect(h).not.toMatch(/<select[^>]*name="cmv"|faixaCmv|muito acima/i);
  });
  it('visão operacional oculta todos os controles financeiros mesmo com URL forjada', () => {
    const h = renderToStaticMarkup(createElement(FiltrosDasFichas, { base: '/erp/fichas', filtros: { ...filtros, incompleto: true }, verCustos: false }));
    expect(h).not.toMatch(/name="cmv"|name="custo"|Comparação com a meta|Comparações selecionadas/);
  });
  it('nomes arquivados são texto operacional com quebra de linha e sem métricas', () => {
    const h = renderToStaticMarkup(createElement(TextoClassificacao, { classificacao: atual }));
    expect(h).toContain('break-words'); expect(h).toContain('Pratos da casa'); expect(h).toContain('Assados');
    expect(h.match(/\(arquivada\)/g)).toHaveLength(2); expect(h).not.toMatch(/R\$|CMV|custo/);
  });
  it('tabela compacta conserva rendimento, custo total e pares correspondentes sem depender das colunas largas', () => {
    const total = { num: 1800n, den: 1n }, porRendimento = { num: 900n, den: 1n };
    const linha: LinhaNaTela = { id: 'fichaA', nome: 'Nome de classificação e ficha muito longo', tipo: 'PRATO', descricao: null, rendimentoMilesimos: 2000, unidadeRendimento: 'UN', ativa: true, foto: null, itens: 1, preparos: 0, validades: null, consumoImediato: true, classificacao: atual, custo: { total, porRendimento, itens: [total], semPreco: [], preparosIncompletos: [], faltaPreco: [] } };
    const h = renderToStaticMarkup(createElement(TelaListaFichas, { base: '/erp/fichas', filtros, linhas: [linha], total: 1, pagina: 1, paginas: 1, acoes: true, correspondenciasCmv: new Map<string, FiltroDoCmv[]>([['fichaA', [{ canal: 'IFOOD', status: 'acima' }]]]) })).replace(/\s/g, ' ');
    const tabela = h.slice(h.indexOf('<table'));
    expect(tabela).toContain('<span class="2xl:hidden"> · rende 2 porções</span>');
    expect(tabela).toContain('Receita: R$ 18,00');
    expect(tabela).toContain('R$ 9,00');
    expect(tabela).toContain('Corresponde: iFood · acima da meta.');
    expect(tabela).toContain('aria-label="Editar Nome de classificação e ficha muito longo"');
    expect(tabela).not.toContain('overflow-hidden');
  });
});

describe('3A retorno por embalagens/preços em ERP e N1', () => {
  const de = deSeguroDaFicha('q=Prato&cmv=IFOOD-acima&cmv=LOJA-dentro&secao=secaoA&subsecao=subA&pagina=3');
  it.each(['/erp/fichas', '/rodolfo/erp/casa-a/fichas'])('nova ficha e cancelar preservam o recorte %s', (base) => {
    const h = renderToStaticMarkup(createElement(TelaFormFicha, { base, contexto: 'Casa', acao: async () => null, opcoes: [], preparos: [], verCustos: false, bloqueio: null, de, classificacao: contexto }));
    expect(h).toContain(`href="${base}?${de.replaceAll('&', '&amp;')}"`);
    expect(campo(h, 'de')).toContain(de.replaceAll('&', '&amp;'));
  });
  it.each(['/erp/fichas', '/rodolfo/erp/casa-a/fichas'])('continuação mantém de em embalagens e preços %s', (base) => {
    for (const etapa of ['embalagens', 'precos'] as const) {
      let destino = '';
      try { concluirEtapaDaFicha({ ok: true, id: 'fichaA', mudou: ['nome'] }, null, base, { mudou: 'salva' }, etapa, { de }); } catch (e) { destino = (e as Error).message.replace('REDIRECT:', ''); }
      const url = new URL(destino, 'http://local');
      expect(url.pathname).toBe(`${base}/fichaA${etapa === 'embalagens' ? '/canais' : ''}`);
      expect(url.searchParams.get('de')).toBe(de);
      if (etapa === 'precos') expect(url.searchParams.get('etapa')).toBe('precos');
    }
  });
  it('formulário de embalagens envia de e mantém cancelar, sem mudar os campos de custo', () => {
    const h = renderToStaticMarkup(createElement(FormEmbalagens, { acao: async () => null, aqui: '/erp/fichas/fichaA/canais', cancelar: `/erp/fichas/fichaA?de=${encodeURIComponent(de)}`, de, opcoes: [], inicial: [], impressao: 'v1', porcao: { num: '1000', den: '1' }, faltaPreco: [], podeConferirPrecos: true, bloqueio: null }));
    expect(campo(h, 'de')).toContain(de.replaceAll('&', '&amp;'));
    expect(h).toContain(`href="/erp/fichas/fichaA?de=${encodeURIComponent(de)}"`);
    expect(h).toContain('Salvar e conferir preços');
  });
});
