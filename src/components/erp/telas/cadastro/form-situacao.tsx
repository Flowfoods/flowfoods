'use client';

/**
 * Desativar ou reativar um cadastro (insumo, embalagem, ficha técnica), com
 * motivo opcional que vai para o histórico. Desativar não apaga: some da lista
 * padrão e o histórico fica. Recusa e conflito aparecem aqui mesmo.
 */

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, ROTULO } from '../../ui/campos';
import type { AcaoDeCadastro, EstadoCadastro } from './estado';

/** Nome na frase e o gênero, para a concordância ("o insumo desativado" / "a ficha desativada"). */
const O_QUE = {
  insumo: { nome: 'insumo', fem: false },
  embalagem: { nome: 'embalagem', fem: true },
  ficha: { nome: 'ficha', fem: true },
  fornecedor: { nome: 'fornecedor', fem: false },
  categoria: { nome: 'categoria', fem: true },
} as const;

export function FormSituacao({
  acao,
  ativo,
  oQue,
  idBase,
  textos,
  ocultos,
}: {
  /** L.1: campos escondidos que vão junto (de onde a pessoa veio na lista: `de`, `origem`). */
  ocultos?: Readonly<Record<string, string>>;
  acao: AcaoDeCadastro;
  /** Situação de agora: ativo → o botão desativa. */
  ativo: boolean;
  oQue: keyof typeof O_QUE;
  idBase: string;
  /** A frase de cada situação, quando a padrão não serve (a categoria mantém os insumos que já estão nela). */
  textos?: { desativar: string; reativar: string };
}) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const { nome, fem } = O_QUE[oQue];
  const [o, este, desativ, ele] = fem ? ['a', 'Esta', 'desativada', 'ela'] : ['o', 'Este', 'desativado', 'ele'];
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="ativo" value={ativo ? 'nao' : 'sim'} />
      {ocultos && Object.entries(ocultos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <p className="text-sm text-suave">
        {textos
          ? ativo
            ? textos.desativar
            : textos.reativar
          : ativo
          ? `Desativar tira ${o} ${nome} da lista e da busca padrão. Nada é apagado: o histórico continua e dá para reativar.`
          : `${este} ${nome} está ${desativ}. Reativar devolve ${ele} à lista.`}
      </p>
      <div>
        <label htmlFor={`${idBase}-motivo`} className={ROTULO}>
          Motivo <span className="font-normal text-suave">(opcional)</span>
        </label>
        <input
          id={`${idBase}-motivo`}
          name="motivo"
          maxLength={200}
          autoComplete="off"
          placeholder={ativo ? 'Ex.: saiu do cardápio' : 'Ex.: voltou ao cardápio'}
          className={CAMPO}
          aria-describedby={`${idBase}-motivo-ajuda`}
        />
        <p id={`${idBase}-motivo-ajuda`} className={AJUDA}>
          Fica no histórico, ao lado de quem fez.
        </p>
      </div>
      {estado?.erros.geral && (
        <p role="alert" className="text-[13px] text-erro">
          {estado.erros.geral}
        </p>
      )}
      <BotaoEnviar variante={ativo ? 'perigo' : 'secundario'} className="w-full" pendente={ativo ? 'Desativando…' : 'Reativando…'}>
        {ativo ? `Desativar ${nome}` : `Reativar ${nome}`}
      </BotaoEnviar>
    </form>
  );
}
