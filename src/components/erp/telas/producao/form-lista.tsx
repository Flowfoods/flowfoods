'use client';

/**
 * A lista do dia (3.2), celular primeiro: o gerente monta na cozinha, pelo celular. Cada linha = um pré-preparo (seletor em
 * largura cheia) e quanto produzir (campo numérico de 48 px, teclado de números, a unidade do rendimento ao lado). "Salvar a
 * lista" refaz a conta de vai usar / tem / comprar; "Gerar os lotes" transforma as linhas em aberto em lotes da produção (só
 * com a lista salva: com mudança por salvar o botão espera e diz por quê). O servidor lê os textos e decide; aqui só se mostra.
 */

import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

export interface OpcaoDaLista {
  id: string;
  nome: string;
  unidade: Unidade;
}

export interface LinhaAberta {
  /** A linha gravada (vazio = nova). */
  id: string;
  fichaId: string;
  /** Como volta para o campo ("2,5"). */
  quantidade: string;
}

type Linha = LinhaAberta & { chave: number };

let proxima = 1;
const nova = (l?: Partial<LinhaAberta>): Linha => ({ id: '', fichaId: '', quantidade: '', ...l, chave: proxima++ });
const assinatura = (ls: readonly LinhaAberta[]) => JSON.stringify(ls.filter((l) => l.fichaId || l.quantidade.trim()).map((l) => [l.id, l.fichaId, l.quantidade.trim()]));

export function FormListaDoDia({
  salvar,
  gerar,
  dia,
  versao,
  abertas,
  opcoes,
  emLote,
  naoGera,
  bloqueio,
}: {
  salvar: AcaoDeEstoque;
  gerar: AcaoDeEstoque;
  dia: string;
  /** A versão lida (vazio = a lista ainda não existe). */
  versao: number | null;
  /** As linhas que ainda não viraram lote (as que viraram aparecem acima, só para ler). */
  abertas: LinhaAberta[];
  opcoes: OpcaoDaLista[];
  /** Quantas linhas já viraram lote (para o texto de quando não há mais nada em aberto). */
  emLote: number;
  /** Por que as linhas não viram lote agora (estoque não aberto); null = viram. */
  naoGera: string | null;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(salvar, null);
  const [estadoGerar, enviarGerar] = useFormState<EstadoEstoque, FormData>(gerar, null);
  const [linhas, setLinhas] = useState<Linha[]>(() => (abertas.length ? abertas.map((l) => nova(l)) : [nova()]));
  const porId = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes]);
  const mudou = assinatura(linhas) !== assinatura(abertas);
  const salvas = abertas.length;
  const erros = estado?.erros ?? {};
  const errosDeLinha = Object.keys(erros).filter((k) => k.startsWith('linha:')).length;
  const muda = (chave: number, m: Partial<LinhaAberta>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...m } : l)));
  const motivoDeNaoGerar = bloqueio ?? (mudou ? 'Salve a lista antes de gerar os lotes: os lotes saem do que está salvo.' : salvas === 0 ? null : naoGera);
  return (
    <div className="space-y-4">
      {/* O espaçamento mora numa div interna: o React põe os campos ocultos da action no começo do <form>, e um `space-y` no
          próprio formulário dava margem ao primeiro bloco visível (vão no topo do painel). Sem <legend> pelo mesmo motivo. */}
      <form action={enviar} aria-label="Pré-preparos em aberto">
        <div className="space-y-3">
          <fieldset disabled={!!bloqueio} className="space-y-3">
            <ol className="space-y-3">
              {linhas.map((l, n) => {
                const o = porId.get(l.fichaId);
                const u = o ? UNIDADES[o.unidade] : null;
                const erro = erros[`linha:${n}`];
                const idF = `lista-f-${l.chave}`;
                const idQ = `lista-q-${l.chave}`;
                const outras = new Set(linhas.filter((x) => x.chave !== l.chave).map((x) => x.fichaId));
                return (
                  <li key={l.chave} className="rounded-[10px] border border-linha p-3">
                    <input type="hidden" name="linhaId" value={l.id} />
                    <label htmlFor={idF} className="sr-only">
                      Pré-preparo da linha {n + 1}
                    </label>
                    <select
                      id={idF}
                      name="fichaId"
                      value={l.fichaId}
                      onChange={(e) => muda(l.chave, { fichaId: e.target.value })}
                      className={`${CAMPO} min-h-12 text-base sm:text-sm`}
                      aria-invalid={!!erro}
                      aria-describedby={erro ? `${idQ}-erro` : undefined}
                    >
                      <option value="">Escolha o pré-preparo</option>
                      {opcoes.map((x) => (
                        <option key={x.id} value={x.id} disabled={outras.has(x.id)}>
                          {x.nome}
                          {outras.has(x.id) ? ' (já na lista)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex items-stretch gap-2">
                      <label htmlFor={idQ} className="sr-only">
                        Quanto produzir{o ? ` de ${o.nome}` : ''}
                      </label>
                      <input
                        id={idQ}
                        name="quantidade"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Quanto"
                        value={l.quantidade}
                        onChange={(e) => muda(l.chave, { quantidade: e.target.value })}
                        className={`${CAMPO} min-h-12 flex-1 text-right text-[18px] font-semibold tabular-nums`}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? `${idQ}-erro` : `${idQ}-unidade`}
                      />
                      <span id={`${idQ}-unidade`} className="flex w-[72px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[14px] text-suave">
                        {u ? u.sigla : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.chave !== l.chave) : [nova()]))}
                        className={classeDeBotao('fantasma', 'min-h-12 shrink-0 px-3')}
                        aria-label={`Tirar a linha ${n + 1}${o ? ` (${o.nome})` : ''}`}
                      >
                        Tirar
                      </button>
                    </div>
                    <Erro id={`${idQ}-erro`} texto={erro} />
                  </li>
                );
              })}
            </ol>
            <button type="button" onClick={() => setLinhas((ls) => [...ls, nova()])} className={classeDeBotao('secundario', 'min-h-12 w-full sm:w-auto')}>
              Mais um pré-preparo
            </button>
          </fieldset>
          {(erros.geral || errosDeLinha > 1) && (
            <p role="alert" className="text-[13px] text-erro">
              {erros.geral ?? `${errosDeLinha} linhas precisam de ajuste: veja embaixo de cada uma.`}
            </p>
          )}
          <div className="flex flex-col gap-2 border-t border-linha pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-suave">{mudou ? 'Há mudança por salvar: a conta embaixo é a da lista salva.' : 'Na unidade do rendimento da ficha: 5 é cinco quilos de molho.'}</p>
            <BotaoEnviar variante={mudou || salvas === 0 ? 'primario' : 'secundario'} pendente="Salvando…" disabled={!!bloqueio} className="min-h-12 w-full sm:w-auto sm:min-w-[160px]">
              Salvar a lista
            </BotaoEnviar>
          </div>
        </div>
        <input type="hidden" name="dia" value={dia} />
        <input type="hidden" name="versao" value={versao ?? ''} />
      </form>

      {(salvas > 0 || emLote === 0) && (
        <form action={enviarGerar} className="rounded-[10px] border border-linha p-3" aria-label="Gerar os lotes">
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-suave">
                {salvas === 0
                  ? 'Monte e salve a lista; depois cada pré-preparo vira um lote da produção.'
                  : `${salvas === 1 ? 'O pré-preparo em aberto vira um lote' : `Os ${salvas} pré-preparos em aberto viram lotes`} da produção, cada um com a requisição dos insumos. Nada sai do estoque até o estoque entregar.`}
              </p>
              <BotaoEnviar variante={mudou || salvas === 0 ? 'secundario' : 'primario'} pendente="Gerando…" disabled={salvas === 0 || !!motivoDeNaoGerar} className="min-h-12 w-full shrink-0 sm:w-auto sm:min-w-[180px]">
                {salvas > 1 ? `Gerar os ${salvas} lotes` : 'Gerar o lote'}
              </BotaoEnviar>
            </div>
            {motivoDeNaoGerar && salvas > 0 && <p className="text-[13px] text-atencao">{motivoDeNaoGerar}</p>}
            {estadoGerar?.erros.geral && (
              <p role="alert" className="text-[13px] text-erro">
                {estadoGerar.erros.geral}
              </p>
            )}
          </div>
          <input type="hidden" name="dia" value={dia} />
          <input type="hidden" name="versao" value={versao ?? ''} />
        </form>
      )}
    </div>
  );
}

/** "Pôr na lista": o pré-preparo que falta produzir entra na lista com o que falta (o servidor confere a versão). */
export function FormPorNaLista({ acao, dia, versao, fichaId, quantidadeMilesimos, rotulo, bloqueio }: { acao: AcaoDeEstoque; dia: string; versao: number | null; fichaId: string; quantidadeMilesimos: number; rotulo: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  return (
    <form action={enviar} className="flex flex-col items-stretch gap-1 sm:items-end">
      <input type="hidden" name="dia" value={dia} />
      <input type="hidden" name="versao" value={versao ?? ''} />
      <input type="hidden" name="fichaId" value={fichaId} />
      <input type="hidden" name="quantidade" value={String(quantidadeMilesimos)} />
      <BotaoEnviar variante="secundario" pendente="Pondo…" disabled={!!bloqueio} className="min-h-11 w-full sm:w-auto">
        Pôr na lista<span className="sr-only"> {rotulo}</span>
      </BotaoEnviar>
      {estado?.erros.geral && (
        <p role="alert" className="text-[12px] text-erro sm:max-w-[16rem] sm:text-right">
          {estado.erros.geral}
        </p>
      )}
    </form>
  );
}
