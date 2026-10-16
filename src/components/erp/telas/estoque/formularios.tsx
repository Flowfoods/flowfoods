'use client';

/**
 * Formulários pequenos do estoque (1.6): abrir o estoque da loja, descartar a
 * contagem em andamento (motivo obrigatório, na própria tela) e concluir a
 * abertura (versão conferida + confirmação dos não contados). 1.7: aplicar a
 * contagem do dia a dia / fechar o período, começar o fechamento e as regras
 * da contagem da loja. O servidor decide; aqui só se mostra o que ele
 * respondeu.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao, type Variante } from '../../ui/estilos';
import type { AcaoDeEstoque, EstadoEstoque } from './estado';

function ErroGeral({ estado }: { estado: EstadoEstoque }) {
  if (!estado?.erros.geral) return null;
  return (
    <p role="alert" className="text-[13px] text-erro">
      {estado.erros.geral}
    </p>
  );
}

/** "Abrir estoque": começa a contagem de abertura e leva para ela. */
export function FormAbrirEstoque({ acao, variante = 'primario', rotulo = 'Abrir estoque', className = '' }: { acao: AcaoDeEstoque; variante?: Variante; rotulo?: string; className?: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  return (
    <form action={enviar} className={`space-y-2 ${className}`}>
      <BotaoEnviar variante={variante} pendente="Abrindo…" className="w-full sm:w-auto">
        {rotulo}
      </BotaoEnviar>
      <ErroGeral estado={estado} />
    </form>
  );
}

/** Descartar a contagem em andamento: nada foi para o estoque; dá para recomeçar. */
export function FormDescartarContagem({ acao }: { acao: AcaoDeEstoque }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  if (!aberto && !estado) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={classeDeBotao('fantasma', 'w-full sm:w-auto')}>
        Descartar esta contagem
      </button>
    );
  }
  return (
    <form action={enviar} className="space-y-3">
      <div>
        <label htmlFor="descartar-motivo" className={ROTULO}>
          Por que a contagem sai?
        </label>
        <input
          id="descartar-motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex.: começamos errado, vamos recomeçar"
          className={CAMPO}
          aria-invalid={!!estado?.erros.motivo}
          aria-describedby={`descartar-motivo-ajuda${estado?.erros.motivo ? ' descartar-motivo-erro' : ''}`}
        />
        <p id="descartar-motivo-ajuda" className={AJUDA}>
          Os números contados até aqui não vão para o estoque. Fica no histórico, com o seu nome.
        </p>
        <Erro id="descartar-motivo-erro" texto={estado?.erros.motivo} />
      </div>
      <ErroGeral estado={estado} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotaoEnviar variante="perigo" pendente="Descartando…">
          Descartar a contagem
        </BotaoEnviar>
        <button type="button" onClick={() => setAberto(false)} className={classeDeBotao('fantasma')}>
          Continuar contando
        </button>
      </div>
    </form>
  );
}

/**
 * Concluir a abertura. Vai com a versão que a pessoa conferiu: se alguém
 * salvou um número depois, o servidor recusa e pede para conferir de novo.
 */
export function FormConcluirAbertura({ acao, versao, naoContados, recarregar }: { acao: AcaoDeEstoque; versao: number; naoContados: number; recarregar: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const erroConfirma = estado?.erros.confirmarNaoContados;
  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="versao" value={versao} />
      {naoContados > 0 && (
        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="confirmarNaoContados" value="sim" className={`${MARCAR} mt-0.5`} aria-invalid={!!erroConfirma} aria-describedby={erroConfirma ? 'confirmar-erro' : undefined} />
            <span>
              <span className="font-semibold text-texto">
                {naoContados === 1 ? 'O insumo não contado entra com zero.' : `Os ${naoContados} insumos não contados entram com zero.`}
              </span>{' '}
              <span className="text-suave">Quer dizer: não tem nesta loja hoje. Fica registrado com o seu nome.</span>
            </span>
          </label>
          <Erro id="confirmar-erro" texto={erroConfirma} />
        </div>
      )}
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}{' '}
          {estado.conflito && (
            <a href={recarregar} className="font-semibold underline underline-offset-4">
              Conferir de novo
            </a>
          )}
        </p>
      )}
      <BotaoEnviar pendente="Concluindo…" className="w-full sm:w-auto">
        Concluir a abertura
      </BotaoEnviar>
    </form>
  );
}

/**
 * Aplicar uma contagem do dia a dia (ou fechar o período, 1.7). Vai com a
 * versão conferida; não contados ficam como estão no livro, só com a
 * confirmação. O servidor confere o piso no fechamento.
 */
export function FormConcluirContagem({
  acao,
  versao,
  tipo,
  naoContados,
  recarregar,
  rotulo,
}: {
  acao: AcaoDeEstoque;
  versao: number;
  tipo: 'CICLICA' | 'FECHAMENTO';
  naoContados: number;
  recarregar: string;
  rotulo: string;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const erroConfirma = estado?.erros.confirmarNaoContados;
  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="versao" value={versao} />
      <input type="hidden" name="tipo" value={tipo} />
      {naoContados > 0 && (
        <div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" name="confirmarNaoContados" value="sim" className={`${MARCAR} mt-0.5`} aria-invalid={!!erroConfirma} aria-describedby={erroConfirma ? 'confirmar-contagem-erro' : undefined} />
            <span>
              <span className="font-semibold text-texto">
                {naoContados === 1 ? 'O insumo sem contar fica como está no livro.' : `Os ${naoContados} insumos sem contar ficam como estão no livro.`}
              </span>{' '}
              <span className="text-suave">Sem ajuste: não contado não é zero.</span>
            </span>
          </label>
          <Erro id="confirmar-contagem-erro" texto={erroConfirma} />
        </div>
      )}
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}{' '}
          {estado.conflito && (
            <a href={recarregar} className="font-semibold underline underline-offset-4">
              Conferir de novo
            </a>
          )}
        </p>
      )}
      <BotaoEnviar pendente={tipo === 'FECHAMENTO' ? 'Fechando…' : 'Aplicando…'} className="w-full sm:w-auto">
        {rotulo}
      </BotaoEnviar>
    </form>
  );
}

/** Começar o fechamento de um período (o de agora ou o anterior que ficou aberto). */
export function FormIniciarFechamento({ acao, inicio, rotulo = 'Começar o fechamento', variante = 'primario' }: { acao: AcaoDeEstoque; inicio: string; rotulo?: string; variante?: Variante }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  return (
    <form action={enviar} className="space-y-2">
      <input type="hidden" name="inicio" value={inicio} />
      <BotaoEnviar variante={variante} pendente="Começando…" className="w-full sm:w-auto">
        {rotulo}
      </BotaoEnviar>
      <ErroGeral estado={estado} />
    </form>
  );
}

/** Regras da contagem da loja (só quem cadastra lojas, rede inteira). Vai com as regras lidas: outra aba mudou = recusa. */
export function FormRegrasDaContagem({ acao, campos, lidas }: { acao: AcaoDeEstoque; campos: Record<'pisoValor' | 'pisoItens' | 'freqA' | 'freqB' | 'freqC' | 'tolerancia', string>; lidas: string }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const campo = (nome: keyof typeof campos, rotulo: string, sufixo: string, ajuda?: string) => (
    <div>
      <label htmlFor={`regra-${nome}`} className={ROTULO}>
        {rotulo}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`regra-${nome}`}
          name={nome}
          defaultValue={campos[nome]}
          inputMode={nome === 'tolerancia' ? 'decimal' : 'numeric'}
          autoComplete="off"
          className={`${CAMPO} max-w-32 text-right tabular-nums`}
          aria-invalid={!!estado?.erros[nome]}
          aria-describedby={[ajuda ? `regra-${nome}-ajuda` : '', estado?.erros[nome] ? `regra-${nome}-erro` : ''].filter(Boolean).join(' ') || undefined}
        />
        <span className="text-sm text-suave">{sufixo}</span>
      </div>
      {ajuda && (
        <p id={`regra-${nome}-ajuda`} className={AJUDA}>
          {ajuda}
        </p>
      )}
      <Erro id={`regra-${nome}-erro`} texto={estado?.erros[nome]} />
    </div>
  );
  return (
    <form action={enviar} className="space-y-5">
      <input type="hidden" name="lidas" value={lidas} />
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-[13px] font-semibold text-texto">Piso para fechar o período</legend>
        {campo('pisoValor', 'Do valor do estoque', '%', 'De 50 a 100. Quanto do valor precisa ter sido contado no período.')}
        {campo('pisoItens', 'Dos insumos', '%', 'De 0 a 100. Quantos insumos com saldo precisam ter sido contados.')}
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-[13px] font-semibold text-texto">Contar de quantos em quantos dias</legend>
        {campo('freqA', 'Curva A', 'dias')}
        {campo('freqB', 'Curva B', 'dias')}
        {campo('freqC', 'Curva C', 'dias')}
      </fieldset>
      {campo('tolerancia', 'Diferença que ainda fecha sozinha', 'R$ por item', 'Se todo item bater até este valor, a contagem fecha sem o gerente. 0 = só se bater exato.')}
      <ErroGeral estado={estado} />
      <BotaoEnviar variante="secundario" pendente="Salvando…" className="w-full sm:w-auto">
        Salvar as regras
      </BotaoEnviar>
    </form>
  );
}
