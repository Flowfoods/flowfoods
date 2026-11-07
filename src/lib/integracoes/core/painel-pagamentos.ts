/** Leitura interna ao painel autorizado, na mesma transação repetível e somente leitura. */
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { FUSO_DO_PAINEL, MAX_PARES_DO_PAINEL, MAX_PARCELAS_DO_PAINEL, type CoberturaDaFonteAnalytics } from '../ifood/painel-campos';
import { RecorteGrandeDoPainel } from '../ifood/painel-resumo';
import { resumirPagamentosDoPainel, type OcorrenciaDePagamento } from '../ifood/painel-pagamentos';

interface FonteAutorizada { chave: string; moduloId: string | null; ambigua: boolean }
interface VersaoMarginal {
  id: string | null; moduloId: string; dia: string; fuso: string;
  situacao: string | null; geracao: number | null; versaoContrato: number | null;
  criadoEm: Date | null; valorAusente: boolean;
}

/** O caller já verificou loja, ambiente, módulos, fontes e ambas as permissões. Não é uma ação pública. */
export async function lerPagamentosDoPainel(tx: ClienteDoParceiro, dias: readonly string[], fontes: readonly FonteAutorizada[]) {
  if (!tx.somenteLeitura) throw new Error('A distribuição exige a transação de leitura do painel.');
  if (!dias.length || dias.length * fontes.length > MAX_PARES_DO_PAINEL) throw new RecorteGrandeDoPainel();
  const modulos = fontes.filter(f => !f.ambigua && f.moduloId).map(f => f.moduloId!);
  // Somente metadados: não transfere JSONs marginais de todos os dias para a aplicação.
  const versoes = modulos.length ? await tx.sql<VersaoMarginal>`SELECT DISTINCT ON (e.id, s.situacao)
    s.id, e."moduloId", to_char(e.dia, 'YYYY-MM-DD') AS dia, e.fuso,
    s.situacao, s.geracao, s."versaoContrato", s."criadoEm", (s.parcelas IS NULL) AS "valorAusente"
    FROM "IntegracaoExecucao" e LEFT JOIN "IntegracaoPagamentoSnapshot" s
      ON s."parceiroId" = e."parceiroId" AND s."execucaoId" = e.id AND s.situacao IN ('PUBLICADO','PENDENTE_PERIODO')
    WHERE e."parceiroId" = ${tx.parceiroId} AND e."moduloId" = ANY(${modulos}::text[])
      AND e.perfil = 'pagamentos' AND e.dia BETWEEN ${dias[0]}::date AND ${dias[dias.length - 1]}::date
    ORDER BY e.id, s.situacao, s.geracao DESC LIMIT ${MAX_PARES_DO_PAINEL * 2 + 1}` : [];
  if (versoes.length > MAX_PARES_DO_PAINEL * 2) throw new RecorteGrandeDoPainel();
  const porDia = new Map<string, VersaoMarginal[]>();
  for (const v of versoes) {
    const chave = `${v.moduloId}|${v.dia}`, grupo = porDia.get(chave);
    if (grupo) grupo.push(v); else porDia.set(chave, [v]);
  }
  const publicados = new Set<string>();
  let valorAusente = false;
  const coberturaDias = dias.map(dia => {
    const pares = fontes.map((fonte): CoberturaDaFonteAnalytics => {
      const vs = fonte.moduloId ? porDia.get(`${fonte.moduloId}|${dia}`) ?? [] : [];
      const publicada = vs.find(v => v.situacao === 'PUBLICADO'), pendente = vs.find(v => v.situacao === 'PENDENTE_PERIODO');
      const base = { chave: fonte.chave, publicadaEm: publicada?.criadoEm?.toISOString() ?? null,
        revisaoPendente: !!pendente && (!publicada || pendente.geracao! > publicada.geracao!) };
      if (fonte.ambigua) return { ...base, estado: 'vinculo-ambiguo' };
      if (vs.some(v => v.fuso !== FUSO_DO_PAINEL || (v.id !== null && v.versaoContrato !== 1))) return { ...base, estado: 'identidade-incompativel' };
      if (!publicada?.id) return { ...base, estado: pendente ? 'versao-pendente' : 'ausente' };
      publicados.add(publicada.id);
      valorAusente ||= publicada.valorAusente;
      return { ...base, estado: 'publicado' };
    });
    return { dia, completo: pares.length > 0 && pares.every(p => p.estado === 'publicado'), fontes: pares };
  });
  const cobertura = { completa: fontes.length > 0 && coberturaDias.every(d => d.completo),
    diasEsperados: dias.length, diasCompletos: coberturaDias.filter(d => d.completo).length,
    fontesSelecionadas: fontes.length, paresEsperados: dias.length * fontes.length,
    paresCobertos: coberturaDias.reduce((n, d) => n + d.fontes.filter(f => f.estado === 'publicado').length, 0), dias: coberturaDias };
  const ids = [...publicados];
  // NULL e cobertura parcial não precisam carregar parcelas. SUM(numeric)::text mantém exatidão.
  const linhas = cobertura.completa && !valorAusente && ids.length ? await tx.sql<OcorrenciaDePagamento>`
    SELECT (p->>'metodo') COLLATE "C" AS metodo, sum((p->>'ocorrencias')::numeric)::text AS ocorrencias
    FROM "IntegracaoPagamentoSnapshot" s CROSS JOIN LATERAL jsonb_array_elements(s.parcelas) p
    WHERE s."parceiroId" = ${tx.parceiroId} AND s.id = ANY(${ids}::text[]) AND s.situacao = 'PUBLICADO' AND s."versaoContrato" = 1
    GROUP BY (p->>'metodo') COLLATE "C" LIMIT ${MAX_PARCELAS_DO_PAINEL + 1}` : [];
  if (linhas.length > MAX_PARCELAS_DO_PAINEL) throw new RecorteGrandeDoPainel();
  return resumirPagamentosDoPainel(cobertura, linhas, valorAusente);
}
