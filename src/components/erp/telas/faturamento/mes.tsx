// Scanner avoid-ai-design, SD4d (P2) aceito: "qui 16/10 · Loja R$ 1,00 · iFood —" é a linha de apoio do dia no celular e "62 pedidos · 140 clientes" o apoio do total, no padrão "A · B" das telas da 1.1–1.10. (O ignore do scanner não aceita id com minúscula.)
/**
 * Faturamento do mês (2.1), a MESMA tela no nível 1 e na pessoa do parceiro.
 * Corporativo/data-first: números tabulares à direita, tabela densa. Duas
 * visões, escolhidas pelo seletor do topo (ou pelo `?loja=`):
 *  - uma loja: o calendário do mês (grade de 7 colunas a partir de 640 px; lista
 *    de dias no celular), com a FALTA à vista (filete vermelho de 2 px e a
 *    palavra "falta iFood");
 *  - a rede: a soma das lojas do alcance e a tabela loja × canal com as faltas.
 * Ticket médio = Σ valor ÷ Σ pedidos do recorte, derivado: nunca gravado.
 */

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DiaDaLojaNoMes, LojaNoMes, MesDoFaturamento } from '@/lib/erp/faturamento';
import { CANAIS } from '@/lib/erp/canal-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { CANAIS_EM_ORDEM, diaDaSemana, mesVizinho, rotuloDoMes, textoDoTicket, type CanalVenda, type TotaisDoRecorte } from '@/lib/erp/faturamento-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Contagem, Metrica, Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';
import { dataCurta } from './formato';
import { FRASE_DO_ESTADO, serieDoMes } from '@/lib/erp/grafico';
import { GraficoDeColunas, type PontoDoGrafico } from '../../ui/grafico-colunas';

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const inteiro = (n: number) => n.toLocaleString('pt-BR');

const frasePedidos = (n: number) => `${inteiro(n)} ${n === 1 ? 'pedido' : 'pedidos'}`;

function frasesDeFalta(faltam: readonly CanalVenda[]): string {
  const nomes = faltam.map((c) => CANAIS[c].curto);
  return nomes.length === 1 ? `falta ${nomes[0]}` : `faltam ${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

// ------------------------------------------------------------------ totais

function Totais({ por, total }: { por: Record<CanalVenda, TotaisDoRecorte>; total: TotaisDoRecorte }) {
  const linhas: { chave: string; rotulo: string; t: TotaisDoRecorte; destaque?: boolean }[] = [
    ...CANAIS_EM_ORDEM.map((c) => ({ chave: c, rotulo: CANAIS[c].rotulo, t: por[c] })),
    { chave: 'total', rotulo: 'Total', t: total, destaque: true },
  ];
  return (
    <Painel titulo="Por canal" subtitulo="Faturamento, pedidos e clientes atendidos no mês. O ticket médio é a conta, não um número lançado." semRespiro>
      <div className="overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[360px]">
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                Canal
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Faturamento
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Pedidos
              </th>
              <th scope="col" className="hidden h-10 px-3 text-right font-semibold sm:table-cell">
                Clientes
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold sm:px-5">
                <span className="sm:hidden">Ticket</span>
                <span className="hidden sm:inline">Ticket médio</span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {linhas.map(({ chave, rotulo, t, destaque }) => (
              <tr key={chave} className={`border-t ${destaque ? 'border-linha-forte font-semibold' : 'border-linha'}`}>
                <th scope="row" className="h-11 px-3 text-left font-medium text-texto sm:px-5">
                  {rotulo}
                </th>
                <td className="px-3 text-right">{t.pedidos === 0 && t.valorCentavos === 0 ? <span className="font-normal text-suave">—</span> : formatarDinheiro(t.valorCentavos)}</td>
                <td className="px-3 text-right">{inteiro(t.pedidos)}</td>
                <td className="hidden px-3 text-right sm:table-cell">{inteiro(t.clientes)}</td>
                <td className="px-3 text-right sm:px-5">{textoDoTicket(t.ticketMedioCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Painel>
  );
}

// ------------------------------------------------------------------ calendário de uma loja

function CelulaDoDia({ d, lojaId, base, canais }: { d: DiaDaLojaNoMes; lojaId: string; base: string; canais: readonly CanalVenda[] }) {
  const numero = Number(d.data.slice(8, 10));
  const falta = d.faltam.length > 0;
  const rotuloAcessivel = `${numero} de ${rotuloDoMes(d.data.slice(0, 7))}: ${d.total ? formatarDinheiro(d.total.valorCentavos) : 'sem lançamento'}${falta ? `, ${frasesDeFalta(d.faltam)}` : ''}${d.emAberto ? ', em aberto' : ''}`;
  const miolo = (
    <>
      <span className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold tabular-nums">{numero}</span>
        {d.emAberto && <span className="text-[11px] text-suave">hoje</span>}
      </span>
      <span className="block text-right text-[13px] font-semibold tabular-nums">{d.total ? formatarDinheiro(d.total.valorCentavos) : <span className="font-normal text-suave">—</span>}</span>
      <span className="block min-h-[2.4em] text-[11px] leading-tight">
        {falta ? (
          <span className="font-semibold text-erro">{frasesDeFalta(d.faltam)}</span>
        ) : d.total ? (
          <span className="flex flex-wrap gap-x-2 text-suave">
            {canais.map((c) => (
              <span key={c} className={d.canais[c] ? 'text-texto' : 'text-suave'}>
                {CANAIS[c].curto}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </>
  );
  const classe = `flex min-h-[96px] min-w-0 flex-col justify-between gap-1 border-t-2 p-2 ${falta ? 'border-erro' : 'border-transparent'}`;
  if (d.futuro) return <div className={`${classe} text-suave`} aria-hidden>{miolo}</div>;
  return (
    <Link href={`${base}/${lojaId}/${d.data}`} aria-label={rotuloAcessivel} className={`${classe} ff-transicao hover:bg-texto/[0.04]`}>
      {miolo}
    </Link>
  );
}

function Calendario({ l, base, mes }: { l: LojaNoMes; base: string; mes: string }) {
  const primeiro = diaDaSemana(`${mes}-01`);
  return (
    <>
      {/* A partir de 640 px: a grade de 7 colunas. */}
      <div className="hidden sm:block">
        <div aria-hidden className="grid grid-cols-7 border-b border-linha bg-forte text-center text-[12px] font-semibold text-suave">
          {SEMANA.map((s) => (
            <span key={s} className="py-2">
              {s}
            </span>
          ))}
        </div>
        <ol className="grid grid-cols-7 [&>li]:border-b [&>li]:border-r [&>li]:border-linha [&>li:nth-child(7n)]:border-r-0">
          {Array.from({ length: primeiro }, (_, i) => (
            <li key={`v${i}`} aria-hidden className="bg-texto/[0.02]" />
          ))}
          {l.dias.map((d) => (
            <li key={d.data} className="min-w-0">
              <CelulaDoDia d={d} lojaId={l.loja.id} base={base} canais={l.loja.canais} />
            </li>
          ))}
        </ol>
      </div>
      {/* No celular: uma linha por dia, do mais novo para o mais antigo. */}
      <ul className="divide-y divide-linha sm:hidden">
        {[...l.dias]
          .filter((d) => !d.futuro)
          .reverse()
          .map((d) => {
            const falta = d.faltam.length > 0;
            return (
              <li key={d.data} className={falta ? 'border-l-2 border-erro' : ''}>
                <Link href={`${base}/${l.loja.id}/${d.data}`} className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-2.5 hover:bg-texto/[0.04]">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-texto">
                      {dataCurta(d.data)}
                      {d.emAberto && <span className="ml-2 text-[12px] font-normal text-suave">hoje, em aberto</span>}
                    </span>
                    <span className="block text-[12px] leading-snug tabular-nums text-suave">
                      {falta ? (
                        <span className="font-semibold text-erro">{frasesDeFalta(d.faltam)}</span>
                      ) : d.total ? (
                        l.loja.canais.map((c) => `${CANAIS[c].curto} ${d.canais[c] ? formatarDinheiro(d.canais[c]!.valorCentavos) : '—'}`).join(' · ')
                      ) : (
                        'sem lançamento'
                      )}
                    </span>
                    {falta && d.total && (
                      <span className="block text-[12px] leading-snug tabular-nums text-suave">
                        {l.loja.canais.filter((c) => d.canais[c]).map((c) => `${CANAIS[c].curto} ${formatarDinheiro(d.canais[c]!.valorCentavos)}`).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums">{d.total ? formatarDinheiro(d.total.valorCentavos) : <span className="font-normal text-suave">—</span>}</span>
                </Link>
              </li>
            );
          })}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ rede: loja × canal

function TabelaDaRede({ m, base }: { m: MesDoFaturamento; base: string }) {
  const faltas = (n: number) => (n > 0 ? <span className="font-semibold text-erro">{n} {n === 1 ? 'falta' : 'faltas'}</span> : <span className="text-suave">0 faltas</span>);
  return (
    <Painel titulo="Por loja" subtitulo="Soma do que cada loja do seu acesso lançou no mês. Falta é canal que a loja vende, sem lançamento, até ontem (cada canal em cada dia conta uma)." semRespiro acessorio={<Contagem>{m.lojas.length}</Contagem>}>
      {/* No celular: um cartão por loja (nome, total, faltas e o que cada canal fez). */}
      <ul className="divide-y divide-linha sm:hidden">
        {m.lojas.map((l) => (
          <li key={l.loja.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`${base}?mes=${m.mes}&loja=${l.loja.id}`} className={`${LINK_DE_TEXTO} min-w-0 truncate font-medium`}>
                {l.loja.nome}
              </Link>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatarDinheiro(l.total.valorCentavos)}</span>
            </div>
            <p className="mt-1 text-[12px] leading-snug tabular-nums text-suave">
              {CANAIS_EM_ORDEM.map((c) => `${CANAIS[c].curto} ${!l.loja.canais.includes(c) && l.porCanal[c].pedidos === 0 ? 'não vende' : l.porCanal[c].pedidos === 0 && l.porCanal[c].valorCentavos === 0 ? '—' : formatarDinheiro(l.porCanal[c].valorCentavos)}`).join(' · ')}
            </p>
            <p className="mt-0.5 text-[12px]">{faltas(l.faltas)}</p>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 border-t border-linha-forte px-4 py-3 font-semibold">
          <span>Rede</span>
          <span className="tabular-nums">
            {formatarDinheiro(m.total.valorCentavos)} <span className="text-[12px] font-normal text-suave">· {m.faltas} {m.faltas === 1 ? 'falta' : 'faltas'}</span>
          </span>
        </li>
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 px-4 font-semibold sm:px-5">
                Loja
              </th>
              {CANAIS_EM_ORDEM.map((c) => (
                <th key={c} scope="col" className="h-10 px-3 text-right font-semibold">
                  {CANAIS[c].curto}
                </th>
              ))}
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Total
              </th>
              <th scope="col" className="h-10 px-4 text-right font-semibold sm:px-5">
                Faltas
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {m.lojas.map((l) => (
              <tr key={l.loja.id} className="border-t border-linha">
                <th scope="row" className="h-11 max-w-[14rem] px-4 text-left font-medium text-texto sm:px-5">
                  <Link href={`${base}?mes=${m.mes}&loja=${l.loja.id}`} className={`${LINK_DE_TEXTO} block truncate`}>
                    {l.loja.nome}
                  </Link>
                </th>
                {CANAIS_EM_ORDEM.map((c) => (
                  <td key={c} className="px-3 text-right">
                    {!l.loja.canais.includes(c) && l.porCanal[c].pedidos === 0 ? <span className="text-suave">não vende</span> : l.porCanal[c].pedidos === 0 && l.porCanal[c].valorCentavos === 0 ? <span className="text-suave">—</span> : formatarDinheiro(l.porCanal[c].valorCentavos)}
                  </td>
                ))}
                <td className="px-3 text-right font-semibold">{formatarDinheiro(l.total.valorCentavos)}</td>
                <td className="px-4 text-right sm:px-5">{l.faltas > 0 ? faltas(l.faltas) : <span className="text-suave">0</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular-nums">
            <tr className="border-t border-linha-forte font-semibold">
              <th scope="row" className="h-11 px-4 text-left sm:px-5">
                Rede
              </th>
              {CANAIS_EM_ORDEM.map((c) => (
                <td key={c} className="px-3 text-right">
                  {formatarDinheiro(m.porCanal[c].valorCentavos)}
                </td>
              ))}
              <td className="px-3 text-right">{formatarDinheiro(m.total.valorCentavos)}</td>
              <td className="px-4 text-right sm:px-5">{m.faltas}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Painel>
  );
}

// ------------------------------------------------------------------ a tela

export function TelaDoMes({
  m,
  base,
  contexto,
  lojaAberta,
  podeLancar,
  bloqueio,
  veRede,
}: {
  m: MesDoFaturamento;
  base: string;
  /** "Rede Completa", o nome da loja ou o parceiro (N1). */
  contexto: string;
  /** A loja do calendário (visão de uma loja ou `?loja=`); ausente = a rede. */
  lojaAberta?: LojaNoMes;
  podeLancar: boolean;
  bloqueio: string | null;
  /** Quem tem a rede inteira volta à soma das lojas. */
  veRede: boolean;
}) {
  const anterior = mesVizinho(m.mes, -1);
  const seguinte = mesVizinho(m.mes, 1);
  const noMesAtual = m.mes === m.hoje.slice(0, 7);
  const lojaQuery = lojaAberta ? `&loja=${lojaAberta.loja.id}` : '';
  const faltas = lojaAberta ? lojaAberta.faltas : m.faltas;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="dre"
        cor={COR.dre}
        titulo="Faturamento"
        subtitulo={`${lojaAberta ? lojaAberta.loja.nome : contexto} · ${rotuloDoMes(m.mes)}`}
        acao={
          podeLancar ? (
            <>
              <BotaoOuMotivo href={`${base}/importar`} bloqueio={bloqueio} variante="secundario">
                Importar planilha
              </BotaoOuMotivo>
              <BotaoOuMotivo href={`${base}/lancar`} bloqueio={bloqueio} variante="primario">
                Lançar o dia
              </BotaoOuMotivo>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav aria-label="Trocar de mês" className="flex items-center gap-1 rounded-[10px] border border-linha bg-painel p-1">
            <Link href={`${base}?mes=${anterior}${lojaQuery}`} aria-label={`Mês anterior: ${rotuloDoMes(anterior)}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto">
              <ChevronLeft size={18} aria-hidden />
            </Link>
            <span className="min-w-36 px-2 text-center text-sm font-semibold tabular-nums" aria-current="date">
              {rotuloDoMes(m.mes)}
            </span>
            {noMesAtual ? (
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-[7px] text-suave/40">
                <ChevronRight size={18} />
              </span>
            ) : (
              <Link href={`${base}?mes=${seguinte}${lojaQuery}`} aria-label={`Mês seguinte: ${rotuloDoMes(seguinte)}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto">
                <ChevronRight size={18} aria-hidden />
              </Link>
            )}
          </nav>
          {!noMesAtual && (
            <Link href={`${base}${lojaAberta ? `?loja=${lojaAberta.loja.id}` : ''}`} className={LINK_DE_TEXTO}>
              Voltar para este mês
            </Link>
          )}
          {lojaAberta && veRede && (
            <Link href={`${base}?mes=${m.mes}&rede=1`} className={LINK_DE_TEXTO}>
              Ver a rede
            </Link>
          )}
        </div>
      </PageHeader>

      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}

      {m.lojas.length === 0 ? (
        <SemLojas />
      ) : (
        <>
          {faltas > 0 && (
            <Aviso tom="alerta" titulo={`${faltas} ${faltas === 1 ? 'canal sem lançamento' : 'canais sem lançamento'} neste mês.`}>
              {lojaAberta ? 'Os dias marcados em vermelho têm canal que a loja vende e ninguém lançou.' : 'Abra a loja para ver os dias marcados em vermelho.'}
            </Aviso>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(() => {
              const t = lojaAberta ? lojaAberta.total : m.total;
              return (
                <>
                  <div className="col-span-2 flex lg:col-span-1 [&>div]:w-full">
                    <Metrica rotulo="Faturamento" valor={formatarDinheiro(t.valorCentavos)} detalhe="venda dos pedidos concluídos" />
                  </div>
                  <Metrica rotulo="Pedidos" valor={inteiro(t.pedidos)} detalhe={frasePedidos(t.pedidos)} />
                  <Metrica rotulo="Clientes atendidos" valor={inteiro(t.clientes)} detalhe="atendimentos, não pessoas diferentes" />
                  <Metrica rotulo="Ticket médio" valor={textoDoTicket(t.ticketMedioCentavos)} detalhe="faturamento ÷ pedidos" />
                </>
              );
            })()}
          </div>
          <GraficoDoMes m={m} lojaAberta={lojaAberta} contexto={lojaAberta ? lojaAberta.loja.nome : contexto} />
          <Totais por={lojaAberta ? lojaAberta.porCanal : m.porCanal} total={lojaAberta ? lojaAberta.total : m.total} />
          {lojaAberta ? (
            <Painel
              titulo={`Dia a dia · ${lojaAberta.loja.nome}`}
              subtitulo={lojaAberta.primeiraData ? `Lançando desde ${formatarData(lojaAberta.primeiraData)}. Falta é canal sem lançamento até ontem; hoje ainda está em aberto.` : 'Nenhum dia lançado ainda: a primeira entrada abre o calendário de faltas.'}
              acessorio={!lojaAberta.loja.ativa ? <Selo>Loja desativada</Selo> : undefined}
              semRespiro
            >
              <Calendario l={lojaAberta} base={base} mes={m.mes} />
            </Painel>
          ) : (
            <TabelaDaRede m={m} base={base} />
          )}
          {m.temIntegracao && (
            <p className="text-[12px] text-suave">Dias com integração valem o número dela; o que a casa digitou fica como conferência na tela do dia.</p>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ gráfico (24/10, referência Nina)

const COR_DO_CANAL: Record<CanalVenda, number> = { LOJA: 1, DELIVERY_PROPRIO: 2, IFOOD: 3 };

/** Faturamento por dia, empilhado por canal. Dia sem lançamento fica vazio (não é zero) e a falta aparece na base. */
function GraficoDoMes({ m, lojaAberta, contexto }: { m: MesDoFaturamento; lojaAberta?: LojaNoMes; contexto: string }) {
  const s = serieDoMes(m, lojaAberta);
  if (s.diasLancados === 0) return null;
  const pontos: PontoDoGrafico[] = s.dias.map((d) => ({
    chave: d.data,
    rotulo: dataCurta(d.data),
    rotuloEixo: String(Number(d.data.slice(8, 10))),
    valores: d.valores,
    total: d.total,
    nota: d.estado === 'falta' ? frasesDeFalta(d.faltam) : d.total === null ? FRASE_DO_ESTADO[d.estado] : undefined,
    marca: d.estado === 'falta' ? 'falta' : undefined,
  }));
  const melhor = s.dias.reduce<(typeof s.dias)[number] | null>((b, d) => (d.total !== null && (!b || (b.total ?? 0) < d.total) ? d : b), null);
  return (
    <Painel
      titulo="Faturamento por dia"
      subtitulo={`${contexto} · ${s.diasLancados} ${s.diasLancados === 1 ? 'dia lançado' : 'dias lançados'}${melhor ? ` · maior dia: ${dataCurta(melhor.data)}, ${formatarDinheiro(melhor.total ?? 0)}` : ''}${s.diasComFalta ? ` · ${s.diasComFalta} com falta` : ''}`}
    >
      <GraficoDeColunas
        titulo={`Faturamento por dia em ${rotuloDoMes(m.mes)}, por canal`}
        series={CANAIS_EM_ORDEM.filter((c) => s.canais.includes(c)).map((c) => ({ chave: c, rotulo: CANAIS[c].rotulo, cor: COR_DO_CANAL[c] }))}
        pontos={pontos}
      />
    </Painel>
  );
}

function SemLojas() {
  return (
    <Painel>
      <Vazio titulo="Nenhuma loja no seu acesso.">Peça a quem cuida da equipe para incluir as lojas em que você trabalha.</Vazio>
    </Painel>
  );
}
