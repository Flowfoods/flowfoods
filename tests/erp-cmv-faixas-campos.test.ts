import { describe, expect, it } from 'vitest';
import { deSeguroDaFicha, filtrosDaFichaPermitidos, lerFiltrosDeFicha, queryDosFiltrosDeFicha } from '@/lib/erp/ficha-campos';

const canais = ['LOJA', 'DELIVERY_PROPRIO', 'IFOOD'] as const;
const faixas = ['muitoFavoravel', 'favoravel', 'confortavel', 'atencao', 'critico', 'semDados', 'naoOfertado', 'faixasNaoConfiguradas'] as const;

describe('3B · filtros financeiros e retorno explícitos', () => {
  it('preserva 24 pares de faixa e os 12 legados, sem perder repetidos da URL ou o retorno operacional', () => {
    const p = new URLSearchParams({ q: 'Ç'.repeat(80), secao: 's-3b', subsecao: 'ss-3b', pagina: '2' });
    for (const canal of canais) {
      for (const faixa of faixas) p.append('faixaCmv', `${canal}-${faixa}`);
      for (const status of ['dentro', 'acima', 'semDados', 'naoOfertado']) p.append('cmv', `${canal}-${status}`);
    }
    const retorno = new URLSearchParams(deSeguroDaFicha(p.toString()));
    expect(retorno.getAll('faixaCmv')).toEqual(canais.flatMap(canal => faixas.map(faixa => `${canal}-${faixa}`)));
    expect(retorno.getAll('cmv')).toHaveLength(12);
    expect(retorno.get('q')).toBe('Ç'.repeat(80));
    expect(retorno.get('secao')).toBe('s-3b');
    expect(retorno.get('subsecao')).toBe('ss-3b');
    expect(retorno.get('pagina')).toBe('2');
  });

  it('deduplica somente pares escolhidos e descarta faixa/canal inválidos, sem fabricar combinações', () => {
    const f = lerFiltrosDeFicha({ faixaCmv: ['IFOOD-critico', 'LOJA-confortavel', 'IFOOD-critico', 'IFOOD-inventada', 'OUTRO-critico'], cmv: 'IFOOD-dentro' });
    expect(f).toMatchObject({ faixasCmv: [{ canal: 'LOJA', faixa: 'confortavel' }, { canal: 'IFOOD', faixa: 'critico' }], cmv: [{ canal: 'IFOOD', status: 'dentro' }] });
    expect(new URLSearchParams(queryDosFiltrosDeFicha(f)).getAll('faixaCmv')).toEqual(['LOJA-confortavel', 'IFOOD-critico']);
  });

  it('sem precos.ver retira também faixas de entrada forjada e do de, mantendo classificação/busca', () => {
    const forjado = Object.assign(lerFiltrosDeFicha({ q: 'Receita', secao: 's-3b', custo: 'incompleto', cmv: 'IFOOD-acima' }), { faixasCmv: [{ canal: 'LOJA' as const, faixa: 'critico' as const }] });
    expect(filtrosDaFichaPermitidos(forjado, false)).toMatchObject({ q: 'Receita', secao: 's-3b', incompleto: false, cmv: [], faixasCmv: [] });
    const retorno = new URLSearchParams(deSeguroDaFicha('q=Receita&secao=s-3b&cmv=IFOOD-acima&faixaCmv=LOJA-critico&custo=incompleto', false));
    expect([...retorno.keys()]).toEqual(['q', 'secao']);
  });
});
