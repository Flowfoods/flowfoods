'use client';

/**
 * I.1b — Conservação e prazo de uso após abertura do INSUMO COMPRADO.
 *
 * Dois assuntos, dois blocos, para ninguém confundir:
 *  1. CONSERVAÇÃO (onde o insumo fica guardado): uma escolha obrigatória, sem valor pré-marcado. "Selecione a conservação" é só a
 *     orientação do campo (opção desabilitada), nunca um valor que se salva; o servidor recusa o que não for uma das quatro.
 *     Não é a categoria: coxa de frango é Proteína, congelada ou não.
 *  2. PRAZO DE USO APÓS ABERTURA (opcional): quanto tempo o produto dura depois de aberto, em horas ou dias, por conservação.
 *     Não é a data de vencimento impressa no lote (essa vem no recebimento, fase 3.4). Em branco = não informado; nenhum prazo
 *     é inventado nem sugerido.
 *
 * Vai tudo como texto; o servidor converte para minutos e confere (`lerValidades`). Os nomes dos campos são os de sempre
 * (`conservacao`, `aceita_X`, `validade_X`, `validadeEm_X`), então a leitura do servidor não muda.
 */

import { useState } from 'react';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, validadesParaCampos, type Conservacao, type EmQue, type Validades } from '@/lib/erp/validade';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { IconeDaConservacao } from '../cadastro/validade';

type Linha = { marcada: boolean; quantidade: string; em: EmQue };

/** Seco é "ambiente" no dia a dia da cozinha: a opção diz as duas palavras. */
export const ROTULO_DA_OPCAO: Record<Conservacao, string> = {
  SECO: 'Seco (ambiente)',
  PISTA_FRIA: 'Pista fria',
  REFRIGERADO: 'Refrigerado',
  CONGELADO: 'Congelado',
};

const OBRIGATORIO = <span className="font-normal text-suave"> (obrigatório)</span>;

export function CamposDeConservacao({
  principalInicial,
  validadesIniciais,
  erros,
  idBase,
  aoMudar,
  aConfirmar = false,
}: {
  /** '' = ainda não escolhida (cadastro novo). */
  principalInicial: Conservacao | '';
  validadesIniciais: Validades | null;
  erros: Partial<Record<string, string>>;
  idBase: string;
  aoMudar?: () => void;
  /** Insumo antigo, em Seco, numa categoria que costuma ser fria, que ninguém confirmou: o campo pede para conferir. */
  aConfirmar?: boolean;
}) {
  const campos = validadesParaCampos(validadesIniciais);
  const [principal, setPrincipal] = useState<Conservacao | ''>(principalInicial);
  const [linhas, setLinhas] = useState<Record<Conservacao, Linha>>(() => {
    const l = {} as Record<Conservacao, Linha>;
    for (const c of ORDEM_DAS_CONSERVACOES) l[c] = campos[c];
    return l;
  });
  const mudar = (c: Conservacao, m: Partial<Linha>) => {
    setLinhas((x) => ({ ...x, [c]: { ...x[c], ...m } }));
    aoMudar?.();
  };
  const erroDaConservacao = erros.conservacao;
  const idAjuda = `${idBase}-conservacao-ajuda`;

  return (
    <div className="space-y-5">
      <input type="hidden" name="validadeNoFormulario" value="sim" />
      <div className="sm:max-w-md">
        <label htmlFor={`${idBase}-conservacao`} className={ROTULO}>
          Conservação{OBRIGATORIO}
        </label>
        <select
          id={`${idBase}-conservacao`}
          name="conservacao"
          required
          aria-required="true"
          value={principal}
          onChange={(e) => {
            setPrincipal(e.target.value as Conservacao | '');
            aoMudar?.();
          }}
          className={`${CAMPO} pr-8`}
          aria-invalid={!!erroDaConservacao}
          aria-describedby={[idAjuda, erroDaConservacao ? `${idBase}-conservacao-erro` : ''].filter(Boolean).join(' ')}
        >
          <option value="" disabled>
            Selecione a conservação
          </option>
          {ORDEM_DAS_CONSERVACOES.map((c) => (
            <option key={c} value={c}>
              {ROTULO_DA_OPCAO[c]}
            </option>
          ))}
        </select>
        <p id={idAjuda} className={AJUDA}>
          Onde o insumo fica guardado normalmente. Não é a categoria: coxa de frango é Proteína, congelada ou não.
        </p>
        {aConfirmar && (
          <p className="mt-1.5 text-[13px] text-atencao">
            Conservação a confirmar: este insumo está em Seco porque o sistema antigo assumia Seco quando ninguém escolhia. Confira e, se for outra, troque.
          </p>
        )}
        <Erro id={`${idBase}-conservacao-erro`} texto={erroDaConservacao} />
      </div>

      <fieldset className="min-w-0">
        <legend className={ROTULO}>
          Prazo de uso após abertura <span className="font-normal text-suave">(opcional)</span>
        </legend>
        <p id={`${idBase}-prazo-ajuda`} className="mb-2 text-[13px] leading-relaxed text-suave">
          Prazo para consumir o produto depois de abrir a embalagem, conforme orientação do fabricante e procedimento validado da operação. Não é a
          data de vencimento impressa no lote. Em branco, o prazo fica “não informado”.
        </p>
        <div aria-hidden className="mb-1 hidden grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-2 text-[12px] font-semibold text-suave sm:grid">
          <span>Quando fica em</span>
          <span className="text-right">Prazo</span>
          <span>Em</span>
        </div>
        <ul className="divide-y divide-linha border-y border-linha" aria-describedby={`${idBase}-prazo-ajuda`}>
          {ORDEM_DAS_CONSERVACOES.map((c) => {
            const l = linhas[c];
            const nome = CONSERVACOES[c];
            const chave = `validade-${c}`;
            const erro = erros[chave];
            return (
              <li key={c} className="py-2.5">
                <div className="grid grid-cols-[5.5rem_6.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]">
                  <label className="col-span-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:col-span-1 sm:min-h-[42px]">
                    <input
                      type="checkbox"
                      name={`aceita_${c}`}
                      checked={l.marcada}
                      onChange={(e) => mudar(c, { marcada: e.target.checked })}
                      className={MARCAR}
                    />
                    <IconeDaConservacao conservacao={c} />
                    <span className="text-texto">{ROTULO_DA_OPCAO[c]}</span>
                    {principal === c && <span className="text-[12px] text-suave">conservação principal</span>}
                  </label>
                  <div>
                    <label htmlFor={`${idBase}-${chave}`} className="sr-only">
                      Prazo de uso após abertura em {nome.toLowerCase()}
                    </label>
                    <input
                      id={`${idBase}-${chave}`}
                      name={`validade_${c}`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={l.quantidade}
                      onChange={(e) => mudar(c, { quantidade: e.target.value, ...(e.target.value.trim() && !l.marcada ? { marcada: true } : {}) })}
                      className={`${CAMPO} text-right tabular-nums`}
                      aria-invalid={!!erro}
                      aria-describedby={erro ? `${idBase}-${chave}-erro` : undefined}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${idBase}-${chave}-em`} className="sr-only">
                      Horas ou dias em {nome.toLowerCase()}
                    </label>
                    <select
                      id={`${idBase}-${chave}-em`}
                      name={`validadeEm_${c}`}
                      value={l.em}
                      onChange={(e) => mudar(c, { em: e.target.value === 'horas' ? 'horas' : 'dias' })}
                      className={CAMPO}
                    >
                      <option value="dias">dias</option>
                      <option value="horas">horas</option>
                    </select>
                  </div>
                </div>
                <Erro id={`${idBase}-${chave}-erro`} texto={erro} />
              </li>
            );
          })}
        </ul>
        <p className={AJUDA}>
          Marque só onde o insumo pode ficar. Se informar o prazo de uma conservação, informe também o da conservação principal. A data de vencimento do
          lote e a de abertura entram no recebimento e no controle de lote (ainda não existem no ERP).
        </p>
      </fieldset>
    </div>
  );
}
