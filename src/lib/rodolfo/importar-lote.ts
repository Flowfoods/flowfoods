/**
 * Importação de um lote do `ledsflowfoods` para o banco.
 *
 * A decisão de cada linha é do domínio puro (`@/lib/leds/importar`), que já é
 * testado sem banco. Aqui só se persiste o que ele decidiu — assim as regras
 * (conflito, opt-out, dedup) não podem divergir entre o teste e a produção.
 */

import { prisma } from '@/lib/db';
import {
  importarPlanilha,
  type EstadoImportacao,
  type LinhaPlanilha,
  type RelatorioImportacao,
} from '@/lib/leds/importar';

export interface ResultadoLote extends RelatorioImportacao {
  lote: string;
}

export async function importarLote(
  linhas: LinhaPlanilha[],
  opts: { lote: string; somenteCelular?: boolean },
): Promise<ResultadoLote> {
  // Opt-outs e leads existentes vêm inteiros: são poucos milhares no pior caso,
  // e uma consulta por linha faria 400 idas ao banco por planilha.
  const [optOuts, existentes] = await Promise.all([
    prisma.optOut.findMany({ select: { telefoneNormalizado: true } }),
    prisma.lead.findMany({
      where: { telefoneNormalizado: { not: null } },
      select: { id: true, telefoneNormalizado: true },
    }),
  ]);

  const estado: EstadoImportacao = {
    optOuts: new Set(optOuts.map((o) => o.telefoneNormalizado)),
    existentes: new Map(
      existentes
        .filter((l): l is { id: string; telefoneNormalizado: string } => l.telefoneNormalizado !== null)
        .map((l) => [l.telefoneNormalizado, l.id]),
    ),
  };

  const relatorio = importarPlanilha(linhas, estado, opts);
  const importadoEm = new Date();

  for (const item of relatorio.linhas) {
    const lead = item.lead;
    if (!lead) continue;

    // Sem telefone normalizado não há chave de dedup: grava sempre como novo,
    // com canal VISITA. É o caso dos fixos e dos "SEM TELEFONE".
    const dados = {
      nome: lead.nome,
      restaurante: lead.nomeCurto,
      telefoneNormalizado: lead.telefoneNormalizado ?? null,
      telefoneOriginal: lead.telefoneOriginal ?? null,
      tipoTelefone: lead.tipoTelefone,
      categoria: lead.categoria || null,
      bairro: lead.bairro || null,
      bloco: lead.bloco || null,
      endereco: lead.endereco ?? null,
      nota: lead.nota,
      avaliacoes: lead.avaliacoes,
      obs: lead.obs ?? null,
      instagram: lead.instagram ?? null,
      ifoodUrl: lead.ifoodUrl ?? null,
      donoNome: lead.donoNome ?? null,
      capacidade: lead.capacidade,
      acessoDecisor: lead.acessoDecisor,
      territorio: lead.territorio,
      scoreBase: lead.scoreBase,
      gapDigital: lead.gapDigital,
      scoreTotal: lead.scoreTotal,
      tier: lead.tier,
      canal: lead.canal,
      status: lead.status,
      source: 'LEDS_IMPORT' as const,
      lote: lead.lote,
      importadoEm,
    };

    const salvo = lead.telefoneNormalizado
      ? await prisma.lead.upsert({
          where: { telefoneNormalizado: lead.telefoneNormalizado },
          create: dados,
          // Reimportação atualiza o dado do Google, mas NUNCA rebaixa o status:
          // um lead que já respondeu ou pediu saída não volta a NOVO porque a
          // planilha foi subida de novo.
          update: {
            nome: dados.nome,
            restaurante: dados.restaurante,
            categoria: dados.categoria,
            bairro: dados.bairro,
            bloco: dados.bloco,
            endereco: dados.endereco,
            nota: dados.nota,
            avaliacoes: dados.avaliacoes,
            obs: dados.obs,
            capacidade: dados.capacidade,
            acessoDecisor: dados.acessoDecisor,
            territorio: dados.territorio,
            scoreBase: dados.scoreBase,
            tier: dados.tier,
            lote: dados.lote,
            importadoEm,
            ...(lead.status === 'CONFLITO' ? { status: 'CONFLITO' as const } : {}),
          },
        })
      : await prisma.lead.create({ data: dados });

    await prisma.leadEvent.create({
      data: {
        leadId: salvo.id,
        tipo: 'import',
        descricao: item.motivo ?? `Importado no lote ${opts.lote} (${item.resultado}).`,
        dados: { resultado: item.resultado, scoreBase: lead.scoreBase, tier: lead.tier },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      evento: 'lote_importado',
      dados: {
        lote: opts.lote,
        total: relatorio.total,
        novos: relatorio.novos,
        atualizados: relatorio.atualizados,
        conflitos: relatorio.bloqueadosConflito,
        optOuts: relatorio.bloqueadosOptOut,
        semTelefone: relatorio.semTelefone,
      },
    },
  });

  return { ...relatorio, lote: opts.lote };
}
