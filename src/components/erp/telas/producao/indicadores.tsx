/**
 * Indicadores da produção por pessoa (3.3), para a gerência: no período e na loja, de cada pessoa que fez lote — quantos
 * concluiu, quanto produziu de cada ficha, o rendimento médio contra o planejado, quantos fora de ±10%, o tempo médio,
 * perdidos, cancelados e estornados. Sempre com a amostra ("3 lotes: amostra pequena"). Sem nota, sem ranking (ordem
 * alfabética), sem cor por pessoa e sem R$: é um retrato para conversar com a equipe, e é hipótese a validar com a casa.
 * Cada pessoa leva ao histórico filtrado por ela. A mesma tela no nível 1.
 */

import Link from 'next/link';
import type { IndicadoresDaProducao } from '@/lib/erp/producao-equipe';
import { fraseDaAmostra, fraseDaFicha, fraseDoResumo, fraseDoRendimentoMedio, fraseDoTempo, rotuloDoPeriodo, type IndicadoresDaPessoa } from '@/lib/erp/producao-equipe-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { FiltroDoPeriodo } from './periodo';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';
import { BarrasHorizontais } from '../../ui/barras-horizontais';
import { FAIXA_DO_RENDIMENTO_BP, formatarRendimento } from '@/lib/erp/producao-campos';
import { formatarQuantidade } from '@/lib/erp/unidades';
import type { ProduzidoPorFicha } from '@/lib/erp/producao-equipe-campos';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Rótulo e valor: lado a lado a partir de 640 px; no celular, o valor embaixo do rótulo (não quebra em 4 linhas). */
function Metrica({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-suave sm:shrink-0">{rotulo}</dt>
      <dd className="min-w-0 font-medium tabular-nums text-texto sm:text-right sm:font-normal">{children}</dd>
    </div>
  );
}

function DaPessoa({ p, historico }: { p: IndicadoresDaPessoa; historico: string }) {
  return (
    <Painel
      titulo={p.nome}
      subtitulo={fraseDaAmostra(p.amostra)}
      acessorio={
        <Link href={historico} className={`${LINK_DE_TEXTO} ff-toque whitespace-nowrap`}>
          Ver os lotes
        </Link>
      }
    >
      <dl className="space-y-3 text-sm sm:space-y-2">
        <Metrica rotulo="Lotes concluídos">{p.concluidos}</Metrica>
        <Metrica rotulo="Rendimento contra o planejado">{fraseDoRendimentoMedio(p)}</Metrica>
        <Metrica rotulo="Fora de ±10%">{p.concluidos ? `${p.foraDaFaixa} de ${p.concluidos}` : '—'}</Metrica>
        <Metrica rotulo="Tempo de produção">{fraseDoTempo(p)}</Metrica>
        <Metrica rotulo="Perdidos">{p.perdidos}</Metrica>
        <Metrica rotulo="Cancelou">{p.cancelou}</Metrica>
        {p.estornados > 0 && <Metrica rotulo="Estornados">{p.estornados}</Metrica>}
      </dl>
      {p.canceladosPelaGerencia > 0 && (
        <p className="mt-3 text-[13px] text-suave">
          {`${plural(p.canceladosPelaGerencia, 'lote cancelado', 'lotes cancelados')} pela gerência enquanto estava${p.canceladosPelaGerencia === 1 ? '' : 'm'} com a pessoa: não conta${p.canceladosPelaGerencia === 1 ? '' : 'm'} para ela (o motivo está no histórico).`}
        </p>
      )}
      <div className="mt-4 border-t border-linha pt-3">
        <p className="text-[12px] font-semibold text-suave">Quanto produziu</p>
        {p.porFicha.length === 0 ? (
          <p className="mt-1 text-[13px] text-suave">Nenhum lote concluído com produção no período.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-[13px] tabular-nums">
            {p.porFicha.map((f) => (
              <li key={`${f.fichaId}:${f.unidade}`} className="[overflow-wrap:anywhere]">
                {fraseDaFicha(f)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Painel>
  );
}

/**
 * Rendimento por preparo (24/10/2026, referência Nina): o que saiu de cada ficha contra o planejado, somando os lotes concluídos da
 * loja no período, de todo mundo. É o retrato do preparo, não da pessoa: ordem alfabética, sem cor por resultado. O traço é 100%.
 */
export function RendimentoPorPreparo({ fichas }: { fichas: readonly ProduzidoPorFicha[] }) {
  if (fichas.length === 0) return null;
  const repetida = new Set(fichas.map((f) => f.fichaId).filter((id, i, a) => a.indexOf(id) !== i));
  return (
    <Painel titulo="Rendimento por preparo" subtitulo="O que saiu contra o planejado pela ficha, somando os lotes concluídos no período. O traço é 100%, o planejado.">
      <BarrasHorizontais
        titulo="Rendimento de cada preparo em percentual do planejado"
        marca={{ rotulo: 'planejado (100%)' }}
        barras={fichas.map((f) => ({
          chave: `${f.fichaId}:${f.unidade}`,
          rotulo: repetida.has(f.fichaId) ? `${f.nome} (${f.unidade.toLowerCase()})` : f.nome,
          valor: f.rendimentoBp,
          valorTexto: formatarRendimento(f.rendimentoBp),
          detalhe: `${formatarQuantidade(f.produzidoMilesimos, f.unidade)} de ${formatarQuantidade(f.planejadoMilesimos, f.unidade)} · ${plural(f.lotes, 'lote', 'lotes')}${Math.abs(f.rendimentoBp - 10000) > FAIXA_DO_RENDIMENTO_BP ? ' · fora de ±10%' : ''}`,
          marca: 10000,
        }))}
      />
    </Painel>
  );
}

export function TelaIndicadores({ d, base, contexto }: { d: IndicadoresDaProducao; base: string; contexto?: string }) {
  const aqui = `${base}/indicadores/${d.loja.id}`;
  const historicoDe = (id: string) => `${base}/historico/${d.loja.id}?de=${d.periodo.de}&ate=${d.periodo.ate}&pessoa=${encodeURIComponent(id)}`;
  const notas = [
    d.semHoraDePegar ? `${plural(d.semHoraDePegar, 'lote concluído sem pegar pela tela da cozinha', 'lotes concluídos sem pegar pela tela da cozinha')}: entra${d.semHoraDePegar === 1 ? '' : 'm'} em tudo, menos no tempo.` : null,
    d.semPessoa ? `${plural(d.semPessoa, 'lote cancelado', 'lotes cancelados')} antes de alguém pegar: fica${d.semPessoa === 1 ? '' : 'm'} fora das pessoas.` : null,
    d.daFlowFoods ? `${plural(d.daFlowFoods, 'lote concluído', 'lotes concluídos')} pela FlowFoods, sem pessoa da equipe: fica${d.daFlowFoods === 1 ? '' : 'm'} fora das pessoas.` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome }]} />
      <PageHeader icone="producao" cor={COR.producao} titulo="Indicadores da produção" subtitulo={[contexto, d.loja.nome, rotuloDoPeriodo(d.periodo, d.hoje)].filter(Boolean).join(' · ')}>
        <FiltroDoPeriodo aqui={aqui} periodo={d.periodo} />
      </PageHeader>
      {d.cortado && <Aviso tom="alerta" titulo="Período com lotes demais para uma tela só: escolha um período menor." />}
      <Aviso titulo="Um retrato do período, não uma nota.">
        Serve para conversar com a equipe: rendimento e tempo dependem da ficha, do equipamento e do dia. Com poucos lotes, ainda não dizem muito. {fraseDoResumo(d.resumo).replace(/\.?$/, '.')}
      </Aviso>
      {notas.length > 0 && <p className="text-[13px] text-suave">{notas.join(' ')}</p>}
      <RendimentoPorPreparo fichas={d.porFicha} />
      {d.pessoas.length === 0 ? (
        <Painel>
          <Vazio titulo="Ninguém fez lote neste período.">Os indicadores aparecem quando a cozinha pega e conclui lotes pela tela de Tarefas.</Vazio>
        </Painel>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {d.pessoas.map((p) => (
            <DaPessoa key={p.id} p={p} historico={historicoDe(p.id)} />
          ))}
        </div>
      )}
      <ExplicacaoNoPonto ponto="leitura">
        <p className="text-[12px] text-suave">
          Rendimento: o que saiu contra o planejado pela ficha; a média dá o mesmo peso a cada lote e não conta os perdidos (que aparecem à parte). Tempo: de quando a pessoa pegou o lote (ou de quando os insumos saíram, se foi depois) até a conclusão.
        </p>
      </ExplicacaoNoPonto>
    </div>
  );
}
