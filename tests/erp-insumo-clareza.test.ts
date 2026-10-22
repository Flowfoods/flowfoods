/**
 * ERP I.1b · a parte pura da clareza do cadastro de insumos (sem banco):
 *  - conservação escolhida, nunca assumida (placeholder, vazio e valor torto são recusados);
 *  - tipo "Material de limpeza e uso" e a sugestão de categoria por ele;
 *  - marca de referência opcional (limpeza, limite, vazia = sem marca);
 *  - "conservação a confirmar" (só Seco, sem confirmação, em Proteína, Laticínios ou Hortifruti);
 *  - custo inicial de referência: o exemplo 5 kg por R$ 25 = R$ 5,00/kg e "Custo não informado" no lugar de R$ 0,00;
 *  - o caminho de volta do "Insumo que falta: cadastrar" (só caminho interno; nada de open redirect);
 *  - prazo de uso após abertura: frases do insumo e a ficha intacta.
 */
import { describe, expect, it } from 'vitest';
import { conservacaoAConfirmar, lerFiltros, lerFormInsumo, MARCA_MAXIMA, TIPOS, TIPOS_DO_FORM } from '@/lib/erp/insumo-campos';
import { sugerirCategoria } from '@/lib/erp/categoria-sugestao';
import { exemploDoCusto, TEXTO_DO_CUSTO_INICIAL } from '@/components/erp/telas/insumos/campos-embalagem';
import { contaDoCusto, custoDaEmbalagem, formatarCusto, CUSTO_NAO_INFORMADO } from '@/lib/erp/unidades';
import { lerValidades } from '@/lib/erp/validade';
import { caminhoDeVolta, rotuloDaVolta, voltaComInsumo } from '@/lib/erp/volta';

const n = (t: string) => t.replace(/\u00a0/g, ' ');
const base = { nome: 'Coxa de frango', tipo: 'INGREDIENTE', unidade: 'KG', categoriaId: 'cat1', conservacao: 'CONGELADO', conteudo: '5', escala: 'base', preco: '25,00' };

describe('I.1b · conservação escolhida, nunca assumida', () => {
  it('sem conservação, com o placeholder ou com valor fora da lista: recusa no campo, com a frase do que fazer', () => {
    for (const ruim of [undefined, '', '   ', 'Conservação', 'Selecione a conservação', 'seco', 'FRIO', 'AMBIENTE']) {
      const r = lerFormInsumo({ ...base, conservacao: ruim });
      expect(r.ok, String(ruim)).toBe(false);
      if (!r.ok) expect(r.erros.conservacao, String(ruim)).toMatch(/Escolha a conservação/);
    }
    const { conservacao: _c, ...semCampo } = base;
    const sem = lerFormInsumo(semCampo);
    expect(!sem.ok && sem.erros.conservacao).toMatch(/Escolha a conservação/);
  });

  it('as quatro conservações legítimas continuam valendo (Seco/ambiente, pista fria, refrigerado, congelado)', () => {
    for (const c of ['SECO', 'PISTA_FRIA', 'REFRIGERADO', 'CONGELADO']) {
      const r = lerFormInsumo({ ...base, conservacao: c });
      expect(r.ok && r.dados.conservacao, c).toBe(c);
    }
  });

  it('corrigir e reenviar: com a conservação escolhida, passa; os outros erros continuam por campo', () => {
    const vazio = lerFormInsumo({ ...base, conservacao: '', nome: ' ', categoriaId: '', unidade: '' });
    expect(vazio.ok).toBe(false);
    if (!vazio.ok) expect(Object.keys(vazio.erros).sort()).toEqual(['categoriaId', 'conservacao', 'nome', 'unidade']);
    expect(lerFormInsumo({ ...base }).ok).toBe(true);
  });

  it('prazo de uso após abertura: só com a conservação principal informada junto; a frase fala em prazo (a ficha segue falando em validade)', () => {
    const soOutra = lerFormInsumo({ ...base, conservacao: 'REFRIGERADO', aceita_CONGELADO: 'on', validade_CONGELADO: '30', validadeEm_CONGELADO: 'dias' });
    expect(!soOutra.ok && soOutra.erros.conservacao).toMatch(/prazo em refrigerado \(a conservação principal\)/);
    const sem = lerFormInsumo({ ...base, conservacao: 'REFRIGERADO', aceita_REFRIGERADO: 'on', validade_REFRIGERADO: '', validadeEm_REFRIGERADO: 'dias' });
    expect(!sem.ok && sem.erros['validade-REFRIGERADO']).toMatch(/prazo de uso após abertura/);
    const ficha = lerValidades({ linhas: { SECO: { marcada: true, quantidade: '', em: 'dias' } } }, 'ficha');
    expect(!ficha.ok && ficha.erros['validade-SECO']).toMatch(/quanto dura/);
    const ok = lerFormInsumo({ ...base, conservacao: 'REFRIGERADO', aceita_REFRIGERADO: 'on', validade_REFRIGERADO: '48', validadeEm_REFRIGERADO: 'horas' });
    expect(ok.ok && ok.dados.validades).toEqual({ principal: 'REFRIGERADO', minutos: { REFRIGERADO: 2880 } });
    // Sem prazo nenhum: "não informado" (nada é inventado nem sugerido).
    const nada = lerFormInsumo({ ...base, conservacao: 'REFRIGERADO' });
    expect(nada.ok && nada.dados.validades).toEqual({ principal: 'REFRIGERADO', minutos: {} });
  });
});

describe('I.1b · tipo de item', () => {
  it('três tipos no formulário (ingrediente, embalagem, material de limpeza e uso); pré-preparo continua só da ficha', () => {
    expect([...TIPOS_DO_FORM]).toEqual(['INGREDIENTE', 'EMBALAGEM', 'MATERIAL']);
    expect(TIPOS.MATERIAL).toBe('Material de limpeza e uso');
    expect(lerFormInsumo({ ...base, nome: 'Detergente neutro', tipo: 'MATERIAL' }).ok).toBe(true);
    const pre = lerFormInsumo({ ...base, tipo: 'PRE_PREPARO' });
    expect(!pre.ok && pre.erros.tipo).toMatch(/ficha técnica/);
    const torto = lerFormInsumo({ ...base, tipo: 'LIMPEZA' });
    expect(!torto.ok && torto.erros.tipo).toBeTruthy();
  });

  it('a categoria sugerida pelo tipo: material → Limpeza e higienização; embalagem → Descartáveis; o nome decide só no ingrediente', () => {
    expect(sugerirCategoria('Detergente neutro', 'MATERIAL')).toMatchObject({ chave: 'LIMPEZA', origem: 'tipo' });
    expect(sugerirCategoria('Luva descartável', 'MATERIAL').chave).toBe('LIMPEZA');
    expect(sugerirCategoria('Caixa kraft', 'EMBALAGEM').chave).toBe('DESCARTAVEIS');
    expect(sugerirCategoria('Coxa de frango congelada', 'INGREDIENTE').chave).toBe('PROTEINA');
  });

  it('o filtro da lista aceita o tipo novo', () => {
    expect(lerFiltros({ tipo: 'MATERIAL' }).tipo).toBe('MATERIAL');
  });
});

describe('I.1b · marca de referência (opcional, informativa)', () => {
  it('vazia ou só espaços = sem marca; espaços colapsam; invisíveis saem', () => {
    expect(lerFormInsumo({ ...base, marcaReferencia: '' })).toMatchObject({ ok: true, dados: { marcaReferencia: null } });
    expect(lerFormInsumo({ ...base, marcaReferencia: '   ' })).toMatchObject({ ok: true, dados: { marcaReferencia: null } });
    expect(lerFormInsumo({ ...base, marcaReferencia: '​' })).toMatchObject({ ok: true, dados: { marcaReferencia: null } });
    expect(lerFormInsumo(base)).toMatchObject({ ok: true, dados: { marcaReferencia: null } });
    expect(lerFormInsumo({ ...base, marcaReferencia: '  Casa   Camil ' })).toMatchObject({ ok: true, dados: { marcaReferencia: 'Casa Camil' } });
  });

  it(`passa de ${MARCA_MAXIMA} letras: recusa no campo; no limite, passa; nunca bloqueia os outros campos`, () => {
    const longa = lerFormInsumo({ ...base, marcaReferencia: 'x'.repeat(MARCA_MAXIMA + 1) });
    expect(!longa.ok && longa.erros.marcaReferencia).toMatch(/Marca longa demais/);
    expect(lerFormInsumo({ ...base, marcaReferencia: 'x'.repeat(MARCA_MAXIMA) }).ok).toBe(true);
  });
});

describe('I.1b · conservação a confirmar (nada é reinterpretado)', () => {
  const seco = { tipo: 'INGREDIENTE', conservacao: 'SECO', conservacaoConfirmadaEm: null };
  it('só Seco, sem confirmação, em Proteína, Laticínios ou Hortifruti', () => {
    for (const c of ['PROTEINA', 'LATICINIOS', 'HORTIFRUTI']) expect(conservacaoAConfirmar({ ...seco, categoriaChave: c }), c).toBe(true);
    for (const c of ['MERCEARIA', 'BEBIDAS', 'DESCARTAVEIS', 'LIMPEZA', 'OUTROS', 'PANIFICACAO', 'CONGELADOS', null]) expect(conservacaoAConfirmar({ ...seco, categoriaChave: c }), String(c)).toBe(false);
  });
  it('outra conservação, confirmada ou pré-preparo: não', () => {
    expect(conservacaoAConfirmar({ ...seco, conservacao: 'REFRIGERADO', categoriaChave: 'PROTEINA' })).toBe(false);
    expect(conservacaoAConfirmar({ ...seco, conservacaoConfirmadaEm: new Date(), categoriaChave: 'PROTEINA' })).toBe(false);
    expect(conservacaoAConfirmar({ ...seco, tipo: 'PRE_PREPARO', categoriaChave: 'PROTEINA' })).toBe(false);
  });
  it('o filtro da lista aceita "confirmar" além das quatro conservações', () => {
    expect(lerFiltros({ conservacao: 'confirmar' }).conservacao).toBe('confirmar');
    expect(lerFiltros({ conservacao: 'REFRIGERADO' }).conservacao).toBe('REFRIGERADO');
    expect(lerFiltros({ conservacao: 'Conservação' }).conservacao).toBeNull();
  });
});

describe('I.1b · custo inicial de referência', () => {
  it('o exemplo do plano: saco de 5 kg por R$ 25,00 → R$ 5,00/kg, calculado pelas mesmas funções do servidor', () => {
    expect(n(exemploDoCusto('KG'))).toBe('saco de farinha de 5 kg por R$ 25,00 → custo de referência R$ 5,00/kg');
    expect(n(exemploDoCusto('L'))).toBe('galão de óleo de 5 L por R$ 25,00 → custo de referência R$ 5,00/L');
    expect(n(exemploDoCusto('UN'))).toBe('caixa com 100 un por R$ 25,00 → custo de referência R$ 0,25/un');
    expect(n(formatarCusto(custoDaEmbalagem(2500, 0, 5000), 'KG'))).toBe('R$ 5,00/kg');
  });

  it('o texto de apoio é o do plano, sem tirar nem pôr', () => {
    expect(TEXTO_DO_CUSTO_INICIAL).toBe(
      'Informe quanto você paga pela embalagem de compra. Esse valor ajuda a calcular o custo do insumo e das fichas antes da primeira compra registrada. Depois, o custo é atualizado pelo último preço de compra.',
    );
  });

  it('sem custo: "Custo não informado" (nunca R$ 0,00), na conta e na frase', () => {
    expect(CUSTO_NAO_INFORMADO).toBe('Custo não informado');
    expect(formatarCusto(null, 'KG')).toBe('Custo não informado');
    const conta = contaDoCusto({ precoEmbalagemCentavos: 0, taxaEntregaCentavos: 0, conteudoMilesimos: 5000, unidade: 'KG' });
    expect(conta).toMatch(/^Custo não informado/);
    expect(n(conta)).not.toMatch(/R\$ 0,00/);
  });

  it('"Ainda não sei o custo" grava 0 só como sinal; zero digitado é recusado com a saída certa', () => {
    const marcado = lerFormInsumo({ ...base, preco: '', semPreco: 'on' });
    expect(marcado.ok && marcado.dados.precoEmbalagemCentavos).toBe(0);
    const zero = lerFormInsumo({ ...base, preco: '0,00' });
    expect(!zero.ok && zero.erros.preco).toMatch(/Custo zero\? Se ainda não sabe, marque “Ainda não sei o custo”/);
    const vazio = lerFormInsumo({ ...base, preco: '' });
    expect(!vazio.ok && vazio.erros.preco).toMatch(/custo inicial de referência/);
  });
});

describe('I.1b · o caminho de volta (?volta=) é só interno', () => {
  const P = '/erp/';
  it('aceita caminho interno da área, com ou sem busca; tira o insumoCriado que já estiver', () => {
    expect(caminhoDeVolta('/erp/compras/nova', P)).toBe('/erp/compras/nova');
    expect(caminhoDeVolta('/erp/fichas/abc/editar?de=lista', P)).toBe('/erp/fichas/abc/editar?de=lista');
    expect(caminhoDeVolta('/erp/compras/nova?insumoCriado=velho', P)).toBe('/erp/compras/nova');
    expect(caminhoDeVolta('/rodolfo/erp/casa-alfa/compras/nova', '/rodolfo/erp/casa-alfa/')).toBe('/rodolfo/erp/casa-alfa/compras/nova');
  });

  it('recusa tudo que sai da área: endereço completo, //, barra invertida, .., esquema, controle, outro parceiro', () => {
    for (const ruim of [
      'https://evil.example/erp/compras',
      '//evil.example/erp/',
      '/\\evil.example',
      '/erp/\\evil.example',
      '/erp/../rodolfo/erp/outra/compras',
      '/erp/%2e%2e/rodolfo',
      '/rodolfo/erp/casa-alfa/compras/nova',
      '/erp',
      'erp/compras',
      'javascript:alert(1)',
      '/erp/compras\n/nova',
      '/erp/compras nova',
      '/erp/insumos/novo',
      '/erp/insumos/novo?volta=/erp/compras/nova',
      '/erp/' + 'a'.repeat(400),
      '',
      undefined,
      null,
      42,
      ['/erp/compras'],
    ]) {
      expect(caminhoDeVolta(ruim, P), String(ruim)).toBeNull();
    }
    // O nível 1 de uma casa não volta para outra casa, nem para o /erp/ da pessoa do parceiro.
    expect(caminhoDeVolta('/rodolfo/erp/outra/compras/nova', '/rodolfo/erp/casa-alfa/')).toBeNull();
    expect(caminhoDeVolta('/erp/compras/nova', '/rodolfo/erp/casa-alfa/')).toBeNull();
  });

  it('prefixo torto não vale; voltaComInsumo põe o id; o rótulo diz de onde veio', () => {
    expect(caminhoDeVolta('/erp/compras', '//erp/')).toBeNull();
    expect(caminhoDeVolta('/erp/compras', 'erp/')).toBeNull();
    expect(voltaComInsumo('/erp/compras/nova', 'abc123')).toBe('/erp/compras/nova?insumoCriado=abc123');
    expect(voltaComInsumo('/erp/fichas/x/editar?de=1', 'abc')).toBe('/erp/fichas/x/editar?de=1&insumoCriado=abc');
    expect(rotuloDaVolta('/erp/compras/nova')).toBe('a nota de compra');
    expect(rotuloDaVolta('/erp/fichas/nova')).toBe('a ficha técnica');
    expect(rotuloDaVolta('/erp/fichas/x/canais')).toBe('as embalagens da ficha');
  });
});
