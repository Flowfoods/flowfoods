/**
 * ERP 3.3 · a cozinha pega a tarefa — a conta PURA (sem banco): o período do histórico, o desfecho de cada lote, o tempo de
 * produção (de pegar, ou da entrega dos insumos, até concluir), os indicadores por pessoa com a amostra (sem ranking: ordem
 * alfabética) e as frases ("sem dado = frase, nunca zero").
 */
import { describe, expect, it } from 'vitest';
import { motivoDoLoteSemEtiqueta } from '@/lib/erp/etiqueta-campos';
import {
  AMOSTRA_PEQUENA,
  desfechoDoLote,
  diaDoEncerramento,
  formatarTempo,
  fraseDaAmostra,
  fraseDaFicha,
  fraseDeQuemPegou,
  fraseDoLoteComOutro,
  fraseDoRendimentoDoLote,
  fraseDoRendimentoMedio,
  fraseDoResumo,
  fraseDoTempo,
  indicadoresPorPessoa,
  lerFiltroId,
  lerPeriodoDoHistorico,
  resumoDoHistorico,
  rotuloDoPeriodo,
  tempoDoLote,
  type LoteEncerrado,
  etiquetaDaFeita,
} from '@/lib/erp/producao-equipe-campos';

const HOJE = '2026-10-21';
/** Hora do Rio (UTC−3) como instante. */
const as = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);

let seq = 0;
function lote(p: Partial<LoteEncerrado> & { quem?: [string, string] | null }): LoteEncerrado {
  seq++;
  const { quem, ...resto } = p;
  return {
    id: `o${seq}`,
    codigo: `261021-${String(seq).padStart(2, '0')}`,
    fichaId: 'f-molho',
    fichaNome: 'Molho cheddar',
    unidade: 'KG',
    status: 'CONCLUIDA',
    planejadoMilesimos: 5000,
    produzidoMilesimos: 5000,
    responsavel: quem === null ? null : quem ? { id: quem[0], nome: quem[1] } : { id: 'u-caio', nome: 'Caio Cozinha' },
    responsavelDesde: as(HOJE, '09:00'),
    insumosEntreguesEm: as(HOJE, '08:00'),
    iniciadaEm: as(HOJE, '09:00'),
    concluidaEm: as(HOJE, '10:00'),
    concluidaPorNome: 'Caio Cozinha',
    canceladaEm: null,
    canceladaPorNome: null,
    motivoCancelamento: null,
    motivoRendimento: null,
    ...resto,
  };
}
const CAIO: [string, string] = ['u-caio', 'Caio Cozinha'];
const DUDA: [string, string] = ['u-duda', 'Duda Lima'];

describe('o período do histórico', () => {
  it('padrão: os últimos 7 dias até hoje; os atalhos hoje e 30 dias', () => {
    expect(lerPeriodoDoHistorico({}, HOJE)).toEqual({ de: '2026-10-15', ate: HOJE, atalho: '7', dias: 7, aviso: null });
    expect(lerPeriodoDoHistorico({ periodo: 'hoje' }, HOJE)).toMatchObject({ de: HOJE, ate: HOJE, atalho: 'hoje', dias: 1 });
    expect(lerPeriodoDoHistorico({ periodo: '30' }, HOJE)).toMatchObject({ de: '2026-09-22', ate: HOJE, atalho: '30', dias: 30 });
    expect(lerPeriodoDoHistorico({ periodo: 'xpto' }, HOJE)).toMatchObject({ atalho: '7' });
  });

  it('de/até escolhidos: um dia só, datas trocadas, futuro e mais de 92 dias (sempre com o aviso); o atalho é reconhecido', () => {
    expect(lerPeriodoDoHistorico({ de: '2026-10-19' }, HOJE)).toEqual({ de: '2026-10-19', ate: '2026-10-19', atalho: null, dias: 1, aviso: null });
    expect(lerPeriodoDoHistorico({ de: '2026-10-20', ate: '2026-10-10' }, HOJE)).toMatchObject({ de: '2026-10-10', ate: '2026-10-20', dias: 11, aviso: null });
    expect(lerPeriodoDoHistorico({ de: '2026-10-20', ate: '2026-11-30' }, HOJE)).toMatchObject({ de: '2026-10-20', ate: HOJE, aviso: 'Não há produção no futuro: o período vai até hoje.' });
    expect(lerPeriodoDoHistorico({ de: '2026-11-02' }, HOJE)).toMatchObject({ de: HOJE, ate: HOJE });
    const longo = lerPeriodoDoHistorico({ de: '2026-01-01', ate: HOJE }, HOJE);
    expect(longo).toMatchObject({ de: '2026-07-22', ate: HOJE, dias: 92 });
    expect(longo.aviso).toBe('No máximo 92 dias de uma vez: começa em 22/07/2026.');
    expect(lerPeriodoDoHistorico({ de: '2026-10-15', ate: HOJE }, HOJE).atalho).toBe('7');
    // Data que não existe não vale: volta ao padrão.
    expect(lerPeriodoDoHistorico({ de: '2026-02-30', ate: '2026-03-01' }, HOJE)).toMatchObject({ atalho: '7' });
  });

  it('o rótulo do período e o filtro de id', () => {
    expect(rotuloDoPeriodo({ de: HOJE, ate: HOJE, dias: 1 }, HOJE)).toBe('hoje, 21/10/2026');
    expect(rotuloDoPeriodo({ de: '2026-10-19', ate: '2026-10-19', dias: 1 }, HOJE)).toBe('19/10/2026');
    expect(rotuloDoPeriodo({ de: '2026-10-15', ate: HOJE, dias: 7 }, HOJE)).toBe('de 15/10 a 21/10/2026 (7 dias)');
    expect(lerFiltroId('u-caio')).toBe('u-caio');
    expect(lerFiltroId('cm1abc')).toBe('cm1abc');
    expect(lerFiltroId("x' OR 1=1")).toBeNull();
    expect(lerFiltroId(undefined)).toBeNull();
  });
});

describe('o lote encerrado', () => {
  it('desfecho: concluído, perdido (0), estornado (cancelado que guarda a conclusão) e cancelado', () => {
    expect(desfechoDoLote({ status: 'CONCLUIDA', concluidaEm: new Date(), produzidoMilesimos: 4600 })).toBe('CONCLUIDO');
    expect(desfechoDoLote({ status: 'CONCLUIDA', concluidaEm: new Date(), produzidoMilesimos: 0 })).toBe('PERDIDO');
    expect(desfechoDoLote({ status: 'CANCELADA', concluidaEm: new Date(), produzidoMilesimos: 4600 })).toBe('ESTORNADO');
    expect(desfechoDoLote({ status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null })).toBe('CANCELADO');
  });

  it('o dia do lote é o do Rio: concluído às 23:30 de 20/10 é de 20/10 (02:30 UTC de 21/10)', () => {
    expect(diaDoEncerramento({ concluidaEm: new Date('2026-10-21T02:30:00Z'), canceladaEm: null })).toBe('2026-10-20');
    expect(diaDoEncerramento({ concluidaEm: null, canceladaEm: as(HOJE, '11:00') })).toBe(HOJE);
    // O estornado é do dia em que foi produzido.
    expect(diaDoEncerramento({ concluidaEm: as('2026-10-19', '10:00'), canceladaEm: as(HOJE, '11:00') })).toBe('2026-10-19');
  });

  it('o rendimento em palavras: o número, "lote perdido" ou "cancelado antes de produzir" (nunca 0%)', () => {
    expect(fraseDoRendimentoDoLote({ status: 'CONCLUIDA', concluidaEm: new Date(), produzidoMilesimos: 4600, planejadoMilesimos: 5000 })).toBe('92%');
    expect(fraseDoRendimentoDoLote({ status: 'CONCLUIDA', concluidaEm: new Date(), produzidoMilesimos: 0, planejadoMilesimos: 5000 })).toBe('lote perdido');
    expect(fraseDoRendimentoDoLote({ status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null, planejadoMilesimos: 5000 })).toBe('cancelado antes de produzir');
  });

  it('tempo de produção: de pegar (ou da entrega dos insumos, se foi depois) até concluir; sem hora de pegar, nada', () => {
    // Pegou às 09:00, os insumos saíram às 09:30, concluiu às 10:45: 75 minutos (a espera pelo estoque não conta).
    expect(tempoDoLote({ responsavelDesde: as(HOJE, '09:00'), insumosEntreguesEm: as(HOJE, '09:30'), concluidaEm: as(HOJE, '10:45') })).toBe(75);
    // Insumos entregues antes de pegar: conta de quando pegou.
    expect(tempoDoLote({ responsavelDesde: as(HOJE, '09:00'), insumosEntreguesEm: as(HOJE, '07:00'), concluidaEm: as(HOJE, '09:40') })).toBe(40);
    expect(tempoDoLote({ responsavelDesde: null, insumosEntreguesEm: as(HOJE, '07:00'), concluidaEm: as(HOJE, '09:40') })).toBeNull();
    expect(tempoDoLote({ responsavelDesde: as(HOJE, '09:00'), insumosEntreguesEm: null, concluidaEm: null })).toBeNull();
    expect([formatarTempo(0), formatarTempo(45), formatarTempo(60), formatarTempo(80), formatarTempo(1505)]).toEqual(['menos de 1 min', '45 min', '1 h', '1 h 20 min', '25 h 5 min']);
  });

  it('o resumo do período e a frase; sem lote, a frase do vazio', () => {
    const lotes = [lote({}), lote({ produzidoMilesimos: 0 }), lote({ status: 'CANCELADA', canceladaEm: as(HOJE, '11:00') }), lote({ status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null, canceladaEm: as(HOJE, '11:00') })];
    expect(resumoDoHistorico(lotes)).toEqual({ total: 4, concluidos: 1, perdidos: 1, estornados: 1, cancelados: 1 });
    expect(fraseDoResumo(resumoDoHistorico(lotes))).toBe('4 lotes encerrados: 1 concluído · 1 perdido · 1 estornado · 1 cancelado');
    expect(fraseDoResumo(resumoDoHistorico([]))).toBe('Nenhum lote encerrado neste período.');
  });

  it('quem pegou e a recusa para quem tenta pegar, concluir ou cancelar o lote de outra pessoa', () => {
    expect(fraseDeQuemPegou('Caio Cozinha', as(HOJE, '09:12'), HOJE)).toBe('Caio Cozinha pegou às 09:12');
    expect(fraseDeQuemPegou('Caio Cozinha', as('2026-10-20', '09:12'), HOJE)).toBe('Caio Cozinha pegou em 20/10 às 09:12');
    expect(fraseDoLoteComOutro('Caio Cozinha', as(HOJE, '09:12'), HOJE, 'pegar')).toBe('Este lote está com Caio Cozinha (pegou às 09:12). Se for para você fazer, peça para a gerência passar o lote para você.');
    expect(fraseDoLoteComOutro('Caio Cozinha', as(HOJE, '09:12'), HOJE, 'concluir')).toMatch(/Só Caio Cozinha ou a gerência conclui\./);
    expect(fraseDoLoteComOutro('Caio Cozinha', as(HOJE, '09:12'), HOJE, 'cancelar')).toMatch(/Só Caio Cozinha ou a gerência cancela\./);
  });
});

describe('os indicadores por pessoa', () => {
  const lotes = [
    // Caio: três molhos concluídos (4,6 · 5 · 4,4 kg de 5), um perdido, um cancelado com ele; um dos concluídos sem hora de pegar.
    lote({ quem: CAIO, produzidoMilesimos: 4600, responsavelDesde: as(HOJE, '09:00'), insumosEntreguesEm: as(HOJE, '09:30'), concluidaEm: as(HOJE, '10:30') }),
    lote({ quem: CAIO, produzidoMilesimos: 5000, responsavelDesde: as('2026-10-20', '14:00'), insumosEntreguesEm: as('2026-10-20', '13:00'), concluidaEm: as('2026-10-20', '14:30') }),
    lote({ quem: CAIO, produzidoMilesimos: 4400, responsavelDesde: null, concluidaEm: as('2026-10-19', '10:00'), motivoRendimento: 'queimou o fundo' }),
    lote({ quem: CAIO, produzidoMilesimos: 0, fichaId: 'f-base', fichaNome: 'Base de cebola', planejadoMilesimos: 2000, responsavelDesde: as(HOJE, '07:00'), insumosEntreguesEm: as(HOJE, '06:00'), concluidaEm: as(HOJE, '08:00'), motivoRendimento: 'caiu no chão' }),
    lote({ quem: CAIO, status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null, canceladaEm: as(HOJE, '11:00'), canceladaPorNome: 'Gil Gerente', motivoCancelamento: 'mudou o cardápio' }),
    // Polimento: um cancelado pelo próprio Caio (o da gerência acima não conta para ele).
    lote({ quem: CAIO, status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null, canceladaEm: as(HOJE, '11:30'), canceladaPorNome: 'Caio Cozinha', motivoCancelamento: 'faltou gás' }),
    // Duda: uma base concluída (2,1 de 2 kg) e um molho estornado.
    lote({ quem: DUDA, fichaId: 'f-base', fichaNome: 'Base de cebola', planejadoMilesimos: 2000, produzidoMilesimos: 2100 }),
    lote({ quem: DUDA, status: 'CANCELADA', canceladaEm: as(HOJE, '12:00'), produzidoMilesimos: 5000 }),
    // Um cancelado antes de alguém pegar.
    lote({ quem: null, status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null, responsavelDesde: null, canceladaEm: as(HOJE, '10:00') }),
    // Polimento: um concluído sem pessoa da equipe (a FlowFoods; a leitura tira o login do nível 1 da 3.1).
    lote({ quem: null, responsavelDesde: null, concluidaPorNome: 'Rodolfo Cavalcante' }),
  ];

  it('Caio: 3 concluídos, 1 perdido, 1 cancelado; 14 kg de 15 kg de molho (93,3%); média 93,3% (cada lote pesa igual); 1 fora da faixa; tempo médio dos 3 com hora de pegar', () => {
    const { pessoas, semPessoa, daFlowFoods } = indicadoresPorPessoa(lotes);
    expect(semPessoa).toBe(1);
    expect(daFlowFoods).toBe(1);
    // Ordem alfabética, nunca por desempenho.
    expect(pessoas.map((p) => p.nome)).toEqual(['Caio Cozinha', 'Duda Lima']);
    const caio = pessoas[0];
    expect(caio).toMatchObject({ id: 'u-caio', concluidos: 3, perdidos: 1, cancelou: 1, canceladosPelaGerencia: 1, estornados: 0, foraDaFaixa: 1, amostra: 4, amostraPequena: true });
    expect(caio.porFicha).toEqual([{ fichaId: 'f-molho', nome: 'Molho cheddar', unidade: 'KG', lotes: 3, planejadoMilesimos: 15000, produzidoMilesimos: 14000, rendimentoBp: 9333 }]);
    expect(caio.rendimentoMedioBp).toBe(9333);
    // 60 min (pegou 09:00, insumos 09:30, concluiu 10:30), 30 min (pegou 14:00) e o perdido 60 min (pegou 07:00): média 50 min.
    expect(caio.tempo).toEqual({ mediaMin: 50, amostra: 3 });
    expect(fraseDaFicha(caio.porFicha[0])).toBe('Molho cheddar: 14 kg em 3 lotes · rendeu 93,3%');
    expect(fraseDoRendimentoMedio(caio)).toBe('93,3% em média, sem contar os perdidos');
    expect(fraseDoTempo(caio)).toBe('50 min em média (3 lotes)');
  });

  it('Duda: 1 concluído (105%), 1 estornado (fora da conta de rendimento); amostra pequena', () => {
    const duda = indicadoresPorPessoa(lotes).pessoas[1];
    expect(duda).toMatchObject({ concluidos: 1, perdidos: 0, cancelou: 0, canceladosPelaGerencia: 0, estornados: 1, rendimentoMedioBp: 10500, foraDaFaixa: 0, amostra: 1, amostraPequena: true });
    expect(duda.porFicha.map((f) => [f.nome, f.produzidoMilesimos, f.rendimentoBp])).toEqual([['Base de cebola', 2100, 10500]]);
  });

  it('sem dado é frase: sem concluído, sem tempo; a amostra diz quando é pouca', () => {
    const so = indicadoresPorPessoa([lote({ quem: CAIO, status: 'CANCELADA', concluidaEm: null, produzidoMilesimos: null, canceladaEm: as(HOJE, '11:00') })]).pessoas[0];
    expect(so).toMatchObject({ concluidos: 0, rendimentoMedioBp: null, tempo: null, amostra: 0, amostraPequena: true, porFicha: [] });
    expect(fraseDoRendimentoMedio(so)).toBe('sem lote concluído');
    expect(fraseDoRendimentoMedio({ rendimentoMedioBp: null, perdidos: 2 })).toBe('sem lote concluído com produção (só perdidos)');
    expect(fraseDoTempo(so)).toBe('sem lote pego pelo ERP (sem hora de começo)');
    expect(fraseDaAmostra(0)).toBe('nenhum lote concluído no período');
    expect(fraseDaAmostra(3)).toBe('3 lotes: amostra pequena, ainda não diz muito');
    expect(fraseDaAmostra(1)).toBe('1 lote: amostra pequena, ainda não diz muito');
    expect(fraseDaAmostra(AMOSTRA_PEQUENA)).toBe('5 lotes');
  });

  it('a mesma pessoa com nome novo aparece uma vez, com o nome do lote mais recente', () => {
    const r = indicadoresPorPessoa([lote({ quem: ['u-caio', 'Caio'], concluidaEm: as('2026-10-19', '10:00') }), lote({ quem: ['u-caio', 'Caio Cozinha'], concluidaEm: as(HOJE, '10:00') })]);
    expect(r.pessoas).toHaveLength(1);
    expect(r.pessoas[0]).toMatchObject({ nome: 'Caio Cozinha', concluidos: 2 });
  });
});

describe('decisão 475 · "Feitas hoje" diz se o lote já tem etiqueta', () => {
  it('só para quem imprime; com etiqueta diz; sem, só cobra o lote que pode receber', () => {
    expect(etiquetaDaFeita({ etiquetas: 0, recebeEtiqueta: true }, true)).toBe('sem etiqueta');
    expect(etiquetaDaFeita({ etiquetas: 2, recebeEtiqueta: true }, true)).toBe('com etiqueta');
    // Vencido depois da etiqueta: continua "com etiqueta".
    expect(etiquetaDaFeita({ etiquetas: 1, recebeEtiqueta: false }, true)).toBe('com etiqueta');
    expect(etiquetaDaFeita({ etiquetas: 0, recebeEtiqueta: false }, true)).toBeNull();
    expect(etiquetaDaFeita({ etiquetas: 0, recebeEtiqueta: true }, false)).toBeNull();
  });

  it('a regra da tela de imprimir: perdido, sem pré-preparo de estoque e vencido não levam etiqueta', () => {
    const agora = new Date('2026-10-25T15:00:00Z');
    const lote = { status: 'CONCLUIDA', concluidaEm: agora, produzidoMilesimos: 4600, insumoProduzidoId: 'i1', validadeEm: new Date('2026-10-28T03:00:00Z') };
    expect(motivoDoLoteSemEtiqueta(lote, agora)).toBeNull();
    expect(motivoDoLoteSemEtiqueta({ ...lote, produzidoMilesimos: 0 }, agora)).toMatch(/se perdeu/);
    expect(motivoDoLoteSemEtiqueta({ ...lote, insumoProduzidoId: null }, agora)).toMatch(/pré-preparo/);
    expect(motivoDoLoteSemEtiqueta({ ...lote, validadeEm: new Date('2026-10-24T03:00:00Z') }, agora)).not.toBeNull();
    // Sem validade não é vencido.
    expect(motivoDoLoteSemEtiqueta({ ...lote, validadeEm: null }, agora)).toBeNull();
  });
});
