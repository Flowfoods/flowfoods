/**
 * Orçamento de compra ao vivo (2.5) — a tela, a linha da prévia da nota e o aviso no detalhe da nota.
 *
 * O servidor já entrega cada loja na VISTA da pessoa (`orcamento.ts`): quem tem `dre.ver` na loja recebe a conta inteira
 * (receita prevista, meta, teto, já comprado, o ritmo com o farol da 2.4); quem não tem recebe só o "cabe" pelo teto
 * arredondado para baixo, o motivo e os avisos. Esta tela só desenha o que recebeu: não existe valor escondido no navegador.
 *
 * Aviso, nunca bloqueio: "passou" é palavra e número, em `erro` só no texto; o botão de lançar continua.
 * Cor do farol só no glifo e na palavra (o componente `Farol` da 2.4).
 *
 * Desenho (revisão de UX da 2.5): o número e o "Por loja" moram no MESMO painel, lado a lado a partir de 1280 px, para a
 * loja que passou ficar na primeira dobra mesmo com a caixa "Como funciona" aberta; a conta por extenso e o ritmo ficam no
 * painel de baixo, só para quem vê a receita. Linha da tabela de uma linha só (44 px), no padrão Corporativo.
 */

import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { OrcamentoDeCompra, OrcamentoNaNota, VistaCompleta, VistaDoOrcamento } from '@/lib/erp/orcamento';
import { aproximado, AVISO_SEM_NOTA, AVISO_SEM_NOTA_NO_LIMITE, fraseDoLimite, fraseDoSaldo, MOTIVO_SEM_META, SUBTITULO_DO_LIMITE } from '@/lib/erp/orcamento-campos';
import { textoDoPercentual } from '@/lib/erp/dre-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { BotaoOuMotivo } from '../cadastro/partes';
import { Farol } from '../dre/farol';

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const SUBTITULO_COMPLETO = 'Meta do CMV × receita prevista − já comprado';

const saldoDe = (v: VistaDoOrcamento) => (v.veReceita ? v.conta?.saldoCentavos ?? null : v.saldoCentavos);

/** Os links de quem pode resolver um "sem número". */
interface Saidas {
  planoHref?: string;
  faturamentoHref?: string;
}

/** `motivos`: o do escopo e os das lojas (na rede, "sem o orçamento de X" esconde o porquê: o da loja diz). */
function SaidaDoMotivo({ motivos, saidas }: { motivos: readonly (string | null)[]; saidas: Saidas }) {
  if (motivos.includes(MOTIVO_SEM_META) && saidas.planoHref) {
    return (
      <p className="text-[13px]">
        <Link href={saidas.planoHref} className={`${LINK_DE_TEXTO} ff-toque`}>
          Definir a meta do CMV em Plano e metas
        </Link>
      </p>
    );
  }
  if (motivos.some((m) => m && /faturamento/.test(m)) && saidas.faturamentoHref) {
    return (
      <p className="text-[13px]">
        <Link href={saidas.faturamentoHref} className={`${LINK_DE_TEXTO} ff-toque`}>
          Lançar o faturamento
        </Link>
      </p>
    );
  }
  return null;
}

/** O número grande: o que cabe, o que passou, ou o motivo de não haver número. */
function NumeroGrande({ v }: { v: VistaDoOrcamento }) {
  const saldo = saldoDe(v);
  if (saldo === null) {
    return (
      <div className="min-w-0">
        <p className="font-display text-[22px] font-bold leading-tight">Sem número</p>
        <p className="mt-1 text-[13px] text-suave">{v.motivo ?? 'sem dado para a conta'}</p>
      </div>
    );
  }
  const passou = saldo < 0;
  if (!v.veReceita) {
    // Limite seguro (quem não vê o DRE): nunca "orçamento" nem "passou", tom de atenção, valor aproximado sem centavos.
    const a = aproximado(saldo);
    return (
      <div className="min-w-0">
        <p className={`font-display text-[30px] font-bold leading-none tabular-nums ${passou ? 'text-atencao' : 'text-texto'}`}>
          {!passou && a === 0 && saldo > 0 ? `menos de ${formatarDinheiro(10_000)}` : formatarDinheiro(passou ? -a : a)}
        </p>
        <p className={`mt-1.5 text-[13px] font-medium ${passou ? 'text-atencao' : 'text-suave'}`}>{passou ? 'acima do limite seguro' : 'cabe no limite seguro'}</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className={`font-display text-[30px] font-bold leading-none tabular-nums ${passou ? 'text-erro' : 'text-texto'}`}>{formatarDinheiro(passou ? -saldo : saldo)}</p>
      <p className={`mt-1.5 text-[13px] font-medium ${passou ? 'text-erro' : 'text-suave'}`}>{passou ? 'passou do orçamento' : 'ainda cabe no período'}</p>
    </div>
  );
}

/** Os avisos que o número sozinho esconde: quem já passou (a sobra de outra loja não cobre) e quem vendeu sem nota. */
function Alertas({ v, escopoDeVarias }: { v: VistaDoOrcamento; escopoDeVarias: boolean }) {
  const passaram = escopoDeVarias ? v.quemPassou : [];
  const semNota = v.semNota;
  if (passaram.length === 0 && semNota.length === 0 && v.diasSemLancamento === 0) return null;
  return (
    <ul className="space-y-1 text-[13px] leading-snug">
      {passaram.map((p) => (
        <li key={p.nome} className={`font-semibold ${v.veReceita ? 'text-erro' : 'text-atencao'}`}>
          {p.frase}
        </li>
      ))}
      {semNota.map((n) => (
        <li key={n} className="text-atencao">
          {`${escopoDeVarias ? n : 'Esta loja'} ${v.veReceita ? AVISO_SEM_NOTA : AVISO_SEM_NOTA_NO_LIMITE}`}
        </li>
      ))}
      {v.diasSemLancamento > 0 && (
        <li className="text-suave">{dias(v.diasSemLancamento)} sem lançamento completo de faturamento: entraram pela média até serem lançados.</li>
      )}
    </ul>
  );
}

/** "R$ 15.603,00" ou "passou R$ 3.216,00", numa linha só. */
function CelulaDoSaldo({ v }: { v: VistaDoOrcamento }) {
  const saldo = saldoDe(v);
  if (saldo === null) return <span className="text-[12px] text-suave">sem número</span>;
  if (!v.veReceita) {
    const a = aproximado(saldo);
    if (saldo < 0) return <span className="whitespace-nowrap font-semibold text-atencao">acima em {formatarDinheiro(-a)}</span>;
    return <span className="whitespace-nowrap font-semibold text-texto">{a === 0 && saldo > 0 ? `menos de ${formatarDinheiro(10_000)}` : formatarDinheiro(a)}</span>;
  }
  if (saldo < 0) return <span className="whitespace-nowrap font-semibold text-erro">passou {formatarDinheiro(-saldo)}</span>;
  return <span className="whitespace-nowrap font-semibold text-texto">{formatarDinheiro(saldo)}</span>;
}

const jaComprado = (v: VistaCompleta) => (v.semNota.length > 0 ? <span className="text-[12px] text-atencao">sem nota de compra</span> : formatarDinheiro(v.compradoCentavos));

/** O "Por loja": tabela Corporativo para quem vê a receita (≥ 1024 px), lista para quem não vê e no celular. */
function PorLoja({ dados, compacto = false }: { dados: OrcamentoDeCompra; compacto?: boolean }) {
  const completa = dados.lojas.every((l) => l.vista.veReceita);
  const lista = (
    <ul className={`divide-y divide-linha border-y border-linha ${completa ? 'lg:hidden' : 'max-w-xl'}`}>
      {dados.lojas.map((l) => (
        <li key={l.lojaId} className="py-2.5">
          {/* Celular: o nome em linha própria; do tablet para cima, nome e número na mesma linha. */}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3">
            <p className="font-medium text-texto">{l.nome}</p>
            <span className="text-sm tabular-nums">
              <CelulaDoSaldo v={l.vista} />
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm tabular-nums">
            {l.vista.veReceita && l.vista.conta && (
              <span className="text-[12px] text-suave">
                teto {formatarDinheiro(l.vista.conta.tetoCentavos)} · já comprado {l.vista.semNota.length > 0 ? 'sem nota' : formatarDinheiro(l.vista.compradoCentavos)}
              </span>
            )}
          </div>
          {saldoDe(l.vista) === null && l.vista.motivo && <p className="text-[12px] text-suave">{l.vista.motivo}</p>}
          {l.vista.semNota.length > 0 && <p className="text-[12px] text-atencao">vendeu e não tem nota de compra no período</p>}
          {l.vista.veReceita && l.vista.ritmo && (
            <div className="mt-1">
              <Farol f={l.vista.ritmo} forma="linha" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="orcamento-por-loja" className="min-w-0">
      {/* Ao lado do número (≥ 1280 px) o título fica só para o leitor de tela: a linha que ele ocupava é a da loja que passou. */}
      <h2 id="orcamento-por-loja" className={compacto ? 'mb-2 text-[13px] font-semibold text-texto xl:sr-only' : 'mb-2 text-[13px] font-semibold text-texto'}>
        Por loja <span className="font-normal text-suave">· cada nota é de uma loja: {completa ? 'o orçamento' : 'o limite'} também</span>
      </h2>
      {lista}
      {completa && (
        <table className="hidden w-full text-[13px] lg:table">
          <caption className="sr-only">Orçamento de compra por loja no período em curso.</caption>
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 pl-3 pr-3 font-semibold">
                Loja
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Cabe ainda
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Já comprado
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Teto
              </th>
              <th scope="col" className="h-10 whitespace-nowrap px-3 text-right font-semibold" title="Receita prevista">
                <span aria-hidden>Prevista</span>
                <span className="sr-only">Receita prevista</span>
              </th>
              <th scope="col" className="h-10 px-3 font-semibold">
                Ritmo até ontem
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {dados.lojas.map((l) => {
              const v = l.vista as VistaCompleta;
              return (
                <tr key={l.lojaId} className="border-t border-linha">
                  <td className="h-11 py-1 pl-3 pr-3">
                    <span className="whitespace-nowrap font-medium text-texto">{l.nome}</span>
                    {/* Sem número: o motivo vai UMA vez, aqui, e quebra linha (nunca alarga a tabela). */}
                    {!v.conta && v.motivo && <span className="block max-w-[16rem] text-[12px] font-normal leading-snug text-suave">{v.motivo}</span>}
                  </td>
                  <td className="px-3 py-1 text-right">
                    <CelulaDoSaldo v={v} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1 text-right">{jaComprado(v)}</td>
                  <td className="whitespace-nowrap px-3 py-1 text-right">{v.conta ? formatarDinheiro(v.conta.tetoCentavos) : <span className="text-[12px] text-suave">sem número</span>}</td>
                  <td className="whitespace-nowrap px-3 py-1 text-right">{v.previsao ? formatarDinheiro(v.previsao.previstaCentavos) : <span className="text-[12px] text-suave">sem número</span>}</td>
                  <td className="px-3 py-1">{v.ritmo ? <Farol f={v.ritmo} forma="linha" /> : <span className="text-[12px] text-suave">sem meta</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** A conta por extenso (assinatura do ERP): só para quem vê a receita. */
function AConta({ v, rede }: { v: VistaCompleta; rede: boolean }) {
  const c = v.conta;
  const p = v.previsao;
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-suave">
      {c && (
        <p className="tabular-nums">
          Meta do CMV {textoDoPercentual(c.metaBp)} × {formatarDinheiro(c.previstaCentavos)} de receita prevista = <span className="font-semibold text-texto">{formatarDinheiro(c.tetoCentavos)}</span> de teto
          {' − '}
          {v.semNota.length > 0 && v.compradoCentavos === 0 ? 'nenhuma nota de compra' : `${formatarDinheiro(c.compradoCentavos)} já comprados`} ={' '}
          <span className={`font-semibold ${c.saldoCentavos < 0 ? 'text-erro' : 'text-texto'}`}>{c.saldoCentavos < 0 ? `passou ${formatarDinheiro(-c.saldoCentavos)}` : formatarDinheiro(c.saldoCentavos)}</span>
        </p>
      )}
      {p && (
        <p className="tabular-nums">
          Receita prevista {formatarDinheiro(p.previstaCentavos)}: {formatarDinheiro(p.realizadoCentavos)} vendidos em {dias(p.diasCompletos)} com faturamento completo + {formatarDinheiro(p.projetadoCentavos)} de{' '}
          {dias(p.diasRestantes + p.diasSemLancamento)} pela média do mesmo dia da semana nas últimas 4 semanas
          {p.diasSemLancamento > 0 ? ` (${dias(p.diasSemLancamento)} sem lançamento completo entraram pela média)` : ''}
          {p.diasAntesDeAbrir > 0 ? `; ${dias(p.diasAntesDeAbrir)} antes do primeiro lançamento da loja ficaram fora` : ''}.
        </p>
      )}
      {!c && !p && v.previstaCentavos !== null && (
        <p className="tabular-nums">Receita prevista {formatarDinheiro(v.previstaCentavos)} (a soma das lojas). Sem a meta do CMV não há teto.</p>
      )}
      {!c && !p && v.previstaCentavos === null && (
        <p>
          {rede ? `Sem a conta da rede: ${v.motivo ?? 'falta dado'}. Ela aparece quando todas as lojas tiverem número.` : `Sem a conta: ${v.motivo ?? 'falta dado'}.`}
          {v.ritmo ? ' O ritmo abaixo já vale.' : ''}
        </p>
      )}
      {p && p.frasesDoZero.length > 0 && (
        <ul className="space-y-0.5">
          {p.frasesDoZero.map((f) => (
            <li key={f}>{f.charAt(0).toUpperCase() + f.slice(1)}.</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O ritmo das compras até ontem: o CMV pelas compras contra a meta, com o farol da 2.4, e o que ele NÃO diz. */
function Ritmo({ v, metaBp }: { v: VistaCompleta; metaBp: number | null }) {
  if (!v.ritmo || metaBp === null) return null;
  return (
    <div className="space-y-1 border-t border-linha pt-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 text-[13px] text-suave">
          <p className="font-semibold text-texto">Ritmo das compras até ontem</p>
          <p className="tabular-nums">
            {v.cmvAteOntemBp !== null ? `CMV pelas compras ${textoDoPercentual(v.cmvAteOntemBp)} contra a meta de ${textoDoPercentual(metaBp)}` : `Meta de ${textoDoPercentual(metaBp)}`}
            {v.ritmo.desvioTexto ? ` (${v.ritmo.desvioTexto})` : ''}
          </p>
        </div>
        <Farol f={v.ritmo} />
      </div>
      <p className="text-[12px] text-suave">O farol olha o ritmo das compras até ontem; o número de cima olha o período inteiro. Comprar muito no começo acende o farol mesmo cabendo no orçamento.</p>
    </div>
  );
}

function BlocoPrincipal({ titulo, v, dados, saidas, varias }: { titulo: string; v: VistaDoOrcamento; dados: OrcamentoDeCompra; saidas: Saidas; varias: boolean }) {
  // Limite seguro: o subtítulo só quando há número (sem número, a frase do "aproximado" não explica nada).
  const subtitulo = v.veReceita || saldoDe(v) === null ? undefined : SUBTITULO_DO_LIMITE;
  return (
    <Painel titulo={titulo} subtitulo={subtitulo}>
      <div className={varias ? 'grid gap-5 xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)]' : ''}>
        <div className="min-w-0 space-y-3">
          <NumeroGrande v={v} />
          <Alertas v={v} escopoDeVarias={varias} />
          <SaidaDoMotivo motivos={[v.motivo, ...dados.lojas.map((l) => l.vista.motivo)]} saidas={saidas} />
        </div>
        {varias && <PorLoja dados={dados} compacto />}
      </div>
    </Painel>
  );
}

function PainelDaConta({ v, metaBp, rede }: { v: VistaCompleta; metaBp: number | null; rede: boolean }) {
  if (!v.conta && !v.previsao && !v.ritmo && v.previstaCentavos === null) return null;
  return (
    <Painel titulo="Como a conta chega aqui" subtitulo={SUBTITULO_COMPLETO}>
      <div className="space-y-3">
        <AConta v={v} rede={rede} />
        <Ritmo v={v} metaBp={metaBp} />
      </div>
    </Painel>
  );
}

export function TelaOrcamento({
  dados,
  contexto,
  lancarHref,
  bloqueio,
  planoHref,
  faturamentoHref,
}: {
  dados: OrcamentoDeCompra;
  /** "Rede Completa" / o nome da loja (e o parceiro, no nível 1). */
  contexto: string;
  /** Só para quem lança nota. */
  lancarHref?: string;
  bloqueio: string | null;
  /** Só para quem define as metas. */
  planoHref?: string;
  /** Só para quem lança faturamento. */
  faturamentoHref?: string;
}) {
  const subtitulo = `${contexto} · ${dados.periodo.nome} · dia ${dados.dia.dia} de ${dados.dia.de}`;
  const principal = dados.rede ?? (dados.lojas.length === 1 ? dados.lojas[0].vista : null);
  const titulo = dados.rede ? 'A rede no período' : dados.lojas.length === 1 ? dados.lojas[0].nome : 'Suas lojas no período';
  const varias = dados.lojas.length > 1;
  const saidas = { planoHref, faturamentoHref };
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
      ) : principal ? (
        <>
          <BlocoPrincipal titulo={titulo} v={principal} dados={dados} saidas={saidas} varias={varias} />
          {principal.veReceita && <PainelDaConta v={principal} metaBp={dados.metaBp} rede={dados.rede !== null} />}
        </>
      ) : (
        <Painel titulo={titulo} subtitulo={dados.lojas.every((l) => l.vista.veReceita) ? SUBTITULO_COMPLETO : SUBTITULO_DO_LIMITE}>
          <div className="space-y-3">
            <PorLoja dados={dados} />
            <SaidaDoMotivo motivos={dados.lojas.map((l) => l.vista.motivo)} saidas={saidas} />
          </div>
        </Painel>
      )}
    </div>
  );
}

// ================================================================ a nota

/** A frase do orçamento na nota: "Com esta nota, cabe R$ X" / "Com esta nota, passa R$ X". */
export function OrcamentoNaPrevia({ o }: { o: OrcamentoNaNota }) {
  if (o.tipo === 'fora') {
    return <p className="mt-1 text-sm text-suave">A data da nota não é do período em curso ({o.periodoNome}): o quanto ainda cabe vale só para ele.</p>;
  }
  if (o.tipo === 'sem') {
    return (
      <p className="mt-1 text-sm text-suave">
        {o.lojaNome} em {o.periodoNome}: sem número ({o.motivo}).
      </p>
    );
  }
  const i = o.impacto;
  const aviso = i.passa && <p className="text-[13px] text-suave">É um aviso: a nota pode ser lançada.{o.defineMetas ? '' : ' Vale combinar com quem define as metas.'}</p>;
  if (i.arredondado) {
    // Limite seguro (quem não vê o DRE): nunca "orçamento" nem "passou"; valores aproximados, sem centavos; tom de atenção.
    return (
      <div className="mt-1 space-y-1 text-sm">
        <p className="tabular-nums text-suave">
          {o.lojaNome} em {o.periodoNome}: antes desta nota, {fraseDoLimite(i.antesCentavos)}.
        </p>
        <p className={`tabular-nums font-semibold ${i.passa ? 'text-atencao' : 'text-texto'}`}>
          {i.passa ? `Com esta nota, fica ${fraseDoLimite(i.depoisCentavos)}.` : `Com esta nota, ainda ${fraseDoLimite(i.depoisCentavos)}.`}
        </p>
        <p className="text-[12px] text-suave">O limite seguro é um {SUBTITULO_DO_LIMITE.charAt(0).toLowerCase() + SUBTITULO_DO_LIMITE.slice(1)}</p>
        {o.semNota && <p className="text-[13px] text-atencao">A loja vendeu no período e ainda não tem nota de compra: confira se falta lançar nota.</p>}
        {aviso}
      </div>
    );
  }
  return (
    <div className="mt-1 space-y-1 text-sm">
      <p className="tabular-nums text-suave">
        {o.lojaNome} em {o.periodoNome}: antes desta nota, {fraseDoSaldo(i.antesCentavos)}.
      </p>
      <p className={`tabular-nums font-semibold ${i.passa ? 'text-erro' : 'text-texto'}`}>
        {i.passa ? `Com esta nota, passa ${formatarDinheiro(-i.depoisCentavos)} do orçamento.` : `Com esta nota, ainda ${fraseDoSaldo(i.depoisCentavos)}.`}
      </p>
      {o.semNota && <p className="text-[13px] text-atencao">A loja vendeu no período e ainda não tem nota de compra: o “antes” é o teto inteiro.</p>}
      {aviso}
    </div>
  );
}

/**
 * No detalhe da nota lançada: como ficou o orçamento da loja (só no período em curso). `agora` = a nota acabou de ser
 * lançada ou editada; numa nota antiga a frase começa com "Hoje," (ela não causou sozinha o estouro).
 */
export function AvisoDoOrcamento({ o, href, agora = false }: { o: OrcamentoNaNota; href?: string; agora?: boolean }) {
  if (o.tipo === 'fora') return null;
  const limite = o.tipo === 'sem' ? o.arredondado : o.impacto.arredondado;
  const link = href ? (
    <>
      {' '}
      <Link href={href} className={LINK_DE_TEXTO}>
        {limite ? 'Ver o limite seguro' : 'Ver o orçamento'}
      </Link>
    </>
  ) : null;
  const quando = agora ? '' : 'Hoje, ';
  if (o.tipo === 'sem') {
    return (
      <Aviso titulo={`${quando}${o.lojaNome} em ${o.periodoNome}: ${o.arredondado ? 'limite seguro' : 'orçamento de compra'} sem número.`}>
        {o.motivo.charAt(0).toUpperCase() + o.motivo.slice(1)}.{link}
      </Aviso>
    );
  }
  const saldo = o.impacto.depoisCentavos;
  if (o.impacto.arredondado) {
    // Limite seguro: tom de atenção, nunca "passou do orçamento" (a conta exata pode ter folga).
    const titulo = `${quando}${o.lojaNome} em ${o.periodoNome}: ${fraseDoLimite(saldo)}.`;
    return (
      <Aviso tom={saldo < 0 ? 'alerta' : 'neutro'} titulo={titulo}>
        {SUBTITULO_DO_LIMITE}
        {link}
      </Aviso>
    );
  }
  if (saldo < 0) {
    return (
      <Aviso tom="alerta" titulo={`${quando}${o.lojaNome} passou ${formatarDinheiro(-saldo)} do orçamento de compra de ${o.periodoNome}.`}>
        {agora ? 'A nota está lançada: o orçamento avisa, não bloqueia.' : 'O orçamento avisa, não bloqueia.'}
        {link}
      </Aviso>
    );
  }
  const titulo = `${agora ? 'O' : 'Hoje, o'} orçamento de compra de ${o.lojaNome} em ${o.periodoNome}: ${fraseDoSaldo(saldo)}.`;
  return <Aviso titulo={titulo}>{link}</Aviso>;
}

/** O título do bloco na prévia: quem não vê o DRE lê "Limite seguro de compra"; nota de outro período, "Quanto ainda cabe". */
export function tituloNaPrevia(o: OrcamentoNaNota): string {
  if (o.tipo === 'fora') return 'Quanto ainda cabe';
  const limite = o.tipo === 'sem' ? o.arredondado : o.impacto.arredondado;
  return limite ? 'Limite seguro de compra' : 'Orçamento de compra';
}
