import { describe, expect, it } from 'vitest';
import { armazemEmMemoria, ServicoDeToken, type AppParaToken } from '@/lib/integracoes/ifood/auth';
import { criarClienteIfood } from '@/lib/integracoes/ifood/http';
import { Limitador } from '@/lib/integracoes/ifood/limitador';
import { chamadaDosHorariosMerchant, conferirHorariosMerchant } from '@/lib/integracoes/ifood/merchant-horarios';
import type { PedidoHttp, Transporte } from '@/lib/integracoes/ifood/transporte';

const loja = 'd05ecab0-7bb7-4a5e-badf-0c6111111111';
const outraLoja = 'd05ecab0-7bb7-4a5e-badf-0c6222222222';
const consulta = { merchantId: loja.toUpperCase() };
const turno = { id: 'turno-sintetico', dayOfWeek: 'SUNDAY', start: '09:00:00', duration: 180 };

describe('Merchant · horários configurados', () => {
  it('monta um GET de horários para o UUID da loja sem filtros', () => {
    expect(chamadaDosHorariosMerchant(consulta)).toEqual({
      metodo: 'GET', familia: 'merchant', caminho: `/merchant/v1.0/merchants/${loja}/opening-hours`,
    });
  });

  it.each([
    { merchantId: 'fora-do-formato' }, { merchantId: `${loja}/status` }, { dia: 'SUNDAY' },
  ])('recusa consulta fora do contrato (%j)', dados => {
    expect(() => chamadaDosHorariosMerchant({ ...consulta, ...dados }))
      .toThrow(expect.objectContaining({ codigo: 'PARAMETROS' }));
  });

  it('conserva a ordem dos grupos, múltiplos turnos, hora local e duração em minutos', () => {
    expect(conferirHorariosMerchant(consulta, [
      { shifts: [turno, { dayOfWeek: 'SUNDAY', start: '13:00:00', duration: 195, enabled: false }] },
      { shifts: [{ id: 'vira-dia', dayOfWeek: 'SATURDAY', start: '23:30:00', duration: 120, enabled: true, nota: 'fixture' }] },
    ])).toEqual({
      merchantIdSolicitado: loja,
      estado: 'observados',
      grupos: [
        { turnos: [
          { id: 'turno-sintetico', diaDaSemana: 'SUNDAY', inicioLocal: '09:00:00', duracaoEmMinutos: 180, habilitado: null },
          { id: null, diaDaSemana: 'SUNDAY', inicioLocal: '13:00:00', duracaoEmMinutos: 195, habilitado: false },
        ] },
        { turnos: [{ id: 'vira-dia', diaDaSemana: 'SATURDAY', inicioLocal: '23:30:00', duracaoEmMinutos: 120, habilitado: true }] },
      ],
    });
  });

  it('preserva um retorno sem turnos e a existência de um grupo vazio', () => {
    expect(conferirHorariosMerchant(consulta, [])).toMatchObject({ estado: 'sem-turnos-informados', grupos: [] });
    expect(conferirHorariosMerchant(consulta, [{ shifts: [] }])).toMatchObject({
      estado: 'sem-turnos-informados', grupos: [{ turnos: [] }],
    });
  });

  it.each([
    [null], [{ errorType: 'FORBIDDEN' }], [[{}]], [[turno]],
    [[{ shifts: [{ ...turno, dayOfWeek: 'INVALIDO' }] }]],
    [[{ shifts: [{ ...turno, start: '24:00:00' }] }]],
    [[{ shifts: [{ ...turno, start: '09:00:00-03:00' }] }]],
    [[{ shifts: [{ ...turno, start: '09:00' }] }]],
    [[{ shifts: [{ ...turno, duration: 0 }] }]],
    [[{ shifts: [{ ...turno, duration: 3.5 }] }]],
    [[{ shifts: [{ ...turno, duration: '180' }] }]],
  ])('recusa um corpo fora do formato dos horários (%j)', resposta => {
    expect(() => conferirHorariosMerchant(consulta, resposta))
      .toThrow(expect.objectContaining({ codigo: 'ESQUEMA' }));
  });
});

it('consulta horários em memória e mantém uma falha de acesso no resultado HTTP', async () => {
  const registros: PedidoHttp[] = [];
  const app: AppParaToken = { id: 'merchant-horarios-local', clientId: 'cliente-sintetico', ambiente: 'TEST',
    nomeDoSegredo: 'IFOOD_TEST_CLIENT_SECRET', homologacao: 'NAO_SE_APLICA' };
  const env = { INTEGRACAO_IFOOD_ATIVA: 'true', INTEGRACAO_CHAVE_CIFRAGEM: 'b'.repeat(64), IFOOD_TEST_CLIENT_SECRET: 'fixture-local' };
  const transporte: Transporte = async pedido => {
    if (pedido.url.endsWith('/oauth/token')) return { status: 200, cabecalhos: {}, corpo: '{"accessToken":"token-sintetico","expiresIn":3600}' };
    registros.push(pedido);
    return pedido.url.endsWith(`/merchants/${loja}/opening-hours`)
      ? { status: 200, cabecalhos: {}, corpo: JSON.stringify([{ shifts: [turno] }]) }
      : { status: 403, cabecalhos: {}, corpo: '{"errorType":"FORBIDDEN"}' };
  };
  const limitador = new Limitador();
  const tokens = new ServicoDeToken({ armazem: armazemEmMemoria(), transporte, limitador, env });
  const cliente = criarClienteIfood({ app, tokens, limitador, transporte, env, maxTentativas: 1 });
  const r = await cliente.chamar(chamadaDosHorariosMerchant(consulta));
  expect(r.ok && conferirHorariosMerchant(consulta, r.dados)).toMatchObject({ estado: 'observados' });
  await expect(cliente.chamar(chamadaDosHorariosMerchant({ merchantId: outraLoja }))).resolves.toMatchObject({
    ok: false, status: 403, classificacao: { tipo: 'sem-permissao' },
  });
  expect(registros.map(pedido => ({ metodo: pedido.metodo, caminho: new URL(pedido.url).pathname, consulta: new URL(pedido.url).search })))
    .toEqual([
      { metodo: 'GET', caminho: `/merchant/v1.0/merchants/${loja}/opening-hours`, consulta: '' },
      { metodo: 'GET', caminho: `/merchant/v1.0/merchants/${outraLoja}/opening-hours`, consulta: '' },
    ]);
});
