/** Diagnóstico offline da evidência INT-1.4. Lê a prova preservada, sem repetir nenhuma chamada. */
import { z } from 'zod';
import { conferirConsultaDiaria, conferirPaginasAnalytics, consultaDoDia, ErroContratoAnalytics, type IdentidadeAnalytics } from './analytics';

const evidenciaSchema = z.object({
  quando: z.string().datetime(), dia: z.string(), loja: z.string(),
  app: z.object({ ambiente: z.literal('TEST') }),
  passos: z.array(z.object({
    nome: z.string(), metodo: z.string(), caminho: z.string(), corpo: z.unknown().optional(),
    ok: z.boolean(), status: z.number().nullable(), requestId: z.string().max(200).nullable(), resposta: z.unknown().optional(),
  })).max(10),
});
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}
export function conferirEvidenciaAnalyticsTest(bruta: unknown) {
  const leitura = evidenciaSchema.safeParse(bruta);
  if (!leitura.success) throw new ErroContratoAnalytics('ESQUEMA', 'Arquivo não corresponde à evidência TEST do leitor.');
  const e = leitura.data;
  const diarios = e.passos.filter((p) => p.nome === 'analytics-do-dia');
  const diario = diarios[0];
  if (diarios.length !== 1 || !diario.ok || diario.status !== 200 || diario.metodo !== 'POST'
    || diario.caminho !== `/analytics/v1.0/merchants/${e.loja}/orders/kpis`
    || canonico(diario.corpo) !== canonico(consultaDoDia(e.dia))) {
    throw new ErroContratoAnalytics('IDENTIDADE', 'A evidência não identifica uma única resposta da consulta diária esperada.');
  }
  const identidade: IdentidadeAnalytics = { ambiente: 'TEST', merchantId: e.loja, dia: e.dia, perfil: 'diario' };
  const conjunto = conferirPaginasAnalytics(identidade, [{ identidade, paginaSolicitada: 1, resposta: diario.resposta }]);
  const compatibilidade = conferirConsultaDiaria(conjunto.paginas[0]);
  return {
    ambiente: 'TEST' as const, quando: e.quando, dia: e.dia,
    http: 200, requestId: diario.requestId,
    estrutura: 'valida' as const, cobertura: conjunto.estado,
    paginasLidas: conjunto.paginasLidas, paginasEsperadas: conjunto.paginasEsperadas,
    gruposLidos: conjunto.itensLidos, gruposEsperados: conjunto.totalItens,
    consultaDiariaCompativel: compatibilidade.compativel, problemasDaConsulta: compatibilidade.problemas,
    normalizacaoMonetaria: 'nao-avaliada' as const,
    publicado: false,
    observacao: 'Diagnóstico de arquivo TEST; procedência declarada pelo arquivo, sem autenticação criptográfica. Moeda e precisão não avaliadas. HTTP 200 não comprova cobertura, homologação nem publicação de faturamento.',
  };
}
