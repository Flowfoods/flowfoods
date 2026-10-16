/**
 * Métricas — funil, cortes, saúde do número e custo de IA.
 *
 * Decisões de visualização, com o porquê:
 *
 * - O funil é UMA série ("quantos leads"), então tem UMA cor. O comprimento da
 *   barra carrega o dado; a cor não codifica nada. Pintar cada etapa de uma cor
 *   diferente seria colorir por posição, que não significa coisa alguma.
 * - A barra usa o acento (vermelho da marca), uma cor só: dois vermelhos
 *   próximos no mesmo gráfico seriam indistinguíveis (ΔE abaixo de 15).
 * - Estado (bom/alerta/erro) sempre vem com rótulo escrito, nunca só cor.
 * - Número em `tabular-nums` para as colunas alinharem na vertical.
 */

import { carregarMetricas, type Corte, type EtapaFunil } from '@/lib/rodolfo/metricas';
import { STOP_LOSS } from '@/lib/barney/regras';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Numero, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { exigirNivel1 } from '@/lib/erp/contexto';

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
              <span className="text-sm text-texto">
                {e.rotulo}
                {e.semOrigem && <span className="ml-2 text-[12px] text-suave">aguarda diagnóstico</span>}
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                {e.valor}
                {e.conversao !== null && <span className="ml-2 text-[12px] text-suave">{e.conversao.toFixed(0)}%</span>}
              </span>
            </div>
            {/* Trilho recessivo, marca fina, ponta arredondada ancorada na base. */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-texto/10">
              <div className="h-full rounded-full bg-acento" style={{ width: `${largura}%` }} />
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
    <Painel titulo={titulo}>
      {linhas.length === 0 ? (
        <Vazio>Sem dado ainda.</Vazio>
      ) : (
        <ul className="space-y-2.5">
          {linhas.map((l) => (
            <li key={l.rotulo}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-texto">{l.rotulo}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-suave">
                  {l.total}
                  {l.responderam > 0 && (
                    <span className="ml-2 text-suave">{((l.responderam / l.total) * 100).toFixed(0)}% resp.</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-texto/10">
                <div className="h-full rounded-full bg-acento" style={{ width: `${(l.total / maior) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

export default async function MetricasPage() {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const m = await carregarMetricas();
  const piso = STOP_LOSS.taxaEntregaMinima;

  const tomEntrega = (t: number | null) => (t === null ? 'neutro' : t < piso ? 'erro' : 'ok');

  return (
    <div className="space-y-6">
      <PageHeader
        icone="metricas"
        cor={COR.comercial}
        titulo="Métricas"
        subtitulo="Tudo lido do banco. Nada estimado."
        acao={
          <a href="/api/metricas/csv" className={classeDeBotao('secundario')}>
            Exportar CSV
          </a>
        }
      />

      <Painel titulo="Funil">
        <Funil etapas={m.funil} />
        <p className="mt-4 text-[13px] text-suave">
          A porcentagem é a conversão sobre a etapa anterior. As últimas cinco etapas dependem do ambiente de
          Diagnóstico, que ainda não existe — ficam em zero até ele alimentar os status.
        </p>
      </Painel>

      <Painel
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
            detalhe={m.saude.semanaRampa === null ? 'rampa não começou' : `semana ${m.saude.semanaRampa + 1} da rampa`}
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
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaCorte titulo="Por bloco" linhas={m.porBloco} />
        <TabelaCorte titulo="Por tier" linhas={m.porTier} />
        <TabelaCorte titulo="Por bairro" linhas={m.porBairro} />
        <TabelaCorte titulo="Por categoria" linhas={m.porCategoria} />
      </div>

      <Painel titulo="Custo de IA">
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
          <p className="mt-3 rounded-[7px] border border-atencao/40 px-3 py-2 text-[13px] text-atencao">
            Teto do dia atingido. O Inbox segue recebendo as respostas, sem classificar nem sugerir rascunho, até
            amanhã.
          </p>
        )}
      </Painel>
    </div>
  );
}
