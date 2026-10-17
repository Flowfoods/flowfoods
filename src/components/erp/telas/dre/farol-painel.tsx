/**
 * O painel de faróis, no topo do DRE (2.4, decisão 177). Blocos modulares do kit Bento da Kairu (uma grade que
 * se reorganiza, cada bloco com um propósito, a meta também por escrito, o que está incluído dito, dado ausente
 * nunca vira zero), na paleta e no tipo da FlowFoods: superfície única, bordas finas neutras e a cor só no
 * indicador. Dois propósitos: "Faróis do período" (quantas linhas em cada faixa e quais estão mal) e um bloco por
 * canal que o escopo vende (a receita do canal contra o ano passado). CMV e despesa não são do canal (decisão 173).
 */

import Link from 'next/link';
import { textoDoPercentual } from '@/lib/erp/dre-campos';
import { textoDaMetaDeCrescimento, textoDaVariacao } from '@/lib/erp/dre-metas-campos';
import type { DreDoPeriodo } from '@/lib/erp/dre';
import { CORES_DO_FAROL, FAIXAS_DO_FAROL, posicaoDaCor } from '@/lib/erp/farol-campos';
import type { CanalDoPeriodo } from '@/lib/erp/farol-dre-campos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import { dataCurta } from '../faturamento/formato';
import { FaixaComPalavra, Farol, idDaLinha, Regua } from './farol';

function Faixas({ d }: { d: DreDoPeriodo }) {
  const { contagem, semCor, motivoGeral } = d.farol;
  const total = contagem.reduce((s, c) => s + c.linhas.length, 0);
  const subtitulo = d.farolAntigo
    ? 'Este período foi fechado antes do farol: as faixas de custo vêm das linhas gravadas no fechamento.'
    : motivoGeral
      ? 'Sem cor enquanto o faturamento não estiver completo.'
      : 'Cada linha com meta contra a meta, em 5 faixas. Régua, palavra e desvio dizem a mesma coisa que a cor.';
  return (
    <Painel
      titulo="Faróis do período"
      subtitulo={subtitulo}
      acessorio={<span className="text-[12px] tabular-nums text-suave">{d.escopo.tipo === 'rede' ? `${d.lojasDoEscopo.length} ${d.lojasDoEscopo.length === 1 ? 'loja incluída' : 'lojas incluídas'}` : d.escopo.nome}</span>}
    >
      {motivoGeral ? (
        // Faltando faturamento nenhuma linha tem cor: cinco cartões de "0 linhas" só pareceriam um resultado.
        <p className="text-sm text-texto">
          <span className="font-semibold">Sem cor em todo o período:</span> {motivoGeral}. Um percentual sobre uma receita incompleta engana, então as linhas mostram o desvio em texto e esperam o lançamento.
        </p>
      ) : total === 0 && semCor.length === 0 ? (
        <p className="text-sm text-suave">Nenhuma linha tem meta neste período, então não há o que medir. As metas se definem em Plano e metas.</p>
      ) : (
        <>
          {/* Celular: os 5 contadores numa fileira (a posição da casa cheia diz a faixa; a legenda escreve as palavras na mesma ordem). */}
          <div className="sm:hidden">
            <ul className="grid grid-cols-5 gap-1.5">
              {contagem.map((c) => (
                <li key={c.cor} aria-label={`${FAIXAS_DO_FAROL.palavras[c.cor]}: ${c.linhas.length} ${c.linhas.length === 1 ? 'linha' : 'linhas'}`} className="flex min-w-0 flex-col items-center gap-1.5 rounded-[10px] border border-linha px-1 py-2.5">
                  <Regua posicao={posicaoDaCor(c.cor)} cor={c.cor} largura={46} />
                  <span aria-hidden className="font-display text-[22px] font-bold leading-none tabular-nums">
                    {c.linhas.length}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] leading-snug text-suave">Da esquerda para a direita: {CORES_DO_FAROL.map((c) => FAIXAS_DO_FAROL.palavras[c]).join(', ')}.</p>
            {contagem
              .filter((c) => (c.cor === 'LARANJA' || c.cor === 'VERMELHO') && c.linhas.length > 0)
              .map((c) => (
                <div key={c.cor} className="mt-3">
                  <FaixaComPalavra cor={c.cor} posicao={posicaoDaCor(c.cor)} palavra={FAIXAS_DO_FAROL.palavras[c.cor]} />
                  <ul className="mt-1 space-y-0.5 text-[13px] leading-snug">
                    {c.linhas.map((l) => (
                      <li key={l.chave}>
                        <a href={`#${idDaLinha(l.chave)}`} className={LINK_DE_TEXTO}>
                          {l.nome}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <ul className="hidden gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-5">
            {contagem.map((c) => {
              const palavra = FAIXAS_DO_FAROL.palavras[c.cor];
              const quais = c.cor === 'LARANJA' || c.cor === 'VERMELHO';
              return (
                <li key={c.cor} className="min-w-0 rounded-[10px] border border-linha px-3 py-3">
                  <div className="min-h-9">
                    <FaixaComPalavra cor={c.cor} posicao={posicaoDaCor(c.cor)} palavra={palavra} />
                  </div>
                  <p className="mt-2 font-display text-[26px] font-bold leading-none tabular-nums">
                    {c.linhas.length}
                    <span className="ml-1.5 font-sans text-[12px] font-normal text-suave">{c.linhas.length === 1 ? 'linha' : 'linhas'}</span>
                  </p>
                  {quais && c.linhas.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[13px] leading-snug">
                      {c.linhas.map((l) => (
                        <li key={l.chave}>
                          <a href={`#${idDaLinha(l.chave)}`} className={LINK_DE_TEXTO}>
                            {l.nome}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {semCor.length > 0 && !motivoGeral && (
        <details className="mt-4 text-[13px]">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-texto underline decoration-linha-forte underline-offset-4">
            {semCor.length === 1 ? '1 linha com meta está sem cor' : `${semCor.length} linhas com meta estão sem cor`}
          </summary>
          <ul className="mt-1 space-y-1 text-suave">
            {semCor.map((l) => (
              <li key={l.chave}>
                <a href={`#${idDaLinha(l.chave)}`} className={LINK_DE_TEXTO}>
                  {l.nome}
                </a>
                : {l.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Painel>
  );
}

function Canal({ c, d, raiz, definirMetas }: { c: CanalDoPeriodo; d: DreDoPeriodo; raiz: string; definirMetas: boolean }) {
  const a = d.anoPassado;
  return (
    <li className="flex min-w-0 flex-col rounded-[14px] border border-linha bg-painel p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{c.nome}</h3>
        <span className="text-[12px] tabular-nums text-suave">{c.participacaoBp === null ? 'sem receita' : `${textoDoPercentual(c.participacaoBp)} da receita`}</span>
      </div>
      <p className="mt-3 truncate font-display text-[26px] font-bold leading-none tabular-nums">{c.receitaCentavos === 0 ? '—' : formatarDinheiro(c.receitaCentavos)}</p>
      <dl className="mt-3 space-y-1 text-[13px]">
        <div className="flex justify-between gap-3">
          <dt className="text-suave">Pedidos</dt>
          <dd className="tabular-nums">{c.pedidos === null ? <span className="text-suave">não informado</span> : c.pedidos.toLocaleString('pt-BR')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-suave">Ticket médio</dt>
          <dd className="tabular-nums">{c.ticketCentavos === null ? <span className="text-suave">—</span> : formatarDinheiro(c.ticketCentavos)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-suave">Ano passado{a ? ` (${dataCurta(a.de)} a ${dataCurta(a.ate)})` : ''}</dt>
          <dd className="tabular-nums">{c.anteriorCentavos === null ? <span className="text-suave">{d.farolAntigo && d.fechamento ? '—' : 'sem lançamento'}</span> : formatarDinheiro(c.anteriorCentavos)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-suave">Variação</dt>
          <dd className="tabular-nums">{c.variacaoBp === null ? <span className="text-suave">—</span> : textoDaVariacao(c.variacaoBp)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-suave">Meta de crescimento</dt>
          <dd className="tabular-nums">
            {c.metaBp === null ? (
              <span className="text-suave">
                sem meta
                {definirMetas && (
                  <>
                    {' · '}
                    <Link href={`${raiz}/dre/plano`} className={LINK_DE_TEXTO}>
                      definir
                    </Link>
                  </>
                )}
              </span>
            ) : (
              <>
                {c.metaBp === 0 ? '0,0 % (igual ao ano passado)' : textoDaMetaDeCrescimento(c.metaBp)}
                {c.metaCentavos !== null && <span className="text-suave"> · {formatarDinheiro(c.metaCentavos)}</span>}
              </>
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-auto pt-3">
        {c.farol ? <Farol f={c.farol} forma="celula" /> : <span className="text-[12px] text-suave">Sem meta de crescimento, sem farol.</span>}
        {c.farol?.desvioTexto && <span className="mt-0.5 block text-[12px] tabular-nums text-suave">desvio {c.farol.desvioTexto} sobre a meta</span>}
      </div>
    </li>
  );
}

/** O painel inteiro: faixas e canais. Quem não tem `dre.ver` nunca chega aqui (a tela do DRE já é fechada). */
/** A meta do total não é a soma das metas dos canais quando as duas existem e diferem: cada uma é definida à parte, e cada farol mede a sua. */
function avisoDaSoma(d: DreDoPeriodo): string | null {
  const total = d.metas['grupo:RECEITA']?.metaCentavos ?? null;
  const dosCanais = d.canais.flatMap((c) => (c.metaCentavos === null ? [] : [c.metaCentavos]));
  if (total === null || d.canais.length === 0 || dosCanais.length !== d.canais.length) return null;
  const soma = dosCanais.reduce((t, m) => t + m, 0);
  return soma === total ? null : `A meta do total (${formatarDinheiro(total)}) não é a soma das metas dos canais (${formatarDinheiro(soma)}): cada uma é definida à parte, e cada farol mede a sua.`;
}

export function PainelDeFaroisDoDre({ d, raiz, definirMetas }: { d: DreDoPeriodo; raiz: string; definirMetas: boolean }) {
  if (d.lojasDoEscopo.length === 0) return null;
  const soma = avisoDaSoma(d);
  return (
    <section aria-labelledby="farois-titulo" className="space-y-4">
      <h2 id="farois-titulo" className="sr-only">
        Faróis e canais do período
      </h2>
      <Faixas d={d} />
      {d.canais.length > 0 && (
        <>
          <ul aria-label="Receita por canal contra o ano passado" className={`grid gap-4 ${d.canais.length === 1 ? '' : d.canais.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
            {d.canais.map((c) => (
              <Canal key={c.canal} c={c} d={d} raiz={raiz} definirMetas={definirMetas} />
            ))}
          </ul>
          {soma && <p className="text-[12px] leading-relaxed text-suave">{soma}</p>}
          <p className="text-[12px] leading-relaxed text-suave">
            O farol por canal é só o da receita, porque só ela nasce no canal. Compra e despesa são da loja, não do canal: dividi-las pela receita daria ao iFood o mesmo custo do salão por construção. O CMV e as despesas têm o farol no total, na tabela abaixo.
          </p>
        </>
      )}
    </section>
  );
}
