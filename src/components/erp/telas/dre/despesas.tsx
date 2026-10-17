/**
 * Despesas (2.2a): a lista do mês (ou as contas a pagar), a MESMA tela no nível 1
 * e na pessoa do parceiro. Quem tem só "lançar despesas" vê e lança sem abrir o
 * DRE. Despesa de loja só nas lojas do acesso; a da rede, só para quem tem a rede
 * inteira. O vencimento e o pagamento não mudam o DRE: só põem a despesa no
 * filtro "A pagar".
 */

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ItemDaLista, listarDespesas } from '@/lib/erp/despesas';
import { frasePagamento, rotuloDaCompetencia, ROTULO_DO_PAGAMENTO, type FiltroDeSituacao } from '@/lib/erp/despesa-campos';
import { mesVizinho, rotuloDoMes } from '@/lib/erp/faturamento-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { FiltroEmLinks } from '../../ui/filtros';
import { Paginacao } from '../../ui/paginacao';
import { Aviso, Metrica, Painel, Selo, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';

type Lista = Awaited<ReturnType<typeof listarDespesas>>;

function SeloDoPagamento({ i }: { i: ItemDaLista }) {
  if (i.pagamento === 'sem-vencimento') return null;
  const tom = i.pagamento === 'paga' ? 'ok' : i.pagamento === 'vencida' ? 'erro' : i.pagamento === 'vence-logo' ? 'alerta' : 'neutro';
  return <Selo tom={tom}>{ROTULO_DO_PAGAMENTO[i.pagamento]}</Selo>;
}

export function TelaDeDespesas({
  lista,
  base,
  raiz,
  contexto,
  hoje,
  mes,
  situacao,
  lojaId,
  lojas,
  podeLancar,
  podeVerDre,
  faltaLancar,
  feito,
  bloqueio,
}: {
  lista: Lista;
  /** `/erp/dre/despesas` ou `/rodolfo/erp/<slug>/dre/despesas`. */
  base: string;
  raiz: string;
  contexto: string;
  hoje: string;
  mes: string;
  situacao: FiltroDeSituacao;
  lojaId?: string;
  lojas: { id: string; nome: string }[];
  podeLancar: boolean;
  podeVerDre: boolean;
  /** Descrições das que repetem todo mês e ainda faltam no mês (vazio = nada falta). */
  faltaLancar: { descricao: string; mesAlvo: string }[];
  feito?: string;
  bloqueio: string | null;
}) {
  const query = (p: { mes?: string; situacao?: FiltroDeSituacao; loja?: string | null; pagina?: number }) => {
    const q = new URLSearchParams();
    const m = p.mes ?? mes;
    const s = p.situacao ?? situacao;
    const l = p.loja === undefined ? lojaId : p.loja;
    if (s !== 'a-pagar') q.set('mes', m);
    if (s !== 'todas') q.set('situacao', s);
    if (l) q.set('loja', l);
    if (p.pagina && p.pagina > 1) q.set('pagina', String(p.pagina));
    const t = q.toString();
    return t ? `${base}?${t}` : base;
  };
  const noMesAtual = mes === hoje.slice(0, 7);
  const aPagar = situacao === 'a-pagar';
  const de = lista.total === 0 ? 0 : (lista.pagina - 1) * lista.porPagina + 1;
  const ate = Math.min(lista.pagina * lista.porPagina, lista.total);
  const nomeDaLoja = lojas.find((l) => l.id === lojaId)?.nome;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="compras"
        cor={COR.dre}
        titulo="Despesas"
        subtitulo={`${nomeDaLoja ?? contexto} · ${aPagar ? 'contas a pagar' : rotuloDoMes(mes)}`}
        acao={
          podeLancar ? (
            <>
              {faltaLancar.length > 0 && (
                <BotaoOuMotivo href={`${raiz}/dre/despesas/nova?modo=mes-passado&mes=${faltaLancar[0].mesAlvo}`} bloqueio={bloqueio} variante="secundario">
                  Lançar as do mês passado
                </BotaoOuMotivo>
              )}
              <BotaoOuMotivo href={`${raiz}/dre/despesas/nova`} bloqueio={bloqueio} variante="primario">
                Lançar despesa
              </BotaoOuMotivo>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {!aPagar && (
            <nav aria-label="Trocar de mês" className="flex items-center gap-1 rounded-[10px] border border-linha bg-painel p-1">
              <Link href={query({ mes: mesVizinho(mes, -1), pagina: 1 })} aria-label={`Mês anterior: ${rotuloDoMes(mesVizinho(mes, -1))}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto">
                <ChevronLeft size={18} aria-hidden />
              </Link>
              <span className="min-w-36 px-2 text-center text-sm font-semibold tabular-nums" aria-current="date">
                {rotuloDoMes(mes)}
              </span>
              <Link href={query({ mes: mesVizinho(mes, 1), pagina: 1 })} aria-label={`Mês seguinte: ${rotuloDoMes(mesVizinho(mes, 1))}`} className="ff-transicao grid h-10 w-10 place-items-center rounded-[7px] text-suave hover:bg-texto/5 hover:text-texto">
                <ChevronRight size={18} aria-hidden />
              </Link>
            </nav>
          )}
          <FiltroEmLinks
            rotulo="Filtrar por situação"
            opcoes={[
              { href: query({ situacao: 'todas', pagina: 1 }), rotulo: 'Do mês', ativo: situacao === 'todas' },
              { href: query({ situacao: 'a-pagar', pagina: 1 }), rotulo: 'A pagar', ativo: aPagar },
              { href: query({ situacao: 'pagas', pagina: 1 }), rotulo: 'Pagas', ativo: situacao === 'pagas' },
            ]}
          />
          {!aPagar && !noMesAtual && (
            <Link href={query({ mes: hoje.slice(0, 7), pagina: 1 })} className={LINK_DE_TEXTO}>
              Voltar para este mês
            </Link>
          )}
          {podeVerDre && (
            <Link href={`${raiz}/dre`} className={LINK_DE_TEXTO}>
              Ver o DRE
            </Link>
          )}
        </div>
        {lojas.length > 1 && (
          <FiltroEmLinks
            rotulo="Filtrar por loja"
            quebra
            opcoes={[{ href: query({ loja: null, pagina: 1 }), rotulo: 'Todas as lojas', ativo: !lojaId }, ...lojas.map((l) => ({ href: query({ loja: l.id, pagina: 1 }), rotulo: l.nome, ativo: l.id === lojaId }))]}
          />
        )}
      </PageHeader>

      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}
      {feito && <Aviso tom="ok" titulo={feito} />}
      {faltaLancar.length > 0 && !aPagar && (
        <Aviso tom="alerta" titulo={`Falta lançar: ${Array.from(new Set(faltaLancar.map((f) => f.descricao))).slice(0, 4).join(', ')}${new Set(faltaLancar.map((f) => f.descricao)).size > 4 ? ' e outras' : ''}.`}>
          Repetem todo mês e ainda não têm o lançamento deste mês.
        </Aviso>
      )}

      {aPagar ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Metrica rotulo="Vencidas" valor={String(lista.aPagar.vencidas)} detalhe={lista.aPagar.vencidas === 1 ? 'conta passou do vencimento' : 'contas passaram do vencimento'} />
          <Metrica rotulo="Vencem em até 7 dias" valor={String(lista.aPagar.venceLogo)} detalhe="a partir de hoje" />
          <div className="col-span-2 flex lg:col-span-1 [&>div]:w-full">
            <Metrica rotulo="Total a pagar" valor={formatarDinheiro(lista.aPagar.totalCentavos)} detalhe={`${lista.aPagar.total} ${lista.aPagar.total === 1 ? 'conta com vencimento' : 'contas com vencimento'}`} />
          </div>
        </div>
      ) : (
        lista.aPagar.total > 0 && (
          <p className="text-[13px] text-suave">
            Contas a pagar: <strong className="font-semibold text-texto">{lista.aPagar.vencidas}</strong> {lista.aPagar.vencidas === 1 ? 'vencida' : 'vencidas'} e <strong className="font-semibold text-texto">{lista.aPagar.venceLogo}</strong> {lista.aPagar.venceLogo === 1 ? 'vence' : 'vencem'} em até 7 dias.{' '}
            <Link href={query({ situacao: 'a-pagar', pagina: 1 })} className={LINK_DE_TEXTO}>
              Ver as contas a pagar
            </Link>
          </p>
        )
      )}

      <Painel titulo={aPagar ? 'Contas a pagar' : `Despesas com competência em ${rotuloDoMes(mes)}`} subtitulo={aPagar ? 'Ordem de vencimento. Pagar não muda o DRE.' : 'Entram as que cruzam o mês: um aluguel do mês, um IPTU do ano.'} semRespiro>
        {lista.itens.length === 0 ? (
          <Vazio titulo={aPagar ? 'Nenhuma conta a pagar.' : situacao === 'pagas' ? 'Nenhuma despesa paga neste mês.' : 'Nenhuma despesa neste mês.'}>
            {podeLancar ? 'Lance o aluguel, o salário e a luz: o DRE passa a mostrar o resultado de verdade.' : 'Quando alguém lançar, aparece aqui.'}
          </Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha lg:hidden">
              {lista.itens.map((i) => (
                <li key={i.id}>
                  <Link href={`${base}/${i.id}`} className="ff-transicao block px-4 py-3 hover:bg-texto/[0.04]">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-texto">{i.descricao}</span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatarDinheiro(i.valorCentavos)}</span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-suave">
                      {i.linhaNome} · {i.lojaNome ?? 'Rede'} · {rotuloDaCompetencia(i.competencia)}
                    </span>
                    {(i.vencimento || i.pagaEm) && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-suave">
                        <SeloDoPagamento i={i} />
                        {frasePagamento(i, hoje)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-forte text-left text-[12px] text-suave">
                    <th scope="col" className="h-10 px-5 font-semibold">
                      Despesa
                    </th>
                    <th scope="col" className="h-10 px-3 font-semibold">
                      Loja
                    </th>
                    <th scope="col" className="h-10 px-3 font-semibold">
                      Competência
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Valor
                    </th>
                    <th scope="col" className="h-10 px-5 font-semibold">
                      Pagamento
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {lista.itens.map((i) => (
                    <tr key={i.id} className="border-t border-linha align-top">
                      <th scope="row" className="max-w-[22rem] px-5 py-2.5 text-left font-medium">
                        <Link href={`${base}/${i.id}`} className={`${LINK_DE_TEXTO} block truncate`}>
                          {i.descricao}
                        </Link>
                        <span className="block text-[12px] font-normal text-suave">
                          {i.linhaNome}
                          {i.recorrente ? ' · repete todo mês' : ''}
                        </span>
                      </th>
                      <td className="px-3 py-2.5">{i.lojaNome ?? <span className="text-suave">Rede</span>}</td>
                      <td className="px-3 py-2.5">{rotuloDaCompetencia(i.competencia)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatarDinheiro(i.valorCentavos)}</td>
                      <td className="px-5 py-2.5">
                        {i.vencimento || i.pagaEm ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <SeloDoPagamento i={i} />
                            <span className="text-[12px] text-suave">{frasePagamento(i, hoje)}</span>
                          </span>
                        ) : (
                          <span className="text-suave">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao de={de} ate={ate} total={lista.total} singular="despesa" plural="despesas" anterior={lista.pagina > 1 ? query({ pagina: lista.pagina - 1 }) : null} proxima={ate < lista.total ? query({ pagina: lista.pagina + 1 }) : null} />
          </>
        )}
      </Painel>
      <p className="text-[12px] leading-relaxed text-suave">
        Valor é o da despesa inteira; o DRE apropria dia a dia. Despesa da rede (sem loja) só aparece para quem tem a rede inteira.
      </p>
    </div>
  );
}
