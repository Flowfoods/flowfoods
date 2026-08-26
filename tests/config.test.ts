import { describe, expect, it } from 'vitest';
import { apertar, CONFIG_PADRAO } from '@/lib/rodolfo/config';
import { INTERVALO_MIN_S, MAX_POR_DIA, MAX_POR_HORA } from '@/lib/barney/regras';

/**
 * `apertar` roda na ESCRITA e na LEITURA da configuração. O teste de leitura é
 * o que importa mais: ele cobre o caso de alguém editar a linha do `Setting`
 * direto no Postgres, que é uma tabela como outra qualquer.
 */
describe('apertar — a configuração nunca sobe um teto', () => {
  it('recusa teto diário acima do rígido', () => {
    expect(apertar({ maxPorDia: 500 }).maxPorDia).toBe(MAX_POR_DIA);
    expect(apertar({ maxPorDia: 31 }).maxPorDia).toBe(MAX_POR_DIA);
  });

  it('aceita teto diário abaixo do rígido', () => {
    expect(apertar({ maxPorDia: 5 }).maxPorDia).toBe(5);
  });

  it('recusa teto horário acima do rígido', () => {
    expect(apertar({ maxPorHora: 80 }).maxPorHora).toBe(MAX_POR_HORA);
  });

  it('aceita teto horário abaixo do rígido', () => {
    expect(apertar({ maxPorHora: 2 }).maxPorHora).toBe(2);
  });

  it('recusa intervalo abaixo do piso de 120s', () => {
    expect(apertar({ intervaloMinS: 1 }).intervaloMinS).toBe(INTERVALO_MIN_S);
    expect(apertar({ intervaloMinS: 0 }).intervaloMinS).toBe(INTERVALO_MIN_S);
    expect(apertar({ intervaloMinS: -50 }).intervaloMinS).toBe(INTERVALO_MIN_S);
  });

  it('aceita intervalo acima do piso', () => {
    expect(apertar({ intervaloMinS: 600 }).intervaloMinS).toBe(600);
  });

  it('não deixa o máximo ficar abaixo do mínimo', () => {
    const c = apertar({ intervaloMinS: 900, intervaloMaxS: 300 });
    expect(c.intervaloMaxS).toBeGreaterThanOrEqual(c.intervaloMinS);
  });

  it('aperta a janela junto', () => {
    const c = apertar({ janela: { diasSemana: [1, 6, 7], horaInicio: 6, horaFim: 23 } });
    expect(c.janela.diasSemana).toEqual([1]);
    expect(c.janela.horaInicio).toBe(10);
    expect(c.janela.horaFim).toBe(18);
  });
});

describe('apertar — os defaults seguros', () => {
  it('disparo nasce DESLIGADO e só liga com true explícito', () => {
    expect(CONFIG_PADRAO.disparoAtivo).toBe(false);
    expect(apertar({}).disparoAtivo).toBe(false);
    expect(apertar({ disparoAtivo: undefined }).disparoAtivo).toBe(false);
    // Valor-lixo vindo do banco não pode ser lido como "ligado".
    expect(apertar({ disparoAtivo: 'sim' as unknown as boolean }).disparoAtivo).toBe(false);
    expect(apertar({ disparoAtivo: true }).disparoAtivo).toBe(true);
  });

  it('aprovação manual nasce LIGADA e só desliga com false explícito', () => {
    expect(CONFIG_PADRAO.modoAprovacao).toBe(true);
    expect(apertar({}).modoAprovacao).toBe(true);
    expect(apertar({ modoAprovacao: undefined }).modoAprovacao).toBe(true);
    expect(apertar({ modoAprovacao: false }).modoAprovacao).toBe(false);
  });

  it('config vazia devolve exatamente o padrão seguro', () => {
    const c = apertar({});
    expect(c.maxPorDia).toBe(MAX_POR_DIA);
    expect(c.maxPorHora).toBe(MAX_POR_HORA);
    expect(c.janela.diasSemana).toEqual([1, 2, 3, 4, 5]);
    expect(c.janela.horaInicio).toBe(10);
    expect(c.janela.horaFim).toBe(18);
  });
});
