import { describe, expect, it, vi } from 'vitest';
import { cancelarNotaNaTransacao, editarNota, obterNota, previaDaNota } from '@/lib/erp/compras';
import { resolverAlcance } from '@/lib/erp/permissoes';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { lerRetornoDeCompra } from '@/lib/erp/compra-retorno';

const alcance = (permissoes: string[]) => resolverAlcance({
  perfilBase: null, perfilProprio: permissoes, permissoesExtras: [], permissoesRemovidas: [],
  redeInteira: false, lojaIds: ['lojaa'],
});
const entrada = { lojaId: 'lojaa', fornecedorId: 'fornecedor', numero: '123', serie: '', data: '2026-11-07', frete: '', total: '10,00', itens: [], versao: '2026-11-07T00:00:00.000Z' };

describe('Política aprovada de compras: quem só lança não lê nem altera notas gravadas', () => {
  it.each([['compras.lancar'], ['compras.lancar', 'insumos.ver'], []].map(permissoes => ({ permissoes })))('nega detalhe sem iniciar consulta: $permissoes', async ({ permissoes }) => {
    const transacao = vi.fn();
    const cliente = { transacao } as unknown as ClienteDoParceiro;
    expect(await obterNota(cliente, alcance(permissoes), 'notaprivada')).toBeNull();
    expect(transacao).not.toHaveBeenCalled();
  });

  it.each([['compras.lancar'], ['compras.ver'], []].map(permissoes => ({ permissoes })))('nega edição e sua prévia antes de ler a nota: $permissoes', async ({ permissoes }) => {
    const transacao = vi.fn();
    const cliente = { transacao } as unknown as ClienteDoParceiro;
    expect(await editarNota(cliente, alcance(permissoes), 'notaprivada', entrada)).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(await previaDaNota(cliente, alcance(permissoes), entrada, 'notaprivada')).toMatchObject({ ok: false, erros: { geral: expect.any(String) } });
    expect(transacao).not.toHaveBeenCalled();
  });

  it.each([['compras.lancar'], ['compras.ver'], []].map(permissoes => ({ permissoes })))('nega o núcleo de cancelamento, inclusive usado por XML, antes de SQL: $permissoes', async ({ permissoes }) => {
    const sql = vi.fn();
    const tx = { sql } as unknown as ClienteDoParceiro;
    await expect(cancelarNotaNaTransacao(tx, alcance(permissoes), 'notaprivada', 'Digitada em dobro', 'Teste')).rejects.toThrow();
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('Retorno da nova compra não contém nota ou dados financeiros', () => {
  const query = { feito: 'lancada', loja: 'lojaa', nova: '11111111-1111-4111-8111-111111111111' };
  it('aceita apenas marcador de remontagem e loja', () => {
    expect(lerRetornoDeCompra(query)).toEqual({ lojaId: 'lojaa', chave: query.nova });
    expect(lerRetornoDeCompra({ ...query, nova: '22222222-2222-4222-8222-222222222222' })?.chave).not.toBe(query.nova);
  });
  it.each([{}, { ...query, feito: 'cancelada' }, { ...query, loja: '../outra' }, { ...query, loja: ['lojaa'] }, { ...query, nova: 'nota123' }, { ...query, nova: ['valor'] }])('ignora retorno inválido: %j', (q) => {
    expect(lerRetornoDeCompra(q)).toBeNull();
  });
});
