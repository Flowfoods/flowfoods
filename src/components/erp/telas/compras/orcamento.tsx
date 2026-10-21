/**
 * Orçamento de compra ao vivo (2.5) — a tela, a linha da prévia da nota e o aviso no detalhe da nota.
 *
 * O servidor já entrega cada loja na VISTA da pessoa (`orcamento.ts`): quem tem `dre.ver` na loja recebe a conta inteira
 * (receita prevista, meta, teto, já comprado, o ritmo com o farol da 2.4); quem não tem recebe só o "cabe" arredondado
 * a R$ 100 e o motivo. Esta tela só desenha o que recebeu: não existe valor escondido no navegador.
 *
 * Aviso, nunca bloqueio: "passou" é palavra e número, em `atencao`/`erro` só no texto; o botão de lançar continua.
 * Cor do farol só no glifo e na palavra (o componente `Farol` da 2.4).
 */

import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { OrcamentoDeCompra, OrcamentoNaNota, VistaCompleta, VistaDoOrcamento } from '@/lib/erp/orcamento';
import { DEGRAU_SEM_RECEITA, fraseDoSaldo, MOTIVO_SEM_META } from '@/lib/erp/orcamento-campos';
import { textoDoPercentual } from '@/lib/erp/dre-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';
import { Farol } from '../dre/farol';

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** O número grande: o que cabe, o que passou, ou o motivo de não haver número. */
function Saldo({ v, grande = true }: { v: VistaDoOrcamento; grande?: boolean }) {
  const saldo = v.veReceita ? v.conta?.saldoCentavos ?? null : v.saldoCentavos;
  if (saldo === null) {
    return (
      <div className="min-w-0">
        <p className={grande ? 'font-display text-[22px] font-bold leading-tight' : 'font-semibold text-texto'}>Sem número</p>
        <p className="mt-1 text-[13px] text-suave">{v.motivo ?? 'sem dado para a conta'}</p>
      </div>
    );
  }
  const passou = saldo < 0;
  const arredondado = !v.veReceita;
  const valor = passou ? -saldo : saldo;
  return (
    <div className="min-w-0">
      <p className={`${grande ? 'font-display text-[30px] leading-none' : 'text-sm'} font-bold tabular-nums ${passou ? 'text-erro' : 'text-texto'}`}>
        {!passou && arredondado && saldo < DEGRAU_SEM_RECEITA ? `menos de ${formatarDinheiro(DEGRAU_SEM_RECEITA)}` : formatarDinheiro(valor)}
      </p>
      <p className={`${grande ? 'mt-1.5 text-[13px]' : 'text-[12px]'} font-medium ${passou ? 'text-erro' : 'text-suave'}`}>
        {passou ? 'passou do orçamento' : 'ainda cabe no período'}
        {arredondado ? ' · arredondado a R$ 100' : ''}
      </p>
    </div>
  );
}

/** A conta por extenso (assinatura do ERP): só para quem vê a receita. */
function AConta({ v }: { v: VistaCompleta }) {
  const c = v.conta;
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-suave">
      {c && (
        <p className="tabular-nums">
          Meta do CMV {textoDoPercentual(c.metaBp)} × {formatarDinheiro(c.previstaCentavos)} de receita prevista = <span className="font-semibold text-texto">{formatarDinheiro(c.tetoCentavos)}</span> de teto
          {' − '}
          {formatarDinheiro(c.compradoCentavos)} já comprados = <span className={`font-semibold ${c.saldoCentavos < 0 ? 'text-erro' : 'text-texto'}`}>{formatarDinheiro(c.saldoCentavos)}</span>
        </p>
      )}
      {v.previsao && (
        <p className="tabular-nums">
          Receita prevista: {formatarDinheiro(v.previsao.realizadoCentavos)} vendidos em {dias(v.previsao.diasCompletos)} com faturamento completo + {formatarDinheiro(v.previsao.projetadoCentavos)} de{' '}
          {dias(v.previsao.diasRestantes + v.previsao.diasSemLancamento)} pela média do mesmo dia da semana nas últimas 4 semanas
          {v.previsao.diasSemLancamento > 0 ? ` (${dias(v.previsao.diasSemLancamento)} sem lançamento completo entraram pela média)` : ''}.
        </p>
      )}
      {!v.previsao && v.diasSemLancamento > 0 && <p>{dias(v.diasSemLancamento)} sem lançamento completo de faturamento entraram pela média.</p>}
    </div>
  );
}

/** O ritmo das compras até ontem: o CMV pelas compras contra a meta, com o farol da 2.4. */
function Ritmo({ v, metaBp }: { v: VistaCompleta; metaBp: number | null }) {
  if (!v.ritmo || metaBp === null) return null;
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-linha pt-3">
      <div className="min-w-0 flex-1 text-[13px] text-suave">
        <p className="font-semibold text-texto">Ritmo das compras até ontem</p>
        <p className="tabular-nums">
          {v.cmvAteOntemBp !== null ? `CMV pelas compras ${textoDoPercentual(v.cmvAteOntemBp)} contra a meta de ${textoDoPercentual(metaBp)}` : `Meta de ${textoDoPercentual(metaBp)}`}
          {v.ritmo.tipo === 'cor' ? ` (${v.ritmo.desvioTexto})` : v.ritmo.desvioTexto ? ` (${v.ritmo.desvioTexto})` : ''}
        </p>
      </div>
      <Farol f={v.ritmo} />
    </div>
  );
}

function BlocoPrincipal({ titulo, v, metaBp, planoHref }: { titulo: string; v: VistaDoOrcamento; metaBp: number | null; planoHref?: string }) {
  return (
    <Painel titulo={titulo} subtitulo={v.veReceita ? 'Meta do CMV × receita prevista − já comprado' : 'Quanto ainda dá para comprar sem furar a meta do CMV'}>
      <div className="space-y-4">
        <Saldo v={v} />
        {v.veReceita ? (
          <>
            <AConta v={v} />
            <Ritmo v={v} metaBp={metaBp} />
          </>
        ) : (
          v.diasSemLancamento > 0 && <p className="text-[13px] text-suave">O faturamento de {dias(v.diasSemLancamento)} ainda não foi lançado completo: o número usa a média até ser lançado.</p>
        )}
        {v.motivo === MOTIVO_SEM_META && planoHref && (
          <p className="text-[13px]">
            <Link href={planoHref} className={LINK_DE_TEXTO}>
              Definir a meta do CMV em Plano e metas
            </Link>
          </p>
        )}
      </div>
    </Painel>
  );
}

function TabelaPorLoja({ dados }: { dados: OrcamentoDeCompra }) {
  const completa = dados.lojas.some((l) => l.vista.veReceita);
  const semAcesso = <span className="text-[12px] text-suave">fora do seu acesso</span>;
  return (
    <Painel titulo="Por loja" subtitulo="Cada nota é de uma loja: o orçamento também." semRespiro>
      {/* Celular e tablet em pé: um bloco por loja. */}
      <ul className="divide-y divide-linha lg:hidden">
        {dados.lojas.map((l) => (
          <li key={l.lojaId} className="space-y-2 px-4 py-3 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-medium text-texto">{l.nome}</span>
              <div className="shrink-0 text-right">
                <Saldo v={l.vista} grande={false} />
              </div>
            </div>
            {l.vista.veReceita && l.vista.conta && (
              <p className="text-[12px] tabular-nums text-suave">
                Teto {formatarDinheiro(l.vista.conta.tetoCentavos)} · já comprado {formatarDinheiro(l.vista.compradoCentavos)} · receita prevista {formatarDinheiro(l.vista.conta.previstaCentavos)}
              </p>
            )}
            {l.vista.veReceita && l.vista.ritmo && <Farol f={l.vista.ritmo} forma="linha" />}
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm lg:table">
        <caption className="sr-only">Orçamento de compra por loja no período em curso.</caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              Loja
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Cabe ainda
            </th>
            {completa && (
              <>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Já comprado
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Teto
                </th>
                <th scope="col" className="h-10 px-3 text-right font-semibold">
                  Receita prevista
                </th>
                <th scope="col" className="h-10 px-3 pr-5 font-semibold">
                  Ritmo até ontem
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {dados.lojas.map((l) => {
            const v = l.vista;
            return (
              <tr key={l.lojaId} className="border-t border-linha align-top">
                <td className="py-3 pl-5 pr-3 font-medium text-texto">{l.nome}</td>
                <td className="px-3 py-3 text-right">
                  <Saldo v={v} grande={false} />
                </td>
                {completa &&
                  (v.veReceita ? (
                    <>
                      <td className="px-3 py-3 text-right">{formatarDinheiro(v.compradoCentavos)}</td>
                      <td className="px-3 py-3 text-right">{v.conta ? formatarDinheiro(v.conta.tetoCentavos) : <span className="text-[12px] text-suave">sem número</span>}</td>
                      <td className="px-3 py-3 text-right">{v.conta ? formatarDinheiro(v.conta.previstaCentavos) : <span className="text-[12px] text-suave">sem número</span>}</td>
                      <td className="px-3 py-3 pr-5">{v.ritmo ? <Farol f={v.ritmo} /> : <span className="text-[12px] text-suave">sem meta</span>}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right">{semAcesso}</td>
                      <td className="px-3 py-3 text-right">{semAcesso}</td>
                      <td className="px-3 py-3 text-right">{semAcesso}</td>
                      <td className="px-3 py-3 pr-5">{semAcesso}</td>
                    </>
                  ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Painel>
  );
}

export function TelaOrcamento({
  dados,
  contexto,
  lancarHref,
  bloqueio,
  planoHref,
}: {
  dados: OrcamentoDeCompra;
  /** "Rede Completa" / o nome da loja (e o parceiro, no nível 1). */
  contexto: string;
  /** Só para quem lança nota. */
  lancarHref?: string;
  bloqueio: string | null;
  /** Só para quem define as metas. */
  planoHref?: string;
}) {
  const subtitulo = `${contexto} · ${dados.periodo.nome} · dia ${dados.dia.dia} de ${dados.dia.de}`;
  const unica = dados.rede === null && dados.lojas.length === 1 ? dados.lojas[0] : null;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="compras"
        cor={COR.compras}
        titulo="Orçamento de compra"
        subtitulo={subtitulo}
        acao={
          lancarHref ? (
            <BotaoOuMotivo href={lancarHref} bloqueio={bloqueio} variante="primario">
              <Plus size={16} aria-hidden />
              Lançar nota
            </BotaoOuMotivo>
          ) : undefined
        }
      />
      {dados.lojas.length === 0 ? (
        <Painel semRespiro>
          <Vazio titulo="Nenhuma loja ativa no seu acesso.">O orçamento é de cada loja ativa: sem loja, não há o que somar.</Vazio>
        </Painel>
      ) : (
        <>
          {dados.rede && <BlocoPrincipal titulo="A rede no período" v={dados.rede} metaBp={dados.metaBp} planoHref={planoHref} />}
          {unica && <BlocoPrincipal titulo={unica.nome} v={unica.vista} metaBp={dados.metaBp} planoHref={planoHref} />}
          {!unica && <TabelaPorLoja dados={dados} />}
          <p className="text-[12px] text-suave">É um aviso, não um bloqueio: a nota que passa do orçamento é lançada igual, e a prévia da nota mostra quanto ela passa.</p>
        </>
      )}
    </div>
  );
}

// ================================================================ a nota

/** A frase do orçamento na nota: "Com esta nota, cabe R$ X" / "Com esta nota, passa R$ X". */
export function OrcamentoNaPrevia({ o }: { o: OrcamentoNaNota }) {
  if (o.tipo === 'fora') {
    return <p className="mt-1 text-sm text-suave">A data da nota não é do período em curso ({o.periodoNome}): o orçamento de compra é só dele.</p>;
  }
  if (o.tipo === 'sem') {
    return (
      <p className="mt-1 text-sm text-suave">
        {o.lojaNome} em {o.periodoNome}: sem número ({o.motivo}).
      </p>
    );
  }
  const i = o.impacto;
  return (
    <div className="mt-1 space-y-1 text-sm">
      <p className="tabular-nums text-suave">
        {o.lojaNome} em {o.periodoNome}: antes desta nota, {fraseDoSaldo(i.antesCentavos, i.arredondado)}
        {i.arredondado ? ' (arredondado a R$ 100)' : ''}.
      </p>
      <p className={`tabular-nums font-semibold ${i.passa ? 'text-erro' : 'text-texto'}`}>
        {i.passa ? `Com esta nota, passa ${formatarDinheiro(-i.depoisCentavos)} do orçamento.` : `Com esta nota, ainda ${fraseDoSaldo(i.depoisCentavos, false)}.`}
      </p>
      {i.passa && <p className="text-[13px] text-suave">É um aviso: a nota pode ser lançada. Vale combinar com quem define as metas.</p>}
    </div>
  );
}

/** No detalhe da nota lançada: como ficou o orçamento da loja (só no período em curso). */
export function AvisoDoOrcamento({ o, href }: { o: OrcamentoNaNota; href?: string }) {
  if (o.tipo === 'fora') return null;
  const link = href ? (
    <>
      {' '}
      <Link href={href} className={LINK_DE_TEXTO}>
        Ver o orçamento
      </Link>
    </>
  ) : null;
  if (o.tipo === 'sem') {
    return (
      <Aviso titulo={`Orçamento de compra de ${o.lojaNome} em ${o.periodoNome}: sem número.`}>
        {o.motivo}.{link}
      </Aviso>
    );
  }
  const saldo = o.impacto.depoisCentavos;
  if (saldo < 0) {
    return (
      <Aviso tom="alerta" titulo={`${o.lojaNome} passou ${formatarDinheiro(-saldo)} do orçamento de compra de ${o.periodoNome}${o.impacto.arredondado ? ' (arredondado a R$ 100)' : ''}.`}>
        A nota está lançada: o orçamento avisa, não bloqueia.{link}
      </Aviso>
    );
  }
  return (
    <Aviso titulo={`Orçamento de compra de ${o.lojaNome} em ${o.periodoNome}: ${fraseDoSaldo(saldo, o.impacto.arredondado)}${o.impacto.arredondado && saldo >= DEGRAU_SEM_RECEITA ? ' (arredondado a R$ 100)' : ''}.`}>
      {link}
    </Aviso>
  );
}
