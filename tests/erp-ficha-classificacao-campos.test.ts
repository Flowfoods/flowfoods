/** 3A: o contrato público da URL e do formulário, inclusive clientes antigos. */
import { describe, expect, it } from 'vitest';
import { deSeguroDaFicha, lerFiltrosDeFicha, queryDosFiltrosDeFicha, temFiltroDeFicha } from '@/lib/erp/ficha-campos';
import { lerEnvioDaFicha } from '@/components/erp/telas/fichas/executar';
import { classificacaoDoFormulario, classificacaoParaCampos, lerClassificacaoDigitada, lerNomeDaClassificacao } from '@/lib/erp/ficha-secoes-campos';

describe('3A · classificação digitada', () => {
  it.each([
    { secao: { tipo: 'nenhuma' }, subsecao: { tipo: 'existente', id: 'filho' } },
    { secao: { tipo: 'nova', nome: 'Nova' }, subsecao: { tipo: 'existente', id: 'filho' } },
    { secao: { tipo: 'existente', id: 'pai', nome: 'Outra' }, subsecao: { tipo: 'nenhuma' } },
    { secao: { tipo: 'nova', nome: 'Nova', id: 'pai' }, subsecao: { tipo: 'nenhuma' } },
    { secao: { tipo: 'existente', id: 'sem' }, subsecao: { tipo: 'nenhuma' } },
    { secao: { tipo: 'existente', id: '../outro' }, subsecao: { tipo: 'nenhuma' } },
    { secao: { tipo: 'nenhuma', id: 'oculto' }, subsecao: { tipo: 'nenhuma' } },
  ])('recusa par dependente inválido ou escolha ambígua: %j', entrada => {
    expect(lerClassificacaoDigitada(entrada).ok).toBe(false);
  });

  it('nome usa NFC, espaços limpos e teto técnico, sem inferir categoria de insumo', () => {
    expect(lerNomeDaClassificacao('  Pratos\t\tquentes  ')).toEqual({ ok: true, dados: 'Pratos quentes' });
    expect(lerNomeDaClassificacao('Sec\u0327a\u0303o')).toEqual({ ok: true, dados: 'Seção' });
    for (const invalido of ['', '  ', 'A'.repeat(81), null]) expect(lerNomeDaClassificacao(invalido).ok).toBe(false);
    expect(lerNomeDaClassificacao('A'.repeat(80)).ok).toBe(true);
  });

  it('editar vínculo arquivado conserva seu ID na representação do formulário', () => {
    expect(classificacaoParaCampos({
      secao: { id: 's1', nome: 'Antiga', ativa: false, versao: 'v1' },
      subsecao: { id: 'ss1', secaoId: 's1', secaoAtiva: false, nome: 'Filha', ativa: false, versao: 'v2' },
    })).toEqual({ secao: { tipo: 'existente', id: 's1' }, subsecao: { tipo: 'existente', id: 'ss1' } });
  });

  it('mínimo de nome conta caracteres Unicode como o CHECK do banco', () => {
    expect(lerNomeDaClassificacao('🍔').ok).toBe(false);
    expect(lerNomeDaClassificacao('🍔🍔')).toEqual({ ok: true, dados: '🍔🍔' });
  });

  it('marcador adulterado e ID junto de nome chegam inválidos ao validador, sem limpeza silenciosa', () => {
    const form = new FormData();
    form.set('classificacaoNoFormulario', 'nao');
    expect(lerClassificacaoDigitada(classificacaoDoFormulario(form)).ok).toBe(false);
    form.set('classificacaoNoFormulario', 'sim');
    form.set('secaoModo', 'existente');
    form.set('secaoId', 's1');
    form.set('secaoNome', 'Outra');
    form.set('subsecaoModo', 'nenhuma');
    expect(lerClassificacaoDigitada(classificacaoDoFormulario(form)).ok).toBe(false);
  });
});

describe('3A · filtros da ficha e retorno seguro', () => {
  it('aceita URL legada e vários pares explícitos, elimina duplicados/inválidos e canonicaliza a ordem', () => {
    expect(lerFiltrosDeFicha({ cmv: 'IFOOD-acima' }).cmv).toEqual([{ canal: 'IFOOD', status: 'acima' }]);
    const filtros = lerFiltrosDeFicha({ cmv: ['IFOOD-acima', 'LOJA-semDados', 'IFOOD-acima', 'DELIVERY_PROPRIO-dentro', 'LOJA-verde', '__proto__-acima'] });
    expect(filtros.cmv).toEqual([
      { canal: 'LOJA', status: 'semDados' },
      { canal: 'DELIVERY_PROPRIO', status: 'dentro' },
      { canal: 'IFOOD', status: 'acima' },
    ]);
    expect(queryDosFiltrosDeFicha(filtros)).toBe('cmv=LOJA-semDados&cmv=DELIVERY_PROPRIO-dentro&cmv=IFOOD-acima');
  });

  it('pares escolhidos não fabricam combinações canal/status não selecionadas', () => {
    const filtros = lerFiltrosDeFicha({ cmv: ['LOJA-acima', 'IFOOD-dentro'] });
    expect(filtros.cmv).toEqual([{ canal: 'LOJA', status: 'acima' }, { canal: 'IFOOD', status: 'dentro' }]);
    expect(new URLSearchParams(queryDosFiltrosDeFicha(filtros)).getAll('cmv')).toEqual(['LOJA-acima', 'IFOOD-dentro']);
    expect(lerFiltrosDeFicha({ cmv: ['IFOOD-', 'X-acima', 'IFOOD-acima-x'] }).cmv).toEqual([]);
    expect(temFiltroDeFicha(lerFiltrosDeFicha({}))).toBe(false);
  });

  it('subseção depende de seção; sem seção não mantém filtro filho', () => {
    expect(lerFiltrosDeFicha({ subsecao: 'filho' })).toMatchObject({ secao: null, subsecao: null });
    expect(lerFiltrosDeFicha({ secao: 'sem', subsecao: 'filho' })).toMatchObject({ secao: 'sem', subsecao: null });
    const soSemFilho = lerFiltrosDeFicha({ secao: 'secao-a', subsecao: 'sem' });
    expect(soSemFilho).toMatchObject({ secao: 'secao-a', subsecao: 'sem' });
    expect(temFiltroDeFicha(soSemFilho)).toBe(true);
    expect(new URLSearchParams(queryDosFiltrosDeFicha(soSemFilho)).get('subsecao')).toBe('sem');
  });

  it('retorno conserva todos os 12 pares legais e filtros operacionais sem truncar texto UTF-8', () => {
    const p = new URLSearchParams();
    p.set('q', 'Ç'.repeat(80));
    p.set('tipo', 'PRATO');
    p.set('situacao', 'todas');
    p.set('secao', 'csecao-de-teste-12345678901234567890');
    p.set('subsecao', 'csubsecao-de-teste-12345678901234567890');
    p.set('custo', 'incompleto');
    for (const canal of ['IFOOD', 'LOJA', 'DELIVERY_PROPRIO']) {
      for (const estado of ['naoOfertado', 'semDados', 'dentro', 'acima']) p.append('cmv', `${canal}-${estado}`);
    }
    p.set('pagina', '9');
    p.append('cmv', 'IFOOD-acima');
    p.set('destino', 'https://externo.invalid/');
    const seguro = deSeguroDaFicha(p.toString());
    const volta = new URLSearchParams(seguro);
    expect(p.toString().length).toBeGreaterThan(600);
    expect(volta.getAll('cmv')).toHaveLength(12);
    expect(new Set(volta.getAll('cmv')).size).toBe(12);
    expect(volta.get('q')).toBe('Ç'.repeat(80));
    expect(volta.get('secao')).toBe(p.get('secao'));
    expect(volta.get('subsecao')).toBe(p.get('subsecao'));
    expect(volta.get('pagina')).toBe('9');
    expect(volta.has('destino')).toBe(false);
    expect(deSeguroDaFicha(seguro)).toBe(seguro);
  });

  it('retorno recusa destino externo e parâmetros desconhecidos, preservando somente pares de faixa válidos', () => {
    for (const entrada of [undefined, null, 7, 'https://externo.invalid/caminho', '//externo.invalid/caminho']) {
      expect(deSeguroDaFicha(entrada)).toBe('');
    }
    const seguro = deSeguroDaFicha('q=prato&de=https%3A%2F%2Fexterno.invalid&faixaCmv=LOJA-critico&faixaCmv=LOJA-inventada&faixaCmv=OUTRO-critico&cmv=IFOOD-acima');
    expect(new URLSearchParams(seguro).getAll('cmv')).toEqual(['IFOOD-acima']);
    expect(new URLSearchParams(seguro).get('q')).toBe('prato');
    expect(new URLSearchParams(seguro).getAll('faixaCmv')).toEqual(['LOJA-critico']);
    expect(seguro).toBe('q=prato&cmv=IFOOD-acima&faixaCmv=LOJA-critico');
    expect(seguro).not.toMatch(/externo|inventada|OUTRO/);
  });
});

describe('3A · marcador da classificação no formulário real', () => {
  it('formulário antigo omite classificação mesmo com campos soltos forjados', async () => {
    const form = new FormData();
    form.set('secaoModo', 'existente');
    form.set('secaoId', 'id-ignorado');
    const lido = await lerEnvioDaFicha(form);
    if ('erroDaFoto' in lido) throw new Error(lido.erroDaFoto);
    expect(lido.entrada.classificacao).toBeUndefined();
  });

  it('marcador atual distingue limpeza explícita de omissão', async () => {
    const form = new FormData();
    form.set('classificacaoNoFormulario', 'sim');
    form.set('secaoModo', 'nenhuma');
    form.set('subsecaoModo', 'nenhuma');
    const lido = await lerEnvioDaFicha(form);
    if ('erroDaFoto' in lido) throw new Error(lido.erroDaFoto);
    expect(lido.entrada.classificacao).toEqual({ secao: { tipo: 'nenhuma' }, subsecao: { tipo: 'nenhuma' } });
  });

  it('nomes contextuais permanecem dados até o salvamento da ficha', async () => {
    const form = new FormData();
    form.set('classificacaoNoFormulario', 'sim');
    form.set('secaoModo', 'nova');
    form.set('secaoNome', 'Pratos principais');
    form.set('subsecaoModo', 'nova');
    form.set('subsecaoNome', 'Peixes');
    const lido = await lerEnvioDaFicha(form);
    if ('erroDaFoto' in lido) throw new Error(lido.erroDaFoto);
    expect(lido.entrada.classificacao).toEqual({ secao: { tipo: 'nova', nome: 'Pratos principais' }, subsecao: { tipo: 'nova', nome: 'Peixes' } });
  });
});
