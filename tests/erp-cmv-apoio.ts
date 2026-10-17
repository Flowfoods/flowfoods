/**
 * Apoio dos testes do CMV (2.3): o que se planta no banco para montar o cenário, sempre pelo portão (`doParceiro`).
 * A nota, o movimento do livro, a abertura, o fechamento de estoque, a cíclica e o faturamento entram com o INSTANTE que o
 * cenário pede (o Rio é UTC−3), porque o assunto do CMV é justamente quando cada coisa aconteceu.
 */
import { gravarMovimentos } from '@/lib/erp/estoque';
import { periodoDe, registrarPeriodo } from '@/lib/erp/periodos';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';

export const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** O Rio é UTC−3: 09:00 em São Paulo = 12:00Z. */
export const BRT = (iso: string, hora: string) => new Date(`${iso}T${hora}:00.000-03:00`);
export const R = (reais: number) => Math.round(reais * 100);
export const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ');

export const nota = (cliente: ClienteDoParceiro, insumoId: string, p: { lojaId: string; numero: string; data: string; centavos: number; frete?: number; lancadaEm: Date; status?: 'LANCADA' | 'CANCELADA'; movimenta?: boolean }) =>
  cliente.transacao(async (tx) => {
    const frete = p.frete ?? 0;
    const cancelada = p.status === 'CANCELADA';
    const n = await tx.notaEntrada.create({
      data: {
        parceiroId: tx.parceiroId,
        lojaId: p.lojaId,
        numero: p.numero,
        entradaEm: dia(p.data),
        totalCentavos: p.centavos + frete,
        freteCentavos: frete,
        status: cancelada ? 'CANCELADA' : 'LANCADA',
        lancadaEm: p.lancadaEm,
        ...(cancelada ? { canceladaEm: p.lancadaEm, motivoCancelamento: 'teste' } : {}),
      },
    });
    await tx.notaEntradaItem.create({
      data: {
        parceiroId: tx.parceiroId,
        notaId: n.id,
        insumoId,
        descricaoNota: 'Insumo',
        insumoNomeSnapshot: 'Insumo CMV',
        unidadeSnapshot: 'KG',
        embalagensMilesimos: 1000,
        conteudoMilesimos: 1000,
        quantidadeMilesimos: p.centavos * 10,
        valorTotalCentavos: p.centavos,
        freteRateadoCentavos: frete,
      },
    });
    if (p.movimenta) {
      await gravarMovimentos(
        tx,
        [{ lojaId: p.lojaId, insumoId, tipo: 'ENTRADA_COMPRA', quantidadeMilesimos: (p.centavos + frete) * 10, valorCentavos: p.centavos + frete, insumoNome: 'Insumo CMV', unidade: 'KG', motivo: `Nota ${p.numero}`, chave: `nota:${n.id}`, notaId: n.id }],
        { ocorridoEm: p.lancadaEm },
      );
    }
    return n.id;
  });

/** Uma saída ou ajuste solto no livro (requisição, cíclica, perda): tipo AJUSTE, o dia do Rio é o que conta. */
export const movimento = (cliente: ClienteDoParceiro, insumoId: string, lojaId: string, centavos: number, quando: Date, motivo: string) =>
  cliente.transacao((tx) =>
    gravarMovimentos(tx, [{ lojaId, insumoId, tipo: 'AJUSTE', quantidadeMilesimos: centavos * 10, valorCentavos: centavos, insumoNome: 'Insumo CMV', unidade: 'KG', motivo, chave: `teste:${motivo}:${quando.toISOString()}` }], { ocorridoEm: quando }),
  );

export const abertura = (cliente: ClienteDoParceiro, lojaId: string, quando: Date, valor: number, semPreco = 0) =>
  cliente.contagem.create({
    data: { parceiroId: cliente.parceiroId, lojaId, tipo: 'ABERTURA', status: 'FECHADA', desfecho: 'APLICADA', referenciaEm: dia(quando.toISOString().slice(0, 10)), fechadaEm: quando, fechadaPorNome: 'Marina', valorTotalCentavos: R(valor), itensSemPreco: semPreco },
  });

/** O fechamento de estoque do período, aplicado em `quando`, com o retrato e (se pedido) um ajuste do próprio fechamento. */
export const fechamentoDeEstoque = (cliente: ClienteDoParceiro, insumoId: string, lojaId: string, periodoId: string, p: { fim: string; quando: Date; retrato: number; proprioAjuste?: number; semPreco?: number | null; contados?: readonly string[] }) =>
  cliente.transacao(async (tx) => {
    const c = await tx.contagem.create({ data: { parceiroId: tx.parceiroId, lojaId, periodoId, tipo: 'FECHAMENTO', status: 'ABERTA', referenciaEm: dia(p.fim), iniciadaPorNome: 'Marina', titulo: 'Fechamento' } });
    // Itens contados sem diferença: o "Contados N de N" do resultado fica coerente com o estoque final fotografado.
    for (const id of p.contados ?? []) {
      await tx.contagemItem.create({ data: { parceiroId: tx.parceiroId, contagemId: c.id, insumoId: id, insumoNomeSnapshot: 'Insumo', unidadeSnapshot: 'KG', contadoMilesimos: 1000, contadoEm: p.quando, saldoSistemaMilesimos: 1000, valorSistemaCentavos: 0 } });
    }
    if (p.proprioAjuste) {
      const item = await tx.contagemItem.create({
        data: { parceiroId: tx.parceiroId, contagemId: c.id, insumoId, insumoNomeSnapshot: 'Insumo CMV', unidadeSnapshot: 'KG', contadoMilesimos: 1000, contadoEm: p.quando, saldoSistemaMilesimos: 1000, valorSistemaCentavos: 0 },
      });
      await gravarMovimentos(
        tx,
        [{ lojaId, insumoId, tipo: 'CONTAGEM', quantidadeMilesimos: p.proprioAjuste * 10, valorCentavos: p.proprioAjuste, insumoNome: 'Insumo CMV', unidade: 'KG', motivo: 'Ajuste do próprio fechamento', chave: `contagem:${item.id}`, contagemItemId: item.id }],
        { ocorridoEm: p.quando },
      );
    }
    await tx.contagem.update({ where: { id: c.id }, data: { status: 'FECHADA', desfecho: 'APLICADA', fechadaEm: p.quando, fechadaPorNome: 'Marina', valorTotalCentavos: R(p.retrato), itensSemPreco: p.semPreco === undefined ? 0 : p.semPreco } });
    return c.id;
  });

/** Uma cíclica aplicada em `quando` (ajuste de contagem do dia a dia). */
export const ciclica = (cliente: ClienteDoParceiro, insumoId: string, lojaId: string, centavos: number, quando: Date) =>
  cliente.transacao(async (tx) => {
    const c = await tx.contagem.create({ data: { parceiroId: tx.parceiroId, lojaId, tipo: 'CICLICA', status: 'ABERTA', referenciaEm: dia(quando.toISOString().slice(0, 10)), fechaAutomaticoEm: new Date(quando.getTime() + 86_400_000), iniciadaPorNome: 'Marina', titulo: 'Cíclica' } });
    const item = await tx.contagemItem.create({
      data: { parceiroId: tx.parceiroId, contagemId: c.id, insumoId, insumoNomeSnapshot: 'Insumo CMV', unidadeSnapshot: 'KG', contadoMilesimos: 1000, contadoEm: quando, saldoSistemaMilesimos: 1000, valorSistemaCentavos: 0 },
    });
    await gravarMovimentos(tx, [{ lojaId, insumoId, tipo: 'CONTAGEM', quantidadeMilesimos: centavos * 10, valorCentavos: centavos, insumoNome: 'Insumo CMV', unidade: 'KG', motivo: 'Contagem · Cíclica', chave: `contagem:${item.id}`, contagemItemId: item.id }], { ocorridoEm: quando });
    await tx.contagem.update({ where: { id: c.id }, data: { status: 'FECHADA', desfecho: 'APLICADA', fechadaEm: quando, fechadaPorNome: 'Marina' } });
  });

/** Faturamento já lançado para todos os dias do intervalo (zero = "não vendeu"), uma linha por loja × dia no único canal da loja. */
export const faturamento = (cliente: ClienteDoParceiro, lojaId: string, canal: 'LOJA' | 'DELIVERY_PROPRIO', de: string, ate: string, vendas: Record<string, number>) =>
  cliente.transacao(async (tx) => {
    const linhas = [];
    for (let t = dia(de).getTime(); t <= dia(ate).getTime(); t += 86_400_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      const v = vendas[d] ?? 0;
      linhas.push({ parceiroId: tx.parceiroId, lojaId, canal, data: dia(d), valorCentavos: R(v), pedidos: v ? 10 : 0, clientes: v ? 10 : 0, origem: 'MANUAL' as const, chaveIdempotencia: `manual:${lojaId}:-:${canal}:${d}`, atualizadoPorNome: 'Marina' });
    }
    await tx.faturamentoLancamento.createMany({ data: linhas });
  });

export const periodoRegistrado = (cliente: ClienteDoParceiro, data: string) =>
  cliente.transacao(async (tx) => {
    const r = await registrarPeriodo(tx, await periodoDe(tx, data));
    if (!r.ok) throw new Error(r.erro);
    return r.id;
  });

