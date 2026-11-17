/**
 * INS-SALVAR-CONFIRMACAO (17/11/2026): no Novo insumo, o que foi digitado antes de o ERP ser atualizado com a tela aberta volta
 * preenchido depois de recarregar. Render dos componentes reais, sem banco e sem navegador (o caminho inteiro tem QA à parte).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';

const estado = vi.hoisted(() => ({ resposta: null as EstadoCadastro, rascunho: null as unknown, descartar: () => {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/erp/insumos/novo', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useActionState: () => [estado.resposta, () => {}] }));
vi.mock('@/components/erp/telas/cadastro/rascunho', async (original) => ({
  ...(await original<typeof import('@/components/erp/telas/cadastro/rascunho')>()),
  useRascunhoDaTela: () => ({ chave: 'parceiro:pessoa:/erp/insumos/novo', valores: estado.rascunho, versaoMudou: false, insumoCriado: null, fornecedorCriado: null, descartar: estado.descartar }),
}));
import { FormInsumo, INSUMO_NOVO, valoresDoFormulario } from '@/components/erp/telas/insumos/form-insumo';
import { FRASE_VERSAO_NOVA_COM_RASCUNHO } from '@/components/erp/telas/cadastro/anuncio';

const categorias = [
  { id: 'cat-emb', chave: 'EMBALAGENS', nome: 'Embalagens', ativa: true },
  { id: 'cat-outros', chave: 'OUTROS', nome: 'Outros / a classificar', ativa: true },
];
/** O que o formulário real envia (nomes dos campos da tela), como no relato: KRAFT 01, embalagem. */
const enviado = () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    envio: 'chave-da-abertura-antiga', nome: 'KRAFT 01', tipo: 'EMBALAGEM', categoriaId: 'cat-emb', marcaReferencia: 'Kraft Brasil',
    conservacao: 'SECO', aceita_SECO: 'on', validade_SECO: '30', validadeEm_SECO: 'dias', validadeNoFormulario: 'sim',
    unidade: 'UN', conteudo: '100', escala: 'base', preco: '45,90', frete: '5,00',
  })) f.set(k, v);
  return f;
};
const html = (props: Partial<Parameters<typeof FormInsumo>[0]> = {}) =>
  renderToStaticMarkup(createElement(FormInsumo, { acao: async () => null, modo: 'criar', base: '/erp/insumos', aqui: '/erp/insumos/novo', cancelar: '/erp/insumos', categorias, envio: 'chave-nova', ...props }));

beforeEach(() => { estado.resposta = null; estado.rascunho = null; });

describe('o que foi enviado vira valores do formulário', () => {
  it('o caso do relato volta inteiro, com o prazo lido pelo mesmo leitor do servidor', () => {
    expect(valoresDoFormulario(enviado())).toEqual({
      nome: 'KRAFT 01', tipo: 'EMBALAGEM', unidade: 'UN', categoriaId: 'cat-emb', conservacao: 'SECO', marcaReferencia: 'Kraft Brasil',
      validades: { principal: 'SECO', minutos: { SECO: 30 * 1440 } }, conteudo: '100', escala: 'base', preco: '45,90', semPreco: false, frete: '5,00',
    });
  });
  it('só volta o que a tela aceita: escolha fora da lista fica vazia, prazo inválido não volta, a chave do envio não volta', () => {
    const f = enviado();
    f.set('tipo', 'LIMPEZA'); f.set('unidade', 'CX'); f.set('conservacao', 'GELADEIRA'); f.set('validade_SECO', 'trinta');
    f.set('nome', 'x'.repeat(120)); f.set('semPreco', 'on'); f.set('escala', 'menor');
    const v = valoresDoFormulario(f);
    expect(v).toMatchObject({ tipo: INSUMO_NOVO.tipo, unidade: '', conservacao: '', validades: null, semPreco: true, escala: 'menor' });
    expect(v.nome).toHaveLength(80);
    expect(Object.keys(v)).not.toContain('envio');
    expect(valoresDoFormulario(new FormData())).toEqual({ ...INSUMO_NOVO });
  });
});

describe('Novo insumo: o rascunho volta preenchido, com aviso e saída', () => {
  it('com rascunho: os campos vêm preenchidos e o aviso diz que nada foi salvo ainda', () => {
    estado.rascunho = valoresDoFormulario(enviado());
    const h = html();
    expect(h).toContain('Recuperamos o que você tinha digitado antes de recarregar. Nada foi salvo ainda: confira e salve.');
    expect(h).toContain('Descartar e começar de novo');
    for (const valor of ['value="KRAFT 01"', 'value="Kraft Brasil"', 'value="100"', 'value="45,90"', 'value="5,00"', 'value="30"']) expect(h, valor).toContain(valor);
    expect(h).toMatch(/<option value="cat-emb" selected="">/);
    // A abertura nova tem a chave nova: a antiga não volta para o formulário.
    expect(h).toContain('name="envio" value="chave-nova"');
    expect(h).not.toContain('chave-da-abertura-antiga');
  });
  it('sem rascunho, ou ao editar: nada é recuperado nem anunciado', () => {
    expect(html()).not.toContain('Recuperamos');
    estado.rascunho = valoresDoFormulario(enviado());
    const editar = html({ modo: 'editar', versao: 'v1', inicial: { ...INSUMO_NOVO, nome: 'Farinha', tipo: 'INGREDIENTE', unidade: 'KG', categoriaId: 'cat-outros', conservacao: 'SECO' } });
    expect(editar).not.toContain('Recuperamos');
    expect(editar).toContain('value="Farinha"');
    expect(editar).not.toContain('KRAFT 01');
  });
  it('o envio que encontra o ERP atualizado mostra a frase certa e o botão de recarregar', () => {
    estado.resposta = { ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 1 };
    const h = html();
    expect(h).toContain(FRASE_VERSAO_NOVA_COM_RASCUNHO);
    expect(h).toMatch(/<button type="button"[^>]*>Recarregar a página<\/button>/);
  });
});
