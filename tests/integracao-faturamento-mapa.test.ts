import { describe, expect, it } from 'vitest';
import { mapearSnapshotParaFaturamento, type SnapshotFinanceiro } from '@/lib/integracoes/ifood/mapa-faturamento';

const identidade = { id: 'snapshot', hash: 'a'.repeat(64), origem: 'IFOOD_ANALYTICS_V1', parceiroId: 'parceiro', lojaId: 'loja',
  merchantId: 'ad7bdf06-b1bb-4d2c-a5cb-d270abdfcd43', provedor: 'IFOOD', ambiente: 'PRODUCAO', perfil: 'diario',
  dia: '2026-11-06', fuso: 'America/Sao_Paulo', situacao: 'PUBLICADO', vazioOficial: false };
function snapshot(linhas: SnapshotFinanceiro['linhas'] = [{ chaveGrupo: 'b'.repeat(64), orderStatus: 'CONCLUDED', salesChannel: 'IFOOD', category: 'FOOD', deliveredBy: 'IFOOD_DELIVERY', pedidos: 3n, gmvWithoutDelivery: 1999n }]): SnapshotFinanceiro {
  return { ...identidade, linhas, numeroGrupos: linhas.length, pedidos: linhas.reduce((s, l) => s + l.pedidos, 0n), vazioOficial: linhas.length === 0 };
}
function linha(delta: Partial<SnapshotFinanceiro['linhas'][number]>) { return { ...snapshot().linhas[0], ...delta }; }
const mapear = mapearSnapshotParaFaturamento;
const falta = (motivo: string) => ({ estado: 'pendente', motivo });

describe('INT-1.7B · mapper financeiro de snapshots persistidos', () => {
  it('soma as duas logísticas FOOD documentadas sem inferir clientes ou descontar taxas', () => {
    expect(mapear(snapshot([linha({}), linha({ chaveGrupo: 'c'.repeat(64), deliveredBy: 'MERCHANT_DELIVERY', pedidos: 2n, gmvWithoutDelivery: 400n })])))
      .toEqual({ estado: 'apto', valorCentavos: 2399, pedidos: 5, clientes: null, versaoMapa: 1 });
  });
  it.each(['', 'merchant', 'AD7BDF06-B1BB-4D2C-A5CB-D270ABDFCD43', ' ad7bdf06-b1bb-4d2c-a5cb-d270abdfcd43'])('recusa merchant não canônico: %j', merchantId => {
    expect(mapear({ ...snapshot(), merchantId })).toEqual(falta('IDENTIDADE'));
  });
  it.each([{ ambiente: 'TEST' }, { perfil: 'homologacao' }, { provedor: 'OUTRO' }, { origem: 'OUTRA' }, { fuso: 'UTC' }, { dia: '2026-02-30' }, { dia: '2019-12-31' }, { hash: 'A'.repeat(64) }])('recusa identidade fora da ponte: %j', delta => {
    expect(mapear({ ...snapshot(), ...delta })).toEqual(falta('IDENTIDADE'));
  });
  it('não consome snapshot retido por período', () => expect(mapear({ ...snapshot(), situacao: 'PENDENTE_PERIODO' })).toEqual(falta('SNAPSHOT_NAO_PUBLICADO')));
  it.each([{ category: null }, { category: 'ANOTAI' }, { category: 'GROCERY' }, { category: 'FOOD_SELF_SERVICE' }, { salesChannel: 'ANOTAI' }, { salesChannel: null }, { deliveredBy: 'DINE_IN' }, { deliveredBy: null }, { deliveredBy: 'NOVO' }, { orderStatus: null }, { orderStatus: 'NOVO' }])('preserva recorte não confirmado como pendência: %j', delta => {
    expect(mapear(snapshot([linha(delta)]))).toEqual(falta('RECORTE_NAO_MAPEADO'));
  });
  it('exclui cancelados e outros canais conhecidos mesmo com dimensões/valor ausentes', () => {
    expect(mapear(snapshot([linha({ orderStatus: 'CANCELLED', category: null, gmvWithoutDelivery: null }),
      linha({ chaveGrupo: 'c'.repeat(64), salesChannel: 'POS', gmvWithoutDelivery: null }),
      linha({ chaveGrupo: 'd'.repeat(64), salesChannel: 'DIGITAL_CATALOG', deliveredBy: null, gmvWithoutDelivery: null })])))
      .toEqual({ estado: 'apto', valorCentavos: 0, pedidos: 0, clientes: null, versaoMapa: 1 });
  });
  it('vazio oficial é zero e não é fonte ausente', () => {
    expect(mapear(snapshot([]))).toEqual({ estado: 'apto', valorCentavos: 0, pedidos: 0, clientes: null, versaoMapa: 1 });
    expect(mapear({ ...snapshot([]), vazioOficial: false })).toEqual(falta('SNAPSHOT_INCOMPLETO'));
  });
  it.each([{ numeroGrupos: 2 }, { pedidos: 4n }, { vazioOficial: true }])('exige cobertura integral (caso %#)', delta => expect(mapear({ ...snapshot(), ...delta })).toEqual(falta('SNAPSHOT_INCOMPLETO')));
  it('recusa grupo duplicado e chave inválida', () => {
    expect(mapear(snapshot([linha({}), linha({})]))).toEqual(falta('SNAPSHOT_INCOMPLETO'));
    expect(mapear(snapshot([linha({ chaveGrupo: '' })]))).toEqual(falta('SNAPSHOT_INCOMPLETO'));
  });
  it('dinheiro ausente não vira zero', () => expect(mapear(snapshot([linha({ gmvWithoutDelivery: null })]))).toEqual(falta('VALOR_AUSENTE')));
  it.each([-1n, 9007199254740992n])('dinheiro inválido %s não arredonda/clampa', gmvWithoutDelivery => expect(mapear(snapshot([linha({ gmvWithoutDelivery })]))).toEqual(falta('NUMEROS_INVALIDOS')));
  it('não admite venda positiva sem pedidos; zero com pedidos é dado conhecido', () => {
    expect(mapear(snapshot([linha({ pedidos: 0n })]))).toEqual(falta('NUMEROS_INVALIDOS'));
    expect(mapear(snapshot([linha({ gmvWithoutDelivery: 0n })]))).toMatchObject({ estado: 'apto', valorCentavos: 0, pedidos: 3, clientes: null });
  });
  it('limita a soma inteira no destino, incluindo a fronteira exata', () => {
    expect(mapear(snapshot([linha({ gmvWithoutDelivery: 100000000n, pedidos: 100000n })]))).toMatchObject({ estado: 'apto', valorCentavos: 100000000, pedidos: 100000 });
    expect(mapear(snapshot([linha({ gmvWithoutDelivery: 100000001n })]))).toEqual(falta('LIMITE_FATURAMENTO'));
    expect(mapear(snapshot([linha({ pedidos: 100001n })]))).toEqual(falta('LIMITE_FATURAMENTO'));
    expect(mapear(snapshot([linha({ gmvWithoutDelivery: 60000000n }), linha({ chaveGrupo: 'c'.repeat(64), gmvWithoutDelivery: 60000000n })]))).toEqual(falta('LIMITE_FATURAMENTO'));
  });
});
