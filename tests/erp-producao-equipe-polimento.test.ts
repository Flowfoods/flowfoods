/**
 * Polimento da 3.3 (sem banco): as regras puras dos acertos pedidos pelos fiscais.
 * - quem recebeu da gerência "recebeu 18:14 (passado por Gil Gerente)", não "pegou";
 * - o cancelado pela gerência não conta para a pessoa (só o que ela mesma cancelou);
 * - "Manter" fecha o formulário mesmo depois de um erro, e o erro dispensado não volta ao abrir de novo;
 * - quem perdeu a corrida não vê mais o "Pegar";
 * - a aba atual vem para a vista dentro do trilho (no celular, "Indicadores" ficava cortada).
 *
 *   npx vitest run tests/erp-producao-equipe-polimento.test.ts
 */
import { describe, expect, it } from 'vitest';
import { canceladoPelaPessoa, fraseDeQuemPegou, quandoPegou } from '@/lib/erp/producao-equipe-campos';
import { perdeuACorrida, vistaDoFormulario } from '@/components/erp/telas/producao/form-tarefas';
import { rolagemParaAAba } from '@/components/erp/ui/abas';

const HOJE = '2026-10-21';
const as = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

describe('quem recebeu o lote da gerência', () => {
  it('o cartão e o lote dizem "recebeu" e quem passou; sem passar, "pegou" como antes', () => {
    expect(quandoPegou(as(HOJE, '18:14'), HOJE, 'Gil Gerente')).toBe('recebeu 18:14 (passado por Gil Gerente)');
    expect(quandoPegou(as(HOJE, '09:12'), HOJE, null)).toBe('pegou 09:12');
    expect(quandoPegou(as('2026-10-20', '18:14'), HOJE, 'Gil Gerente')).toBe('recebeu 20/10 às 18:14 (passado por Gil Gerente)');
    expect(fraseDeQuemPegou('Duda Lima', as(HOJE, '18:14'), HOJE, 'Gil Gerente')).toBe('Duda Lima recebeu às 18:14 (passado por Gil Gerente)');
    expect(fraseDeQuemPegou('Caio Cozinha', as(HOJE, '09:12'), HOJE)).toBe('Caio Cozinha pegou às 09:12');
  });
});

describe('quem cancelou', () => {
  it('a própria pessoa (o nome do cancelamento é o dela) ou a gerência; sem ninguém com o lote, nunca é da pessoa', () => {
    const caio = { id: 'u-caio', nome: 'Caio Cozinha' };
    expect(canceladoPelaPessoa({ responsavel: caio, canceladaPorNome: 'Caio Cozinha' })).toBe(true);
    expect(canceladoPelaPessoa({ responsavel: caio, canceladaPorNome: 'Gil Gerente' })).toBe(false);
    expect(canceladoPelaPessoa({ responsavel: caio, canceladaPorNome: null })).toBe(false);
    expect(canceladoPelaPessoa({ responsavel: null, canceladaPorNome: 'Gil Gerente' })).toBe(false);
  });
});

describe('formulário que abre e fecha (soltar, passar)', () => {
  const erro = { ok: false as const, erros: { geral: 'O lote mudou agora há pouco.' }, conflito: true, vez: 1 };
  it('"Manter" fecha mesmo com o erro da ação; o erro dispensado não volta ao abrir; um erro novo aparece', () => {
    // Aberto, com o erro: mostra o erro.
    expect(vistaDoFormulario(true, erro, null)).toEqual({ aberto: true, erro });
    // "Manter" (fecha e dispensa o erro): fechado — antes, o erro mantinha o formulário aberto.
    expect(vistaDoFormulario(false, erro, erro)).toEqual({ aberto: false, erro: null });
    // Abre de novo: sem o erro velho.
    expect(vistaDoFormulario(true, erro, erro)).toEqual({ aberto: true, erro: null });
    // Tenta de novo e erra de novo (outro estado): aparece.
    const outro = { ...erro, vez: 2 };
    expect(vistaDoFormulario(true, outro, erro)).toEqual({ aberto: true, erro: outro });
  });

  it('perder a corrida (conflito) tira o "Pegar"; erro sem conflito (ou nenhum) não tira', () => {
    expect(perdeuACorrida({ ok: false, erros: { geral: 'Este lote está com Duda Lima (pegou às 17:47).' }, conflito: true, vez: 1 })).toBe(true);
    expect(perdeuACorrida({ ok: false, erros: { geral: 'Sem acesso.' }, vez: 1 })).toBe(false);
    expect(perdeuACorrida(null)).toBe(false);
  });
});

describe('abas no celular', () => {
  it('a aba atual cortada no fim rola para a vista (com a folga da máscara); a que já está inteira não mexe; a que ficou para trás volta', () => {
    // Trilho de 358 px, rolado no início; "Indicadores" de 300 a 400 px: cortada.
    expect(rolagemParaAAba({ scrollLeft: 0, clientWidth: 358 }, { offsetLeft: 300, offsetWidth: 100 })).toBe(400 - 358 + 32);
    // "Tarefas" de 90 a 160 px: inteira.
    expect(rolagemParaAAba({ scrollLeft: 0, clientWidth: 358 }, { offsetLeft: 90, offsetWidth: 70 })).toBeNull();
    // Rolado para o fim e a atual é a primeira.
    expect(rolagemParaAAba({ scrollLeft: 120, clientWidth: 358 }, { offsetLeft: 0, offsetWidth: 90 })).toBe(0);
  });
});
