// Scanner avoid-ai-design, SD4d (P2) aceito: "Lote 261018-01 · 5 kg", "Vai usar · tem · comprar" e as linhas de origem são o padrão "A · B" das telas da 1.1–3.1.
/**
 * Lista do dia (3.2): o gerente define o que produzir (os lotes do dia) e a tela cruza com o estoque: por insumo, o que VAI
 * USAR, o que TEM e o que falta COMPRAR. Pré-preparo que falta vai para "Falta produzir", com o botão que o põe na lista (a
 * cascata nunca explode sozinha). O rascunho mora na URL; a prévia é uma página comum e não grava nada; "Confirmar a lista"
 * grava os lotes numa transação só. Celular primeiro (cartões por insumo e barra fixa); a partir de 768 px, tabela. R$ só vem do
 * servidor para quem tem `insumos.ver`; o fornecedor, só para quem tem `compras.ver` na loja da nota. A mesma tela no nível 1
 * e na pessoa do parceiro.
 */

import Link from 'next/link';
import type { FornecedorDaLinha, LinhaDaConta, ListaDoDia, LoteDoDia } from '@/lib/erp/lista-do-dia';
import { fraseDoCoberto, hrefDaLista, textoDaQuantidade, type LinhaDoRascunho } from '@/lib/erp/lista-do-dia-campos';
import { fechadoNaData, type AvisoDePeriodos } from '@/lib/erp/periodo-fechado-campos';
import { formatarQuantidade, formatarDinheiro, UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { formatarRendimento, rendimentoDoLote } from '@/lib/erp/producao-campos';
import { rotuloDoDia } from '@/lib/erp/lista-do-dia-campos';
import { somarDias } from '@/lib/erp/contagem-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { CAMPO, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormConfirmarLista } from './form-lista';
import { SeloDoLote } from './partes';

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const nota = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function TelaListaDoDia({
  d,
  base,
  contexto,
  feito,
  digitadas,
  acao,
  periodos,
  bloqueio,
  agora,
}: {
  d: ListaDoDia;
  base: string;
  contexto?: string;
  feito?: string;
  /** O rascunho como a URL o trouxe (uma linha por linha digitada). */
  digitadas: LinhaDoRascunho[];
  acao: AcaoDeEstoque;
  periodos: AvisoDePeriodos;
  bloqueio: string | null;
  agora: Date;
}) {
  const aqui = `${base}/${d.loja.id}/lista`;
  const quadro = `${base}/${d.loja.id}`;
  const href = (dia: string, linhas: readonly LinhaDoRascunho[] = []) => hrefDaLista(aqui, dia, d.hoje, linhas);
  const ontem = somarDias(d.dia, -1);
  const proximo = somarDias(d.dia, 1);
  const limite = somarDias(d.hoje, 14);
  const rascunhoAtivo = d.pode.planejar && !d.passado && !bloqueio;
  const erros = d.rascunho.erros;
  const comErro = Object.keys(erros).length > 0 || d.rascunho.excedeu;
  const lotesDoRascunho = d.rascunho.linhas.length;
  const motivoParado = !d.aberto
    ? `O estoque da ${d.loja.nome} ainda não foi aberto.`
    : d.rascunho.excedeu
      ? 'A lista passa de 30 linhas: tire algumas e confirme o resto depois.'
      : erros.geral
        ? erros.geral
        : comErro
          ? 'Corrija as linhas marcadas para confirmar.'
          : lotesDoRascunho === 0
            ? 'Ponha pelo menos um pré-preparo na lista.'
            : null;
  const fechadoHoje = fechadoNaData(periodos.fechados, d.hoje)?.nome ?? null;
  const naoVai = d.lotes.filter((l) => l.status !== 'CANCELADA');
  const canceladas = d.lotes.filter((l) => l.status === 'CANCELADA');

  return (
    <div className={`mx-auto max-w-4xl space-y-5 ${rascunhoAtivo ? 'pb-28 sm:pb-0' : ''}`}>
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome }]} />
      <PageHeader
        icone="producao"
        cor={COR.producao}
        titulo={`Lista do dia · ${d.loja.nome}`}
        subtitulo={[contexto, rotuloDoDia(d.dia, d.hoje), d.passado ? 'só leitura' : null].filter(Boolean).join(' · ')}
      />

      <nav aria-label="Dia da lista" className="flex flex-wrap items-center gap-2">
        <Link href={href(ontem)} aria-label={`Dia anterior, ${rotuloDoDia(ontem, d.hoje)}`} className={classeDeBotao('secundario', 'min-w-11')}>
          ←
        </Link>
        {d.dia !== d.hoje && (
          <Link href={href(d.hoje)} className={classeDeBotao('secundario')}>
            Hoje
          </Link>
        )}
        {d.dia < limite ? (
          <Link href={href(proximo)} aria-label={`Dia seguinte, ${rotuloDoDia(proximo, d.hoje)}`} className={classeDeBotao('secundario', 'min-w-11')}>
            →
          </Link>
        ) : (
          <span aria-hidden="true" className={classeDeBotao('secundario', 'min-w-11 pointer-events-none opacity-40')}>
            →
          </span>
        )}
        <span className="text-[13px] text-suave">{d.passado ? 'Dia que já passou: só consulta.' : 'Daqui a 14 dias, no máximo.'}</span>
      </nav>

      {feito && <Aviso tom="ok" titulo={feito} />}
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}
      {!d.aberto && !d.passado && (
        <Aviso tom="alerta" titulo={`O estoque da ${d.loja.nome} ainda não foi aberto.`}>
          Sem o estoque aberto não há “tem” nem “comprar”, e a lista não pode ser confirmada: a produção baixa os insumos do estoque.
        </Aviso>
      )}
      {fechadoHoje && !d.passado && (
        <AvisoDoPeriodoFechado
          periodo={fechadoHoje}
          href={periodos.href}
          frase="Hoje cai neste período: dá para planejar a lista, mas entregar os insumos e concluir o lote serão recusados."
        />
      )}

      <Painel
        titulo={d.passado ? `Lotes de ${nota(d.dia)}` : 'O que vai ser produzido'}
        subtitulo={d.passado ? 'Planejado e o que saiu de verdade' : 'Os lotes do dia, da lista e avulsos'}
        acessorio={naoVai.length ? <span className="text-[12px] tabular-nums text-suave">{naoVai.length} {naoVai.length === 1 ? 'lote' : 'lotes'}</span> : undefined}
        semRespiro
      >
        {naoVai.length === 0 ? (
          <Vazio titulo={d.passado ? 'Nenhum lote neste dia.' : 'Nenhum lote na lista ainda.'}>
            {d.pode.planejar && !d.passado ? 'Ponha os pré-preparos do dia no rascunho aqui embaixo e confirme.' : d.passado ? undefined : 'Quem define a lista do dia ainda não confirmou nenhum lote.'}
          </Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {naoVai.map((l) => (
              <LoteNaLista key={l.id} l={l} aqui={quadro} passado={d.passado} />
            ))}
          </ul>
        )}
        {canceladas.length > 0 && (
          <details className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
            <summary className="min-h-8 cursor-pointer py-1">
              {canceladas.length} {canceladas.length === 1 ? 'lote tirado da lista' : 'lotes tirados da lista'}
            </summary>
            <ul className="mt-1 divide-y divide-linha">
              {canceladas.map((l) => (
                <LoteNaLista key={l.id} l={l} aqui={quadro} passado />
              ))}
            </ul>
          </details>
        )}
      </Painel>

      {!d.passado && d.pode.planejar && (
        <Rascunho d={d} digitadas={digitadas} aqui={aqui} href={href} ativo={rascunhoAtivo} />
      )}

      {d.conta && <Conta d={d} href={href} digitadas={digitadas} agora={agora} />}
      {!d.pode.verEstoque && !d.passado && (
        <p className="text-[13px] text-suave">Seu acesso não inclui ver o estoque: aqui você vê os lotes do dia. O que usar, o que tem e o que comprar ficam com quem vê o estoque.</p>
      )}

      {rascunhoAtivo && (
        <FormConfirmarLista acao={acao} dia={d.dia} linhas={digitadas} lotes={lotesDoRascunho} motivoParado={motivoParado} />
      )}
    </div>
  );
}

// ================================================================ os lotes do dia

function LoteNaLista({ l, aqui, passado }: { l: LoteDoDia; aqui: string; passado: boolean }) {
  const r = l.status === 'CONCLUIDA' && l.produzidoMilesimos !== null ? rendimentoDoLote(l.planejadoMilesimos, l.produzidoMilesimos) : null;
  return (
    <li>
      <Link href={`${aqui}/${l.id}`} className="ff-transicao flex min-h-14 items-start justify-between gap-3 px-4 py-3 text-sm hover:bg-texto/[0.03] sm:px-5">
        <span className="min-w-0">
          <span className="block break-words font-medium text-texto">{l.fichaNome}</span>
          <span className="mt-0.5 block text-[13px] tabular-nums text-suave">
            Lote <span className="text-texto">{l.codigoLote}</span> ·{' '}
            {l.status === 'CONCLUIDA' && l.produzidoMilesimos !== null
              ? `${formatarQuantidade(l.produzidoMilesimos, l.unidade)} de ${formatarQuantidade(l.planejadoMilesimos, l.unidade)}${r ? ` · rendeu ${formatarRendimento(r.rendimentoBp)}` : ''}`
              : formatarQuantidade(l.planejadoMilesimos, l.unidade)}
            {l.planejadaPorNome && !passado ? ` · ${l.planejadaPorNome}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <SeloDoLote status={l.status} estornado={l.estornado} />
          {!l.daLista && l.status !== 'CANCELADA' && <span className="text-[12px] text-suave">fora da lista</span>}
        </span>
      </Link>
    </li>
  );
}

// ================================================================ o rascunho

function Rascunho({ d, digitadas, aqui, href, ativo }: { d: ListaDoDia; digitadas: LinhaDoRascunho[]; aqui: string; href: (dia: string, linhas?: readonly LinhaDoRascunho[]) => string; ativo: boolean }) {
  const nomeDe = (id: string) => d.fichas.find((f) => f.id === id)?.nome ?? d.rascunho.linhas.find((l) => l.fichaId === id)?.nome ?? 'Pré-preparo não encontrado';
  const unidadeDe = (id: string): Unidade | null => d.fichas.find((f) => f.id === id)?.unidade ?? null;
  const juntadas = d.rascunho.linhas;
  return (
    <Painel titulo="Rascunho da lista" subtitulo="Monte aqui o que vai produzir: nada é gravado até confirmar" id="rascunho">
      {d.fichas.length === 0 ? (
        <Vazio titulo="Nenhum pré-preparo para pôr na lista.">Só se produz pré-preparo (molho, base, calda…): cadastre a ficha técnica dele em Fichas e produtos.</Vazio>
      ) : (
        <div className="space-y-4">
          {digitadas.length > 0 && (
            <ul className="divide-y divide-linha rounded-[10px] border border-linha">
              {digitadas.map((l, n) => {
                const erro = d.rascunho.erros[`linha:${n}`];
                const un = unidadeDe(l.fichaId);
                const juntada = juntadas.find((j) => j.fichaId === l.fichaId);
                return (
                  <li key={n} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-texto">
                        {nomeDe(l.fichaId)} <span className="font-normal tabular-nums text-suave">· {l.quantidade || '—'} {un ? UNIDADES[un].sigla : ''}</span>
                      </p>
                      {erro && (
                        <p role="alert" className="mt-0.5 text-[13px] text-erro">
                          {erro}
                        </p>
                      )}
                      {!erro && juntada && juntada.juntou > 1 && digitadas.findIndex((x) => x.fichaId === l.fichaId) === n && (
                        <p className="mt-0.5 text-[12px] text-suave">A mesma ficha entrou {juntada.juntou} vezes: vira um lote só, de {formatarQuantidade(juntada.quantidadeMilesimos, juntada.unidade)}.</p>
                      )}
                      {!erro && juntada?.aviso && digitadas.findIndex((x) => x.fichaId === l.fichaId) === n && <p className="mt-0.5 text-[13px] text-atencao">{juntada.aviso}</p>}
                      {!erro && juntada && digitadas.findIndex((x) => x.fichaId === l.fichaId) === n && juntada.avisosDaFicha.map((a) => (
                        <p key={a} className="mt-0.5 text-[12px] text-atencao">
                          {a}
                        </p>
                      ))}
                    </div>
                    <Link href={href(d.dia, digitadas.filter((_, i) => i !== n))} className={classeDeBotao('fantasma', 'min-h-11')} aria-label={`Tirar ${nomeDe(l.fichaId)} do rascunho`}>
                      Tirar
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {d.rascunho.excedeu && (
            <p role="alert" className="text-[13px] text-erro">
              A lista passa de 30 linhas: as primeiras 30 ficaram. Confirme e monte o resto depois.
            </p>
          )}
          <form method="get" action={aqui} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
            {d.dia !== d.hoje && <input type="hidden" name="dia" value={d.dia} />}
            {digitadas.map((l, n) => (
              <input key={n} type="hidden" name="l" value={`${l.fichaId}~${l.quantidade}`} />
            ))}
            <div>
              <label htmlFor="rascunho-ficha" className={ROTULO}>
                Pré-preparo
              </label>
              <select id="rascunho-ficha" name="f" defaultValue="" disabled={!ativo} className={`${CAMPO} min-h-12 text-base sm:text-sm`}>
                <option value="">Escolha o pré-preparo</option>
                {d.fichas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} · {UNIDADES[f.unidade].sigla}
                    {f.temMilesimos !== null ? ` · tem ${formatarQuantidade(Math.max(0, f.temMilesimos), f.unidade)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rascunho-quanto" className={ROTULO}>
                Quanto
              </label>
              <input id="rascunho-quanto" name="q" inputMode="decimal" autoComplete="off" disabled={!ativo} placeholder="Ex.: 5" className={`${CAMPO} min-h-12 text-right text-base tabular-nums sm:text-sm`} />
            </div>
            <button type="submit" disabled={!ativo} className={classeDeBotao('secundario', 'min-h-12')}>
              Pôr na lista
            </button>
            <p className="text-[12px] text-suave sm:col-span-3">Na unidade do rendimento da ficha (kg, L ou un). O saldo que aparece em “tem” é o do estoque da loja agora.</p>
          </form>
        </div>
      )}
    </Painel>
  );
}

// ================================================================ vai usar · tem · comprar

const qtd = (m: number, u: Unidade) => formatarQuantidade(m, u);

function Origens({ l }: { l: LinhaDaConta }) {
  const lista = l.origens.filter((o) => o.grupo === 'LISTA');
  const outros = l.origens.filter((o) => o.grupo === 'OUTROS');
  if (l.origens.length === 0) return null;
  return (
    <span className="mt-0.5 block text-[12px] leading-snug text-suave">
      {lista.length > 0 && `Lista do dia: ${lista.map((o) => `${o.de} ${qtd(o.quantidadeMilesimos, l.unidade)}`).join(' · ')}`}
      {lista.length > 0 && outros.length > 0 && ' — '}
      {outros.length > 0 && `Outros pedidos: ${outros.map((o) => `${o.de} ${qtd(o.quantidadeMilesimos, l.unidade)}`).join(' · ')}`}
    </span>
  );
}

function Tem({ l }: { l: LinhaDaConta }) {
  return (
    <>
      {qtd(l.temMilesimos, l.unidade)}
      {l.noLivroMilesimos < 0 && <span className="block text-[12px] font-normal text-erro">−{qtd(-l.noLivroMilesimos, l.unidade)} no livro</span>}
    </>
  );
}

function Comprar({ l, verCustos }: { l: LinhaDaConta; verCustos: boolean }) {
  if (!l.comprar) return <span className="text-suave">—</span>;
  return (
    <>
      <span className="font-semibold text-texto">{l.comprar.texto}</span>
      {verCustos && (l.valorCentavos !== null ? <span className="block text-[12px] font-normal tabular-nums text-suave">{formatarDinheiro(l.valorCentavos)}</span> : <span className="block text-[12px] font-normal text-atencao">Sem preço</span>)}
    </>
  );
}

function Produzir({ l, href, digitadas, dia }: { l: LinhaDaConta; href: (dia: string, linhas?: readonly LinhaDoRascunho[]) => string; digitadas: LinhaDoRascunho[]; dia: string }) {
  const p = l.produzir;
  if (!p) return <span className="text-suave">—</span>;
  if (p.situacao === 'FALTA') {
    return (
      <>
        <span className="font-semibold text-atencao">falta {qtd(p.faltaMilesimos, l.unidade)}</span>
        {l.ficha && (
          <Link
            href={`${href(dia, [...digitadas, { fichaId: l.ficha.id, quantidade: textoDaQuantidade(p.faltaMilesimos) }])}#rascunho`}
            className={`${classeDeBotao('secundario', 'mt-1.5 min-h-11 w-full text-left sm:w-auto')}`}
          >
            Pôr na lista: {l.nome} {qtd(p.faltaMilesimos, l.unidade)}
          </Link>
        )}
        {!l.ficha && <span className="block text-[12px] font-normal text-suave">Sem ficha ativa para produzir.</span>}
      </>
    );
  }
  if (p.situacao === 'COBERTO') return <span className="text-[13px] font-normal text-texto">{fraseDoCoberto(p.paraFichas)}</span>;
  return <span className="text-suave">—</span>;
}

function Conta({ d, href, digitadas, agora }: { d: ListaDoDia; href: (dia: string, linhas?: readonly LinhaDoRascunho[]) => string; digitadas: LinhaDoRascunho[]; agora: Date }) {
  const c = d.conta!;
  const verCustos = d.pode.verCustos;
  const produzir = c.linhas.filter((l) => l.tipo === 'PRE_PREPARO' && l.produzir && l.produzir.situacao !== 'TEM');
  const comprar = c.linhas.filter((l) => l.comprar);
  const bastam = c.linhas.filter((l) => !l.comprar && !(l.tipo === 'PRE_PREPARO' && l.produzir && l.produzir.situacao !== 'TEM'));
  const hora = HORA.format(agora);
  if (c.linhas.length === 0) {
    return (
      <Painel titulo="Vai usar · tem · comprar">
        <Vazio titulo="Nada vai sair do estoque para este dia.">Quando a lista tiver lotes (ou houver requisição aberta até o dia), o que usar, o que tem e o que comprar aparecem aqui.</Vazio>
      </Painel>
    );
  }
  // Agrupa o "comprar" pelo fornecedor da última compra (só quem vê compras na loja da nota recebe o nome).
  const grupos = new Map<string, { fornecedor: FornecedorDaLinha | null; linhas: LinhaDaConta[] }>();
  for (const l of comprar) {
    const k = l.fornecedor ? `${l.fornecedor.nome}|${l.fornecedor.notaEm}` : '';
    const g = grupos.get(k) ?? { fornecedor: l.fornecedor, linhas: [] };
    g.linhas.push(l);
    grupos.set(k, g);
  }
  const ordenados = Array.from(grupos.values()).sort((x, y) => (x.fornecedor && !y.fornecedor ? -1 : !x.fornecedor && y.fornecedor ? 1 : (x.fornecedor?.nome ?? '').localeCompare(y.fornecedor?.nome ?? '', 'pt-BR')));
  const comFornecedor = ordenados.some((g) => g.fornecedor);
  return (
    <div className="space-y-5">
      {!d.aberto ? (
        <Painel titulo="Vai usar" subtitulo="O estoque ainda não foi aberto: sem o livro não há “tem” nem “comprar”">
          <ul className="divide-y divide-linha">
            {c.linhas.map((l) => (
              <li key={l.insumoId} className="py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-texto">{l.nome}</span>
                  <span className="shrink-0 tabular-nums">{qtd(l.vaiUsarMilesimos, l.unidade)}</span>
                </div>
                <Origens l={l} />
              </li>
            ))}
          </ul>
        </Painel>
      ) : (
        <>
          {produzir.length > 0 && (
            <Painel titulo="Falta produzir" subtitulo="Pré-preparo que a lista usa: o estoque e os lotes do dia cobrem?" semRespiro>
              <TabelaDaConta linhas={produzir} ultima="Falta produzir" celula={(l) => <Produzir l={l} href={href} digitadas={digitadas} dia={d.dia} />} />
            </Painel>
          )}
          <Painel
            titulo="Comprar"
            subtitulo={`Estoque de agora, às ${hora}. Embalagens da compra padrão, arredondando para cima`}
            acessorio={comprar.length ? <span className="text-[12px] tabular-nums text-suave">{comprar.length} {comprar.length === 1 ? 'insumo' : 'insumos'}</span> : undefined}
            semRespiro
          >
            {comprar.length === 0 ? (
              <Vazio titulo="Nada para comprar.">O estoque cobre o que a lista vai usar.</Vazio>
            ) : (
              <>
                {ordenados.map((g, n) => (
                  <section key={g.fornecedor ? `${g.fornecedor.nome}|${g.fornecedor.notaEm}` : 'sem'} aria-label={g.fornecedor ? `Fornecedor ${g.fornecedor.nome}` : 'Sem fornecedor conhecido'} className={n > 0 ? 'border-t border-linha' : ''}>
                    {comFornecedor && (
                      <h3 className="bg-forte px-4 py-2 text-[12px] font-semibold text-suave sm:px-5">
                        {g.fornecedor ? `${g.fornecedor.nome} · última nota ${nota(g.fornecedor.notaEm)}` : 'Sem fornecedor conhecido'}
                      </h3>
                    )}
                    <TabelaDaConta linhas={g.linhas} ultima="Comprar" celula={(l) => <Comprar l={l} verCustos={verCustos} />} />
                  </section>
                ))}
                {verCustos && c.compra && (
                  <p className="border-t border-linha px-4 py-3 text-sm sm:px-5">
                    <span className="text-suave">Compra estimada </span>
                    {c.compra.semPreco.length > 0 ? (
                      <>
                        <span className="font-semibold tabular-nums text-texto">{formatarDinheiro(c.compra.totalCentavos)}</span> <Selo tom="alerta">incompleta</Selo>{' '}
                        <span className="text-suave">sem contar {c.compra.semPreco.join(', ')} (sem preço)</span>
                      </>
                    ) : (
                      <span className="font-semibold tabular-nums text-texto">{formatarDinheiro(c.compra.totalCentavos)}</span>
                    )}
                  </p>
                )}
              </>
            )}
          </Painel>
          {bastam.length > 0 && (
            <Painel semRespiro>
              <details>
                <summary className="flex min-h-12 cursor-pointer items-center px-4 py-2 text-sm font-medium text-texto sm:px-5">
                  Já tem o suficiente ({bastam.length})
                </summary>
                <div className="border-t border-linha">
                  <TabelaDaConta linhas={bastam} ultima="Comprar" celula={() => <span className="text-suave">—</span>} />
                </div>
              </details>
            </Painel>
          )}
        </>
      )}
    </div>
  );
}

/** A mesma lista em dois formatos: cartões no celular, tabela a partir de 768 px. A última coluna é a que muda (comprar ou produzir). */
function TabelaDaConta({ linhas, ultima, celula }: { linhas: LinhaDaConta[]; ultima: string; celula: (l: LinhaDaConta) => React.ReactNode }) {
  return (
    <>
      <ul className="divide-y divide-linha md:hidden">
        {linhas.map((l) => (
          <li key={l.insumoId} className="space-y-2 px-4 py-3 text-sm">
            <div>
              <span className="font-medium text-texto">
                {l.nome} {!l.ativo && <Selo>Desativado</Selo>}
              </span>
              <Origens l={l} />
            </div>
            <dl className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 text-[13px] tabular-nums">
              <div>
                <dt className="text-[12px] text-suave">Vai usar</dt>
                <dd className="font-semibold text-texto">{qtd(l.vaiUsarMilesimos, l.unidade)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-suave">Tem</dt>
                <dd className="font-semibold text-texto">
                  <Tem l={l} />
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-suave">{ultima}</dt>
                <dd className="font-semibold">{celula(l)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Insumos da lista: quanto vai usar, quanto tem no estoque e {ultima.toLowerCase()}.</caption>
        <thead>
          <tr className="bg-forte text-left text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
              Insumo
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Vai usar
            </th>
            <th scope="col" className="h-10 px-3 text-right font-semibold">
              Tem
            </th>
            <th scope="col" className="h-10 w-[34%] px-3 pr-5 text-left font-semibold">
              {ultima}
            </th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((l) => (
            <tr key={l.insumoId} className="border-t border-linha align-top">
              <td className="py-2.5 pl-5 pr-3">
                <span className="font-medium text-texto">
                  {l.nome} {!l.ativo && <Selo>Desativado</Selo>}
                </span>
                <Origens l={l} />
              </td>
              <td className="px-3 py-2.5 text-right">{qtd(l.vaiUsarMilesimos, l.unidade)}</td>
              <td className="px-3 py-2.5 text-right">
                <Tem l={l} />
              </td>
              <td className="px-3 py-2.5 pr-5 text-left">{celula(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
