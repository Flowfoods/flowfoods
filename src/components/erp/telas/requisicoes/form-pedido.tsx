'use client';

/**
 * Nova requisição (1.8), celular primeiro: a cozinha pede pelo celular, no
 * meio do serviço. Setor (o da pessoa já vem marcado), para quando (hoje,
 * amanhã, outro dia), os insumos com quanto (kg|g, L|ml, un) em campos de
 * 48 px, observação opcional e o botão fixo no rodapé com quantos itens vão.
 * Linhas vazias são ignoradas pelo servidor; quem decide é ele.
 */

import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import type { OpcaoDeInsumo } from '@/lib/erp/requisicao';
import type { LinhaDigitada } from '@/lib/erp/requisicao-campos';
import { LISTA_DE_SETORES, SETORES, type Setor } from '@/lib/erp/permissoes';
import { UNIDADES } from '@/lib/erp/unidades';
import { CONSERVACOES } from '@/lib/erp/validade';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

type Linha = LinhaDigitada & { chave: number };

let proxima = 1;
const nova = (l?: Partial<LinhaDigitada>): Linha => ({ insumoId: '', quantidade: '', escala: 'base', ...l, chave: proxima++ });

export function FormPedido({
  acao,
  listaDeInsumos,
  setorInicial,
  linhasIniciais,
  ficha,
  bloqueio,
}: {
  acao: AcaoDeEstoque;
  listaDeInsumos: OpcaoDeInsumo[];
  setorInicial: Setor | null;
  linhasIniciais: LinhaDigitada[];
  ficha: { id: string; nome: string; quantidadeMilesimos: number; texto: string } | null;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [linhas, setLinhas] = useState<Linha[]>(() => (linhasIniciais.length ? linhasIniciais.map((l) => nova(l)) : [nova(), nova()]));
  const [quando, setQuando] = useState<'hoje' | 'amanha' | 'outro'>('hoje');
  const porId = useMemo(() => new Map(listaDeInsumos.map((i) => [i.id, i])), [listaDeInsumos]);
  const prontos = linhas.filter((l) => l.insumoId && l.quantidade.trim()).length;
  const erros = estado?.erros ?? {};
  const muda = (chave: number, m: Partial<LinhaDigitada>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...m } : l)));
  const errosDeLinha = Object.keys(erros).filter((k) => k.startsWith('item:')).length;
  // O servidor numera as linhas na ordem enviada (`item:<n>`), contando as vazias.
  return (
    <form action={enviar} className="space-y-5 pb-24 sm:pb-0">
      {ficha && (
        <>
          <input type="hidden" name="fichaId" value={ficha.id} />
          <input type="hidden" name="fichaQuantidade" value={ficha.quantidadeMilesimos} />
        </>
      )}
      <fieldset disabled={!!bloqueio} className="space-y-5">
        <Painel titulo="Para quem e para quando">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pedido-setor" className={ROTULO}>
                Setor
              </label>
              <select id="pedido-setor" name="setor" defaultValue={setorInicial ?? ''} required className={`${CAMPO} min-h-12 text-base sm:text-sm`} aria-invalid={!!erros.setor} aria-describedby={erros.setor ? 'pedido-setor-erro' : undefined}>
                <option value="" disabled>
                  Escolha o setor
                </option>
                {LISTA_DE_SETORES.map((s) => (
                  <option key={s} value={s}>
                    {SETORES[s]}
                  </option>
                ))}
              </select>
              <Erro id="pedido-setor-erro" texto={erros.setor} />
            </div>
            <fieldset>
              <legend className={ROTULO}>Para quando</legend>
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
                <CampoData id="pedido-dia" name="paraDia" required className="mt-2 min-h-12 text-base sm:text-sm" aria-label="Dia (dd/mm/aaaa)" aria-invalid={!!erros.paraDia} aria-describedby={erros.paraDia ? 'pedido-dia-erro' : undefined} />
              ) : (
                <input type="hidden" name="paraDia" value={quando} />
              )}
              <Erro id="pedido-dia-erro" texto={erros.paraDia} />
            </fieldset>
          </div>
        </Painel>

        <Painel titulo="O que vai sair do estoque" subtitulo={ficha ? `Lista da ficha ${ficha.nome} (${ficha.texto}): confira e mude o que precisar` : 'Um insumo por linha; o que ficar vazio não vai'}>
          <ol className="space-y-3">
            {linhas.map((l, n) => {
              const ins = porId.get(l.insumoId);
              const u = ins ? UNIDADES[ins.unidade] : null;
              const erro = erros[`item:${n}`];
              const idQ = `pedido-q-${l.chave}`;
              return (
                <li key={l.chave} className="rounded-[10px] border border-linha p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`pedido-i-${l.chave}`} className="sr-only">
                        Insumo da linha {n + 1}
                      </label>
                      <select
                        id={`pedido-i-${l.chave}`}
                        name="insumo"
                        value={l.insumoId}
                        onChange={(e) => muda(l.chave, { insumoId: e.target.value, escala: 'base' })}
                        className={`${CAMPO} min-h-12 text-base sm:text-sm`}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? `${idQ}-erro` : undefined}
                      >
                        <option value="">Escolha o insumo</option>
                        {listaDeInsumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome} · {CONSERVACOES[i.conservacao]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {linhas.length > 1 && (
                      <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} className={classeDeBotao('fantasma', 'min-h-12 px-3')} aria-label={`Tirar a linha ${n + 1}${ins ? ` (${ins.nome})` : ''}`}>
                        Tirar
                      </button>
                    )}
                  </div>
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
                  </div>
                  <Erro id={`${idQ}-erro`} texto={erro} />
                </li>
              );
            })}
          </ol>
          <button type="button" onClick={() => setLinhas((ls) => [...ls, nova()])} className={classeDeBotao('secundario', 'mt-3 w-full sm:w-auto')}>
            Mais um insumo
          </button>
          <Erro id="pedido-itens-erro" texto={erros.itens} />
        </Painel>

        <div>
          <label htmlFor="pedido-obs" className={ROTULO}>
            Observação <span className="font-normal text-suave">(opcional)</span>
          </label>
          <textarea id="pedido-obs" name="observacao" rows={2} maxLength={280} placeholder="Ex.: para o almoço; o bacon em tiras" className={`${CAMPO} text-base sm:text-sm`} />
          <p className={AJUDA}>Quem entrega lê antes de separar.</p>
          <Erro id="pedido-obs-erro" texto={erros.observacao} />
        </div>
      </fieldset>

      {(estado?.erros.geral || errosDeLinha > 1) && (
        <p role="alert" className="text-[13px] text-erro">
          {estado?.erros.geral ?? `${errosDeLinha} linhas precisam de ajuste: veja embaixo de cada uma.`}
        </p>
      )}
      {bloqueio && <p className="text-sm text-suave">{bloqueio}</p>}

      {/* No celular, o pedido fica sempre à mão no rodapé. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-[13px] tabular-nums text-suave">{prontos === 0 ? 'Nenhum insumo ainda' : prontos === 1 ? '1 insumo' : `${prontos} insumos`}</span>
          <BotaoEnviar pendente="Pedindo…" disabled={!!bloqueio} className="min-w-[160px]">
            Pedir ao estoque
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
