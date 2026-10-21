// Scanner avoid-ai-design, SD4d (P2) aceito: "Vila da Penha · hoje, quarta 21/10 · 2 pré-preparos" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–3.1.
/**
 * A lista do dia (3.2): o que a loja produz no dia e o que isso pede do estoque. Em cima, o dia (ontem, hoje, amanhã ou
 * outro); "O que produzir" (as linhas: as que já viraram lote, com o lote e a etapa, e as em aberto, que o gerente muda e
 * transforma em lotes); "Pré-preparos que entram nas receitas" (a base que o molho usa: vai usar, tem, na lista, falta
 * produzir, e "Pôr na lista"); "Matéria-prima" em três colunas — vai usar, tem, comprar —, com "falta X" escrito (a cor só
 * reforça) e o saldo abaixo de zero como alarme; "Para quem compra" (o custo estimado só para quem vê custos, o orçamento
 * pela vista de quem lê, e os atalhos de Compras); o histórico da lista. Tabela Corporativo a partir de 768 px; cartões
 * abaixo (a cozinha usa pelo celular). A mesma tela no nível 1 e na pessoa do parceiro.
 */

import Link from 'next/link';
import type { ListaDoDiaNaTela, LinhaDaLista } from '@/lib/erp/producao-lista';
import { quantidadeComSinal, resumoDaConta, textoDasEmbalagens, TITULO_NO_HISTORICO_DA_LISTA, type InsumoNaConta, type PreparoNaConta } from '@/lib/erp/producao-lista-campos';
import { ROTULO_DA_PRODUCAO } from '@/lib/erp/producao-campos';
import { fraseDoLimite, fraseDoSaldo, SUBTITULO_DO_LIMITE } from '@/lib/erp/orcamento-campos';
import type { OrcamentoNaNota } from '@/lib/erp/orcamento';
import { somarDias } from '@/lib/erp/contagem-campos';
import { textoDoCampo } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro, formatarFracao, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { TrilhaDaPagina } from '../../shell/trilha';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormListaDoDia, FormPorNaLista, LevarParaVista } from './form-lista';
import { TOM_DO_LOTE } from './partes';

const primeiraMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const q = (m: number, u: Unidade) => formatarQuantidade(m, u);

// ================================================================ o dia

function SeletorDoDia({ aqui, dia, hoje }: { aqui: string; dia: string; hoje: string }) {
  const atalhos: [string, string][] = [
    [somarDias(hoje, -1), 'Ontem'],
    [hoje, 'Hoje'],
    [somarDias(hoje, 1), 'Amanhã'],
  ];
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <nav aria-label="Dia da lista" className="grid grid-cols-3 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1 sm:w-[340px]">
        {atalhos.map(([d, rotulo]) => (
          <Link
            key={d}
            href={`${aqui}?dia=${d}`}
            aria-current={d === dia ? 'page' : undefined}
            className={`ff-transicao flex min-h-11 items-center justify-center rounded-[7px] text-[14px] sm:min-h-10 ${d === dia ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
      <form method="get" action={aqui} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="lista-outro-dia" className="mb-1 block text-[12px] font-medium text-suave">
            Outro dia
          </label>
          <input id="lista-outro-dia" type="date" name="dia" defaultValue={dia} className="ff-transicao block min-h-11 w-full rounded-[7px] border border-linha-forte bg-campo px-3 text-base text-texto sm:min-h-10 sm:text-sm" />
        </div>
        <button type="submit" className={classeDeBotao('secundario', 'min-h-11 sm:min-h-10')}>
          Abrir
        </button>
      </form>
    </div>
  );
}

// ================================================================ o que produzir

function SeloDaLinha({ l, aqui }: { l: LinhaDaLista; aqui: string }) {
  if (l.estado === 'NA_LISTA') {
    return (
      <span className="flex flex-col items-end gap-1">
        <Selo tom="neutro">Na lista</Selo>
        {l.lote && <span className="text-[12px] text-suave">lote {l.lote.codigo} {l.lote.estornado ? 'estornado' : 'cancelado'}</span>}
      </span>
    );
  }
  const lote = l.lote!;
  return (
    <Link href={`${aqui}/${lote.id}`} className="ff-transicao -my-1 flex min-h-11 flex-col items-end justify-center gap-1 rounded-[7px] px-1 hover:bg-texto/[0.03]" aria-label={`Lote ${lote.codigo}, ${ROTULO_DA_PRODUCAO[lote.status].toLowerCase()}: abrir o lote`}>
      <Selo tom={TOM_DO_LOTE[lote.status]}>{ROTULO_DA_PRODUCAO[lote.status]}</Selo>
      <span className="text-[12px] tabular-nums text-texto underline decoration-linha-forte underline-offset-4">Lote {lote.codigo}</span>
    </Link>
  );
}

function LinhaParaLer({ l, aqui, apurado }: { l: LinhaDaLista; aqui: string; apurado: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">
          {l.nome} <span className="whitespace-nowrap tabular-nums">· {q(l.quantidadeMilesimos, l.unidade)}</span>
        </p>
        {apurado && l.emEstoqueMilesimos !== null && (
          <p className={`mt-0.5 text-[12px] tabular-nums ${l.emEstoqueMilesimos < 0 ? 'text-erro' : 'text-suave'}`}>
            no estoque agora: {quantidadeComSinal(l.emEstoqueMilesimos, l.unidade)}
            {l.emEstoqueMilesimos < 0 ? ' (abaixo de zero)' : ''}
          </p>
        )}
        {l.estado === 'NA_LISTA' && !l.fichaDisponivel && <p className="mt-0.5 text-[12px] text-atencao">A ficha não vira mais lote (desativada ou mudou de unidade): ajuste ou tire da lista.</p>}
      </div>
      <SeloDaLinha l={l} aqui={aqui} />
    </li>
  );
}

// ================================================================ matéria-prima

/** "falta 1,565 kg" (erro) / "dá" (ok) / "—" sem saldo: a palavra vai sempre junto da cor. */
function Comprar({ i }: { i: InsumoNaConta }) {
  if (i.comprarMilesimos === null) return <span className="text-suave">—<span className="sr-only"> sem saldo para cruzar</span></span>;
  if (i.comprarMilesimos === 0) return <span className="font-semibold text-ok">dá</span>;
  return <span className="whitespace-nowrap font-semibold text-erro">falta {q(i.comprarMilesimos, i.unidade)}</span>;
}

function Tem({ i }: { i: InsumoNaConta }) {
  if (i.temMilesimos === null) return <span className="text-suave">—<span className="sr-only"> sem saldo apurado</span></span>;
  if (i.temMilesimos < 0) {
    return (
      <span className="text-erro">
        <span className="whitespace-nowrap">{quantidadeComSinal(i.temMilesimos, i.unidade)}</span>
        <span className="block whitespace-nowrap text-[12px]">abaixo de zero</span>
      </span>
    );
  }
  return <>{q(i.temMilesimos, i.unidade)}</>;
}

function Apoio({ i, custo }: { i: InsumoNaConta; custo: string | null | undefined }) {
  const partes = [i.deOnde.length ? `em ${i.deOnde.join(' · ')}` : null, i.embalagens ? `≈ ${textoDasEmbalagens(i.embalagens, i.unidade)}` : null].filter(Boolean);
  return (
    <>
      {partes.length > 0 && <span className="block text-[12px] text-suave [overflow-wrap:anywhere]">{partes.join(' · ')}</span>}
      {custo !== undefined && i.comprarMilesimos ? <span className="block text-[12px] tabular-nums text-suave">{custo === null ? 'sem preço' : `≈ ${custo} pelo último preço`}</span> : null}
    </>
  );
}

function MateriaPrima({ d, podeMontar }: { d: ListaDoDiaNaTela; podeMontar: boolean }) {
  const c = d.conta;
  const custoDe = (insumoId: string): string | null | undefined => {
    if (!d.custo) return undefined;
    const v = d.custo.porInsumo.get(insumoId);
    return v === undefined ? undefined : v === null ? null : formatarFracao(v);
  };
  const resumo = resumoDaConta(c.resumo);
  return (
    <Painel id="materia-prima" className="scroll-mt-24" titulo="Matéria-prima: vai usar, tem e comprar" subtitulo={c.apurado ? 'Pelo estoque da loja agora, na unidade de cada insumo' : 'Sem saldo para cruzar: só o que vai usar'} semRespiro>
      {c.materiaPrima.length === 0 ? (
        <Vazio>{d.linhas.length === 0 && d.foraDaLista.length === 0 ? (podeMontar ? 'Monte a lista para ver o que ela pede do estoque.' : 'Sem lista, nada a tirar do estoque.') : 'Nada a tirar do estoque para o que falta produzir.'}</Vazio>
      ) : (
        <>
          {(c.motivoSemSaldo || resumo) && <p className="border-b border-linha px-4 py-2.5 text-[13px] text-suave sm:px-5">{c.motivoSemSaldo ?? resumo}</p>}
          {/* Celular e tablet em pé: um cartão por insumo. */}
          <ul className="divide-y divide-linha md:hidden">
            {c.materiaPrima.map((i) => (
              <li key={i.insumoId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{i.nome}</p>
                  <p className="shrink-0 text-right text-[15px] tabular-nums">
                    <Comprar i={i} />
                  </p>
                </div>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-4 text-[13px] tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt className="text-suave">Vai usar</dt>
                    <dd className="text-right text-texto">{q(i.vaiUsarMilesimos, i.unidade)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-suave">Tem</dt>
                    <dd className="text-right text-texto">
                      <Tem i={i} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-1">
                  <Apoio i={i} custo={custoDe(i.insumoId)} />
                </div>
              </li>
            ))}
          </ul>
          {/* A partir de 768 px: tabela Corporativo. */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Matéria-prima da lista: vai usar, tem e comprar</caption>
              <thead className="bg-forte text-[12px] font-semibold text-suave">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-left">
                    Insumo
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Vai usar
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right">
                    Tem
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right">
                    Comprar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linha">
                {c.materiaPrima.map((i) => (
                  <tr key={i.insumoId} className="align-top">
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <span className="block font-semibold text-texto">{i.nome}</span>
                      <Apoio i={i} custo={undefined} />
                    </th>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{q(i.vaiUsarMilesimos, i.unidade)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      <Tem i={i} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                      <Comprar i={i} />
                      {d.custo && i.comprarMilesimos ? <span className="block text-[12px] text-suave">{custoDe(i.insumoId) === null ? 'sem preço' : `≈ ${custoDe(i.insumoId)}`}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {c.avisos.length > 0 && (
        <ul className="space-y-1 border-t border-linha px-4 py-3 text-[13px] text-atencao sm:px-5">
          {c.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

/** "4 insumos faltam · 1 abaixo de zero": atalho, logo abaixo do Gerar, para a matéria-prima (no celular ela fica lá embaixo). */
function AtalhoDaConta({ d }: { d: ListaDoDiaNaTela }) {
  const r = d.conta.resumo;
  if (!d.conta.apurado || d.conta.materiaPrima.length === 0) return null;
  const partes = [r.faltaComprar ? `${r.faltaComprar} ${r.faltaComprar === 1 ? 'insumo falta' : 'insumos faltam'}` : null, r.negativos ? `${r.negativos} abaixo de zero` : null].filter(Boolean);
  return (
    <a href="#materia-prima" className={`${LINK_DE_TEXTO} ff-toque mt-2 inline-flex min-h-11 items-center tabular-nums xl:hidden`}>
      {partes.length ? partes.join(' · ') : 'Tudo dá'}: ver a matéria-prima
    </a>
  );
}

// ================================================================ pré-preparos que entram nas receitas

function Preparos({ d, porNaLista, podePor }: { d: ListaDoDiaNaTela; porNaLista?: AcaoDeEstoque; podePor: boolean }) {
  const ps = d.conta.preparos;
  if (ps.length === 0) return null;
  const escolhiveis = new Set(d.opcoes.map((o) => o.id));
  return (
    <Painel titulo="Pré-preparos que entram nas receitas" subtitulo="Primeiro o que tem no estoque, depois o que a lista produz; o que falta produzir já entra na matéria-prima" semRespiro>
      <ul className="divide-y divide-linha">
        {ps.map((p: PreparoNaConta) => {
          const falta = p.faltaProduzirMilesimos;
          return (
            <li key={p.insumoId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{p.nome}</p>
                <p className="mt-0.5 text-[13px] tabular-nums text-suave">
                  vai usar {q(p.vaiUsarMilesimos, p.unidade)} · tem {p.temMilesimos === null ? '—' : quantidadeComSinal(p.temMilesimos, p.unidade)}
                  {p.naListaMilesimos ? ` · na lista ${q(p.naListaMilesimos, p.unidade)}` : ''}
                </p>
                <p className="mt-0.5 text-[12px] text-suave [overflow-wrap:anywhere]">em {p.deOnde.join(' · ')}</p>
                {falta === null ? null : falta > 0 ? (
                  <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-atencao">falta produzir {q(falta, p.unidade)}</p>
                ) : (
                  <p className="mt-0.5 text-[13px] font-semibold text-ok">dá</p>
                )}
                {p.semFicha && <p className="mt-0.5 text-[12px] text-atencao">A ficha dele está desativada: o que falta não entra na compra.</p>}
              </div>
              {podePor && porNaLista && falta && p.fichaId && !p.semFicha && escolhiveis.has(p.fichaId) ? (
                <FormPorNaLista acao={porNaLista} dia={d.dia} versao={d.lista?.versao ?? null} fichaId={p.fichaId} quantidadeMilesimos={falta} rotulo={`${p.nome}, ${q(falta, p.unidade)}`} bloqueio={null} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </Painel>
  );
}

// ================================================================ para quem compra

function FraseDoOrcamento({ o }: { o: OrcamentoNaNota }) {
  if (o.tipo === 'fora') return null;
  if (o.tipo === 'sem') {
    return (
      <p className="text-sm text-suave">
        {o.arredondado ? 'Limite seguro de compra' : 'Orçamento de compra'} de {o.lojaNome} em {o.periodoNome}: sem número ({o.motivo}).
      </p>
    );
  }
  const i = o.impacto;
  const comCompra = i.antesCentavos !== i.depoisCentavos;
  if (i.arredondado) {
    return (
      <div className="space-y-1 text-sm">
        <p className="tabular-nums text-suave">
          {o.lojaNome} em {o.periodoNome}: antes desta compra, {fraseDoLimite(i.antesCentavos)}.
        </p>
        {comCompra && <p className={`font-semibold tabular-nums ${i.passa ? 'text-atencao' : 'text-texto'}`}>{i.passa ? `Com a compra estimada, fica ${fraseDoLimite(i.depoisCentavos)}.` : `Com a compra estimada, ainda ${fraseDoLimite(i.depoisCentavos)}.`}</p>}
        <p className="text-[12px] text-suave">{SUBTITULO_DO_LIMITE}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="tabular-nums text-suave">
        {o.lojaNome} em {o.periodoNome}: antes desta compra, {fraseDoSaldo(i.antesCentavos)}.
      </p>
      {comCompra && <p className={`font-semibold tabular-nums ${i.passa ? 'text-erro' : 'text-texto'}`}>{i.passa ? `Com a compra estimada, passa ${formatarDinheiro(-i.depoisCentavos)} do orçamento.` : `Com a compra estimada, ainda ${fraseDoSaldo(i.depoisCentavos)}.`}</p>}
      {i.passa && <p className="text-[12px] text-suave">É um aviso: a compra pode ser feita.</p>}
    </div>
  );
}

function ParaQuemCompra({ d, raiz }: { d: ListaDoDiaNaTela; raiz: string }) {
  if (d.conta.resumo.faltaComprar === 0) return null;
  if (!d.custo && !d.orcamento && !d.pode.lancarNota) return null;
  const limite = d.orcamento && (d.orcamento.tipo === 'sem' ? d.orcamento.arredondado : d.orcamento.tipo === 'conta' ? d.orcamento.impacto.arredondado : false);
  return (
    <Painel titulo="Para quem compra" subtitulo="A lista não faz pedido: quem compra lança a nota em Compras">
      <div className="space-y-4">
        {d.custo && (
          <div>
            <p className="font-display text-[26px] font-bold leading-none tabular-nums">{formatarFracao(d.custo.total)}</p>
            <p className="mt-1.5 text-[12px] font-medium text-suave">
              compra estimada do que falta, pelo último preço pago
              {d.custo.semPreco.length ? ` · sem contar ${d.custo.semPreco.join(', ')} (sem preço)` : ''}
            </p>
          </div>
        )}
        {d.orcamento && <FraseDoOrcamento o={d.orcamento} />}
        {(d.pode.lancarNota || d.pode.verOrcamento) && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {d.pode.lancarNota && (
              <Link href={`${raiz}/compras/nova`} className={classeDeBotao('secundario', 'min-h-12 sm:min-h-10')}>
                Lançar nota
              </Link>
            )}
            {d.pode.verOrcamento && d.orcamento && (
              <Link href={`${raiz}/compras/orcamento`} className={`${LINK_DE_TEXTO} ff-toque inline-flex min-h-11 items-center self-start sm:self-center`}>
                {limite ? 'Ver o limite seguro' : 'Ver o orçamento'}
              </Link>
            )}
          </div>
        )}
      </div>
    </Painel>
  );
}

// ================================================================ a tela

export function TelaListaDoDia({
  d,
  base,
  raiz,
  contexto,
  feito,
  acoes,
  bloqueio,
  periodosHref,
}: {
  d: ListaDoDiaNaTela;
  /** `/erp/producao` ou o espelho do nível 1. */
  base: string;
  /** `/erp` ou `/rodolfo/erp/<slug>` (Compras mora fora da produção). */
  raiz: string;
  contexto?: string;
  feito?: string;
  acoes: { salvar: AcaoDeEstoque; gerar: AcaoDeEstoque; por: AcaoDeEstoque };
  bloqueio: string | null;
  periodosHref: string | null;
}) {
  const aqui = `${base}/lista/${d.loja.id}`;
  const doLote = `${base}/${d.loja.id}`;
  const fixas = d.linhas.filter((l) => l.estado !== 'NA_LISTA');
  const abertas = d.linhas.filter((l) => l.estado === 'NA_LISTA');
  const edita = d.pode.planejar && !d.naoEdita && !bloqueio;
  const contagem = d.linhas.length ? `${d.linhas.length} ${d.linhas.length === 1 ? 'pré-preparo' : 'pré-preparos'}${fixas.length ? ` · ${fixas.length} ${fixas.length === 1 ? 'virou lote' : 'viraram lote'}` : ''}` : 'sem lista';
  const historico = d.historico.map((h) => ({ ...h, mudancas: h.mudancas.filter((m) => m.campo !== 'nome') }));
  // Cada volta do servidor é uma "vez" nova: o aviso do que acabou de acontecer vem para a vista mesmo repetido.
  const vez = String(Date.now());
  return (
    <div className="space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome }]} />
      <PageHeader icone="producao" cor={COR.producao} titulo="Lista do dia" subtitulo={[contexto, d.loja.nome, primeiraMaiuscula(d.rotuloDoDia), contagem].filter(Boolean).join(' · ')}>
        <SeletorDoDia aqui={aqui} dia={d.dia} hoje={d.hoje} />
      </PageHeader>
      {feito && (
        <LevarParaVista vez={`${feito}:${d.lista?.versao ?? 0}:${vez}`}>
          <Aviso tom="ok" titulo={feito} />
        </LevarParaVista>
      )}
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}
      {d.periodoFechado && <AvisoDoPeriodoFechado periodo={d.periodoFechado} href={periodosHref} frase="Esta lista é desse período: não dá para montar nem gerar lotes nela." />}
      {d.naoEdita && !d.periodoFechado && d.pode.planejar && <Aviso titulo={d.naoEdita} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:items-start">
        <div className="min-w-0 space-y-5">
          <Painel titulo="O que produzir" subtitulo={edita ? 'Escolha o pré-preparo e quanto; salve para refazer a conta nesta tela' : 'O que a loja produz neste dia'} semRespiro={!edita || fixas.length > 0}>
            {fixas.length > 0 && (
              <>
                <p className={`text-[12px] font-semibold text-suave ${edita ? '' : 'sr-only'} px-4 pt-3 sm:px-5`}>Já viraram lote</p>
                <ul className="divide-y divide-linha">
                  {fixas.map((l) => (
                    <LinhaParaLer key={l.id} l={l} aqui={doLote} apurado={d.estoque === 'ABERTO'} />
                  ))}
                </ul>
              </>
            )}
            {edita ? (
              <div className={fixas.length ? 'border-t border-linha p-4 sm:p-5' : ''}>
                {fixas.length > 0 && <p className="mb-3 text-[12px] font-semibold text-suave">Em aberto</p>}
                <FormListaDoDia
                  key={`${d.lista?.versao ?? 'nova'}:${d.dia}`}
                  salvar={acoes.salvar}
                  gerar={acoes.gerar}
                  dia={d.dia}
                  versao={d.lista?.versao ?? null}
                  abertas={abertas.map((l) => ({ id: l.id, fichaId: l.fichaId, quantidade: textoDoCampo(l.quantidadeMilesimos) }))}
                  opcoes={d.opcoes}
                  emLote={fixas.length}
                  naoGera={d.naoGera}
                  bloqueio={bloqueio}
                />
                {d.opcoes.length === 0 && <p className="mt-3 text-[13px] text-suave">Nenhum pré-preparo para produzir: cadastre a ficha técnica dele (molho, base, calda…) em Fichas e produtos.</p>}
                <AtalhoDaConta d={d} />
              </div>
            ) : abertas.length > 0 ? (
              <ul className={`divide-y divide-linha ${fixas.length ? 'border-t border-linha' : ''}`}>
                {abertas.map((l) => (
                  <LinhaParaLer key={l.id} l={l} aqui={doLote} apurado={d.estoque === 'ABERTO'} />
                ))}
              </ul>
            ) : (
              fixas.length === 0 && <Vazio titulo="Sem lista neste dia.">{d.pode.planejar ? (d.naoEdita || bloqueio ? null : 'Monte a lista do dia.') : 'Quem define a lista é a gerência: ela aparece aqui quando for montada.'}</Vazio>
            )}
            {d.foraDaLista.length > 0 && (
              <div className="border-t border-linha px-4 py-3 sm:px-5">
                <p className="text-[12px] font-semibold text-suave">Também planejados para este dia, fora da lista (entram na conta)</p>
                <ul className="mt-1">
                  {d.foraDaLista.map((o) => (
                    <li key={o.id}>
                      <Link href={`${doLote}/${o.id}`} className="ff-transicao flex min-h-11 items-center justify-between gap-3 rounded-[7px] text-sm hover:bg-texto/[0.03]">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {o.nome} <span className="tabular-nums text-suave">· {q(o.quantidadeMilesimos, o.unidade)} · lote {o.codigo}</span>
                        </span>
                        <Selo tom={TOM_DO_LOTE[o.status]}>{ROTULO_DA_PRODUCAO[o.status]}</Selo>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Painel>
          <Preparos d={d} porNaLista={acoes.por} podePor={edita} />
        </div>
        <div className="min-w-0 space-y-5">
          <MateriaPrima d={d} podeMontar={edita} />
          <ParaQuemCompra d={d} raiz={raiz} />
        </div>
      </div>

      {historico.length > 0 && (
        <Painel titulo="Histórico da lista" semRespiro>
          <ListaHistorico linhas={historico} compacta titulos={TITULO_NO_HISTORICO_DA_LISTA} />
        </Painel>
      )}
    </div>
  );
}
