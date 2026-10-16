'use client';
// Scanner avoid-ai-design, SD4d (P2) aceito: "Seco · contou Ana", "Faltam 9 · salvando…" e "Vila da Penha · desde 16/10" são linhas de apoio da lista densa, no padrão "A · B" das telas da 1.1–1.5. (O ignore do scanner não aceita id com minúscula.)

/**
 * Contagem de abertura (1.6), feita para o CELULAR: a pessoa está na câmara
 * fria, com uma mão. A lista vem agrupada por onde o insumo fica (seco, pista
 * fria, refrigerado, congelado), com busca e "Faltam / Contados / Todos".
 * Cada item tem campo numérico grande: embalagens fechadas (quando a
 * embalagem padrão não é 1 kg/1 L/1 un) + o solto, em kg ou g. A conta
 * aparece embaixo ("3 × embalagem de 5 kg + 2,4 kg = 17,4 kg"), igual à do
 * servidor (`lerContagem`).
 *
 * Salva sozinho: ao parar de digitar (0,8 s) ou ao sair do campo. Cada item
 * diz Salvando… / Salvo / Falha (com "Tentar de novo", que manda o mesmo
 * número: o servidor aceita a retentativa). Outra pessoa contou o mesmo item
 * antes: o número dela aparece e a pessoa escolhe. Vazio = não contado; "Não
 * tem" grava zero. O rodapé fixo diz quanto falta.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ItemDaContagem, ResultadoDoItem } from '@/lib/erp/estoque';
import { fraseDoQueFalta, lerContagem, perguntaEmbalagens, resumoDaContagem, type ContagemDigitada } from '@/lib/erp/estoque-campos';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, type Conservacao } from '@/lib/erp/validade';
import { formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { classeDeBotao } from '../../ui/estilos';
import { Barra } from '../../ui/superficies';
import { IconeDaConservacao } from '../cadastro/validade';
import type { AcaoDeContar } from './estado';

type Situacao = 'parado' | 'pendente' | 'salvando' | 'salvo' | 'erro' | 'falha' | 'conflito';

interface Linha {
  item: ItemDaContagem;
  campos: ContagemDigitada;
  situacao: Situacao;
  erros: Partial<Record<'embalagens' | 'solto' | 'geral', string>>;
  conflito: ItemDaContagem | null;
}

type Aba = 'faltam' | 'contados' | 'todos';

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const ESPERA_MS = 800;

const mesmosCampos = (a: ContagemDigitada, b: ContagemDigitada) => a.embalagens.trim() === b.embalagens.trim() && a.solto.trim() === b.solto.trim() && a.escala === b.escala;

export function TelaContagem({
  itens,
  acao,
  conferirHref,
  saldoHref,
  podeConcluir,
}: {
  itens: ItemDaContagem[];
  acao: AcaoDeContar;
  /** Conferir e concluir (só quem ajusta saldo). */
  conferirHref?: string;
  saldoHref: string;
  podeConcluir: boolean;
}) {
  const [linhas, setLinhas] = useState<Record<string, Linha>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, { item: i, campos: i.campos, situacao: 'parado' as Situacao, erros: {}, conflito: null }])),
  );
  const [aba, setAba] = useState<Aba>('todos');
  const [busca, setBusca] = useState('');
  // Quem a pessoa mexeu continua na tela até ela trocar de aba (não some no meio da digitação).
  const [mexidos, setMexidos] = useState<Set<string>>(() => new Set());
  const [fechada, setFechada] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const emVoo = useRef<Record<string, boolean>>({});
  const atual = useRef(linhas);
  atual.current = linhas;

  const resumo = useMemo(() => resumoDaContagem(Object.values(linhas).map((l) => ({ contadoMilesimos: l.item.contadoMilesimos }))), [linhas]);
  const pendentes = Object.values(linhas).some((l) => l.situacao === 'pendente' || l.situacao === 'salvando' || l.situacao === 'falha');

  useEffect(() => {
    if (!pendentes) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [pendentes]);

  const mudar = useCallback((id: string, f: (l: Linha) => Partial<Linha>) => {
    setLinhas((ls) => ({ ...ls, [id]: { ...ls[id], ...f(ls[id]) } }));
  }, []);

  const salvar = useCallback(
    async (id: string, versaoForcada?: number) => {
      clearTimeout(timers.current[id]);
      const l = atual.current[id];
      if (!l || emVoo.current[id]) return;
      // Em conflito, a pessoa escolhe ("ficar com o dela" / "usar o meu"): sair do campo não reenvia.
      if (l.situacao === 'conflito' && versaoForcada === undefined) return;
      if (versaoForcada === undefined && mesmosCampos(l.campos, l.item.campos) && l.situacao !== 'falha') {
        if (l.situacao === 'pendente') mudar(id, () => ({ situacao: 'parado' }));
        return;
      }
      const enviados = l.campos;
      emVoo.current[id] = true;
      mudar(id, () => ({ situacao: 'salvando', erros: {} }));
      let r: ResultadoDoItem;
      try {
        r = await acao({ itemId: id, embalagens: enviados.embalagens, solto: enviados.solto, escala: enviados.escala, versao: versaoForcada ?? l.item.versao });
      } catch {
        emVoo.current[id] = false;
        mudar(id, () => ({ situacao: 'falha', erros: { geral: 'Sem conexão: o número ainda não foi salvo.' } }));
        return;
      }
      emVoo.current[id] = false;
      if (r.ok) {
        const agora = atual.current[id];
        const mudouDepois = !mesmosCampos(agora.campos, enviados);
        mudar(id, () => ({ item: r.item, situacao: mudouDepois ? 'pendente' : 'salvo', erros: {}, conflito: null }));
        // A pessoa continuou digitando enquanto salvava: salva o novo também.
        if (mudouDepois) timers.current[id] = setTimeout(() => void salvar(id), ESPERA_MS);
        return;
      }
      if (r.fechada) {
        setFechada(r.erros.geral ?? 'A contagem não está mais aberta.');
        mudar(id, () => ({ situacao: 'erro', erros: r.erros }));
        return;
      }
      if (r.conflito) {
        mudar(id, () => ({ situacao: 'conflito', conflito: r.conflito!.item, erros: r.erros }));
        return;
      }
      mudar(id, () => ({ situacao: 'erro', erros: r.erros }));
    },
    [acao, mudar],
  );

  const digitar = (id: string, campos: Partial<ContagemDigitada>) => {
    setMexidos((m) => (m.has(id) ? m : new Set(m).add(id)));
    const emConflito = atual.current[id]?.situacao === 'conflito';
    mudar(id, (l) => ({ campos: { ...l.campos, ...campos }, situacao: l.situacao === 'conflito' ? 'conflito' : 'pendente', erros: l.situacao === 'conflito' ? l.erros : {} }));
    clearTimeout(timers.current[id]);
    if (!emConflito) timers.current[id] = setTimeout(() => void salvar(id), ESPERA_MS);
  };

  const trocarAba = (a: Aba) => {
    setAba(a);
    setMexidos(new Set());
  };

  const q = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = Object.values(linhas).filter((l) => {
    if (q && !l.item.nome.toLocaleLowerCase('pt-BR').includes(q)) return false;
    if (mexidos.has(l.item.id) || aba === 'todos') return true;
    const contado = l.item.contadoMilesimos !== null;
    return aba === 'contados' ? contado : !contado;
  });
  const grupos = ORDEM_DAS_CONSERVACOES.map((c) => ({
    c,
    linhas: visiveis.filter((l) => l.item.conservacao === c).sort((a, b) => a.item.nome.localeCompare(b.item.nome, 'pt-BR')),
    todos: Object.values(linhas).filter((l) => l.item.conservacao === c),
  })).filter((g) => g.todos.length > 0);

  // Enter: salva e vai para o próximo campo de contagem (contar sem tirar o olho da prateleira).
  const proximo = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const todos = Array.from(document.querySelectorAll<HTMLInputElement>('[data-campo-contagem]'));
    const i = todos.indexOf(e.currentTarget);
    (todos[i + 1] ?? e.currentTarget).focus();
  };

  return (
    <div className="space-y-4">
      {fechada && (
        <div role="alert" className="rounded-[14px] border border-linha bg-painel px-4 py-3 text-sm">
          <p className="font-semibold text-texto">{fechada}</p>
          <Link href={saldoHref} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-semibold underline underline-offset-4">
            Ver o estoque da loja
          </Link>
        </div>
      )}

      {/* Barra de ferramentas fixa sob o topo: busca e o que mostrar. */}
      <div className="sticky top-16 z-20 -mx-4 space-y-2 border-b border-linha bg-fundo px-4 pb-3 pt-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <label htmlFor="contagem-busca" className="sr-only">
          Buscar insumo na contagem
        </label>
        <input
          id="contagem-busca"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar insumo"
          autoComplete="off"
          className="ff-transicao block min-h-12 w-full rounded-[7px] border border-linha-forte bg-campo px-3 text-base text-texto placeholder:text-suave/70 hover:border-texto/30"
        />
        <div role="tablist" aria-label="O que mostrar" className="grid grid-cols-3 gap-1 rounded-[10px] border border-linha bg-painel p-1">
          {(
            [
              ['faltam', `Faltam ${resumo.naoContados}`],
              ['contados', `Contados ${resumo.contados}`],
              ['todos', `Todos ${resumo.total}`],
            ] as const
          ).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={aba === v}
              onClick={() => trocarAba(v)}
              className="ff-transicao min-h-10 rounded-[7px] px-2 text-[13px] tabular-nums text-suave hover:text-texto aria-[selected=true]:bg-forte aria-[selected=true]:font-semibold aria-[selected=true]:text-texto"
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 && (
        <p className="rounded-[14px] border border-linha bg-painel px-4 py-8 text-center text-sm text-suave">
          {q ? 'Nenhum insumo com esse nome.' : aba === 'faltam' ? 'Nada faltando: todos foram contados.' : 'Nenhum insumo contado ainda.'}
        </p>
      )}

      {grupos
        .filter((g) => g.linhas.length > 0)
        .map((g) => (
          <section key={g.c} aria-labelledby={`grupo-${g.c}`} className="overflow-hidden rounded-[14px] border border-linha bg-painel">
            <header className="flex min-h-12 items-center justify-between gap-3 border-b border-linha px-4 py-2.5">
              <h2 id={`grupo-${g.c}`} className="flex items-center gap-2 text-[13px] font-semibold text-texto">
                <IconeDaConservacao conservacao={g.c as Conservacao} />
                {CONSERVACOES[g.c]}
              </h2>
              <span className="text-[12px] tabular-nums text-suave">
                {g.todos.filter((l) => l.item.contadoMilesimos !== null).length} de {g.todos.length}
              </span>
            </header>
            <ul className="divide-y divide-linha">
              {g.linhas.map((l) => (
                <ItemContavel
                  key={l.item.id}
                  l={l}
                  bloqueado={!!fechada}
                  digitar={(c) => digitar(l.item.id, c)}
                  sair={() => void salvar(l.item.id)}
                  repetir={() => void salvar(l.item.id, l.item.versao)}
                  ficarComOOutro={() => mudar(l.item.id, () => ({ item: l.conflito!, campos: l.conflito!.campos, situacao: 'salvo', conflito: null, erros: {} }))}
                  usarOMeu={() => {
                    const versao = l.conflito!.versao;
                    mudar(l.item.id, () => ({ item: { ...l.item, versao }, conflito: null }));
                    void salvar(l.item.id, versao);
                  }}
                  proximo={proximo}
                />
              ))}
            </ul>
          </section>
        ))}

      {/* Rodapé fixo: quanto falta e o próximo passo. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-linha bg-fundo px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tabular-nums text-texto" aria-live="polite">
              {fraseDoQueFalta(resumo)}
              {pendentes && <span className="font-normal text-suave"> · salvando…</span>}
            </p>
            <div className="mt-1.5 max-w-sm">
              <Barra valor={resumo.contados} total={resumo.total} tom={resumo.naoContados === 0 ? 'ok' : 'alerta'} rotulo={`${resumo.contados} de ${resumo.total} contados`} />
            </div>
          </div>
          {podeConcluir && conferirHref ? (
            <Link href={conferirHref} aria-disabled={pendentes} className={classeDeBotao('primario', `w-full sm:w-auto ${pendentes ? 'pointer-events-none opacity-55' : ''}`)}>
              Conferir e concluir
            </Link>
          ) : (
            <p className="w-full text-[12px] text-suave sm:w-auto sm:max-w-xs">Terminou? Avise o gerente: ele confere e conclui.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemContavel({
  l,
  bloqueado,
  digitar,
  sair,
  repetir,
  ficarComOOutro,
  usarOMeu,
  proximo,
}: {
  l: Linha;
  bloqueado: boolean;
  digitar: (c: Partial<ContagemDigitada>) => void;
  sair: () => void;
  repetir: () => void;
  ficarComOOutro: () => void;
  usarOMeu: () => void;
  proximo: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const i = l.item;
  const u = UNIDADES[i.unidade];
  const comEmbalagem = perguntaEmbalagens({ unidade: i.unidade, embalagemConteudoMilesimos: i.embalagem?.conteudoMilesimos ?? null });
  const lido = lerContagem(l.campos, { unidade: i.unidade, embalagemConteudoMilesimos: i.embalagem?.conteudoMilesimos ?? null });
  const total = lido.ok ? lido.lida.contadoMilesimos : undefined;
  const idBase = `item-${i.id}`;
  const erroEmb = l.erros.embalagens ?? (lido.ok ? undefined : lido.erros.embalagens);
  const erroSolto = l.erros.solto ?? (lido.ok ? undefined : lido.erros.solto);
  const descritores = [`${idBase}-conta`, erroEmb ? `${idBase}-erro-emb` : '', erroSolto ? `${idBase}-erro-solto` : ''].filter(Boolean).join(' ');
  const campo =
    'ff-transicao block h-12 rounded-[7px] border border-linha-forte bg-campo px-3 text-right text-lg font-semibold tabular-nums text-texto placeholder:font-normal placeholder:text-suave/60 hover:border-texto/30 disabled:opacity-60 aria-[invalid=true]:border-erro';
  return (
    <li className="px-4 py-3.5">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <h3 className="min-w-0 text-[15px] font-semibold text-texto">{i.nome}</h3>
        {l.item.contadoMilesimos === null && l.situacao === 'parado' && !l.campos.embalagens.trim() && !l.campos.solto.trim() ? (
          <button type="button" disabled={bloqueado} onClick={() => digitar({ embalagens: '', solto: '0', escala: 'base' })} className={classeDeBotao('secundario', 'min-h-10 shrink-0 px-3 text-[13px] sm:min-h-9')}>
            Não tem
            <span className="sr-only"> (marca zero)</span>
          </button>
        ) : (
          <SituacaoDoItem l={l} repetir={repetir} />
        )}
      </div>
      <div className={`mt-2.5 grid items-end gap-3 ${comEmbalagem ? 'grid-cols-2 sm:flex' : 'grid-cols-1 sm:flex'}`}>
        {comEmbalagem && (
          <div className="min-w-0">
            <label htmlFor={`${idBase}-emb`} className="mb-1 block truncate text-[12px] text-suave">
              Fechadas · {i.embalagem!.nome.replace(/^embalagem /, '')}
            </label>
            <input
              id={`${idBase}-emb`}
              data-campo-contagem
              inputMode="decimal"
              enterKeyHint="next"
              autoComplete="off"
              value={l.campos.embalagens}
              placeholder="0"
              disabled={bloqueado}
              onChange={(e) => digitar({ embalagens: e.target.value })}
              onBlur={sair}
              onKeyDown={proximo}
              aria-invalid={!!erroEmb}
              aria-describedby={descritores}
              className={`${campo} w-full sm:w-28`}
            />
          </div>
        )}
        <div className="min-w-0">
          <label htmlFor={`${idBase}-solto`} className="mb-1 block text-[12px] text-suave">
            {comEmbalagem ? 'Solto' : 'Quantidade'}
            <span className="sr-only">, em {l.campos.escala === 'menor' ? u.menor : u.sigla}</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id={`${idBase}-solto`}
              data-campo-contagem
              inputMode={l.campos.escala === 'menor' || i.unidade === 'UN' ? 'numeric' : 'decimal'}
              enterKeyHint="next"
              autoComplete="off"
              value={l.campos.solto}
              placeholder="0"
              disabled={bloqueado}
              onChange={(e) => digitar({ solto: e.target.value })}
              onBlur={sair}
              onKeyDown={proximo}
              aria-invalid={!!erroSolto}
              aria-describedby={descritores}
              className={`${campo} w-full min-w-0 sm:w-28`}
            />
            {i.unidade === 'UN' ? (
              <span className="shrink-0 px-1 text-[13px] text-suave">un</span>
            ) : (
              <span role="group" aria-label="Unidade" className="inline-grid shrink-0 grid-cols-2 gap-0.5 rounded-[8px] border border-linha-forte bg-campo p-0.5">
                {(['base', 'menor'] as const).map((esc) => (
                  <button
                    key={esc}
                    type="button"
                    aria-pressed={l.campos.escala === esc}
                    disabled={bloqueado}
                    onClick={() => digitar({ escala: esc })}
                    className="ff-transicao min-h-10 min-w-9 rounded-[6px] px-1.5 text-[13px] text-suave aria-[pressed=true]:bg-forte aria-[pressed=true]:font-semibold aria-[pressed=true]:text-texto"
                  >
                    {esc === 'base' ? u.sigla : u.menor}
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1.5">
        <p id={`${idBase}-conta`} className="min-w-0 text-[12px] tabular-nums text-suave">
          {typeof total === 'number' && (
            <>
              {comEmbalagem && <>= </>}
              <span className="font-semibold text-texto">{formatarQuantidade(total, i.unidade)}</span>
              {l.situacao === 'salvo' || l.situacao === 'parado' ? (i.por && i.em ? ` · ${i.por}, ${HORA.format(new Date(i.em))}` : '') : ''}
            </>
          )}
        </p>
      </div>
      {erroEmb && (
        <p id={`${idBase}-erro-emb`} className="mt-1 text-[13px] text-erro">
          {erroEmb}
        </p>
      )}
      {erroSolto && (
        <p id={`${idBase}-erro-solto`} className="mt-1 text-[13px] text-erro">
          {erroSolto}
        </p>
      )}
      {l.situacao === 'conflito' && l.conflito && (
        <div role="alert" className="mt-3 rounded-[10px] border border-linha-forte bg-texto/[0.03] px-3 py-3 text-sm">
          <p className="text-texto">
            <span className="font-semibold">{l.conflito.por ?? 'Outra pessoa'}</span> contou este item{l.conflito.em ? ` às ${HORA.format(new Date(l.conflito.em))}` : ''}: <span className="font-semibold tabular-nums">{l.conflito.texto}</span>.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={ficarComOOutro} className={classeDeBotao('secundario')}>
              Ficar com {l.conflito.contadoMilesimos === null ? 'o dela' : formatarQuantidade(l.conflito.contadoMilesimos, i.unidade)}
            </button>
            {total !== undefined && (
              <button type="button" onClick={usarOMeu} className={classeDeBotao('secundario')}>
                Usar o meu{total === null ? ' (não contado)' : `: ${formatarQuantidade(total, i.unidade)}`}
              </button>
            )}
          </div>
        </div>
      )}
      {l.situacao !== 'conflito' && l.erros.geral && (
        <p role="alert" className="mt-1 text-[13px] text-erro">
          {l.erros.geral}
        </p>
      )}
    </li>
  );
}

function SituacaoDoItem({ l, repetir }: { l: Linha; repetir: () => void }) {
  const base = 'shrink-0 text-[12px] font-semibold';
  switch (l.situacao) {
    case 'pendente':
    case 'salvando':
      return (
        <span className={`${base} text-suave`} aria-live="polite">
          Salvando…
        </span>
      );
    case 'salvo':
      return (
        <span className={`${base} text-ok`} aria-live="polite">
          Salvo
        </span>
      );
    case 'falha':
      return (
        <button type="button" onClick={repetir} className={`${base} min-h-10 rounded-[6px] px-1 text-erro underline underline-offset-4`}>
          Falhou · tentar de novo
        </button>
      );
    case 'conflito':
      return <span className={`${base} text-atencao`}>Contado por outra pessoa</span>;
    case 'erro':
      return <span className={`${base} text-erro`}>Não salvou</span>;
    default:
      return l.item.contadoMilesimos === null ? <span className={`${base} font-normal text-suave`}>Não contado</span> : <span className={`${base} font-normal text-suave`}>Contado</span>;
  }
}
