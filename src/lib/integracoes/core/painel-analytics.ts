/** INT-1.8B: snapshots Analytics, não faturamento/repasse. Sem transporte ou escrita. */
import { ErroDeRelatorio, type ClienteDoParceiro } from '@/lib/erp/tenant';
import { filtroDeLojas, recusa, type Alcance } from '@/lib/erp/permissoes';
import { moduloLiberado } from '@/lib/erp/liberacao';
import {
  diasDoPainel, FUSO_DO_PAINEL, lerFiltrosDoPainelAnalytics, MAX_PARES_DO_PAINEL, ontemDoPainelAnalytics, UUID_DO_MERCHANT,
  type CoberturaDaFonteAnalytics, type ContextoServidorDoPainelAnalytics, type EntradaDoPainelAnalytics,
  type ResultadoDoPainelAnalytics,
} from '../ifood/painel-campos';
import { RecorteGrandeDoPainel, resumirPainelAnalytics, type LinhaAgregadaDoPainelAnalytics } from '../ifood/painel-resumo';

const MAX_LINHAS_AGREGADAS = 20_000;
class FotografiaInvalidaDoPainel extends Error {}
const recusar = (motivo: Extract<ResultadoDoPainelAnalytics, { ok: false }>['motivo'], mensagem: string): ResultadoDoPainelAnalytics => ({ ok: false, motivo, mensagem });
type VersaoLida = {
  id: string | null; moduloId: string; dia: string; fuso: string; unidade: string;
  situacao: string | null; geracao: number | null; vazioOficial: boolean | null; criadoEm: Date | null;
};

/** Contexto vem do ctx.parceiro autenticado; URL só fornece filtros. As duas permissões são obrigatórias. */
export async function lerPainelAnalytics(
  cliente: ClienteDoParceiro, alcance: Alcance, contexto: ContextoServidorDoPainelAnalytics, entrada: EntradaDoPainelAnalytics = {},
): Promise<ResultadoDoPainelAnalytics> {
  if (!contexto || contexto.parceiroId !== cliente.parceiroId || typeof contexto.homologacaoDeIntegracao !== 'boolean') return recusar('contexto-invalido', 'Não foi possível conferir o contexto deste parceiro.');
  const autorizado = (lojaId?: string) => !recusa(alcance, 'integracao.ver', lojaId ? { lojaId } : undefined) && !recusa(alcance, 'faturamento.ver', lojaId ? { lojaId } : undefined);
  if (!autorizado()) return recusar('sem-permissao', 'Seu acesso precisa incluir Integração e Faturamento para consultar estes indicadores.');
  const ontem = ontemDoPainelAnalytics(), filtros = lerFiltrosDoPainelAnalytics(entrada, ontem);
  if (!filtros) return recusar('filtro-invalido', 'Confira a loja, as fontes e um período válido até ontem.');
  if (filtros.lojaId && !autorizado(filtros.lojaId)) return recusar('sem-permissao', 'Esta loja não está disponível no seu acesso.');
  const dias = diasDoPainel(filtros.inicio, filtros.fim);
  if (!dias) return recusar('recorte-grande', 'Reduza o período ou a seleção de fontes para conferir este painel.');
  const ambiente = contexto.homologacaoDeIntegracao ? 'TEST' : 'PRODUCAO';
  try {
    return await cliente.transacao(async (tx): Promise<ResultadoDoPainelAnalytics> => {
      // Opções internas não elevam isolamento de uma TX já aberta. Verificar antes de qualquer dado.
      const [fotografia] = await tx.sql<{ repetivel: boolean; leitura: boolean }>`SELECT
        current_setting('transaction_isolation') IN ('repeatable read', 'serializable') AS repetivel,
        current_setting('transaction_read_only') = 'on' AS leitura`;
      if (!tx.somenteLeitura || fotografia?.repetivel !== true || fotografia.leitura !== true) throw new FotografiaInvalidaDoPainel();
      if (!await moduloLiberado(tx, 'integracao')) return recusar('nao-liberado', 'O módulo Integração não está liberado para este parceiro.');
      const limite = filtroDeLojas(alcance);
      const lojas = await tx.loja.findMany({ where: limite ? { id: limite } : {}, select: { id: true, nome: true }, orderBy: [{ ativa: 'desc' }, { nome: 'asc' }, { id: 'asc' }], take: MAX_PARES_DO_PAINEL + 1 });
      if (lojas.length > MAX_PARES_DO_PAINEL) throw new RecorteGrandeDoPainel();
      const loja = filtros.lojaId ? lojas.find(l => l.id === filtros.lojaId) : lojas[0];
      if (!loja) return filtros.lojaId ? recusar('filtro-invalido', 'Esta loja não está disponível no seu acesso.') : { ok: true, lojas, filtros, ambiente, painel: null };
      if (!autorizado(loja.id)) return recusar('sem-permissao', 'Esta loja não está disponível no seu acesso.');
      filtros.lojaId = loja.id;
      // Inclui desligadas e referências aplicadas; criadoEm não define início comercial da fonte.
      const conexoes = await tx.integracaoConexao.findMany({
        where: { provedor: 'IFOOD', OR: [{ lojaId: loja.id }, { fontesFaturamento: { some: { recibo: { lojaId: loja.id } } } }] },
        select: { id: true, lojaId: true, idExterno: true, nomeExterno: true, ambiente: true, estado: true,
          marca: { select: { id: true, nome: true } }, modulos: { where: { modulo: 'ANALYTICS' }, select: { id: true } } },
        orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }], take: MAX_PARES_DO_PAINEL + 1,
      });
      if (conexoes.length > MAX_PARES_DO_PAINEL) throw new RecorteGrandeDoPainel();
      if (conexoes.some(c => c.ambiente !== ambiente || !UUID_DO_MERCHANT.test(c.idExterno))) return recusar('contexto-invalido', 'O ambiente ou os vínculos desta loja precisam ser conferidos pela FlowFoods.');
      const porMerchant = new Map<string, typeof conexoes>();
      for (const c of conexoes) {
        const grupo = porMerchant.get(c.idExterno);
        if (grupo) grupo.push(c); else porMerchant.set(c.idExterno, [c]);
      }
      if (filtros.merchants.some(id => !porMerchant.has(id))) return recusar('filtro-invalido', 'Uma das fontes não está disponível nesta loja.');
      const selecionadas = filtros.merchants.length ? filtros.merchants : [...porMerchant.keys()];
      if (dias.length * selecionadas.length > MAX_PARES_DO_PAINEL) throw new RecorteGrandeDoPainel();
      const merchants = [...porMerchant.keys()];
      // Retorna só chaves já autorizadas da loja; nenhum identificador/nome de outra loja.
      const conflitos = merchants.length ? await tx.sql<{ merchant: string }>`SELECT DISTINCT c."idExterno" AS merchant
        FROM "IntegracaoConexao" c WHERE c."parceiroId" = ${tx.parceiroId} AND c.provedor = 'IFOOD'
          AND c.ambiente::text = ${ambiente} AND c."lojaId" <> ${loja.id} AND c."idExterno" = ANY(${merchants}::text[])` : [];
      const ambiguas = new Set(conflitos.map(c => c.merchant));
      for (const [merchant, cs] of porMerchant) if (cs.length !== 1 || cs.some(c => c.lojaId !== loja.id || c.modulos.length > 1)) ambiguas.add(merchant);
      const fontes = [...porMerchant].map(([chave, cs]) => ({ chave, nome: cs[0].nomeExterno, marca: cs[0].marca?.nome ?? null,
        selecionada: selecionadas.includes(chave), ambigua: ambiguas.has(chave), ativa: cs.some(c => c.estado === 'ATIVA') }));
      const modulos = selecionadas.flatMap(id => porMerchant.get(id)!.flatMap(c => c.modulos.map(m => m.id)));
      // DISTINCT ON é no banco: não transfere todas as gerações para deduplicar em memória.
      const versoes = modulos.length ? await tx.sql<VersaoLida>`SELECT DISTINCT ON (e.id, s.situacao)
        s.id, e."moduloId", to_char(e.dia, 'YYYY-MM-DD') AS dia, e.fuso, e.unidade,
        s.situacao, s.geracao, s."vazioOficial", s."criadoEm"
        FROM "IntegracaoExecucao" e LEFT JOIN "IntegracaoSnapshot" s
          ON s."parceiroId" = e."parceiroId" AND s."execucaoId" = e.id AND s.situacao IN ('PUBLICADO','PENDENTE_PERIODO')
        WHERE e."parceiroId" = ${tx.parceiroId} AND e."moduloId" = ANY(${modulos}::text[])
          AND e.perfil = 'diario' AND e.dia BETWEEN ${filtros.inicio}::date AND ${filtros.fim}::date
        ORDER BY e.id, s.situacao, s.geracao DESC LIMIT ${MAX_PARES_DO_PAINEL * 2 + 1}` : [];
      if (versoes.length > MAX_PARES_DO_PAINEL * 2) throw new RecorteGrandeDoPainel();
      const porDia = new Map<string, VersaoLida[]>();
      for (const v of versoes) {
        const k = `${v.moduloId}|${v.dia}`, grupo = porDia.get(k);
        if (grupo) grupo.push(v); else porDia.set(k, [v]);
      }
      const idsPublicados = new Set<string>();
      const coberturaDias = dias.map(dia => {
        const pares = selecionadas.map((chave): CoberturaDaFonteAnalytics => {
          const modulo = porMerchant.get(chave)![0].modulos[0];
          const vs = modulo ? porDia.get(`${modulo.id}|${dia}`) ?? [] : [];
          const publicada = vs.find(v => v.situacao === 'PUBLICADO');
          const pendente = vs.find(v => v.situacao === 'PENDENTE_PERIODO');
          const revisaoPendente = !!pendente && (!publicada || pendente.geracao! > publicada.geracao!);
          const base = { chave, publicadaEm: publicada?.criadoEm?.toISOString() ?? null, revisaoPendente };
          if (ambiguas.has(chave)) return { ...base, estado: 'vinculo-ambiguo' };
          if (vs.some(v => v.fuso !== FUSO_DO_PAINEL || !['REAL', 'CENTAVO'].includes(v.unidade))) return { ...base, estado: 'identidade-incompativel' };
          if (!publicada?.id) return { ...base, estado: pendente ? 'versao-pendente' : 'ausente' };
          idsPublicados.add(publicada.id);
          return { ...base, estado: publicada.vazioOficial ? 'vazio-oficial' : 'publicado' };
        });
        return { dia, completo: pares.length > 0 && pares.every(p => ['publicado', 'vazio-oficial'].includes(p.estado)), fontes: pares };
      });
      const paresCobertos = coberturaDias.reduce((n, d) => n + d.fontes.filter(f => ['publicado', 'vazio-oficial'].includes(f.estado)).length, 0);
      const cobertura = { completa: selecionadas.length > 0 && coberturaDias.every(d => d.completo), diasEsperados: dias.length,
        diasCompletos: coberturaDias.filter(d => d.completo).length, fontesSelecionadas: selecionadas.length,
        paresEsperados: dias.length * selecionadas.length, paresCobertos, dias: coberturaDias };
      const ids = [...idsPublicados];
      // SUM(bigint) é numeric; cast para text preserva inteiros maiores que MAX_SAFE. NULL propaga por métrica.
      const linhas = ids.length ? await tx.sql<LinhaAgregadaDoPainelAnalytics>`SELECT to_char(e.dia, 'YYYY-MM-DD') AS dia,
        k."orderStatus", k."salesChannel", k."deliveredBy", sum(k.pedidos)::text AS pedidos,
        CASE WHEN count(k.gmv) = count(*) THEN sum(k.gmv)::text ELSE NULL END AS gmv,
        CASE WHEN count(k."gmvWithoutDelivery") = count(*) THEN sum(k."gmvWithoutDelivery")::text ELSE NULL END AS "gmvSemEntrega"
        FROM "KpiIfoodDia" k JOIN "IntegracaoSnapshot" s ON s."parceiroId" = k."parceiroId" AND s.id = k."snapshotId"
        JOIN "IntegracaoExecucao" e ON e."parceiroId" = s."parceiroId" AND e.id = s."execucaoId"
        WHERE k."parceiroId" = ${tx.parceiroId} AND k."snapshotId" = ANY(${ids}::text[]) AND s.situacao = 'PUBLICADO' AND e.perfil = 'diario'
        GROUP BY e.dia, k."orderStatus", k."salesChannel", k."deliveredBy"
        LIMIT ${MAX_LINHAS_AGREGADAS + 1}` : [];
      if (linhas.length > MAX_LINHAS_AGREGADAS) throw new RecorteGrandeDoPainel();
      const linhasPorDia = new Map<string, LinhaAgregadaDoPainelAnalytics[]>();
      for (const l of linhas) {
        const grupo = linhasPorDia.get(l.dia);
        if (grupo) grupo.push(l); else linhasPorDia.set(l.dia, [l]);
      }
      return { ok: true, lojas, filtros, ambiente, painel: {
        loja, ambiente, periodo: { inicio: filtros.inicio, fim: filtros.fim, fuso: FUSO_DO_PAINEL, ateOntem: ontem }, fontes, cobertura,
        resumo: resumirPainelAnalytics(linhas, cobertura.completa, selecionadas.length > 0),
        serie: coberturaDias.map(d => ({ dia: d.dia, completo: d.completo, indicadores: resumirPainelAnalytics(linhasPorDia.get(d.dia) ?? [], d.completo, selecionadas.length > 0).indicadores })),
      } };
    }, { repetivel: true, relatorio: {} });
  } catch (erro) {
    if (erro instanceof RecorteGrandeDoPainel) return recusar('recorte-grande', erro.message);
    if (erro instanceof FotografiaInvalidaDoPainel || erro instanceof ErroDeRelatorio) return recusar('leitura-indisponivel', 'Não foi possível conferir os indicadores agora. Tente novamente em instantes ou reduza o período.');
    throw erro;
  }
}
