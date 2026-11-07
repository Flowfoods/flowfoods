import { describe, expect, it, vi } from 'vitest';
import { entidadesDoFiltro, FILTROS } from '@/components/erp/telas/historico/tela-historico';
import { descreverMudancas, listarHistorico, rotuloEntidade, semPrecificacao } from '@/lib/erp/historico';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';

describe('3A · classificação no histórico existente', () => {
  it('grupo Fichas técnicas inclui a taxonomia sem criar grupo ou misturar categoria de insumo', () => {
    expect(entidadesDoFiltro('FichaTecnica')).toEqual(['FichaTecnica', 'CanalConfig', 'SecaoFicha', 'SubsecaoFicha']);
    expect(FILTROS.filter(f => f.rotulo === 'Fichas técnicas')).toHaveLength(1);
    expect(entidadesDoFiltro('Insumo')).toEqual(['Insumo', 'InsumoVariante']);
  });

  it('nomes e estado são legíveis; IDs estáveis não viram campos do histórico', () => {
    expect(rotuloEntidade('SecaoFicha')).toMatch(/seção/i);
    expect(rotuloEntidade('SubsecaoFicha')).toMatch(/subseção/i);
    const mudancas = descreverMudancas({ id: 's1', nome: 'Nome anterior', ativa: true }, { id: 's1', nome: 'Nome atual', ativa: false }, 'SecaoFicha');
    expect(mudancas.map(m => m.campo)).not.toContain('id');
    expect(mudancas).toContainEqual(expect.objectContaining({ antes: 'Nome anterior', depois: 'Nome atual' }));
    expect(mudancas.find(m => m.antes !== 'Nome anterior')?.depois).not.toBe('false');
    const filho = descreverMudancas(null, { id: 'ss1', secaoId: 's1', nome: 'Filho', secao: 'Pai', ativa: true }, 'SubsecaoFicha');
    expect(filho.map(m => m.campo)).not.toEqual(expect.arrayContaining(['id', 'secaoId']));
    expect(filho).toContainEqual(expect.objectContaining({ depois: 'Pai' }));
  });

  it('tirar dados financeiros preserva a mudança operacional de classificação', () => {
    const antes = { secaoId: 's1', secao: 'Seção anterior', precoLoja: 'R$ 10,00', cmvLoja: '20%' };
    const depois = { secaoId: 's2', secao: 'Seção atual', precoLoja: 'R$ 20,00', cmvLoja: '10%' };
    const operacional = semPrecificacao(antes, depois)!;
    expect(operacional.antes).toMatchObject({ secao: 'Seção anterior' });
    expect(operacional.depois).toMatchObject({ secao: 'Seção atual' });
    expect(JSON.stringify(operacional)).not.toMatch(/precoLoja|cmvLoja|R\$/);
    expect(descreverMudancas(operacional.antes, operacional.depois, 'FichaTecnica').map(m => m.campo)).not.toContain('secaoId');
  });

  it('preenche o limite com eventos permitidos quando o primeiro lote só mudou classificação sem fichas.ver', async () => {
    const comum = { entidade: 'FichaTecnica', acao: 'ALTEROU', motivo: null, autorNome: 'Pessoa sintética', ocorridoEm: new Date('2026-11-06T12:00:00Z') };
    const ocultos = ['oculto-1', 'oculto-2'].map(id => ({ ...comum, id,
      antes: { nome: 'Ficha sintética', secaoId: 's1', secao: 'Seção anterior' },
      depois: { nome: 'Ficha sintética', secaoId: 's2', secao: 'Seção atual' },
    }));
    const visiveis = ['visivel-1', 'visivel-2'].map(id => ({ ...comum, id,
      antes: { nome: 'Nome anterior' }, depois: { nome: 'Nome atual' },
    }));
    const findMany = vi.fn().mockResolvedValueOnce(ocultos).mockResolvedValueOnce(visiveis);
    const cliente = { historicoAlteracao: { findMany } } as unknown as ClienteDoParceiro;
    const linhas = await listarHistorico(cliente, { limite: 2, verPrecos: true, verCustos: true, verFichas: false });
    expect(linhas.map(linha => linha.id)).toEqual(['visivel-1', 'visivel-2']);
    expect(JSON.stringify(linhas)).not.toMatch(/Seção anterior|Seção atual|secaoId|oculto-/);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: 0, take: 2 }));
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ skip: 2, take: 2 }));
  });
});
