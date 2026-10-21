'use client';

/**
 * Formulários pequenos do detalhe da requisição (1.8): cancelar a pedida
 * (motivo na própria tela) e receber de volta o que voltou (devolução por
 * estorno no livro). O servidor decide; aqui só se mostra o que ele respondeu.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import type { ItemDoDetalhe } from '@/lib/erp/requisicao';
import { formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

function ErroGeral({ estado, recarregar }: { estado: EstadoEstoque; recarregar?: string }) {
  if (!estado?.erros.geral) return null;
  return (
    <p role="alert" className="text-[13px] text-erro">
      {estado.erros.geral}{' '}
      {estado.conflito && recarregar && (
        <a href={recarregar} className="font-semibold underline underline-offset-4">
          Ver de novo
        </a>
      )}
    </p>
  );
}

export function FormCancelarRequisicao({ acao }: { acao: AcaoDeEstoque }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  if (!aberto && !estado) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={classeDeBotao('fantasma', 'w-full sm:w-auto')}>
        Cancelar esta requisição
      </button>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <div>
        <label htmlFor="cancelar-motivo" className={ROTULO}>
          Por que a requisição sai?
        </label>
        <input
          id="cancelar-motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex.: pedimos em dobro"
          className={CAMPO}
          aria-invalid={!!estado?.erros.motivo}
          aria-describedby={`cancelar-motivo-ajuda${estado?.erros.motivo ? ' cancelar-motivo-erro' : ''}`}
        />
        <p id="cancelar-motivo-ajuda" className={AJUDA}>
          Nada saiu do estoque por ela. Fica no histórico, com o seu nome.
        </p>
        <Erro id="cancelar-motivo-erro" texto={estado?.erros.motivo} />
      </div>
      <ErroGeral estado={estado} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotaoEnviar variante="perigo" pendente="Cancelando…">
          Cancelar a requisição
        </BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma')}>
          Manter
        </button>
      </div>
    </form>
  );
}

export function FormDevolver({ acao, versao, itens, recarregar }: { acao: AcaoDeEstoque; versao: number; itens: ItemDoDetalhe[]; recarregar: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const comSaida = itens.filter((i) => i.atendidoMilesimos > 0);
  const [itemId, setItemId] = useState(comSaida[0]?.id ?? '');
  const [escala, setEscala] = useState<'base' | 'menor'>('base');
  const item = comSaida.find((i) => i.id === itemId);
  const u = item ? UNIDADES[item.unidade] : null;
  const erro = estado?.erros.devolver;
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      <input type="hidden" name="escala" value={escala} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div>
          <label htmlFor="devolver-item" className={ROTULO}>
            O que voltou
          </label>
          <select id="devolver-item" name="itemId" value={itemId} onChange={(e) => setItemId(e.target.value)} className={`${CAMPO} min-h-12 text-base sm:text-sm`}>
            {comSaida.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome} · saiu {formatarQuantidade(i.atendidoMilesimos, i.unidade)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="devolver-q" className={ROTULO}>
            Quanto voltou
          </label>
          <div className="flex gap-2">
            <input id="devolver-q" name="quantidade" inputMode="decimal" autoComplete="off" required className={`${CAMPO} min-h-12 min-w-0 flex-1 text-right text-base font-semibold tabular-nums`} aria-invalid={!!erro} aria-describedby={erro ? 'devolver-erro' : undefined} />
            {u && item!.unidade !== 'UN' ? (
              <div role="radiogroup" aria-label="Unidade" className="grid w-[96px] shrink-0 grid-cols-2 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
                {(['base', 'menor'] as const).map((e) => (
                  <button key={e} type="button" role="radio" aria-checked={escala === e} onClick={() => setEscala(e)} className={`ff-transicao min-h-10 rounded-[7px] text-[14px] ${escala === e ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}>
                    {e === 'base' ? u.sigla : u.menor}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex w-[96px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[14px] text-suave">{u?.sigla ?? 'un'}</span>
            )}
          </div>
        </div>
      </div>
      <div>
        <label htmlFor="devolver-motivo" className={ROTULO}>
          Por quê <span className="font-normal text-suave">(opcional)</span>
        </label>
        <input id="devolver-motivo" name="motivo" maxLength={200} autoComplete="off" placeholder="Ex.: sobrou do almoço" className={CAMPO} />
      </div>
      <Erro id="devolver-erro" texto={erro} />
      <ErroGeral estado={estado} recarregar={recarregar} />
      <p className={AJUDA}>No livro, a saída é estornada e sai de novo só o que ficou: nenhuma linha é apagada.</p>
      <BotaoEnviar variante="secundario" pendente="Registrando…">
        Receber de volta
      </BotaoEnviar>
    </form>
  );
}
