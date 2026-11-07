import { describe, expect, it } from 'vitest';
import { planejarCopiaEmbalagens } from '@/lib/erp/embalagens-copia';
import type { LinhaMaterialDaFicha } from '@/lib/erp/ficha-unificada-campos';
import { LIMITES_DO_CANAL } from '@/lib/erp/canal-campos';

const linha = (canal: LinhaMaterialDaFicha['canal'], insumoId: string, quantidade = '1', unidade = 'un') => ({ canal, insumoId, quantidade, unidade });
const delivery = (id: string, q = '1', u = 'un') => linha('DELIVERY_PROPRIO', id, q, u);
const ifood = (id: string, q = '1', u = 'un') => linha('IFOOD', id, q, u);

describe('copiar embalagens entre canais sem perder ajustes', () => {
  it.each(['IFOOD', 'DELIVERY_PROPRIO'] as const)('copia para %s preservando quantidade fracionária e unidade', destino => {
    const origem = destino === 'IFOOD' ? 'DELIVERY_PROPRIO' : 'IFOOD';
    const entrada = [linha(origem, 'papel', '0,025', 'kg'), linha(destino, '')];
    const antes = structuredClone(entrada);
    const r = planejarCopiaEmbalagens(entrada, destino, new Set(['papel']));
    expect(r.novas).toEqual([linha(destino, 'papel', '0,025', 'kg')]);
    expect(r.manter).toEqual([entrada[0]]);
    expect(r.excedeLimite).toBe(false);
    expect(entrada).toEqual(antes);
  });

  it('mantém quantidades do destino, não duplica itens repetidos nem altera a origem', () => {
    const entrada = [delivery('caixa', '2'), delivery('sacola', '3'), delivery('sacola', '4'), ifood('caixa', '5')];
    const r = planejarCopiaEmbalagens(entrada, 'IFOOD', new Set(['caixa', 'sacola']));
    expect(r.manter).toEqual(entrada);
    expect(r.novas).toEqual([ifood('sacola', '3')]);
    expect(planejarCopiaEmbalagens([...r.manter, ...r.novas], 'IFOOD', new Set(['caixa', 'sacola'])).novas).toEqual([]);
    r.novas[0].quantidade = '9';
    expect(entrada[1].quantidade).toBe('3');
  });

  it('não copia insumo inativo, de outro tipo ou desconhecido; mantém rascunho parcial', () => {
    const parcial = ifood('', '0,5', 'kg');
    const r = planejarCopiaEmbalagens([delivery('ativo'), delivery('inativo'), delivery('outro'), delivery(''), parcial], 'IFOOD', new Set(['ativo']));
    expect(r.novas).toEqual([ifood('ativo')]);
    expect(r.manter).toContain(parcial);
  });

  it('sem itens novos não remove a linha vazia', () => {
    const entrada = [delivery('caixa'), ifood('caixa'), ifood('')];
    const r = planejarCopiaEmbalagens(entrada, 'IFOOD', new Set(['caixa']));
    expect(r.novas).toEqual([]);
    expect(r.manter).toEqual(entrada);
  });

  it('considera o limite após retirar só a linha inicial; informa excesso sem cortar a cópia', () => {
    const ids = Array.from({ length: LIMITES_DO_CANAL.embalagens }, (_, i) => `item-${i}`);
    const origem = ids.map(id => delivery(id));
    expect(planejarCopiaEmbalagens([...origem, ifood('')], 'IFOOD', new Set(ids)).excedeLimite).toBe(false);
    const r = planejarCopiaEmbalagens([...origem, ifood('extra')], 'IFOOD', new Set(ids));
    expect(r.excedeLimite).toBe(true);
    expect(r.novas).toHaveLength(ids.length);
    expect(r.manter.at(-1)).toEqual(ifood('extra'));
  });
});
