'use client';

/**
 * Formulários da cozinha (3.3), pequenos e de toque grande: pegar um lote (ou uma linha da lista de hoje), soltar o lote
 * (com o motivo) e, para a gerência, passar para outra pessoa (com o motivo). Cada um leva o que a tela mostrou (a versão
 * do lote; a linha com a ficha e a quantidade): o servidor decide e, se alguém mexeu antes, diz quem e o quê. Os mesmos
 * formulários servem a tela da cozinha (`voltar=tarefas`) e a tela do lote.
 */

import { useId, useState } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, classeDeBotaoDaCozinha } from '../../ui/estilos';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';

/**
 * Polimento da 3.3: o que um formulário que abre e fecha (soltar, passar) mostra. "Manter" fecha MESMO depois de um erro
 * (antes, o erro da ação mantinha o formulário aberto); o erro já dispensado não volta quando a pessoa abre de novo.
 */
export function vistaDoFormulario(aberto: boolean, estado: EstadoEstoque, dispensado: EstadoEstoque): { aberto: boolean; erro: EstadoEstoque } {
  return { aberto, erro: estado && estado !== dispensado ? estado : null };
}

/** Polimento da 3.3: quem perdeu a corrida (o lote ficou com outra pessoa, ou mudou) não vê mais o "Pegar": só a frase e "Ver de novo". */
export function perdeuACorrida(estado: EstadoEstoque): boolean {
  return !!estado?.conflito;
}

function ErroGeral({ estado, recarregar }: { estado: EstadoEstoque; recarregar: string }) {
  if (!estado?.erros.geral) return null;
  return (
    <p role="alert" className="text-[14px] text-erro">
      {estado.erros.geral}{' '}
      {estado.conflito && (
        <a href={recarregar} className="ff-toque font-semibold underline underline-offset-4">
          Ver de novo
        </a>
      )}
    </p>
  );
}

/** "Pegar": um toque. O lote (versão lida) ou a linha da lista de hoje (ficha e quantidade que a tela mostrou). */
export function FormPegar({
  acao,
  campos,
  rotulo,
  recarregar,
  voltar,
  cozinha = true,
  variante = 'secundario',
}: {
  acao: AcaoDeEstoque;
  /** O que vai junto: `versao` (lote) ou `linha`, `ficha`, `quantidade` (linha da lista). */
  campos: Record<string, string>;
  /** O nome acessível do botão ("Pegar Molho cheddar, 5 kg"). */
  rotulo: string;
  recarregar: string;
  voltar?: 'tarefas';
  cozinha?: boolean;
  variante?: 'primario' | 'secundario';
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  return (
    <form action={enviar}>
      <div className="space-y-2">
        {Object.entries(campos).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {voltar && <input type="hidden" name="voltar" value={voltar} />}
        {/* Perdeu a corrida: o botão some (tocar de novo só repetiria a recusa); fica a frase de quem pegou e "Ver de novo". */}
        {!perdeuACorrida(estado) && (
          <BotaoEnviar variante={variante} cozinha={cozinha} pendente="Pegando…" className={cozinha ? 'w-full' : 'w-full sm:w-auto'}>
            <span aria-hidden>Pegar</span>
            <span className="sr-only">{rotulo}</span>
          </BotaoEnviar>
        )}
        <ErroGeral estado={estado} recarregar={recarregar} />
      </div>
    </form>
  );
}

/** "Soltar": abre o motivo (obrigatório); o lote volta para pegar, sem ninguém. */
export function FormSoltar({ acao, lote, versao, recarregar, voltar, deOutro, cozinha = true }: { acao: AcaoDeEstoque; lote: string; versao: number; recarregar: string; voltar?: 'tarefas'; deOutro?: string; cozinha?: boolean }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  const [dispensado, setDispensado] = useState<EstadoEstoque>(null);
  const id = useId();
  const classe = cozinha ? classeDeBotaoDaCozinha : classeDeBotao;
  const vista = vistaDoFormulario(aberto, estado, dispensado);
  const erro = vista.erro;
  if (!vista.aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={classe('secundario', 'w-full sm:w-auto')}>
        {deOutro ? (
          <>
            Soltar o lote<span className="sr-only"> de {deOutro}</span>
          </>
        ) : (
          'Soltar'
        )}
      </button>
    );
  }
  return (
    <form action={enviar}>
      <div className="space-y-3">
        <input type="hidden" name="lote" value={lote} />
        <input type="hidden" name="versao" value={versao} />
        {voltar && <input type="hidden" name="voltar" value={voltar} />}
        <div>
          <label htmlFor={`${id}-motivo`} className={ROTULO}>
            {deOutro ? `Por que soltar o lote de ${deOutro}?` : 'Por que você vai soltar?'}
          </label>
          <input
            id={`${id}-motivo`}
            name="motivo"
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
            placeholder="Ex.: acabou o turno"
            className={`${CAMPO} min-h-12 text-base`}
            aria-invalid={!!erro?.erros.motivo}
            aria-describedby={`${id}-ajuda${erro?.erros.motivo ? ` ${id}-erro` : ''}`}
          />
          <p id={`${id}-ajuda`} className={AJUDA}>
            O lote continua em produção, sem ninguém: volta para alguém pegar. Fica no histórico, com o seu nome.
          </p>
          <Erro id={`${id}-erro`} texto={erro?.erros.motivo} />
        </div>
        <ErroGeral estado={erro} recarregar={recarregar} />
        {/* Na cozinha, um embaixo do outro: na coluna de 240 px do cartão, lado a lado o texto quebrava. */}
        <div className={cozinha ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row'}>
          <BotaoEnviar variante="secundario" cozinha={cozinha} pendente="Soltando…">
            Soltar o lote
          </BotaoEnviar>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              setDispensado(estado);
            }}
            className={classe('fantasma')}
          >
            Manter
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * "Passar para outra pessoa" (a gerência): quem recebe (quem registra produção na loja) e o motivo.
 * Quem usa os formulários de lote passa `key` com a versão do lote: depois de gravar, o formulário fecha. Sem isso, o lote que fica
 * no mesmo lugar da tela manteria o formulário aberto com a escolha velha e a versão nova, e um segundo toque gravaria de novo.
 */
export function FormPassar({
  acao,
  lote,
  versao,
  pessoas,
  atual,
  recarregar,
  voltar,
  cozinha = true,
}: {
  acao: AcaoDeEstoque;
  lote: string;
  versao: number;
  pessoas: readonly { usuarioId: string; nome: string }[];
  /** Quem está com o lote (sai da escolha). */
  atual: string | null;
  recarregar: string;
  voltar?: 'tarefas';
  cozinha?: boolean;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [aberto, setAberto] = useState(false);
  const [dispensado, setDispensado] = useState<EstadoEstoque>(null);
  const id = useId();
  const vista = vistaDoFormulario(aberto, estado, dispensado);
  const erro = vista.erro;
  const classe = cozinha ? classeDeBotaoDaCozinha : classeDeBotao;
  const escolhas = pessoas.filter((p) => p.nome !== atual);
  if (escolhas.length === 0) return <p className="text-[13px] text-suave">Ninguém mais nesta loja registra produção para receber o lote.</p>;
  if (!vista.aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className={classe('secundario', 'w-full sm:w-auto')}>
        Passar para outra pessoa
      </button>
    );
  }
  return (
    <form action={enviar}>
      <div className="space-y-3">
        <input type="hidden" name="lote" value={lote} />
        <input type="hidden" name="versao" value={versao} />
        {voltar && <input type="hidden" name="voltar" value={voltar} />}
        <div>
          <label htmlFor={`${id}-para`} className={ROTULO}>
            Para quem
          </label>
          <select id={`${id}-para`} name="para" required defaultValue="" className={`${CAMPO} min-h-12 text-base`} aria-invalid={!!erro?.erros.para} aria-describedby={erro?.erros.para ? `${id}-para-erro` : undefined}>
            <option value="" disabled>
              Escolha quem vai fazer
            </option>
            {escolhas.map((p) => (
              <option key={p.usuarioId} value={p.usuarioId}>
                {p.nome}
              </option>
            ))}
          </select>
          <Erro id={`${id}-para-erro`} texto={erro?.erros.para} />
        </div>
        <div>
          <label htmlFor={`${id}-motivo`} className={ROTULO}>
            Por quê
          </label>
          <input
            id={`${id}-motivo`}
            name="motivo"
            required
            minLength={3}
            maxLength={200}
            autoComplete="off"
            placeholder="Ex.: Caio foi para a chapa"
            className={`${CAMPO} min-h-12 text-base`}
            aria-invalid={!!erro?.erros.motivo}
            aria-describedby={`${id}-ajuda${erro?.erros.motivo ? ` ${id}-erro` : ''}`}
          />
          <p id={`${id}-ajuda`} className={AJUDA}>
            A hora de quem recebe começa agora. Fica no histórico do lote, com o seu nome.
          </p>
          <Erro id={`${id}-erro`} texto={erro?.erros.motivo} />
        </div>
        <ErroGeral estado={erro} recarregar={recarregar} />
        <div className={cozinha ? 'flex flex-col gap-2' : 'flex flex-col gap-2 sm:flex-row'}>
          <BotaoEnviar variante="secundario" cozinha={cozinha} pendente="Passando…">
            Passar o lote
          </BotaoEnviar>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              setDispensado(estado);
            }}
            className={classe('fantasma')}
          >
            Manter
          </button>
        </div>
      </div>
    </form>
  );
}
