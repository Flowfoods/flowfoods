/**
 * INS-SALVAR-CONFIRMACAO (17/11/2026): no Novo insumo, o que foi digitado antes de o ERP ser atualizado com a tela aberta volta
 * preenchido depois de recarregar, com a MESMA chave do envio (o servidor reconhece o reenvio). Render dos componentes reais, com a
 * fiação capturada (o que o formulário passa à ação segura, ao erro geral e ao `<form>`); o caminho no navegador tem QA à parte.
 */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoCadastro } from '@/components/erp/telas/cadastro/estado';

type Opcoes = { aoVersaoNova?: (form: FormData, c: { incerto: boolean }) => boolean };
const estado = vi.hoisted(() => ({
  resposta: null as EstadoCadastro,
  rascunho: null as unknown,
  descartar: () => {},
  opcoes: undefined as undefined | Opcoes,
  erroGeral: undefined as undefined | { aoGuardarAntesDeRecarregar?: (form: FormData) => boolean },
  form: undefined as undefined | { onSubmit?: (e?: unknown) => void },
  guardados: [] as [string, unknown][],
  descartados: [] as string[],
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/erp/insumos/novo', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useActionState: () => [estado.resposta, () => {}] }));
vi.mock('@/components/erp/telas/cadastro/rascunho', async (original) => ({
  ...(await original<typeof import('@/components/erp/telas/cadastro/rascunho')>()),
  useRascunhoDaTela: () => ({ chave: 'parceiro:pessoa:/erp/insumos/novo', valores: estado.rascunho, versaoMudou: false, insumoCriado: null, fornecedorCriado: null, descartar: estado.descartar }),
  guardarRascunho: (chave: string, valores: unknown) => { estado.guardados.push([chave, valores]); return true; },
  descartarRascunho: (chave: string) => { estado.descartados.push(chave); },
}));
vi.mock('@/components/erp/telas/cadastro/anuncio', async (original) => {
  const real = await original<typeof import('@/components/erp/telas/cadastro/anuncio')>();
  return { ...real, useAcaoSegura: (acao: Parameters<typeof real.useAcaoSegura>[0], opcoes?: Opcoes) => { estado.opcoes = opcoes; return real.useAcaoSegura(acao, opcoes); } };
});
vi.mock('@/components/erp/telas/cadastro/erros', async (original) => {
  const real = await original<typeof import('@/components/erp/telas/cadastro/erros')>();
  return { ...real, ErroGeral: (p: Parameters<typeof real.ErroGeral>[0]) => { estado.erroGeral = p; return createElement(real.ErroGeral, p); } };
});
vi.mock('@/components/erp/ui/formulario-com-acao', () => ({
  FormularioComAcao: (p: { onSubmit?: () => void; className?: string; children?: ReactNode }) => { estado.form = p; return createElement('form', { className: p.className }, p.children); },
}));
import { FormInsumo, INSUMO_NOVO, rascunhoDoEnvio, textoDoRecuperado, valoresDoFormulario } from '@/components/erp/telas/insumos/form-insumo';
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
const editar = { modo: 'editar' as const, versao: 'v1', inicial: { ...INSUMO_NOVO, nome: 'Farinha', tipo: 'INGREDIENTE' as const, unidade: 'KG' as const, categoriaId: 'cat-outros', conservacao: 'SECO' as const } };
const html = (props: Partial<Parameters<typeof FormInsumo>[0]> = {}) =>
  renderToStaticMarkup(createElement(FormInsumo, { acao: async () => null, modo: 'criar', base: '/erp/insumos', aqui: '/erp/insumos/novo', cancelar: '/erp/insumos', categorias, envio: 'chave-nova', ...props }));

beforeEach(() => {
  Object.assign(estado, { resposta: null, rascunho: null, opcoes: undefined, erroGeral: undefined, form: undefined, guardados: [], descartados: [] });
});

describe('o que foi enviado vira o rascunho', () => {
  it('o caso do relato volta inteiro, com o prazo lido pelo mesmo leitor do servidor e a chave do envio', () => {
    const r = rascunhoDoEnvio(enviado(), false);
    expect(r).toEqual({
      valores: {
        nome: 'KRAFT 01', tipo: 'EMBALAGEM', unidade: 'UN', categoriaId: 'cat-emb', conservacao: 'SECO', marcaReferencia: 'Kraft Brasil',
        validades: { principal: 'SECO', minutos: { SECO: 30 * 1440 } }, conteudo: '100', escala: 'base', preco: '45,90', semPreco: false, frete: '5,00',
      },
      envio: 'chave-da-abertura-antiga', incerto: false, prazoNaoVoltou: false,
    });
    expect(rascunhoDoEnvio(enviado(), true).incerto).toBe(true);
  });
  it('só volta o que a tela aceita; um prazo que o servidor recusaria não volta, e isso fica marcado', () => {
    const f = enviado();
    f.set('tipo', 'LIMPEZA'); f.set('unidade', 'CX'); f.set('conservacao', 'GELADEIRA'); f.set('validade_SECO', 'trinta');
    f.set('nome', 'x'.repeat(120)); f.set('semPreco', 'on'); f.set('escala', 'menor');
    const r = rascunhoDoEnvio(f, false);
    expect(r.valores).toMatchObject({ tipo: INSUMO_NOVO.tipo, unidade: '', conservacao: '', validades: null, semPreco: true, escala: 'menor' });
    expect(r.valores.nome).toHaveLength(80);
    expect(r.prazoNaoVoltou).toBe(true);
    expect(valoresDoFormulario(new FormData())).toEqual({ ...INSUMO_NOVO });
    expect(rascunhoDoEnvio(new FormData(), false)).toEqual({ valores: { ...INSUMO_NOVO }, envio: '', incerto: false, prazoNaoVoltou: false });
  });
  it('o aviso nunca diz que nada foi salvo; com envio incerto, diz que o reenvio é reconhecido; prazo perdido pede conferência', () => {
    const certo = textoDoRecuperado({ incerto: false, prazoNaoVoltou: false });
    expect(certo).toContain('O envio anterior não foi processado: confira e salve.');
    const incerto = textoDoRecuperado({ incerto: true, prazoNaoVoltou: true });
    expect(incerto).toContain('pode ter sido salvo: ao salvar, o sistema reconhece e não cria outro');
    expect(incerto).toContain('prazo de uso após abertura');
    for (const t of [certo, incerto]) expect(t).not.toMatch(/nada foi salvo/i);
  });
});

describe('Novo insumo recuperado: mesma chave do envio, valores, aviso anunciável e saída', () => {
  it('com rascunho: os campos e a chave antiga voltam; o aviso nasce visível e a região viva nasce vazia', () => {
    estado.rascunho = rascunhoDoEnvio(enviado(), false);
    const h = html();
    expect(h).toContain(textoDoRecuperado({ incerto: false, prazoNaoVoltou: false }));
    expect(h).toContain('Descartar e começar de novo');
    for (const valor of ['value="KRAFT 01"', 'value="Kraft Brasil"', 'value="100"', 'value="45,90"', 'value="5,00"', 'value="30"']) expect(h, valor).toContain(valor);
    expect(h).toMatch(/<option value="cat-emb" selected="">/);
    // O reenvio é o MESMO envio para o servidor: a chave da abertura antiga volta, não a nova.
    expect(h).toContain('name="envio" value="chave-da-abertura-antiga"');
    expect(h).not.toContain('chave-nova');
    expect(h).toContain('<p role="status" aria-live="polite" class="sr-only"></p>');
  });
  it('rascunho com outra forma (outra versão do ERP) é ignorado', () => {
    estado.rascunho = { nome: 'KRAFT 01' };
    const h = html();
    expect(h).not.toContain('Recuperamos');
    expect(h).toContain('name="envio" value="chave-nova"');
  });
  it('sem rascunho, ou ao editar: nada é recuperado nem anunciado', () => {
    expect(html()).not.toContain('Recuperamos');
    estado.rascunho = rascunhoDoEnvio(enviado(), false);
    const h = html(editar);
    expect(h).not.toContain('Recuperamos');
    expect(h).toContain('value="Farinha"');
    expect(h).not.toContain('KRAFT 01');
  });
  it('o envio que encontra o ERP atualizado mostra a frase certa e o botão de recarregar', () => {
    estado.resposta = { ok: false, erros: { geral: FRASE_VERSAO_NOVA_COM_RASCUNHO }, versaoNova: true, rascunhoGuardado: true, vez: 1 };
    const h = html();
    expect(h).toContain(FRASE_VERSAO_NOVA_COM_RASCUNHO);
    expect(h).toMatch(/<button type="button"[^>]*>Recarregar a página<\/button>/);
  });
});

describe('a fiação: guarda só no cadastro novo, com a chave do envio; guarda de novo no toque; descarta a cada envio', () => {
  it('cadastro novo: o envio que encontra o ERP atualizado guarda o rascunho na chave da tela, com a incerteza recebida', () => {
    html();
    expect(estado.opcoes?.aoVersaoNova?.(enviado(), { incerto: true })).toBe(true);
    expect(estado.guardados).toEqual([['parceiro:pessoa:/erp/insumos/novo', rascunhoDoEnvio(enviado(), true)]]);
  });
  it('editar: nada é guardado (a edição tem a versão lida e o conflito próprios)', () => {
    html(editar);
    expect(estado.opcoes?.aoVersaoNova?.(enviado(), { incerto: false })).toBe(false);
    expect(estado.guardados).toEqual([]);
    expect(estado.erroGeral?.aoGuardarAntesDeRecarregar).toBeUndefined();
  });
  it('no toque em "Recarregar a página", guarda o que está na tela agora (com o que mudou depois do aviso)', () => {
    estado.resposta = { ok: false, erros: { geral: 'x' }, versaoNova: true, rascunhoGuardado: true, incerto: true, vez: 2 };
    html();
    const agora = enviado(); agora.set('nome', 'KRAFT 01 editado depois do aviso');
    expect(estado.erroGeral?.aoGuardarAntesDeRecarregar?.(agora)).toBe(true);
    expect(estado.guardados).toEqual([['parceiro:pessoa:/erp/insumos/novo', rascunhoDoEnvio(agora, true)]]);
  });
  it('cada envio novo descarta o rascunho de antes (nada volta depois dizendo que não foi salvo); editar não mexe', () => {
    html();
    estado.form?.onSubmit?.();
    expect(estado.descartados).toEqual(['parceiro:pessoa:/erp/insumos/novo']);
    estado.descartados = [];
    html(editar);
    estado.form?.onSubmit?.();
    expect(estado.descartados).toEqual([]);
  });
});
