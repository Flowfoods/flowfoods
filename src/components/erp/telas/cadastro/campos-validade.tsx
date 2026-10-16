'use client';

/**
 * Bloco "onde fica e quanto dura" (1.4), o MESMO no formulário da ficha
 * técnica e no do insumo. Uma linha por conservação: marcar, quanto dura
 * (número inteiro + dias ou horas) e qual é a principal. Vai como texto; o
 * servidor converte para minutos e confere (`lerValidades`).
 *
 * Ajudas da tela (o servidor decide do mesmo jeito): digitar o número marca a
 * linha; marcar a primeira faz dela a principal; desmarcar a principal passa
 * a principal para outra marcada. Na ficha, a principal só vale entre as
 * marcadas; no insumo ela existe sempre (é onde se guarda).
 */

import { useState } from 'react';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, validadesParaCampos, type Conservacao, type EmQue, type Validades } from '@/lib/erp/validade';
import { AJUDA, CAMPO, Erro, MARCAR } from '../../ui/campos';
import { IconeDaConservacao } from './validade';

type Linha = { marcada: boolean; quantidade: string; em: EmQue };

export function CamposDeValidade({
  para,
  inicial,
  erros,
  idBase,
  aoMudar,
}: {
  para: 'ficha' | 'insumo';
  inicial: Validades | null;
  erros: Partial<Record<string, string>>;
  idBase: string;
  aoMudar?: () => void;
}) {
  const campos = validadesParaCampos(inicial);
  const [linhas, setLinhas] = useState<Record<Conservacao, Linha>>(() => {
    const l = {} as Record<Conservacao, Linha>;
    for (const c of ORDEM_DAS_CONSERVACOES) l[c] = campos[c];
    return l;
  });
  const [principal, setPrincipal] = useState<Conservacao | null>(campos.principal ?? (para === 'insumo' ? 'SECO' : null));

  function mudar(c: Conservacao, m: Partial<Linha>) {
    const novas = { ...linhas, [c]: { ...linhas[c], ...m } };
    setLinhas(novas);
    if (m.marcada === true && (!principal || !linhas[principal].marcada)) setPrincipal(c);
    else if (m.marcada === false && principal === c) {
      setPrincipal(ORDEM_DAS_CONSERVACOES.find((x) => novas[x].marcada) ?? (para === 'insumo' ? c : null));
    }
    aoMudar?.();
  }

  const erroGeral = erros.conservacao;
  return (
    <fieldset className="min-w-0" aria-describedby={erroGeral ? `${idBase}-conservacao-erro` : undefined}>
      <legend className="sr-only">Onde fica e quanto dura</legend>
      <input type="hidden" name="validadeNoFormulario" value="sim" />
      <div aria-hidden className="mb-1 hidden grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_6.5rem] gap-2 text-[12px] font-semibold text-suave sm:grid">
        <span>Onde fica</span>
        <span className="text-right">Dura</span>
        <span />
        <span>Principal</span>
      </div>
      <ul id={`${idBase}-conservacao`} tabIndex={-1} className="divide-y divide-linha border-y border-linha">
        {ORDEM_DAS_CONSERVACOES.map((c) => {
          const l = linhas[c];
          const nome = CONSERVACOES[c];
          const chave = `validade-${c}`;
          const erro = erros[chave];
          const podeSerPrincipal = para === 'insumo' || l.marcada;
          return (
            <li key={c} className="py-2.5">
              <div className="grid grid-cols-[5.5rem_6.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_6.5rem]">
                <label className="col-span-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:col-span-1 sm:min-h-[42px]">
                  <input
                    type="checkbox"
                    name={`aceita_${c}`}
                    checked={l.marcada}
                    onChange={(e) => mudar(c, { marcada: e.target.checked })}
                    className={MARCAR}
                  />
                  <IconeDaConservacao conservacao={c} />
                  <span className="text-texto">{nome}</span>
                </label>
                <div>
                  <label htmlFor={`${idBase}-${chave}`} className="sr-only">
                    Quanto dura em {nome.toLowerCase()}
                  </label>
                  <input
                    id={`${idBase}-${chave}`}
                    name={`validade_${c}`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={c === 'PISTA_FRIA' ? '6' : '3'}
                    value={l.quantidade}
                    onChange={(e) => mudar(c, { quantidade: e.target.value, ...(e.target.value.trim() && !l.marcada ? { marcada: true } : {}) })}
                    className={`${CAMPO} text-right tabular-nums`}
                    aria-invalid={!!erro}
                    aria-describedby={erro ? `${idBase}-${chave}-erro` : undefined}
                  />
                </div>
                <div>
                  <label htmlFor={`${idBase}-${chave}-em`} className="sr-only">
                    Dias ou horas em {nome.toLowerCase()}
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
                <label
                  className={`flex min-h-11 items-center gap-2 text-[13px] sm:min-h-[42px] ${podeSerPrincipal ? 'cursor-pointer text-texto' : 'text-suave'}`}
                >
                  <input
                    type="radio"
                    name="conservacao"
                    value={c}
                    checked={principal === c}
                    disabled={!podeSerPrincipal}
                    onChange={() => {
                      setPrincipal(c);
                      aoMudar?.();
                    }}
                    className={MARCAR}
                  />
                  Principal
                </label>
              </div>
              <Erro id={`${idBase}-${chave}-erro`} texto={erro} />
            </li>
          );
        })}
      </ul>
      <Erro id={`${idBase}-conservacao-erro`} texto={erroGeral} />
      <p className={AJUDA}>
        {para === 'ficha'
          ? 'Marque onde pode ficar e quanto dura em cada lugar. Principal é onde fica normalmente. Pista fria costuma ser em horas.'
          : 'Principal é onde se guarda. Validade depois de aberto (opcional); a do fabricante vem no lote.'}
      </p>
    </fieldset>
  );
}
