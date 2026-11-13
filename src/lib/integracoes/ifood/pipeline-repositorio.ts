/** Fila por parceiro. Toda evidência pertence a uma geração; só uma cobertura inteira publica uma versão. */
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { datasEmPeriodoFechado, travarParaEscrever } from '@/lib/erp/periodo-trava';
import type { PosseAnalytics } from '../core/posse-analytics';
import { registrarEsperaAnalytics } from '../core/controle-analytics';
import { mudarModulo } from '../core/conexoes';
import { DIMENSOES_DIARIAS, METRICAS_DIARIAS, normalizarDiaAnalytics } from './analytics';
import { normalizarPagamentosAnalytics } from './analytics-pagamentos';
import { normalizarComplementaresAnalytics } from './analytics-complementares';
import { diaSeguinte } from './datas';
import { classificar } from './respostas';
import { sinalizarFaturamentoAnalytics } from './faturamento-pendencias';
import {
  ErroPipelineAnalytics, LEASE_SEGUNDOS, LIMITE_BYTES_JANELA, LIMITE_GRUPOS_JANELA, PRIORIDADE, PRIORIDADE_RELEITURA_DIARIA,
  type FalhaAnalytics, type JanelaAnalytics, type PaginaDoTransporte, type TarefaAnalytics, type TipoJanela,
} from './pipeline-tipos';

const hash = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const idDeRequisicao = (s: string | null | undefined) => s && /^[\w.:-]{1,120}$/.test(s) ? s : null;
const inclusao = { modulo: { include: { conexao: true } } } as const;
type Execucao = Prisma.IntegracaoExecucaoGetPayload<{ include: typeof inclusao }>;

/** JSON.parse aceita Infinity por overflow e UTF-16 que JSONB não armazena. Recusa antes do driver. */
function jsonPersistivel(valor: unknown): boolean {
  const textoValido = (s: string) => !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);
  const pilha = [{ valor, nivel: 0 }];
  let nos = 0;
  while (pilha.length) {
    const atual = pilha.pop()!;
    if (++nos > 250_000 || atual.nivel > 32) return false;
    const v = atual.valor;
    if (typeof v === 'number' && !Number.isFinite(v)) return false;
    if (typeof v === 'string' && !textoValido(v)) return false;
    if (v && typeof v === 'object') {
      for (const [k, filho] of Object.entries(v)) {
        if (!textoValido(k)) return false;
        pilha.push({ valor: filho, nivel: atual.nivel + 1 });
      }
    }
  }
  return true;
}

function tarefaDe(e: Execucao): TarefaAnalytics {
  const c = e.modulo.conexao;
  const base = {
    id: e.id, parceiroId: e.parceiroId, moduloId: e.moduloId, appId: e.modulo.appId,
    lojaId: c.lojaId, geracao: e.geracao, dono: e.dono!,
    tipo: e.tipo as TipoJanela, fuso: e.fuso, unidade: { moeda: 'BRL' as const, unidade: e.unidade as 'REAL' | 'CENTAVO' },
  };
  const identidade = { ambiente: c.ambiente, merchantId: c.idExterno, dia: e.dia.toISOString().slice(0, 10) };
  if (e.perfil === 'pagamentos') return { ...base, perfil: 'pagamentos', identidade: { ...identidade, perfil: 'pagamentos', fuso: e.fuso, versaoContrato: 1 } };
  if (e.perfil === 'complementares') return { ...base, perfil: 'complementares', identidade: { ...identidade, perfil: 'complementares', fuso: e.fuso, versaoContrato: 1 } };
  if (e.perfil !== 'acesso' && e.perfil !== 'diario') throw new ErroPipelineAnalytics('ENTRADA', 'Perfil de coleta desconhecido.');
  return { ...base, perfil: e.perfil, identidade: { ...identidade, perfil: e.perfil === 'acesso' ? 'homologacao' : 'diario' } };
}

/** D1 e revisão usam a mesma identidade. Um novo ciclo não antecipa Retry-After nem interrompe uma tentativa. */
export async function agendarJanela(cliente: ClienteDoParceiro, j: JanelaAnalytics): Promise<void> {
  if (!diaSeguinte(j.dia) || !diaSeguinte(j.ciclo) || !(j.tipo in PRIORIDADE)
    || !['REAL', 'CENTAVO'].includes(j.unidade) || !j.moduloId || j.moduloId.length > 60
    || (j.perfil !== undefined && !['diario', 'pagamentos', 'complementares'].includes(j.perfil)) || (j.tipo === 'ACESSO' && j.perfil !== undefined)) {
    throw new ErroPipelineAnalytics('ENTRADA', 'Janela de coleta inválida.');
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: j.fuso }).format(); }
  catch { throw new ErroPipelineAnalytics('ENTRADA', 'Fuso da coleta inválido.'); }
  const perfil = j.tipo === 'ACESSO' ? 'acesso' : j.perfil ?? 'diario';
  await cliente.transacao(async tx => {
    const acesso = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_exigir_acesso(${tx.parceiroId}, ${j.moduloId}, NULL, ${perfil === 'acesso'}) AS ok`;
    if (!acesso[0]?.ok) throw new ErroPipelineAnalytics('ACESSO', 'Integração sem autorização para coletar.');
    const anterior = await tx.integracaoExecucao.findFirst({ where: { moduloId: j.moduloId, dia: new Date(`${j.dia}T00:00:00Z`), perfil } });
    if (anterior && (anterior.fuso !== j.fuso || anterior.unidade !== j.unidade)) throw new ErroPipelineAnalytics('ENTRADA', 'Fuso ou unidade diferente da janela existente.');
    await tx.sql`INSERT INTO "IntegracaoExecucao"
      (id, "parceiroId", "moduloId", dia, perfil, tipo, ciclo, prioridade, fuso, unidade, "atualizadoEm")
      VALUES (${randomUUID()}, ${tx.parceiroId}, ${j.moduloId}, ${j.dia}::date, ${perfil}, ${j.tipo}, ${j.ciclo}, ${PRIORIDADE[j.tipo]}, ${j.fuso}, ${j.unidade}, clock_timestamp())
      ON CONFLICT ("parceiroId", "moduloId", dia, perfil) DO UPDATE SET
      tipo = CASE WHEN "IntegracaoExecucao".estado IN ('PLANEJADA','AGUARDANDO') THEN
        CASE WHEN EXCLUDED.prioridade < "IntegracaoExecucao".prioridade THEN EXCLUDED.tipo ELSE "IntegracaoExecucao".tipo END ELSE EXCLUDED.tipo END,
      prioridade = CASE WHEN "IntegracaoExecucao".estado IN ('PLANEJADA','AGUARDANDO') THEN LEAST("IntegracaoExecucao".prioridade, EXCLUDED.prioridade) ELSE EXCLUDED.prioridade END,
      estado = CASE WHEN "IntegracaoExecucao".estado IN ('PLANEJADA','AGUARDANDO') THEN "IntegracaoExecucao".estado ELSE 'PLANEJADA' END,
      ciclo = EXCLUDED.ciclo, "concluidaEm" = NULL, "atualizadoEm" = clock_timestamp()
      WHERE "IntegracaoExecucao".estado <> 'EXECUTANDO'
        AND "IntegracaoExecucao"."ultimoErro" IS DISTINCT FROM 'prazo-invalido'
        AND ("IntegracaoExecucao".ciclo <> EXCLUDED.ciclo OR
          ("IntegracaoExecucao".estado IN ('PLANEJADA','AGUARDANDO') AND EXCLUDED.prioridade < "IntegracaoExecucao".prioridade))`;
    const gravada = await tx.integracaoExecucao.findFirstOrThrow({ where: { moduloId: j.moduloId, dia: new Date(`${j.dia}T00:00:00Z`), perfil } });
    if (gravada.fuso !== j.fuso || gravada.unidade !== j.unidade) throw new ErroPipelineAnalytics('ENTRADA', 'Fuso ou unidade diferente da janela existente.');
  });
}

export function criarRepositorioAnalytics(cliente: ClienteDoParceiro, posse: PosseAnalytics, chaveGeral: () => boolean) {
  async function confirmarPosse() {
    if (!await posse.confirmar()) throw new ErroPipelineAnalytics('POSSE', 'A execução perdeu a posse.');
    if (!chaveGeral()) throw new ErroPipelineAnalytics('ACESSO', 'A coleta está suspensa.');
  }
  async function acesso(tx: ClienteDoParceiro, moduloId: string, verificacao: boolean) {
    const a = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_exigir_acesso(${tx.parceiroId}, ${moduloId}, ${posse.id}, ${verificacao}) AS ok`;
    if (!a[0]?.ok) throw new ErroPipelineAnalytics('ACESSO', 'Integração sem autorização para coletar.');
  }
  async function conferir(tx: ClienteDoParceiro, t: TarefaAnalytics, exigirAcesso = true) {
    if (t.parceiroId !== tx.parceiroId || t.dono !== posse.id) throw new ErroPipelineAnalytics('POSSE', 'Tentativa de outra execução.');
    if (exigirAcesso) await acesso(tx, t.moduloId, t.perfil === 'acesso');
    const f = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_fence(${tx.parceiroId}, ${t.id}, ${t.geracao}::int, ${t.dono}) AS ok`;
    if (!f[0]?.ok) throw new ErroPipelineAnalytics('POSSE', 'Tentativa encerrada ou com prazo expirado.');
    const e = await tx.integracaoExecucao.findUniqueOrThrow({ where: { id: t.id }, include: inclusao });
    const real = tarefaDe(e);
    if (Object.keys(real).some(k => JSON.stringify(real[k as keyof TarefaAnalytics]) !== JSON.stringify(t[k as keyof TarefaAnalytics]))) {
      throw new ErroPipelineAnalytics('ENTRADA', 'Identidade da tentativa não confere.');
    }
    return e;
  }
  async function encerrar(tx: ClienteDoParceiro, t: TarefaAnalytics, estado: string, extra: Prisma.IntegracaoExecucaoUpdateManyMutationInput = {}) {
    const r = await tx.integracaoExecucao.updateMany({ where: { id: t.id, geracao: t.geracao, dono: t.dono, estado: 'EXECUTANDO' },
      data: { estado, dono: null, leaseAte: null, concluidaEm: new Date(), ...extra } });
    if (r.count !== 1) throw new ErroPipelineAnalytics('POSSE', 'Tentativa substituída.');
  }
  return {
    async adquirir(): Promise<TarefaAnalytics | null> {
      await confirmarPosse();
      return cliente.transacao(async tx => {
        // Leitura de candidatos não trava a fila antes das permissões (mesma ordem de locks da publicação).
        const candidatos = await tx.sql<{ id: string; moduloId: string; perfil: string }>`SELECT e.id, e."moduloId", e.perfil FROM "IntegracaoExecucao" e
          WHERE e."parceiroId" = ${tx.parceiroId} AND e."naoAntesDe" <= clock_timestamp()
            AND (e.estado IN ('PLANEJADA','AGUARDANDO') OR (e.estado = 'EXECUTANDO' AND e."leaseAte" < clock_timestamp() AND e.dono <> ${posse.id}))
            AND erp_integracao_exigir_acesso(${tx.parceiroId}, e."moduloId", ${posse.id}, e.perfil = 'acesso')
          ORDER BY (SELECT max(h."iniciadaEm") FROM "IntegracaoExecucao" h WHERE h."parceiroId" = e."parceiroId" AND h.perfil = e.perfil) ASC NULLS FIRST,
            CASE e.perfil WHEN 'acesso' THEN 0 WHEN 'diario' THEN 1 WHEN 'pagamentos' THEN 2 WHEN 'complementares' THEN 3 ELSE 4 END,
            e.prioridade, e."naoAntesDe", e.dia DESC, e.id LIMIT 30`;
        for (const c of candidatos) {
          // A recusa não altera evidência nem passa para outra conexão sem repetir a verificação.
          const a = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_exigir_acesso(${tx.parceiroId}, ${c.moduloId}, ${posse.id}, ${c.perfil === 'acesso'}) AS ok`;
          if (!a[0]?.ok) continue;
          const rows = await tx.sql<{ id: string }>`UPDATE "IntegracaoExecucao" SET estado = 'EXECUTANDO',
            geracao = geracao + 1, dono = ${posse.id}, "leaseAte" = clock_timestamp() + ${LEASE_SEGUNDOS} * interval '1 second',
            prioridade = CASE WHEN perfil = 'diario' AND prioridade = ${PRIORIDADE_RELEITURA_DIARIA}::int
              THEN CASE tipo WHEN 'D1' THEN ${PRIORIDADE.D1}::int WHEN 'REVISAO' THEN ${PRIORIDADE.REVISAO}::int ELSE ${PRIORIDADE.HISTORICO}::int END
              ELSE prioridade END,
            "iniciadaEm" = clock_timestamp(), "concluidaEm" = NULL, "ultimoErro" = NULL, "ultimoHttp" = NULL, "ultimoRequestId" = NULL,
            "atualizadoEm" = clock_timestamp()
            WHERE "parceiroId" = ${tx.parceiroId} AND id = ${c.id} AND "naoAntesDe" <= clock_timestamp()
              AND (estado IN ('PLANEJADA','AGUARDANDO') OR (estado = 'EXECUTANDO' AND "leaseAte" < clock_timestamp() AND dono <> ${posse.id}))
            RETURNING id`;
          if (rows.length) return tarefaDe(await tx.integracaoExecucao.findUniqueOrThrow({ where: { id: c.id }, include: inclusao }));
        }
        return null;
      }, { timeout: 30_000 });
    },
    async renovar(t: TarefaAnalytics): Promise<void> {
      await confirmarPosse();
      await cliente.transacao(async tx => {
        await conferir(tx, t);
        await tx.sql`UPDATE "IntegracaoExecucao" SET "leaseAte" = clock_timestamp() + ${LEASE_SEGUNDOS} * interval '1 second',
          "atualizadoEm" = clock_timestamp() WHERE "parceiroId" = ${tx.parceiroId} AND id = ${t.id}`;
      });
    },
    async salvarPagina(t: TarefaAnalytics, p: PaginaDoTransporte): Promise<void> {
      await confirmarPosse();
      const bytes = Buffer.byteLength(p.corpoOriginal, 'utf8');
      if (bytes > 2 * 1024 * 1024 || !Number.isInteger(p.pagina) || p.pagina < 1 || p.pagina > 1000 || p.http !== 200) {
        throw new ErroPipelineAnalytics('LIMITE', 'Resposta fora dos limites da coleta.');
      }
      if (['pagamentos', 'complementares'].includes(t.perfil) ? p.versaoContrato !== 1 : p.versaoContrato !== undefined) {
        throw new ErroPipelineAnalytics('CORPO', 'Versão de recibo incompatível com o perfil.');
      }
      let resposta: unknown;
      try { resposta = JSON.parse(p.corpoOriginal); if (resposta === null || !jsonPersistivel(resposta)) throw new Error(); }
      catch { throw new ErroPipelineAnalytics('CORPO', 'Resposta não é JSON válido.'); }
      await cliente.transacao(async tx => {
        await conferir(tx, t);
        const existentes = await tx.sql<{ pagina: number; sha256: string; bytes: number }>`SELECT pagina, sha256, octet_length("corpoOriginal") AS bytes
          FROM "IntegracaoPayload" WHERE "parceiroId" = ${tx.parceiroId} AND "execucaoId" = ${t.id} AND geracao = ${t.geracao}`;
        const sha256 = hash(p.corpoOriginal);
        const ja = existentes.find(e => e.pagina === p.pagina);
        if (ja) {
          if (ja.sha256 !== sha256) throw new ErroPipelineAnalytics('CORPO', 'A página mudou na mesma tentativa.');
          return;
        }
        if (existentes.reduce((s, e) => s + e.bytes, bytes) > LIMITE_BYTES_JANELA) throw new ErroPipelineAnalytics('LIMITE', 'Janela excedeu o limite local.');
        // O parser JS não pode alterar silenciosamente um decimal do corpo original. JSONB compara
        // a representação decimal original com a interpretada antes de qualquer normalização monetária.
        try {
          const fiel = await tx.sql<{ igual: boolean }>`SELECT ${p.corpoOriginal}::jsonb = ${JSON.stringify(resposta)}::jsonb AS igual`;
          if (!fiel[0]?.igual) throw new ErroPipelineAnalytics('CORPO', 'O JSON original perde precisão ao ser interpretado.');
        } catch (erro) {
          if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2010'
            && ['22003', '22P02', '22P05'].includes(String(erro.meta?.code))) {
            throw new ErroPipelineAnalytics('CORPO', 'O JSON original não pode ser armazenado com precisão.');
          }
          throw erro;
        }
        // O serializer de Json do Prisma descarta chaves próprias como __proto__.
        // Texto parametrizado mantém essas chaves no JSONB, depois da prova de fidelidade acima.
        // Continua no portão tenant, na mesma TX/fence e sob os triggers/CHECKs do payload.
        await tx.sql`INSERT INTO "IntegracaoPayload"
          (id, "parceiroId", "execucaoId", geracao, pagina, "corpoOriginal", resposta, sha256, http, "requestId", "versaoContrato")
          VALUES (${randomUUID()}, ${tx.parceiroId}, ${t.id}, ${t.geracao}::int, ${p.pagina}::int,
            ${p.corpoOriginal}, ${p.corpoOriginal}::jsonb, ${sha256}, ${p.http}::int,
            ${idDeRequisicao(p.requestId)}, ${p.versaoContrato ?? null}::int)`;
      });
    },
    async publicar(t: TarefaAnalytics): Promise<'publicada' | 'vazia' | 'sem-mudanca' | 'pendente-periodo'> {
      await confirmarPosse();
      if (t.perfil !== 'diario') throw new ErroPipelineAnalytics('ENTRADA', 'Verificação de acesso não publica indicadores.');
      const paginas = await cliente.integracaoPayload.findMany({ where: { execucaoId: t.id, geracao: t.geracao }, orderBy: { pagina: 'asc' } });
      if (paginas.reduce((s, p) => s + Buffer.byteLength(p.corpoOriginal), 0) > LIMITE_BYTES_JANELA) throw new ErroPipelineAnalytics('LIMITE', 'Janela excedeu o limite local.');
      for (const p of paginas) if (hash(p.corpoOriginal) !== p.sha256) throw new ErroPipelineAnalytics('CORPO', 'Evidência não confere com o hash.');
      const dia = normalizarDiaAnalytics(t.identidade, paginas.map(p => ({ identidade: t.identidade, paginaSolicitada: p.pagina, resposta: JSON.parse(p.corpoOriginal) })), t.unidade);
      if (dia.linhas.length > LIMITE_GRUPOS_JANELA) throw new ErroPipelineAnalytics('LIMITE', 'Janela excedeu o limite de grupos.');
      const linhas = dia.linhas.map(l => ({ ...l, chaveGrupo: hash(JSON.stringify(DIMENSOES_DIARIAS.map(d => l.dimensoes[d]))) }))
        .sort((a, b) => a.chaveGrupo.localeCompare(b.chaveGrupo));
      const sha256 = hash(JSON.stringify([t.identidade, t.unidade, linhas.map(l => [l.chaveGrupo, l.pedidos, METRICAS_DIARIAS.map(m => l.centavos[m])])]));
      return cliente.transacao(async tx => {
        await travarParaEscrever(tx);
        await conferir(tx, t);
        const atuais = await tx.integracaoPayload.findMany({ where: { execucaoId: t.id, geracao: t.geracao }, orderBy: { pagina: 'asc' }, select: { pagina: true, sha256: true } });
        if (atuais.length !== paginas.length || atuais.some((p, i) => p.pagina !== paginas[i].pagina || p.sha256 !== paginas[i].sha256)) {
          throw new ErroPipelineAnalytics('CORPO', 'A evidência mudou durante a preparação da publicação.');
        }
        const ultimo = await tx.integracaoSnapshot.findFirst({ where: { execucaoId: t.id, situacao: 'PUBLICADO' }, orderBy: { geracao: 'desc' } });
        if (ultimo?.hash === sha256) {
          await sinalizarFaturamentoAnalytics(tx, ultimo.id, posse.id);
          await encerrar(tx, t, 'SUCESSO', { ultimoHash: sha256 });
          return 'sem-mudanca';
        }
        const fechado = (await datasEmPeriodoFechado(tx, [t.identidade.dia])).has(t.identidade.dia);
        const snapshot = await tx.integracaoSnapshot.create({ data: {
          parceiroId: tx.parceiroId, execucaoId: t.id, geracao: t.geracao, situacao: fechado ? 'PENDENTE_PERIODO' : 'PUBLICADO',
          vazioOficial: dia.estado === 'vazio-oficial', hash: sha256, pedidos: BigInt(dia.pedidos), numeroGrupos: linhas.length,
        } });
        // Lotes limitados mantêm o número de parâmetros e a memória previsíveis. A versão inteira é atômica.
        for (let i = 0; i < linhas.length; i += 500) {
          await tx.kpiIfoodDia.createMany({ data: linhas.slice(i, i + 500).map(l => ({
            parceiroId: tx.parceiroId, snapshotId: snapshot.id, chaveGrupo: l.chaveGrupo,
            ...l.dimensoes, pedidos: BigInt(l.pedidos),
            ...Object.fromEntries(METRICAS_DIARIAS.map(m => [m, l.centavos[m] === null ? null : BigInt(l.centavos[m]!)])),
          })) });
        }
        if (!fechado) await sinalizarFaturamentoAnalytics(tx, snapshot.id, posse.id);
        await encerrar(tx, t, fechado ? 'PENDENTE_PERIODO' : 'SUCESSO', {
          ultimoHash: sha256, ...(!fechado ? { ultimaPublicacaoEm: new Date() } : {}),
        });
        return fechado ? 'pendente-periodo' : dia.estado === 'vazio-oficial' ? 'vazia' : 'publicada';
      }, { timeout: 30_000 });
    },
    async publicarPagamentos(t: TarefaAnalytics): Promise<'publicada' | 'sem-mudanca' | 'pendente-periodo'> {
      await confirmarPosse();
      if (t.perfil !== 'pagamentos') throw new ErroPipelineAnalytics('ENTRADA', 'Esta tarefa não é uma distribuição de pagamentos.');
      const paginas = await cliente.integracaoPayload.findMany({ where: { execucaoId: t.id, geracao: t.geracao }, orderBy: { pagina: 'asc' } });
      for (const p of paginas) {
        if (p.versaoContrato !== 1 || hash(p.corpoOriginal) !== p.sha256) throw new ErroPipelineAnalytics('CORPO', 'Versão ou hash do recibo marginal inválido.');
      }
      const normalizado = normalizarPagamentosAnalytics(t.identidade, paginas.map(p => ({
        identidade: t.identidade, paginaSolicitada: p.pagina, versaoContrato: 1, corpoOriginal: p.corpoOriginal,
      })));
      // Fuso é parte da identidade persistida, mesmo quando o texto do dia é igual.
      const sha256 = hash(JSON.stringify([t.identidade.ambiente, t.identidade.merchantId, t.identidade.dia,
        t.identidade.fuso, t.identidade.perfil, normalizado.versaoContrato, normalizado.parcelas]));
      return cliente.transacao(async tx => {
        await travarParaEscrever(tx);
        await conferir(tx, t);
        const atuais = await tx.integracaoPayload.findMany({ where: { execucaoId: t.id, geracao: t.geracao }, orderBy: { pagina: 'asc' }, select: { pagina: true, sha256: true, versaoContrato: true } });
        if (atuais.length !== paginas.length || atuais.some((p, i) => p.pagina !== paginas[i].pagina || p.sha256 !== paginas[i].sha256 || p.versaoContrato !== paginas[i].versaoContrato)) {
          throw new ErroPipelineAnalytics('CORPO', 'A evidência marginal mudou durante a preparação.');
        }
        const anterior = await tx.integracaoPagamentoSnapshot.findFirst({ where: { execucaoId: t.id, situacao: 'PUBLICADO' }, orderBy: { geracao: 'desc' } });
        if (anterior?.hash === sha256 && anterior.versaoContrato === normalizado.versaoContrato) {
          await encerrar(tx, t, 'SUCESSO', { ultimoHash: sha256 });
          return 'sem-mudanca';
        }
        const fechado = (await datasEmPeriodoFechado(tx, [t.identidade.dia])).has(t.identidade.dia);
        await tx.integracaoPagamentoSnapshot.create({ data: {
          parceiroId: tx.parceiroId, execucaoId: t.id, geracao: t.geracao, paginaInicial: 1,
          versaoContrato: normalizado.versaoContrato, situacao: fechado ? 'PENDENTE_PERIODO' : 'PUBLICADO', hash: sha256,
          parcelas: normalizado.parcelas === null ? Prisma.DbNull : normalizado.parcelas.map(p => ({ ...p })),
        } });
        await encerrar(tx, t, fechado ? 'PENDENTE_PERIODO' : 'SUCESSO', {
          ultimoHash: sha256, ...(!fechado ? { ultimaPublicacaoEm: new Date() } : {}),
        });
        return fechado ? 'pendente-periodo' : 'publicada';
      }, { timeout: 30_000 });
    },
    async publicarComplementares(t: TarefaAnalytics): Promise<'publicada' | 'sem-mudanca' | 'pendente-periodo'> {
      await confirmarPosse();
      if (t.perfil !== 'complementares') throw new ErroPipelineAnalytics('ENTRADA', 'Esta tarefa não é uma distribuição complementar.');
      const paginas = await cliente.integracaoPayload.findMany({ where: { execucaoId: t.id, geracao: t.geracao }, orderBy: { pagina: 'asc' } });
      for (const p of paginas) {
        if (p.versaoContrato !== 1 || hash(p.corpoOriginal) !== p.sha256) throw new ErroPipelineAnalytics('CORPO', 'Versão ou hash do recibo complementar inválido.');
      }
      const normalizado = normalizarComplementaresAnalytics(t.identidade, paginas.map(p => ({
        identidade: t.identidade, paginaSolicitada: p.pagina, versaoContrato: 1, corpoOriginal: p.corpoOriginal,
      })));
      const sha256 = hash(JSON.stringify([t.identidade.ambiente, t.identidade.merchantId, t.identidade.dia,
        t.identidade.fuso, t.identidade.perfil, normalizado.versaoContrato, normalizado.horarios, normalizado.primeirosPedidos]));
      return cliente.transacao(async tx => {
        await travarParaEscrever(tx);
        await conferir(tx, t);
        const atuais = await tx.integracaoPayload.findMany({ where: { execucaoId: t.id, geracao: t.geracao }, orderBy: { pagina: 'asc' }, select: { pagina: true, sha256: true, versaoContrato: true } });
        if (atuais.length !== paginas.length || atuais.some((p, i) => p.pagina !== paginas[i].pagina || p.sha256 !== paginas[i].sha256 || p.versaoContrato !== paginas[i].versaoContrato)) {
          throw new ErroPipelineAnalytics('CORPO', 'A evidência complementar mudou durante a preparação.');
        }
        const anterior = await tx.integracaoDistribuicaoSnapshot.findFirst({ where: { execucaoId: t.id, situacao: 'PUBLICADO' }, orderBy: { geracao: 'desc' } });
        if (anterior?.hash === sha256 && anterior.versaoContrato === normalizado.versaoContrato) {
          await encerrar(tx, t, 'SUCESSO', { ultimoHash: sha256 });
          return 'sem-mudanca';
        }
        const fechado = (await datasEmPeriodoFechado(tx, [t.identidade.dia])).has(t.identidade.dia);
        await tx.integracaoDistribuicaoSnapshot.create({ data: {
          parceiroId: tx.parceiroId, execucaoId: t.id, geracao: t.geracao, paginaInicial: 1,
          versaoContrato: normalizado.versaoContrato, situacao: fechado ? 'PENDENTE_PERIODO' : 'PUBLICADO', hash: sha256,
          horarios: normalizado.horarios === null ? Prisma.DbNull : normalizado.horarios.map(p => ({ ...p })),
          primeirosPedidos: normalizado.primeirosPedidos === null ? Prisma.DbNull : normalizado.primeirosPedidos.map(p => ({ ...p })),
        } });
        await encerrar(tx, t, fechado ? 'PENDENTE_PERIODO' : 'SUCESSO', {
          ultimoHash: sha256, ...(!fechado ? { ultimaPublicacaoEm: new Date() } : {}),
        });
        return fechado ? 'pendente-periodo' : 'publicada';
      }, { timeout: 30_000 });
    },
    async verificarAcesso(t: TarefaAnalytics): Promise<void> {
      await confirmarPosse();
      if (t.perfil !== 'acesso') throw new ErroPipelineAnalytics('ENTRADA', 'Esta tarefa não é uma verificação de acesso.');
      await cliente.transacao(async tx => {
        await conferir(tx, t);
        const p = await tx.integracaoPayload.findFirst({ where: { execucaoId: t.id, geracao: t.geracao, pagina: 1, http: 200 } });
        if (!p) throw new ErroPipelineAnalytics('CORPO', 'Falta a evidência da verificação.');
        const corpo: unknown = JSON.parse(p.corpoOriginal);
        if (hash(p.corpoOriginal) !== p.sha256 || !corpo || typeof corpo !== 'object' || Array.isArray(corpo)
          || classificar(200, {}, p.corpoOriginal, Date.now()).tipo !== 'ok') {
          throw new ErroPipelineAnalytics('CORPO', 'A evidência de acesso contém uma resposta inválida.');
        }
        await tx.integracaoConexaoModulo.update({ where: { id: t.moduloId }, data: { verificadoEm: new Date() } });
        await encerrar(tx, t, 'SUCESSO');
      });
    },
    async falhar(t: TarefaAnalytics, f: FalhaAnalytics): Promise<void> {
      // Revogação não pode impedir o registro da própria falha; a posse e a geração continuam obrigatórias.
      if (!await posse.confirmar()) throw new ErroPipelineAnalytics('POSSE', 'A execução perdeu a posse.');
      let prazo: Date | undefined;
      if (f.naoAntesDe) {
        const d = new Date(f.naoAntesDe);
        if (Number.isFinite(d.getTime()) && d.getUTCFullYear() <= 9999) prazo = d;
      } else if (f.codigo === 'limite') {
        prazo = new Date(Date.now() + 4 * 60 * 60 * 1000);
      }
      const transitoria = ['indisponivel', 'nao-encontrado', 'limite'].includes(f.codigo);
      const pausaPorPrazo = f.codigo === 'prazo-invalido' || (f.codigo === 'limite' && !prazo);
      if (f.codigo === 'limite' || pausaPorPrazo) {
        if (t.parceiroId !== cliente.parceiroId || t.dono !== posse.id) throw new ErroPipelineAnalytics('POSSE', 'Tentativa de outra execução.');
        const origem = await cliente.integracaoExecucao.findFirst({ where: { id: t.id, geracao: t.geracao, dono: t.dono, estado: 'EXECUTANDO' }, select: { id: true } });
        if (!origem) throw new ErroPipelineAnalytics('POSSE', 'Tentativa encerrada ou substituída.');
        // Checkpoint global primeiro: se a fila recusar a gravação por suspensão/lease,
        // o prazo remoto já conhecido continua protegendo os outros parceiros.
        await registrarEsperaAnalytics(posse, prazo ?? null, pausaPorPrazo);
      }
      await cliente.transacao(async tx => {
        if (f.codigo === 'limite' || pausaPorPrazo) {
          if (t.parceiroId !== tx.parceiroId || t.dono !== posse.id) throw new ErroPipelineAnalytics('POSSE', 'Tentativa de outra execução.');
          // Lock global EXCLUSIVO vem antes de módulo/execução. Uma janela não pode consumir
          // a cota recusada enquanto outra respeita o Retry-After; é um bloqueio global conservador.
          const a = await tx.sql<{ ok: boolean }>`SELECT erp_integracao_adiar(${tx.parceiroId}, ${t.id}, ${t.geracao}::int, ${t.dono}, ${prazo ?? null}::timestamptz, ${pausaPorPrazo}) AS ok`;
          if (!a[0]?.ok) throw new ErroPipelineAnalytics('POSSE', 'Tentativa encerrada ou substituída.');
        }
        await conferir(tx, t, false);
        // Um Retry-After inválido jamais vira uma espera menor.
        const reagendar = transitoria && (f.codigo !== 'limite' || !!prazo);
        const espera = prazo ?? new Date(Date.now() + 4 * 60 * 60 * 1000);
        if (f.codigo === 'sem-permissao') {
          const r = await mudarModulo(tx, t.moduloId, 'erro-permissao', 'Coletor Analytics', { erro: '403 do iFood: autorização recusada.' });
          if (!r.ok) throw new ErroPipelineAnalytics('ACESSO', 'Não foi possível registrar a recusa de acesso.');
        }
        await encerrar(tx, t, reagendar ? 'AGUARDANDO' : 'FALHA', {
          ultimoErro: f.codigo === 'limite' && !prazo ? 'prazo-invalido' : f.codigo, ultimoHttp: f.http ?? null, ultimoRequestId: idDeRequisicao(f.requestId),
          ...(reagendar ? { naoAntesDe: espera } : {}),
        });
      });
    },
  };
}

/** O último valor válido vem acompanhado do estado da coleta; falha posterior nunca vira zero. */
export async function ultimoDiaAnalytics(cliente: ClienteDoParceiro, moduloId: string, dia: string) {
  const e = await cliente.integracaoExecucao.findFirst({ where: { moduloId, dia: new Date(`${dia}T00:00:00Z`), perfil: 'diario' } });
  if (!e) return null;
  const snapshot = await cliente.integracaoSnapshot.findFirst({ where: { execucaoId: e.id, situacao: 'PUBLICADO' }, orderBy: { geracao: 'desc' }, include: { linhas: true } });
  return { estado: e.estado, erro: e.ultimoErro, ultimaPublicacaoEm: e.ultimaPublicacaoEm, snapshot };
}
