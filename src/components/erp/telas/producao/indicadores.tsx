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
import { Aviso, Linha, Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { FiltroDoPeriodo } from './periodo';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function DaPessoa({ p, historico }: { p: IndicadoresDaPessoa; historico: string }) {
  return (
    <Painel titulo={p.nome} subtitulo={fraseDaAmostra(p.amostra)} acessorio={<Link href={historico} className={`${LINK_DE_TEXTO} ff-toque`}>Ver os lotes</Link>}>
      <dl className="space-y-2 text-sm">
        <Linha rotulo="Lotes concluídos">
          <span className="tabular-nums">{p.concluidos}</span>
        </Linha>
        <Linha rotulo="Rendimento contra o planejado">
          <span className="tabular-nums">{fraseDoRendimentoMedio(p)}</span>
        </Linha>
        <Linha rotulo="Fora de ±10%">
          <span className="tabular-nums">{p.concluidos ? `${p.foraDaFaixa} de ${p.concluidos}` : '—'}</span>
        </Linha>
        <Linha rotulo="Tempo de produção">
          <span className="tabular-nums">{fraseDoTempo(p)}</span>
        </Linha>
        <Linha rotulo="Perdidos">
          <span className="tabular-nums">{p.perdidos}</span>
        </Linha>
        <Linha rotulo="Cancelados com a pessoa">
          <span className="tabular-nums">{p.cancelados}</span>
        </Linha>
        {p.estornados > 0 && (
          <Linha rotulo="Estornados">
            <span className="tabular-nums">{p.estornados}</span>
          </Linha>
        )}
      </dl>
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

export function TelaIndicadores({ d, base, contexto }: { d: IndicadoresDaProducao; base: string; contexto?: string }) {
  const aqui = `${base}/indicadores/${d.loja.id}`;
  const historicoDe = (id: string) => `${base}/historico/${d.loja.id}?de=${d.periodo.de}&ate=${d.periodo.ate}&pessoa=${encodeURIComponent(id)}`;
  const notas = [
    d.semHoraDePegar ? `${plural(d.semHoraDePegar, 'lote concluído sem pegar pela tela da cozinha', 'lotes concluídos sem pegar pela tela da cozinha')}: entra${d.semHoraDePegar === 1 ? '' : 'm'} em tudo, menos no tempo.` : null,
    d.semPessoa ? `${plural(d.semPessoa, 'lote cancelado', 'lotes cancelados')} antes de alguém pegar: fica${d.semPessoa === 1 ? '' : 'm'} fora das pessoas.` : null,
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
      <p className="text-[12px] text-suave">
        Rendimento: o que saiu contra o planejado pela ficha; a média dá o mesmo peso a cada lote e não conta os perdidos (que aparecem à parte). Tempo: de quando a pessoa pegou o lote (ou de quando os insumos saíram, se foi depois) até a conclusão.
      </p>
    </div>
  );
}
