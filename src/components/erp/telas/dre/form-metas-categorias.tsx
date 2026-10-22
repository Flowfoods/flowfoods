'use client';

/**
 * O formulário das metas por categoria (I.2a, decisões 270 a 273), da rede ou de uma loja.
 *
 * UMA gravação para o formulário inteiro, condicional à impressão do que foi lido (duas abas não se atropelam). Vazio é "sem
 * meta"; "0" é uma meta de zero. "Usar o modelo de 32%" só PREENCHE os campos (nada é gravado); a soma e o aviso de diferença
 * contra o total se atualizam enquanto a pessoa digita, mas quem decide o que vale é o servidor (a conta é refeita ao salvar).
 * A loja segue a rede (campos só de leitura, com as metas dela) ou personaliza o conjunto INTEIRO.
 */

import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { formatarData } from '@/lib/erp/compra-campos';
import { aplicarModelo32, avisoDaSoma, percentualComDuasCasas, type CategoriaParaMeta } from '@/lib/erp/cmv-categorias-campos';
import { lerMetaDigitada } from '@/lib/erp/dre-metas-campos';
import { classeDeBotao } from '../../ui/estilos';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, MARCAR, ROTULO } from '../../ui/campos';
import type { AcaoLocal, EstadoLocal } from './estado';

export interface CategoriaNoFormulario extends CategoriaParaMeta {
  usa: boolean;
  campo: string;
  campoDaRede: string;
}

const idDe = (id: string) => `meta-cat-${id}`;

const bpDe = (texto: string): number | null => {
  const l = lerMetaDigitada(texto, 'percentual');
  return l.ok ? l.bp : null;
};

export function FormMetasPorCategoria({
  acao,
  alvo,
  categorias,
  totalCampo,
  totalBp,
  segueInicial,
  versao,
  periodoAtual,
  valeDesde,
  bloqueio,
}: {
  acao: AcaoLocal;
  alvo: 'rede' | 'loja';
  categorias: CategoriaNoFormulario[];
  /** Na rede, o campo da meta total (a do CMV do DRE). */
  totalCampo: string;
  /** Na loja, o total do DRE, só para o aviso de soma. */
  totalBp: number | null;
  segueInicial: boolean;
  versao: string;
  periodoAtual: string;
  /** O início do período de agora: o que se grava hoje vale daí em diante. */
  valeDesde: string;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoLocal, FormData>(acao, null);
  const erros = estado?.erros ?? {};
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(categorias.map((c) => [c.id, c.campo])));
  const [usa, setUsa] = useState<Record<string, boolean>>(() => Object.fromEntries(categorias.map((c) => [c.id, c.usa])));
  const [total, setTotal] = useState(totalCampo);
  const [segue, setSegue] = useState(segueInicial);
  const [frase, setFrase] = useState<string | null>(null);
  const daLoja = alvo === 'loja';
  const travado = !!bloqueio;
  const lendoARede = daLoja && segue;

  const { soma, comValor } = useMemo(() => {
    let s = 0;
    let n = 0;
    for (const c of categorias) {
      if (daLoja && !usa[c.id]) continue;
      const bp = lendoARede ? bpDe(c.campoDaRede) : bpDe(valores[c.id] ?? '');
      if (bp !== null) {
        s += bp;
        n++;
      }
    }
    return { soma: s, comValor: n };
  }, [categorias, valores, usa, daLoja, lendoARede]);
  const totalLido = daLoja ? totalBp : bpDe(total);
  const aviso = comValor > 0 ? avisoDaSoma(soma, totalLido) : null;

  const usarOModelo = () => {
    const m = aplicarModelo32(categorias);
    setValores(Object.fromEntries(categorias.map((c) => [c.id, daLoja && !usa[c.id] ? '' : m.campos[c.id] ?? ''])));
    if (!daLoja) setTotal(m.total);
    if (daLoja) setSegue(false);
    setFrase(m.frase);
  };

  const valorDoCampo = (c: CategoriaNoFormulario) => (lendoARede ? c.campoDaRede : (valores[c.id] ?? ''));

  return (
    <form action={enviar} noValidate>
      <input type="hidden" name="versao" value={versao} />
      {erros.geral && (
        <div role="alert" className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm sm:mx-5">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href="" className="text-[13px] font-medium underline underline-offset-4">
              Recarregar
            </a>
          )}
        </div>
      )}
      <fieldset disabled={travado} className="min-w-0 space-y-5 px-4 pb-4 sm:px-5">
        <legend className="sr-only">{daLoja ? 'Metas por categoria desta loja' : 'Metas por categoria da rede'}</legend>

        {daLoja && (
          <div role="radiogroup" aria-label="De onde vêm as metas desta loja" className="grid gap-2 sm:grid-cols-2">
            <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 text-sm ${segue ? 'border-texto/50 bg-forte' : 'border-linha'}`}>
              <input type="radio" name="segue" value="sim" checked={segue} onChange={() => setSegue(true)} className={`${MARCAR} mt-0.5`} />
              <span>
                <span className="block font-medium text-texto">Segue a rede</span>
                <span className="block text-[12px] leading-snug text-suave">Vale a meta da rede, e muda junto com ela.</span>
              </span>
            </label>
            <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2.5 text-sm ${!segue ? 'border-texto/50 bg-forte' : 'border-linha'}`}>
              <input type="radio" name="segue" value="nao" checked={!segue} onChange={() => setSegue(false)} className={`${MARCAR} mt-0.5`} />
              <span>
                <span className="block font-medium text-texto">Personalizar esta loja</span>
                <span className="block text-[12px] leading-snug text-suave">Metas só desta loja, o conjunto inteiro. A rede deixa de mexer nelas.</span>
              </span>
            </label>
          </div>
        )}

        {!daLoja && (
          <div>
            <label htmlFor="meta-total" className={ROTULO}>
              Meta total do CMV (% da receita bruta)
            </label>
            <input
              id="meta-total"
              name="total"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              maxLength={12}
              placeholder="sem meta"
              aria-invalid={!!erros.total}
              aria-describedby={`meta-total-ajuda${erros.total ? ' meta-total-erro' : ''}`}
              className={`${CAMPO} w-full max-w-[12rem] scroll-mb-28 text-right tabular-nums`}
            />
            <p id="meta-total-ajuda" className="mt-1.5 text-[12px] text-suave">
              É a meta da linha CMV do DRE: mudar aqui muda lá. As categorias dividem esse total.
            </p>
            {erros.total && (
              <p id="meta-total-erro" className="mt-1 text-[13px] text-erro">
                {erros.total}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={usarOModelo} disabled={travado} className={classeDeBotao('secundario')}>
              Usar o modelo de 32%
            </button>
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-suave">Referência ilustrativa, não limite. Só preenche os campos: nada é gravado até você salvar.</p>
          </div>
          <p aria-live="polite" className="min-h-0 text-[13px] text-texto">
            {frase}
          </p>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-linha">
          <table className="w-full text-sm">
            <caption className="sr-only">Meta de cada categoria, em % da receita bruta</caption>
            <thead>
              <tr className="bg-forte text-left text-[12px] text-suave">
                <th scope="col" className="h-10 px-4 font-semibold">
                  Categoria
                </th>
                {daLoja && (
                  <th scope="col" className="h-10 w-20 px-2 text-center font-semibold sm:w-28">
                    Usa
                  </th>
                )}
                <th scope="col" className="h-10 w-32 px-3 text-right font-semibold sm:w-44 sm:px-4">
                  Meta, %
                </th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((c) => {
                const id = idDe(c.id);
                const erro = erros[`cat_${c.id}`];
                const naoUsa = daLoja && !usa[c.id];
                return (
                  <tr key={c.id} className="border-t border-linha">
                    <th scope="row" className="min-w-0 px-4 py-2 text-left align-top font-normal">
                      <label htmlFor={id} className="block min-h-6 leading-6 text-texto">
                        {c.nome}
                        {!c.ativa && <span className="ml-2 text-[12px] text-suave">desativada, a meta continua valendo</span>}
                      </label>
                      {c.chave === 'OUTROS' && <span className="block text-[12px] leading-snug text-suave">Meta 0 quer dizer que tudo que cair aqui é fila para classificar, não que não há custo.</span>}
                      {erro && (
                        <span id={`${id}-erro`} className="mt-1 block text-[13px] text-erro">
                          {erro}
                        </span>
                      )}
                    </th>
                    {daLoja && (
                      <td className="px-2 py-1 text-center align-top">
                        <input type="hidden" name={`viu_${c.id}`} value="1" />
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            name={`usa_${c.id}`}
                            checked={usa[c.id] ?? true}
                            onChange={(e) => {
                              setUsa((u) => ({ ...u, [c.id]: e.target.checked }));
                              if (!e.target.checked) setValores((v) => ({ ...v, [c.id]: '' }));
                            }}
                            className={MARCAR}
                            aria-label={`${c.nome}: esta loja usa`}
                          />
                        </label>
                      </td>
                    )}
                    <td className="px-3 py-1.5 text-right align-top sm:px-4">
                      <input
                        id={id}
                        name={`cat_${c.id}`}
                        value={naoUsa ? '' : valorDoCampo(c)}
                        onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
                        disabled={naoUsa || lendoARede}
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={12}
                        placeholder={naoUsa ? 'não usa' : 'sem meta'}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? `${id}-erro` : undefined}
                        className={`${CAMPO} ml-auto w-28 scroll-mb-28 text-right font-normal tabular-nums sm:w-32`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-linha-forte bg-forte font-semibold">
                <th scope="row" className="px-4 py-2.5 text-left" colSpan={daLoja ? 2 : 1}>
                  Soma das categorias
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">{comValor > 0 ? percentualComDuasCasas(soma) : <span className="font-normal text-suave">—</span>}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {aviso && (
          <p role="status" className="rounded-[10px] border border-linha px-3 py-2.5 text-sm text-texto">
            <span className="font-semibold">Confira a divisão.</span> {aviso}. Dá para salvar assim: é só um aviso de que as categorias não fecham no total.
          </p>
        )}
        {daLoja && totalBp === null && <p className="text-[12px] text-suave">O total do CMV não tem meta definida; ele se define na tela da rede.</p>}
      </fieldset>

      <p className="border-t border-linha px-4 py-3 text-[13px] text-texto sm:px-5">
        As metas valem <strong className="font-semibold">a partir de {formatarData(valeDesde)}</strong>, o começo de {periodoAtual}. Os períodos anteriores seguem com as metas que valiam neles.
      </p>
      <div data-barra-fixa className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-b-[14px] border-t border-linha bg-painel px-4 py-3 sm:px-5">
        <BotaoEnviar pendente="Salvando…" disabled={travado} className="w-full sm:w-auto">
          Salvar as metas
        </BotaoEnviar>
        <p aria-live="polite" className="min-h-5 text-[13px]">
          {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
        </p>
      </div>
    </form>
  );
}
