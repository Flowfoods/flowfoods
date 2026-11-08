/** Leitor interno: usa a fotografia e os gates do painel autorizado. */
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { FUSO_DO_PAINEL, MAX_PARES_DO_PAINEL, MAX_PARCELAS_DO_PAINEL, type CoberturaDaFonteAnalytics } from '../ifood/painel-campos';
import { RecorteGrandeDoPainel } from '../ifood/painel-resumo';
import { resumirComplementaresDoPainel, type OcorrenciaComplementar } from '../ifood/painel-complementares';

interface FonteAutorizada { chave: string; moduloId: string | null; ambigua: boolean }
interface VersaoComplementar {
  id: string | null; moduloId: string; dia: string; fuso: string;
  situacao: string | null; geracao: number | null; versaoContrato: number | null;
  criadoEm: Date | null; horariosAusentes: boolean; primeirosPedidosAusentes: boolean;
}
/** Não é ação pública. O caller confere ambas permissões, liberação, loja, ambiente e fontes. */
export async function lerComplementaresDoPainel(tx: ClienteDoParceiro, dias: readonly string[], fontes: readonly FonteAutorizada[]) {
  if (!tx.somenteLeitura) throw new Error('As distribuições exigem a transação de leitura do painel.');
  if (!dias.length || dias.length * fontes.length > MAX_PARES_DO_PAINEL) throw new RecorteGrandeDoPainel();
  const modulos = fontes.filter(f => !f.ambigua && f.moduloId).map(f => f.moduloId!);
  const versoes = modulos.length ? await tx.sql<VersaoComplementar>`SELECT DISTINCT ON (e.id, s.situacao)
    s.id, e."moduloId", to_char(e.dia, 'YYYY-MM-DD') AS dia, e.fuso,
    s.situacao, s.geracao, s."versaoContrato", s."criadoEm",
    (s.horarios IS NULL) AS "horariosAusentes", (s."primeirosPedidos" IS NULL) AS "primeirosPedidosAusentes"
    FROM "IntegracaoExecucao" e LEFT JOIN "IntegracaoDistribuicaoSnapshot" s
      ON s."parceiroId" = e."parceiroId" AND s."execucaoId" = e.id AND s.situacao IN ('PUBLICADO','PENDENTE_PERIODO')
    WHERE e."parceiroId" = ${tx.parceiroId} AND e."moduloId" = ANY(${modulos}::text[])
      AND e.perfil = 'complementares' AND e.dia BETWEEN ${dias[0]}::date AND ${dias[dias.length - 1]}::date
    ORDER BY e.id, s.situacao, s.geracao DESC LIMIT ${MAX_PARES_DO_PAINEL * 2 + 1}` : [];
  if (versoes.length > MAX_PARES_DO_PAINEL * 2) throw new RecorteGrandeDoPainel();
  const porDia = new Map<string, VersaoComplementar[]>();
  for (const v of versoes) {
    const chave = `${v.moduloId}|${v.dia}`, grupo = porDia.get(chave);
    if (grupo) grupo.push(v); else porDia.set(chave, [v]);
  }
  const publicados = new Set<string>(), ausentes = { horarios: false, primeirosPedidos: false };
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
      ausentes.horarios ||= publicada.horariosAusentes;
      ausentes.primeirosPedidos ||= publicada.primeirosPedidosAusentes;
      return { ...base, estado: 'publicado' };
    });
    return { dia, completo: pares.length > 0 && pares.every(p => p.estado === 'publicado'), fontes: pares };
  });
  const cobertura = { completa: fontes.length > 0 && coberturaDias.every(d => d.completo),
    diasEsperados: dias.length, diasCompletos: coberturaDias.filter(d => d.completo).length,
    fontesSelecionadas: fontes.length, paresEsperados: dias.length * fontes.length,
    paresCobertos: coberturaDias.reduce((n, d) => n + d.fontes.filter(f => f.estado === 'publicado').length, 0), dias: coberturaDias };
  const ids = [...publicados];
  // Consultas estáticas e independentes: um campo NULL não esconde o outro nem vira zero.
  const horarios = cobertura.completa && !ausentes.horarios && ids.length ? await tx.sql<OcorrenciaComplementar>`
    SELECT (p->>'termo') COLLATE "C" AS termo, sum((p->>'ocorrencias')::numeric)::text AS ocorrencias
    FROM "IntegracaoDistribuicaoSnapshot" s CROSS JOIN LATERAL jsonb_array_elements(s.horarios) p
    WHERE s."parceiroId" = ${tx.parceiroId} AND s.id = ANY(${ids}::text[]) AND s.situacao = 'PUBLICADO' AND s."versaoContrato" = 1
    GROUP BY (p->>'termo') COLLATE "C" LIMIT ${MAX_PARCELAS_DO_PAINEL + 1}` : [];
  const primeirosPedidos = cobertura.completa && !ausentes.primeirosPedidos && ids.length ? await tx.sql<OcorrenciaComplementar>`
    SELECT (p->>'termo') COLLATE "C" AS termo, sum((p->>'ocorrencias')::numeric)::text AS ocorrencias
    FROM "IntegracaoDistribuicaoSnapshot" s CROSS JOIN LATERAL jsonb_array_elements(s."primeirosPedidos") p
    WHERE s."parceiroId" = ${tx.parceiroId} AND s.id = ANY(${ids}::text[]) AND s.situacao = 'PUBLICADO' AND s."versaoContrato" = 1
    GROUP BY (p->>'termo') COLLATE "C" LIMIT ${MAX_PARCELAS_DO_PAINEL + 1}` : [];
  if (horarios.length > MAX_PARCELAS_DO_PAINEL || primeirosPedidos.length > MAX_PARCELAS_DO_PAINEL) throw new RecorteGrandeDoPainel();
  return resumirComplementaresDoPainel(cobertura, horarios, primeirosPedidos, ausentes);
}
