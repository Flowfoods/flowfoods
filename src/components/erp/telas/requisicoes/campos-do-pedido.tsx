'use client';

/**
 * As peças comuns de quem monta uma lista de insumos para sair do estoque (Regra Nº 2): a requisição (1.8) e o planejamento
 * do lote de produção (3.1). Linhas de insumo + quanto (kg|g, L|ml, un) em campos de 48 px, e o "para quando"
 * (hoje, amanhã, outro dia). O servidor lê os textos e decide; aqui só se mostra.
 */

import { useMemo, useState } from 'react';
import type { OpcaoDeInsumo } from '@/lib/erp/requisicao';
import type { LinhaDigitada } from '@/lib/erp/requisicao-campos';
import { UNIDADES } from '@/lib/erp/unidades';
import { CONSERVACOES } from '@/lib/erp/validade';
import { CAMPO, Erro, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';

export type Linha = LinhaDigitada & { chave: number };

let proxima = 1;
export const nova = (l?: Partial<LinhaDigitada>): Linha => ({ insumoId: '', quantidade: '', escala: 'base', ...l, chave: proxima++ });

/** O estado das linhas: as iniciais (da ficha) ou duas vazias; quantas estão prontas (insumo e número). */
export function useLinhasDeInsumos(iniciais: LinhaDigitada[]) {
  const [linhas, setLinhas] = useState<Linha[]>(() => (iniciais.length ? iniciais.map((l) => nova(l)) : [nova(), nova()]));
  const prontos = linhas.filter((l) => l.insumoId && l.quantidade.trim()).length;
  const muda = (chave: number, m: Partial<LinhaDigitada>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...m } : l)));
  return { linhas, setLinhas, prontos, muda };
}

export function ListaDeLinhas({
  titulo,
  subtitulo,
  listaDeInsumos,
  estado,
  erros,
  prefixo,
}: {
  titulo: string;
  subtitulo: string;
  listaDeInsumos: OpcaoDeInsumo[];
  estado: ReturnType<typeof useLinhasDeInsumos>;
  erros: Partial<Record<string, string>>;
  /** Prefixo dos ids dos campos (a tela de pedir e a de planejar não repetem id). */
  prefixo: string;
}) {
  const { linhas, setLinhas, muda } = estado;
  const porId = useMemo(() => new Map(listaDeInsumos.map((i) => [i.id, i])), [listaDeInsumos]);
  // O servidor numera as linhas na ordem enviada (`item:<n>`), contando as vazias.
  return (
    <Painel titulo={titulo} subtitulo={subtitulo}>
      <ol className="space-y-3">
        {linhas.map((l, n) => {
          const ins = porId.get(l.insumoId);
          const u = ins ? UNIDADES[ins.unidade] : null;
          const erro = erros[`item:${n}`];
          const idQ = `${prefixo}-q-${l.chave}`;
          return (
            <li key={l.chave} className="rounded-[10px] border border-linha p-3">
              {/* Herança d da 1.8: o seletor ocupa a linha inteira (no celular o nome do insumo cabe inteiro); "Tirar" desce para a linha do número. */}
              <label htmlFor={`${prefixo}-i-${l.chave}`} className="sr-only">
                Insumo da linha {n + 1}
              </label>
              <select
                id={`${prefixo}-i-${l.chave}`}
                name="insumo"
                value={l.insumoId}
                onChange={(e) => muda(l.chave, { insumoId: e.target.value, escala: 'base' })}
                className={`${CAMPO} min-h-12 text-base sm:text-sm`}
                aria-invalid={!!erro}
                aria-describedby={erro ? `${idQ}-erro` : undefined}
              >
                <option value="">Escolha o insumo</option>
                {/* Agrupado pelo lugar: a opção é só o nome (o lugar está no grupo), para caber inteira. */}
                {(Object.keys(CONSERVACOES) as (keyof typeof CONSERVACOES)[]).map((c) => {
                  const doLugar = listaDeInsumos.filter((i) => i.conservacao === c);
                  return doLugar.length === 0 ? null : (
                    <optgroup key={c} label={CONSERVACOES[c]}>
                      {doLugar.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <div className="mt-2 flex items-stretch gap-2">
                <label htmlFor={idQ} className="sr-only">
                  Quanto{ins ? ` de ${ins.nome}` : ''}
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
                  aria-describedby={erro ? `${idQ}-erro` : undefined}
                />
                {u && ins!.unidade !== 'UN' ? (
                  <div role="radiogroup" aria-label="Unidade" className="grid w-[112px] shrink-0 grid-cols-2 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
                    {(['base', 'menor'] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        role="radio"
                        aria-checked={l.escala === e}
                        onClick={() => muda(l.chave, { escala: e })}
                        className={`ff-transicao min-h-10 rounded-[7px] text-[14px] ${l.escala === e ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}
                      >
                        {e === 'base' ? u.sigla : u.menor}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="flex w-[112px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[14px] text-suave">{u ? u.sigla : '—'}</span>
                )}
                <input type="hidden" name="escala" value={l.escala} />
                {linhas.length > 1 && (
                  <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} className={classeDeBotao('fantasma', 'min-h-12 shrink-0 px-3')} aria-label={`Tirar a linha ${n + 1}${ins ? ` (${ins.nome})` : ''}`}>
                    Tirar
                  </button>
                )}
              </div>
              <Erro id={`${idQ}-erro`} texto={erro} />
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => setLinhas((ls) => [...ls, nova()])} className={classeDeBotao('secundario', 'mt-3 w-full sm:w-auto')}>
        Mais um insumo
      </button>
      <Erro id={`${prefixo}-itens-erro`} texto={erros.itens} />
    </Painel>
  );
}

/** Para quando: hoje, amanhã ou outro dia (campo de data). O valor vai em `paraDia`. */
export function ParaQuando({ prefixo, erro, legenda = 'Para quando' }: { prefixo: string; erro?: string; legenda?: string }) {
  const [quando, setQuando] = useState<'hoje' | 'amanha' | 'outro'>('hoje');
  return (
    <fieldset>
      <legend className={ROTULO}>{legenda}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
        {(
          [
            ['hoje', 'Hoje'],
            ['amanha', 'Amanhã'],
            ['outro', 'Outro dia'],
          ] as const
        ).map(([v, r]) => (
          <label key={v} className="relative">
            <input type="radio" name="paraQuando" value={v} checked={quando === v} onChange={() => setQuando(v)} className="peer sr-only" />
            <span className="ff-transicao flex min-h-10 cursor-pointer items-center justify-center rounded-[7px] text-[14px] text-suave hover:text-texto peer-checked:bg-forte peer-checked:font-semibold peer-checked:text-texto peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento">
              {r}
            </span>
          </label>
        ))}
      </div>
      {quando === 'outro' ? (
        <CampoData id={`${prefixo}-dia`} name="paraDia" required className="mt-2 min-h-12 text-base sm:text-sm" aria-label="Dia (dd/mm/aaaa)" aria-invalid={!!erro} aria-describedby={erro ? `${prefixo}-dia-erro` : undefined} />
      ) : (
        <input type="hidden" name="paraDia" value={quando} />
      )}
      <Erro id={`${prefixo}-dia-erro`} texto={erro} />
    </fieldset>
  );
}
