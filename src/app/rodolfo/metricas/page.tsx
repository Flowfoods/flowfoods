/**
 * Métricas — funil, cortes, saúde do número e custo de IA.
 *
 * Decisões de visualização, com o porquê:
 *
 * - O funil é UMA série ("quantos leads"), então tem UMA cor. O comprimento da
 *   barra carrega o dado; a cor não codifica nada. Pintar cada etapa de uma cor
 *   diferente seria colorir por posição, que não significa coisa alguma.
 * - `primary` (#b91c1c) e `bright` (#dc2626) NUNCA aparecem como duas cores
 *   distintas no mesmo gráfico: medido, ΔE 7,6 em visão normal — abaixo do piso
 *   de 15, ou seja, indistinguíveis até para quem enxerga todas as cores.
 * - Estado (bom/alerta/erro) sempre vem com rótulo escrito, nunca só cor.
 * - Número em `tabular-nums` para as colunas alinharem na vertical.
 */

import Link from 'next/link';
import { carregarMetricas, type Corte, type EtapaFunil } from '@/lib/rodolfo/metricas';
import { STOP_LOSS } from '@/lib/barney/regras';
import { Cartao, Numero, Selo, Vazio } from '../ui';

export const dynamic = 'force-dynamic';

const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(0)}%`);
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Funil({ etapas }: { etapas: EtapaFunil[] }) {
  const topo = etapas[0]?.valor ?? 0;

  return (
    <ol className="space-y-2.5">
      {etapas.map((e) => {
        const largura = topo > 0 ? Math.max((e.valor / topo) * 100, e.valor > 0 ? 1.5 : 0) : 0;
        return (
          <li key={e.chave}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-sm text-surface/80">
                {e.rotulo}
                {e.semOrigem && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-surface/35">
                    aguarda diagnóstico
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {e.valor}
                {e.conversao !== null && (
                  <span className="ml-2 text-xs text-surface/45">{e.conversao.toFixed(0)}%</span>
                )}
              </span>
            </div>
            {/* Trilho recessivo, marca fina, ponta arredondada ancorada na base. */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-bright"
                style={{ width: `${largura}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TabelaCorte({ titulo, linhas }: { titulo: string; linhas: Corte[] }) {
  const maior = Math.max(1, ...linhas.map((l) => l.total));

  return (
    <Cartao titulo={titulo}>
      {linhas.length === 0 ? (
        <Vazio>Sem dado ainda.</Vazio>
      ) : (
        <ul className="space-y-2.5">
          {linhas.map((l) => (
            <li key={l.rotulo}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-surface/80">{l.rotulo}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-surface/60">
                  {l.total}
                  {l.responderam > 0 && (
                    <span className="ml-2 text-surface/45">
                      {((l.responderam / l.total) * 100).toFixed(0)}% resp.
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-bright"
                  style={{ width: `${(l.total / maior) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

export default async function MetricasPage() {
  const m = await carregarMetricas();
  const piso = STOP_LOSS.taxaEntregaMinima;

  const tomEntrega = (t: number | null) => (t === null ? 'neutro' : t < piso ? 'erro' : 'ok');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Métricas</h1>
          <p className="mt-1 text-sm text-surface/60">Tudo lido do banco. Nada estimado.</p>
        </div>
        <a
          href="/api/metricas/csv"
          className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-surface/75 transition hover:border-white/30 hover:text-surface"
        >
          Exportar CSV
        </a>
      </div>

      <Cartao titulo="Funil">
        <Funil etapas={m.funil} />
        <p className="mt-4 text-xs text-surface/40">
          A porcentagem é a conversão sobre a etapa anterior. As últimas cinco etapas
          dependem do ambiente de Diagnóstico, que ainda não existe — ficam em zero até ele
          alimentar os status.
        </p>
      </Cartao>

      <Cartao
        titulo="Saúde do número"
        acessorio={
          <Selo tom={m.saude.estadoInstancia === 'open' ? 'ok' : 'erro'}>
            {m.saude.estadoInstancia === 'open' ? 'conectada' : m.saude.estadoInstancia}
          </Selo>
        }
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Numero
            valor={pct(m.saude.taxa24h)}
            rotulo="Entrega 24h"
            detalhe={`${m.saude.entregues24h}/${m.saude.enviados24h}`}
          />
          <Numero
            valor={pct(m.saude.taxa7d)}
            rotulo="Entrega 7d"
            detalhe={`${m.saude.entregues7d}/${m.saude.enviados7d}`}
          />
          <Numero valor={m.saude.falhas7d} rotulo="Falhas 7d" />
          <Numero
            valor={m.saude.tetoHoje}
            rotulo="Teto de hoje"
            detalhe={
              m.saude.semanaRampa === null
                ? 'rampa não começou'
                : `semana ${m.saude.semanaRampa + 1} da rampa`
            }
          />
        </div>

        {/* Estado sempre com texto, nunca só a cor. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Selo tom={tomEntrega(m.saude.taxa24h)}>
            {m.saude.taxa24h === null
              ? 'Sem envio nas últimas 24h'
              : m.saude.taxa24h < piso
                ? `Entrega abaixo do piso de ${piso * 100}%`
                : `Entrega acima do piso de ${piso * 100}%`}
          </Selo>
          {m.saude.falhas7d >= STOP_LOSS.falhasConsecutivas && (
            <Selo tom="alerta">{m.saude.falhas7d} falhas em 7 dias</Selo>
          )}
        </div>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaCorte titulo="Por bloco" linhas={m.porBloco} />
        <TabelaCorte titulo="Por tier" linhas={m.porTier} />
        <TabelaCorte titulo="Por bairro" linhas={m.porBairro} />
        <TabelaCorte titulo="Por categoria" linhas={m.porCategoria} />
      </div>

      <Cartao titulo="Custo de IA">
        <div className="grid grid-cols-3 gap-4">
          <Numero
            valor={brl(m.custoIA.hojeBRL)}
            rotulo="Hoje"
            detalhe={m.custoIA.tetoDiarioBRL ? `teto ${brl(m.custoIA.tetoDiarioBRL)}` : 'sem teto'}
          />
          <Numero valor={brl(m.custoIA.mesBRL)} rotulo="No mês" />
          <Numero valor={m.custoIA.classificacoes} rotulo="Classificações" />
        </div>
        {m.custoIA.tetoDiarioBRL && m.custoIA.hojeBRL >= m.custoIA.tetoDiarioBRL && (
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            Teto do dia atingido. O Inbox segue recebendo as respostas, sem classificar nem
            sugerir rascunho, até amanhã.
          </p>
        )}
      </Cartao>

      <p className="pb-2 text-center text-xs text-surface/35">
        <Link href="/rodolfo" className="hover:text-surface/60">
          ← voltar ao painel
        </Link>
      </p>
    </div>
  );
}
