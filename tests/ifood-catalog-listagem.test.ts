import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { chamadaDaListagemCatalog, chamadaDaListagemCategoriasCatalog, conferirCatalogos, conferirCategoriasCatalog } from '@/lib/integracoes/ifood/catalog-listagem';
import { criarClienteIfood } from '@/lib/integracoes/ifood/http';
import { Limitador, LIMITES_POR_MINUTO } from '@/lib/integracoes/ifood/limitador';
import type { PedidoHttp, Transporte } from '@/lib/integracoes/ifood/transporte';

const loja = '27eb3070-a991-4d20-a207-000000000001';
const lojaVazia = '27eb3070-a991-4d20-a207-000000000002';
const lojaSemAcesso = '27eb3070-a991-4d20-a207-000000000003';
const consulta = { merchantId: loja.toUpperCase() };
const catalogo = {
  catalogId: 'menu-sintetico-001',
  context: ['DEFAULT', 'WHITELABEL'],
  status: 'AVAILABLE',
  modifiedAt: 1741900000.37425,
};
const entradaCategorias = { ...consulta, catalogId: 'Menu:TEST-001' };
const categoria = {
  id: 'cat-sintetica-001', index: 0, name: 'Sanduíches', externalCode: 'CAT-SAND', status: 'AVAILABLE', template: 'DEFAULT',
};

describe('Catalog v2 · listagem por loja', () => {
  it('usa apenas o UUID normalizado no caminho do GET', () => {
    expect(chamadaDaListagemCatalog(consulta)).toEqual({
      metodo: 'GET', familia: 'catalog', caminho: `/catalog/v2.0/merchants/${loja}/catalogs`,
    });
    expect(() => chamadaDaListagemCatalog({ merchantId: `${loja}/categories` }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
    expect(() => chamadaDaListagemCatalog({ ...consulta, catalogId: 'menu-sintetico-001' }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it('preserva o identificador opaco, os contextos, o estado e o número retornado', () => {
    const alternativo = { catalogId: 'menu:opaco/002', context: [], status: 'UNAVAILABLE', modifiedAt: 0 };
    expect(conferirCatalogos(consulta, [
      { ...catalogo, merchant: { id: loja }, items: [{ name: 'Item sintético' }] },
      alternativo,
    ])).toEqual({ merchantIdSolicitado: loja, situacao: 'observada', catalogos: [catalogo, alternativo] });
  });

  it('distingue uma lista vazia de uma resposta fora do contrato', () => {
    expect(conferirCatalogos(consulta, [])).toEqual({ merchantIdSolicitado: loja, situacao: 'vazia', catalogos: [] });
    expect(() => conferirCatalogos(consulta, { errorType: 'FORBIDDEN' }))
      .toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });

  it.each([
    { catalogId: '' }, { catalogId: 123 }, { context: 'DEFAULT' }, { context: [null] },
    { status: null }, { modifiedAt: '2026-11-27T14:00:00Z' }, { modifiedAt: undefined },
  ])('recusa campos com tipo incompatível (%j)', campos => {
    expect(() => conferirCatalogos(consulta, [{ ...catalogo, ...campos }]))
      .toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });
});

describe('Catalog v2 · categorias de um catálogo', () => {
  it('preserva o identificador do catálogo no caminho e usa a opção atual de leitura', () => {
    expect(chamadaDaListagemCategoriasCatalog(entradaCategorias)).toEqual({
      metodo: 'GET', familia: 'catalog', caminho: `/catalog/v2.0/merchants/${loja}/catalogs/Menu:TEST-001/categories`,
      consulta: { includeItems: 'false' },
    });
    expect(() => chamadaDaListagemCategoriasCatalog({ catalogId: 'Menu:TEST-001' })).toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
    expect(() => chamadaDaListagemCategoriasCatalog({ ...entradaCategorias, includeItems: true }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it.each(['', '.', '..', 'menu/loja', 'menu%2Foutro', 'menu?includeItems=true', 'menu#outro'])('recusa catálogo fora de um segmento (%s)', catalogId => {
    expect(() => chamadaDaListagemCategoriasCatalog({ ...entradaCategorias, catalogId }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it('mantém ordem, código e status explícitos, e registra os campos opcionais ausentes', () => {
    const semCodigo = { ...categoria, id: 'outra', index: 3, externalCode: null, status: 'UNAVAILABLE', template: null };
    expect(conferirCategoriasCatalog(entradaCategorias, [
      { ...semCodigo, items: [{ id: 'item-nao-consultado' }] }, { ...categoria, pizza: {} },
    ])).toEqual({
      merchantIdSolicitado: loja, catalogIdSolicitado: entradaCategorias.catalogId,
      situacao: 'observada', categorias: [semCodigo, categoria],
    });
  });

  it('distingue lista vazia, resposta incompleta e identidade repetida', () => {
    expect(conferirCategoriasCatalog(entradaCategorias, [])).toMatchObject({ situacao: 'vazia', categorias: [] });
    for (const resposta of [null, {}, [{ ...categoria, index: '0' }], [categoria, { ...categoria, name: 'ID repetido' }]]) {
      expect(() => conferirCategoriasCatalog(entradaCategorias, resposta)).toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
    }
  });
});

it('Catalog tem fila própria, com o limite da listagem e a folga padrão do cliente', async () => {
  expect(LIMITES_POR_MINUTO.catalog).toBe(3000);
  expect(new Limitador().capacidade('catalog')).toBe(2700);
  let agora = 0;
  const esperas: number[] = [];
  const limitador = new Limitador(() => agora, async ms => {
    esperas.push(ms);
    agora += ms;
  }, { ...LIMITES_POR_MINUTO, catalog: 2, merchant: 2 });
  await limitador.esperarVez('catalog');
  await limitador.esperarVez('merchant');
  expect(esperas).toEqual([]);
  await limitador.esperarVez('catalog');
  expect(esperas).toEqual([60_001]);
});

it('usa o cliente com transporte em memória e mantém HTTP 403 como falha de acesso', async () => {
  const registros: PedidoHttp[] = [];
  const app: AppParaToken = {
    id: 'catalog-local', clientId: 'cliente-sintetico', ambiente: 'TEST',
    nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA',
  };
  const env = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'fixture-local' };
  const transporte: Transporte = async pedido => {
    if (pedido.url.endsWith('/oauth/token')) return { status: 200, cabecalhos: {}, corpo: '{"accessToken":"token-sintetico","expiresIn":3600}' };
    registros.push(pedido);
    const caminho = new URL(pedido.url).pathname;
    if (caminho.includes(`/merchants/${lojaSemAcesso}/`)) {
      return { status: 403, cabecalhos: {}, corpo: '{"errorType":"FORBIDDEN"}' };
    }
    if (caminho.endsWith('/categories')) return { status: 200, cabecalhos: {}, corpo: JSON.stringify([categoria]) };
    return { status: 200, cabecalhos: {}, corpo: JSON.stringify(pedido.url.endsWith(`/merchants/${loja}/catalogs`) ? [catalogo] : []) };
  };
  const limitador = new Limitador();
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env });
  const cliente = criarClienteIfood({ app, tokens, limitador, transporte, env, maxTentativas: 1 });

  for (const { id, situacao, catalogos } of [
    { id: loja, situacao: 'observada', catalogos: [catalogo] },
    { id: lojaVazia, situacao: 'vazia', catalogos: [] },
  ]) {
    const entrada = { merchantId: id };
    const r = await cliente.chamar(chamadaDaListagemCatalog(entrada));
    expect(r.ok && conferirCatalogos(entrada, r.dados)).toEqual({ merchantIdSolicitado: id, situacao, catalogos });
  }
  await expect(cliente.chamar(chamadaDaListagemCatalog({ merchantId: lojaSemAcesso }))).resolves.toMatchObject({
    ok: false, status: 403, classificacao: { tipo: 'sem-permissao' },
  });
  const categorias = await cliente.chamar(chamadaDaListagemCategoriasCatalog(entradaCategorias));
  expect(categorias.ok && conferirCategoriasCatalog(entradaCategorias, categorias.dados)).toMatchObject({ situacao: 'observada', categorias: [categoria] });
  await expect(cliente.chamar(chamadaDaListagemCategoriasCatalog({ ...entradaCategorias, merchantId: lojaSemAcesso }))).resolves.toMatchObject({
    ok: false, status: 403, classificacao: { tipo: 'sem-permissao' },
  });
  expect(registros.map(pedido => ({ metodo: pedido.metodo, caminho: new URL(pedido.url).pathname, consulta: new URL(pedido.url).search })))
    .toEqual([
      ...[loja, lojaVazia, lojaSemAcesso].map(id => ({ metodo: 'GET', caminho: `/catalog/v2.0/merchants/${id}/catalogs`, consulta: '' })),
      ...[loja, lojaSemAcesso].map(id => ({
        metodo: 'GET', caminho: `/catalog/v2.0/merchants/${id}/catalogs/${entradaCategorias.catalogId}/categories`, consulta: '?includeItems=false',
      })),
    ]);
});
