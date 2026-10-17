'use client';

/**
 * Formulários pequenos do lote (3.1): começar a produzir, cancelar o lote que ainda não saiu e estornar o lote concluído.
 * Cada um leva a versão lida (duas abas não se atropelam). O servidor decide; aqui só se mostra o que ele respondeu.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { periodoDaFraseDeRecusa } from '@/lib/erp/periodo-fechado-campos';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
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

export function FormComecar({ acao, versao, recarregar }: { acao: AcaoDeEstoque; versao: number; recarregar: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  return (
    <form action={enviar} className="space-y-2">
      <input type="hidden" name="versao" value={versao} />
      <BotaoEnviar variante="secundario" pendente="Começando…" className="w-full sm:w-auto">
        Começar a produzir
      </BotaoEnviar>
      <ErroGeral estado={estado} recarregar={recarregar} />
    </form>
  );
}

export function FormCancelarLote({ acao, versao, recarregar, daLista = false }: { acao: AcaoDeEstoque; versao: number; recarregar: string; daLista?: boolean }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  if (!aberto && !estado) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={classeDeBotao('secundario', 'w-full sm:w-auto')}>
        {daLista ? 'Tirar da lista' : 'Cancelar este lote'}
      </button>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      <div>
        <label htmlFor="cancelar-lote-motivo" className={ROTULO}>
          {daLista ? 'Por que o lote sai da lista?' : 'Por que o lote sai?'}
        </label>
        <input
          id="cancelar-lote-motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex.: mudou o cardápio da semana"
          className={CAMPO}
          aria-invalid={!!estado?.erros.motivo}
          aria-describedby={`cancelar-lote-ajuda${estado?.erros.motivo ? ' cancelar-lote-erro' : ''}`}
        />
        <p id="cancelar-lote-ajuda" className={AJUDA}>
          A requisição dos insumos é cancelada junto. Se algo já saiu do estoque, o estoque recebe de volta antes. Fica no histórico, com o seu nome.
        </p>
        <Erro id="cancelar-lote-erro" texto={estado?.erros.motivo} />
      </div>
      <ErroGeral estado={estado} recarregar={recarregar} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotaoEnviar variante="perigo" pendente={daLista ? 'Tirando…' : 'Cancelando…'}>
          {daLista ? 'Tirar da lista' : 'Cancelar o lote'}
        </BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma')}>
          Manter
        </button>
      </div>
    </form>
  );
}

export function FormEstornar({
  acao,
  versao,
  recarregar,
  quantoEntrou,
  fechadoHoje = null,
  hrefPeriodos = null,
}: {
  acao: AcaoDeEstoque;
  versao: number;
  recarregar: string;
  quantoEntrou: string | null;
  /** O período de HOJE está fechado: o estorno entra no livro com a data de hoje, então será recusado (a tela avisa antes). */
  fechadoHoje?: string | null;
  hrefPeriodos?: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  const fechadoNoServidor = periodoDaFraseDeRecusa(estado?.erros.geral);
  const fechado = fechadoHoje ?? fechadoNoServidor;
  const aviso = fechado ? <AvisoDoPeriodoFechado id="estornar-periodo-fechado" periodo={fechado} href={hrefPeriodos} frase="O estorno entra no estoque com a data de hoje: não dá para estornar lote nele." rolar={!fechadoHoje && !!fechadoNoServidor} dentro /> : null;
  if (!aberto && !estado) {
    return (
      <div className="space-y-3">
        {aviso}
        <button type="button" onClick={() => setAberto(true)} disabled={!!fechadoHoje} className={classeDeBotao('secundario', 'w-full sm:w-auto')}>
          Estornar este lote
        </button>
      </div>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      {aviso}
      <div>
        <label htmlFor="estornar-motivo" className={ROTULO}>
          Por que o lote é estornado?
        </label>
        <input
          id="estornar-motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex.: lote contaminado, jogado fora"
          className={CAMPO}
          aria-invalid={!!estado?.erros.motivo}
          aria-describedby={`estornar-ajuda${estado?.erros.motivo ? ' estornar-erro' : ''}`}
        />
        <p id="estornar-ajuda" className={AJUDA}>
          {quantoEntrou ? `Tira do estoque o que o lote pôs (${quantoEntrou}), com o antes e o depois no livro.` : 'Desfaz a conclusão do lote.'} Os insumos que saíram continuam saídos: o que foi cozinhado não volta para a prateleira.
        </p>
        <Erro id="estornar-erro" texto={estado?.erros.motivo} />
      </div>
      {(estado?.erros.confirmarNegativo) && (
        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="confirmarNegativo" value="sim" className={`${MARCAR} mt-0.5`} aria-describedby="estornar-negativo-erro" />
            <span>
              <span className="font-semibold text-erro">Estornar mesmo assim, abaixo de zero no livro.</span>
            </span>
          </label>
          <Erro id="estornar-negativo-erro" texto={estado.erros.confirmarNegativo} />
        </div>
      )}
      {!fechadoNoServidor && <ErroGeral estado={estado} recarregar={recarregar} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotaoEnviar variante="perigo" pendente="Estornando…" disabled={!!fechadoHoje}>
          Estornar o lote
        </BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma')}>
          Manter
        </button>
      </div>
    </form>
  );
}
