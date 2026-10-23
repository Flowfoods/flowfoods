'use client';

/**
 * Emitir a etiqueta (3.4), do lote produzido ou da embalagem aberta: o tamanho (60 × 40 ou 60 × 60), quantas etiquetas (uma
 * por pote), quanto em cada (só no lote, opcional) e se a hora aparece. A prévia redesenha ao vivo com a MESMA função do papel;
 * o servidor lê tudo de novo e grava o retrato (a reimpressão usa o retrato: nada recalcula). A chave do envio faz o duplo
 * clique virar a mesma emissão.
 */

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { MAX_ETIQUETAS, ORDEM_DOS_FORMATOS, FORMATOS, type Formato } from '@/lib/erp/etiqueta-campos';
import { montarEtiqueta } from '@/lib/erp/etiqueta-zpl';
import { formatarQuantidade, lerQuantidadeNa, UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';
import { chaveNova, desserializar, type ConteudoSerial } from './conteudo';
import { PreviaDaEtiqueta } from './previa';

const BOTAO_PASSO = 'ff-transicao inline-flex min-h-11 min-w-11 items-center justify-center rounded-[7px] border border-linha-forte text-lg font-semibold text-texto hover:border-texto/35 hover:bg-texto/5 disabled:cursor-not-allowed disabled:opacity-55';

export function FormEmitir({
  acao,
  envioInicial,
  previa,
  origem,
  unidade,
  produzidoMilesimos,
  formatoInicial = 'E60X40',
  recarregar,
  bloqueio,
}: {
  acao: AcaoDeEstoque;
  /** A chave do envio feita no servidor (vale sem JavaScript); o navegador troca por uma nova ao abrir. */
  envioInicial: string;
  previa: ConteudoSerial;
  origem: 'LOTE' | 'ABERTA';
  unidade: Unidade;
  /** Lote: o que saiu (as etiquetas juntas não passam disso). */
  produzidoMilesimos?: number;
  formatoInicial?: Formato;
  recarregar: string;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [envio, setEnvio] = useState(envioInicial);
  useEffect(() => setEnvio(chaveNova()), []);
  const [formato, setFormato] = useState<Formato>(formatoInicial);
  const [quantas, setQuantas] = useState('1');
  const [quanto, setQuanto] = useState('');
  const [escala, setEscala] = useState<'base' | 'menor'>('base');
  const [hora, setHora] = useState(true);
  const erros = estado?.erros ?? {};
  const u = UNIDADES[unidade];
  const n = /^\d{1,3}$/.test(quantas.trim()) ? Number(quantas.trim()) : null;
  const nValido = n !== null && n >= 1 && n <= MAX_ETIQUETAS;
  const q = origem === 'LOTE' && quanto.trim() ? lerQuantidadeNa(quanto.trim(), unidade, unidade === 'UN' ? 'base' : escala) : null;
  const quantoInvalido = origem === 'LOTE' && !!quanto.trim() && (q === null || q <= 0);
  const passa = origem === 'LOTE' && nValido && q !== null && q > 0 && produzidoMilesimos !== undefined && n! * q > produzidoMilesimos;
  const layout = useMemo(() => {
    const c = desserializar(previa);
    return montarEtiqueta({ ...c, quantidade: origem === 'LOTE' ? (q && q > 0 ? formatarQuantidade(q, unidade) : null) : c.quantidade, mostrarHora: hora }, formato);
  }, [previa, origem, q, unidade, hora, formato]);
  const passo = (d: number) => setQuantas(String(Math.min(MAX_ETIQUETAS, Math.max(1, (n ?? 1) + d))));
  const travado = !!bloqueio;
  const podeEnviar = !travado && nValido && !layout.erro && !quantoInvalido && !passa;
  return (
    <form action={enviar} className="space-y-5 pb-28 sm:pb-0">
      <input type="hidden" name="envio" value={envio} />
      <input type="hidden" name="escala" value={escala} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <fieldset disabled={travado} className="min-w-0 space-y-5">
          <Painel titulo="A etiqueta" subtitulo="Tamanho do rolo que está na impressora e quantas sair">
            <div className="space-y-5">
              <Segmentos<Formato> nome="formato" legenda="Tamanho" opcoes={ORDEM_DOS_FORMATOS.map((f) => [f, FORMATOS[f].rotulo] as const)} valor={formato} aoMudar={setFormato} descritoPor={erros.formato ? 'emitir-formato-erro' : undefined} invalido={!!erros.formato} />
              <Erro id="emitir-formato-erro" texto={erros.formato} />
              <div>
                <label htmlFor="emitir-quantas" className={ROTULO}>
                  Quantas etiquetas <span className="font-normal text-suave">({origem === 'LOTE' ? 'uma por pote ou porção' : 'uma por embalagem'}, até {MAX_ETIQUETAS})</span>
                </label>
                <div className="flex items-stretch gap-2">
                  <button type="button" className={BOTAO_PASSO} onClick={() => passo(-1)} disabled={!nValido || n! <= 1} aria-label="Uma etiqueta a menos">
                    −
                  </button>
                  <input
                    id="emitir-quantas"
                    name="quantas"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    value={quantas}
                    onChange={(e) => setQuantas(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    className={`${CAMPO} w-24 text-center text-[18px] font-semibold tabular-nums`}
                    aria-invalid={!!erros.quantas || (!!quantas && !nValido)}
                    aria-describedby={erros.quantas ? 'emitir-quantas-erro' : undefined}
                  />
                  <button type="button" className={BOTAO_PASSO} onClick={() => passo(1)} disabled={nValido && n! >= MAX_ETIQUETAS} aria-label="Uma etiqueta a mais">
                    +
                  </button>
                </div>
                <Erro id="emitir-quantas-erro" texto={erros.quantas ?? (quantas && !nValido ? `De 1 a ${MAX_ETIQUETAS}.` : undefined)} />
              </div>
              {origem === 'LOTE' && (
                <div>
                  <label htmlFor="emitir-quanto" className={ROTULO}>
                    Quanto em cada <span className="font-normal text-suave">(opcional)</span>
                  </label>
                  <div className="flex items-stretch gap-2">
                    <input
                      id="emitir-quanto"
                      name="quanto"
                      inputMode="decimal"
                      autoComplete="off"
                      value={quanto}
                      onChange={(e) => setQuanto(e.target.value)}
                      placeholder={unidade === 'UN' ? 'Ex.: 10' : escala === 'base' ? 'Ex.: 0,5' : 'Ex.: 500'}
                      className={`${CAMPO} min-w-0 flex-1 text-right tabular-nums`}
                      aria-invalid={!!erros.quanto || quantoInvalido || passa}
                      aria-describedby={`emitir-quanto-ajuda${erros.quanto || quantoInvalido || passa ? ' emitir-quanto-erro' : ''}`}
                    />
                    {unidade !== 'UN' ? (
                      <div role="radiogroup" aria-label="Unidade de quanto em cada" className="grid w-[112px] shrink-0 grid-cols-2 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
                        {(['base', 'menor'] as const).map((e) => (
                          <button key={e} type="button" role="radio" aria-checked={escala === e} onClick={() => setEscala(e)} className={`ff-transicao min-h-9 rounded-[7px] text-[14px] ${escala === e ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}>
                            {e === 'base' ? u.sigla : u.menor}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="flex w-[112px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[14px] text-suave">{u.sigla}</span>
                    )}
                  </div>
                  <p id="emitir-quanto-ajuda" className={AJUDA}>
                    Vazio: a etiqueta sai sem quantidade. Juntas, não passam do que saiu do lote{produzidoMilesimos !== undefined ? ` (${formatarQuantidade(produzidoMilesimos, unidade)})` : ''}.
                  </p>
                  <Erro
                    id="emitir-quanto-erro"
                    texto={
                      erros.quanto ??
                      (quantoInvalido ? 'Número como 0,5 (ou inteiro em g e ml), maior que zero.' : passa ? `${n} × ${formatarQuantidade(q!, unidade)} passa do que saiu do lote (${formatarQuantidade(produzidoMilesimos!, unidade)}).` : undefined)
                    }
                  />
                </div>
              )}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-texto">
                <input type="checkbox" name="hora" value="sim" checked={hora} onChange={(e) => setHora(e.target.checked)} className={MARCAR} />
                <span>
                  Mostrar a hora <span className="text-suave">({origem === 'LOTE' ? 'na manipulação e na validade' : 'na abertura e na validade'})</span>
                </span>
              </label>
            </div>
          </Painel>
        </fieldset>
        <Painel titulo="Como vai sair" subtitulo="O código da etiqueta nasce na emissão">
          <PreviaDaEtiqueta layout={layout} />
        </Painel>
      </div>

      {(erros.geral || bloqueio) && (
        <p role="alert" className="text-[13px] text-erro">
          {erros.geral ?? bloqueio}{' '}
          {estado?.conflito && (
            <a href={recarregar} className="font-semibold underline underline-offset-4">
              Ver de novo
            </a>
          )}
        </p>
      )}

      <div data-barra-fixa className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="min-w-0 text-[13px] tabular-nums text-suave">{layout.erro ? 'Não cabe neste tamanho' : nValido ? `${n} × ${FORMATOS[formato].rotulo}` : 'Diga quantas etiquetas'}</span>
          <BotaoEnviar pendente="Emitindo…" disabled={!podeEnviar} className="min-w-[180px]">
            {nValido && n! > 1 ? `Emitir ${n} etiquetas` : 'Emitir a etiqueta'}
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
