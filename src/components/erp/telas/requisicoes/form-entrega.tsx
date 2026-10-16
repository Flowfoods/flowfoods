'use client';

/**
 * Entregar (1.8): o estoquista confere item a item e diz quanto sai AGORA
 * (já vem o que falta). Ao lado, o que o livro diz da loja e em quanto fica;
 * abaixo de zero aparece em vermelho com a palavra, e a entrega só passa com
 * a confirmação (o produto está aí, o livro é que está errado: o negativo
 * vira alarme). "Encerrar o resto" fecha a requisição com o corte à vista.
 * Vai com a versão lida: entregar duas vezes a mesma tela não baixa duas vezes.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import type { ItemDoDetalhe } from '@/lib/erp/requisicao';
import { quantidadeNegativa } from '@/lib/erp/requisicao-campos';
import { formatarQuantidade, lerQuantidadeNa, UNIDADES } from '@/lib/erp/unidades';
import { textoDoCampo } from '@/lib/erp/requisicao-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro, MARCAR } from '../../ui/campos';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

export function FormEntrega({ acao, versao, itens, recarregar }: { acao: AcaoDeEstoque; versao: number; itens: ItemDoDetalhe[]; recarregar: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [valores, setValores] = useState<Record<string, { q: string; e: 'base' | 'menor' }>>(() => Object.fromEntries(itens.map((i) => [i.id, { q: i.faltaMilesimos > 0 ? textoDoCampo(i.faltaMilesimos) : '', e: 'base' }])));
  const [encerrar, setEncerrar] = useState(false);
  const erros = estado?.erros ?? {};
  const saida = (i: ItemDoDetalhe) => {
    const v = valores[i.id];
    if (!v?.q.trim()) return 0;
    return lerQuantidadeNa(v.q.trim(), i.unidade, v.e) ?? 0;
  };
  const negativos = itens.filter((i) => i.saldoMilesimos - saida(i) < 0 && saida(i) > 0);
  const saem = itens.filter((i) => saida(i) > 0).length;
  const sobraFalta = itens.some((i) => i.faltaMilesimos - saida(i) > 0);
  return (
    <form action={enviar} className="space-y-4 pb-28 sm:pb-0">
      <input type="hidden" name="versao" value={versao} />
      <ol className="space-y-3">
        {itens.map((i) => {
          const u = UNIDADES[i.unidade];
          const v = valores[i.id] ?? { q: '', e: 'base' as const };
          const sai = saida(i);
          const fica = i.saldoMilesimos - sai;
          const idQ = `entrega-${i.id}`;
          const erro = erros[`item:${i.id}`];
          return (
            <li key={i.id} className="rounded-[14px] border border-linha bg-painel p-4">
              <input type="hidden" name="item" value={i.id} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-texto">{i.nome}</div>
                  <div className="mt-0.5 text-[12px] tabular-nums text-suave">
                    pedido {formatarQuantidade(i.solicitadoMilesimos, i.unidade)}
                    {i.atendidoMilesimos > 0 && ` · já saiu ${formatarQuantidade(i.atendidoMilesimos, i.unidade)}`}
                    {` · falta ${formatarQuantidade(i.faltaMilesimos, i.unidade)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[12px] tabular-nums">
                  <div className="text-suave">no livro</div>
                  <div className={`text-[14px] font-semibold ${i.saldoMilesimos < 0 ? 'text-erro' : 'text-texto'}`}>{quantidadeNegativa(i.saldoMilesimos, i.unidade)}</div>
                </div>
              </div>
              <div className="mt-3 flex items-stretch gap-2">
                <label htmlFor={idQ} className="flex min-h-12 shrink-0 items-center text-[13px] font-medium text-texto">
                  Sai agora
                </label>
                <input
                  id={idQ}
                  name={`q:${i.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={v.q}
                  placeholder="0"
                  onChange={(e) => setValores((s) => ({ ...s, [i.id]: { ...v, q: e.target.value } }))}
                  className={`${CAMPO} min-h-12 min-w-0 flex-1 text-right text-[18px] font-semibold tabular-nums`}
                  aria-invalid={!!erro}
                  aria-describedby={`${idQ}-fica${erro ? ` ${idQ}-erro` : ''}`}
                />
                {i.unidade !== 'UN' ? (
                  <div role="radiogroup" aria-label={`Unidade de ${i.nome}`} className="grid w-[104px] shrink-0 grid-cols-2 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
                    {(['base', 'menor'] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        role="radio"
                        aria-checked={v.e === e}
                        onClick={() => setValores((s) => ({ ...s, [i.id]: { ...v, e } }))}
                        className={`ff-transicao min-h-10 rounded-[7px] text-[14px] ${v.e === e ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}
                      >
                        {e === 'base' ? u.sigla : u.menor}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="flex w-[104px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[14px] text-suave">{u.sigla}</span>
                )}
                <input type="hidden" name={`e:${i.id}`} value={v.e} />
              </div>
              <p id={`${idQ}-fica`} className={`mt-1.5 text-right text-[12px] tabular-nums ${fica < 0 ? 'font-semibold text-erro' : 'text-suave'}`}>
                {sai > 0 ? `no livro fica ${quantidadeNegativa(fica, i.unidade)}${fica < 0 ? ' · abaixo de zero' : ''}` : 'nada sai deste agora'}
              </p>
              <Erro id={`${idQ}-erro`} texto={erro} />
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 rounded-[14px] border border-linha bg-painel p-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" name="encerrar" value="sim" checked={encerrar} onChange={(e) => setEncerrar(e.target.checked)} className={`${MARCAR} mt-0.5`} />
          <span>
            <span className="font-semibold text-texto">Encerrar o resto</span>{' '}
            <span className="text-suave">{sobraFalta ? 'O que faltar não vai sair por esta requisição (fica o corte à vista).' : 'Nada fica faltando com esta entrega.'}</span>
          </span>
        </label>
        {(negativos.length > 0 || erros.confirmarNegativo) && (
          <div>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" name="confirmarNegativo" value="sim" className={`${MARCAR} mt-0.5`} aria-describedby={erros.confirmarNegativo ? 'confirmar-negativo-erro' : undefined} />
              <span>
                <span className="font-semibold text-erro">Entregar mesmo assim, abaixo de zero no livro.</span>{' '}
                <span className="text-suave">O produto está aqui e o livro é que está errado: o saldo negativo vira alarme nas divergências até a próxima contagem.</span>
              </span>
            </label>
            <Erro id="confirmar-negativo-erro" texto={erros.confirmarNegativo} />
          </div>
        )}
      </div>

      {erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {erros.geral}{' '}
          {estado?.conflito && (
            <a href={recarregar} className="font-semibold underline underline-offset-4">
              Conferir de novo
            </a>
          )}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-[13px] tabular-nums text-suave">{saem === 0 ? (encerrar ? 'só encerrar' : 'nada saindo') : `${saem} de ${itens.length} saindo`}</span>
          <BotaoEnviar pendente="Dando baixa…" className="min-w-[180px]">
            {saem === 0 && encerrar ? 'Encerrar a requisição' : 'Entregar e dar baixa'}
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
