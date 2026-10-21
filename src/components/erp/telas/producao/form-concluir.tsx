'use client';

/**
 * Concluir o lote (3.1), celular primeiro: o cozinheiro diz quanto saiu de verdade (kg|g, L|ml, un), o motivo quando a
 * diferença passa de 10% (ou o lote se perdeu) e em que conservação o lote vai (a validade nasce daí). A tela mostra ao vivo
 * o rendimento e, para quem vê custos, o custo por unidade; o servidor lê os textos e refaz tudo (campo forjado não vale).
 * Concluir duas vezes a mesma tela não põe duas entradas no estoque: vai com a versão lida.
 */

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { periodoDaFraseDeRecusa } from '@/lib/erp/periodo-fechado-campos';
import { custoPorUnidadeDoLote, formatarRendimento, quandoVence, rendimentoDoLote, validadeDoLote } from '@/lib/erp/producao-campos';
import { formatarDinheiro, formatarFracao, formatarQuantidade, lerQuantidadeNa, UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

export interface ConservacaoParaEscolher {
  chave: string;
  rotulo: string;
  minutos: number;
  /** "3 dias". */
  duracao: string;
  principal: boolean;
}

export function FormConcluir({
  acao,
  voltar,
  versao,
  planejadoMilesimos,
  unidade,
  conservacoes,
  custo,
  recarregar,
  fechadoHoje,
  hrefPeriodos,
  bloqueio,
}: {
  acao: AcaoDeEstoque;
  /** 3.3: veio da tela da cozinha (volta para ela). */
  voltar?: 'tarefas';
  versao: number;
  planejadoMilesimos: number;
  unidade: Unidade;
  conservacoes: ConservacaoParaEscolher[];
  /** Só para quem vê custos: o que saiu do estoque (centavos), os insumos sem preço e o custo da ficha hoje (texto pronto). */
  custo: { totalCentavos: number; semPreco: string[]; previstoTexto: string | null } | null;
  recarregar: string;
  /** O período de hoje, quando já está fechado no DRE: o aviso vem antes de preencher. */
  fechadoHoje: string | null;
  hrefPeriodos: string | null;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const u = UNIDADES[unidade];
  const [texto, setTexto] = useState('');
  const [escala, setEscala] = useState<'base' | 'menor'>('base');
  const [motivo, setMotivo] = useState('');
  const [conservacao, setConservacao] = useState(conservacoes.find((c) => c.principal)?.chave ?? conservacoes[0]?.chave ?? '');
  // A validade que a escolha dá "se concluir agora": o relógio só existe no navegador.
  const [agoraMs, setAgoraMs] = useState<number | null>(null);
  useEffect(() => setAgoraMs(Date.now()), []);
  const erros = estado?.erros ?? {};
  // O servidor recusou por período fechado (a tela já tinha avisado, ou o período fechou depois de abrir): o mesmo aviso, trazido para a vista.
  const fechadoNoServidor = periodoDaFraseDeRecusa(erros.geral);
  const travado = !!bloqueio || !!fechadoHoje;
  const q = texto.trim() ? lerQuantidadeNa(texto.trim(), unidade, escala) : null;
  const r = q !== null && q >= 0 && q <= planejadoMilesimos * 2 ? rendimentoDoLote(planejadoMilesimos, q) : null;
  const perdido = q === 0;
  const pedeMotivo = r !== null && (perdido || r.foraDaFaixa);
  const porUnidade = custo && q && q > 0 ? custoPorUnidadeDoLote(custo.totalCentavos, q) : null;
  const escolhida = conservacoes.find((c) => c.chave === conservacao);
  const idQ = 'concluir-produzido';
  return (
    <form action={enviar} className="space-y-5 pb-28 sm:pb-0">
      <input type="hidden" name="versao" value={versao} />
      <input type="hidden" name="escala" value={escala} />
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      {(fechadoHoje || fechadoNoServidor) && (
        <AvisoDoPeriodoFechado
          id="concluir-periodo-fechado"
          periodo={(fechadoHoje ?? fechadoNoServidor)!}
          href={hrefPeriodos}
          frase="O lote entra no estoque com a data de hoje: não dá para concluir nem estornar lote nele."
          rolar={!fechadoHoje && !!fechadoNoServidor}
        />
      )}
      <fieldset disabled={travado} className="space-y-5">
        <Painel titulo="Quanto saiu de verdade" subtitulo={`Planejado: ${formatarQuantidade(planejadoMilesimos, unidade)}. Pese ou meça o lote pronto.`}>
          <div className="flex items-stretch gap-2">
            <label htmlFor={idQ} className="sr-only">
              Quanto saiu, em {u.sigla}
            </label>
            <input
              id={idQ}
              name="produzido"
              inputMode="decimal"
              autoComplete="off"
              required
              value={texto}
              placeholder={escala === 'base' ? String(planejadoMilesimos / 1000).replace('.', ',') : String(planejadoMilesimos)}
              onChange={(e) => setTexto(e.target.value)}
              className={`${CAMPO} min-h-14 min-w-0 flex-1 text-right text-[22px] font-semibold tabular-nums`}
              aria-invalid={!!erros.produzido}
              aria-describedby={`${idQ}-rend${erros.produzido ? ` ${idQ}-erro` : ''}`}
            />
            {unidade !== 'UN' ? (
              <div role="radiogroup" aria-label="Unidade" className="grid w-[112px] shrink-0 grid-cols-2 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
                {(['base', 'menor'] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={escala === e}
                    onClick={() => setEscala(e)}
                    className={`ff-transicao min-h-12 rounded-[7px] text-[15px] ${escala === e ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}
                  >
                    {e === 'base' ? u.sigla : u.menor}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex w-[112px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[15px] text-suave">{u.sigla}</span>
            )}
          </div>
          <p id={`${idQ}-rend`} className={`mt-2 text-[13px] tabular-nums ${r?.foraDaFaixa ? 'font-semibold text-atencao' : 'text-suave'}`} aria-live="polite">
            {r === null
              ? 'O rendimento aparece quando você digitar.'
              : perdido
                ? 'Lote perdido: nada entra no estoque, e o custo dos insumos fica registrado como perda.'
                : `${formatarRendimento(r.rendimentoBp)} do planejado${r.diferencaMilesimos > 0 ? `, faltaram ${formatarQuantidade(r.diferencaMilesimos, unidade)}` : r.diferencaMilesimos < 0 ? `, saiu ${formatarQuantidade(-r.diferencaMilesimos, unidade)} a mais` : ''}${r.foraDaFaixa ? ' · passa de 10%: diga o motivo' : ''}`}
          </p>
          <Erro id={`${idQ}-erro`} texto={erros.produzido} />

          <div className="mt-4">
            <label htmlFor="concluir-motivo" className={ROTULO}>
              Motivo da diferença{' '}
              <span className="font-normal text-suave">{pedeMotivo ? '(obrigatório)' : '(só se passar de 10%)'}</span>
            </label>
            <input
              id="concluir-motivo"
              name="motivo"
              maxLength={200}
              autoComplete="off"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required={pedeMotivo}
              placeholder={perdido ? 'Ex.: queimou no fundo da panela' : 'Ex.: evaporou mais do que o normal'}
              className={CAMPO}
              aria-invalid={!!erros.motivo}
              aria-describedby={erros.motivo ? 'concluir-motivo-erro' : undefined}
            />
            <Erro id="concluir-motivo-erro" texto={erros.motivo} />
          </div>
        </Painel>

        {conservacoes.length > 0 ? (
          <Painel titulo="Onde o lote vai ficar" subtitulo="A validade do lote sai da conservação que você escolher. Mudar a ficha depois não muda este lote.">
            <div role="radiogroup" aria-label="Conservação do lote" className="grid gap-2">
              {conservacoes.map((c) => {
                const vence = agoraMs !== null ? quandoVence(validadeDoLote(new Date(agoraMs), c.minutos)) : null;
                return (
                  <label key={c.chave} className="relative block">
                    <input type="radio" name="conservacao" value={c.chave} checked={conservacao === c.chave} onChange={() => setConservacao(c.chave)} className="peer sr-only" />
                    <span className="ff-transicao flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-linha px-3.5 py-2.5 hover:border-linha-forte peer-checked:border-linha-forte peer-checked:bg-forte peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento">
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-texto">
                          {c.rotulo}
                          {c.principal && <span className="ml-2 text-[12px] font-normal text-suave">principal da ficha</span>}
                        </span>
                        <span className="block text-[12px] text-suave">dura {c.duracao}</span>
                      </span>
                      <span className="shrink-0 text-right text-[13px] tabular-nums text-texto">{vence ? `vence ${vence}` : ''}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {escolhida && perdido && <p className={AJUDA}>Lote perdido não vai para a prateleira: a conservação não vale.</p>}
            <Erro id="concluir-cons-erro" texto={erros.conservacao} />
          </Painel>
        ) : (
          <p className="rounded-[10px] border border-linha px-3.5 py-2.5 text-[13px] text-suave">A ficha ainda não diz quanto o lote dura: ele conclui sem validade. Peça a quem cuida das fichas para informar a conservação.</p>
        )}

        {custo && (
          <Painel titulo="Custo do lote" subtitulo="O que saiu do estoque pela requisição, dividido pelo que saiu de verdade">
            <p className="text-[15px] tabular-nums text-texto">
              {custo.semPreco.length > 0 ? (
                <>
                  <span className="font-semibold">Custo incompleto</span> · {formatarDinheiro(custo.totalCentavos)} {`(sem contar ${custo.semPreco.join(', ')})`}
                </>
              ) : porUnidade && q ? (
                <>
                  <span className="font-semibold">
                    {formatarFracao(porUnidade).replace(/ /g, ' ')}/{u.sigla}
                  </span>{' '}
                  <span className="text-suave">
                    ({formatarDinheiro(custo.totalCentavos)} ÷ {formatarQuantidade(q, unidade)})
                  </span>
                </>
              ) : (
                <span className="text-suave">{formatarDinheiro(custo.totalCentavos)} saíram do estoque; o custo por {u.sigla} aparece quando você digitar quanto saiu.</span>
              )}
            </p>
            {custo.previstoTexto && <p className={AJUDA}>A ficha prevê hoje {custo.previstoTexto}.</p>}
          </Painel>
        )}
      </fieldset>

      {((erros.geral && !fechadoNoServidor) || bloqueio) && (
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
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-[13px] tabular-nums text-suave">{q === null ? 'Falta dizer quanto saiu' : perdido ? 'Lote perdido' : `Entra no estoque: ${formatarQuantidade(q, unidade)}`}</span>
          <BotaoEnviar pendente="Concluindo…" disabled={travado} className="min-w-[200px]">
            {perdido ? 'Registrar lote perdido' : 'Concluir e pôr no estoque'}
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
