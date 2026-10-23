'use client';

/**
 * Modo de preparo em ETAPAS numeradas (N.4), dentro do formulário da ficha. Cada etapa é um campo próprio; a numeração
 * é a posição. Adicionar, tirar, subir e descer por BOTÃO (toque e teclado; nada depende de arrastar). As etapas vão no
 * formulário como `passo` na ordem da tela: o servidor lê, limpa espaço sobrando e descarta etapa em branco.
 *
 * O texto antigo (`modoPreparo`) não some e não é dividido sozinho: quando a ficha tem, ele aparece guardado logo abaixo,
 * editável, e a pessoa pode COPIAR para as etapas (uma por linha) se quiser — para revisar antes de salvar. Ficha nova
 * não mostra o texto antigo.
 */

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { chaveDoPasso, LIMITES_DA_FICHA } from '@/lib/erp/ficha-campos';
import { AJUDA, CAMPO, Erro } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';

export function EditorDePassos({
  inicial,
  textoAnterior,
  erros,
  idBase,
  aoMudar,
}: {
  inicial: readonly string[];
  /** O modo de preparo antigo, em texto corrido ('' = não tem). */
  textoAnterior: string;
  erros: Partial<Record<string, string>>;
  idBase: string;
  aoMudar: () => void;
}) {
  const proxima = useRef(0);
  const nova = (texto = '') => ({ chave: proxima.current++, texto });
  const [passos, setPassos] = useState(() => (inicial.length ? inicial.map((t) => nova(t)) : [nova()]));
  const [anterior, setAnterior] = useState(textoAnterior);
  const [copiado, setCopiado] = useState(false);
  const refs = useRef(new Map<number, HTMLTextAreaElement>());
  const focar = (chave: number) => requestAnimationFrame(() => refs.current.get(chave)?.focus());

  const mudar = (fn: (ps: typeof passos) => typeof passos) => {
    setPassos(fn);
    aoMudar();
  };
  const mover = (i: number, para: number) =>
    mudar((ps) => {
      if (para < 0 || para >= ps.length) return ps;
      const n = [...ps];
      const [p] = n.splice(i, 1);
      n.splice(para, 0, p);
      focar(p.chave);
      return n;
    });
  const linhasDoAnterior = anterior
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {erros.passos && (
        <p id={`${idBase}-passos`} className="text-[13px] text-erro">
          {erros.passos}
        </p>
      )}
      <ol className="space-y-3">
        {passos.map((p, i) => {
          const id = `${idBase}-${chaveDoPasso(i)}`;
          const erro = erros[chaveDoPasso(i)];
          return (
            <li key={p.chave} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
              <span aria-hidden className="flex h-11 items-center justify-center font-display text-lg text-suave sm:h-[42px]">
                {i + 1}
              </span>
              <div className="min-w-0">
                <label htmlFor={id} className="sr-only">
                  Etapa {i + 1}
                </label>
                <textarea
                  id={id}
                  ref={(el) => {
                    if (el) refs.current.set(p.chave, el);
                    else refs.current.delete(p.chave);
                  }}
                  name="passo"
                  rows={2}
                  maxLength={LIMITES_DA_FICHA.passo}
                  value={p.texto}
                  onChange={(e) => {
                    const t = e.target.value;
                    mudar((ps) => ps.map((x) => (x.chave === p.chave ? { ...x, texto: t } : x)));
                  }}
                  placeholder={i === 0 ? 'Ex.: Selar o blend 2 min de cada lado.' : 'O que fazer nesta etapa'}
                  className={`${CAMPO} resize-y leading-relaxed`}
                  aria-invalid={!!erro}
                  aria-describedby={erro ? `${id}-erro` : undefined}
                />
                <Erro id={`${id}-erro`} texto={erro} />
              </div>
              <div className="col-start-2 flex gap-1 sm:col-start-3 sm:flex-col sm:gap-0.5">
                <button
                  type="button"
                  onClick={() => mover(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Subir a etapa ${i + 1}`}
                  className={classeDeBotao('fantasma', 'min-h-11 px-3 sm:min-h-9')}
                >
                  <ArrowUp size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, i + 1)}
                  disabled={i === passos.length - 1}
                  aria-label={`Descer a etapa ${i + 1}`}
                  className={classeDeBotao('fantasma', 'min-h-11 px-3 sm:min-h-9')}
                >
                  <ArrowDown size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    mudar((ps) => {
                      const resto = ps.length === 1 ? [nova()] : ps.filter((x) => x.chave !== p.chave);
                      focar(resto[Math.min(i, resto.length - 1)].chave);
                      return resto;
                    })
                  }
                  aria-label={`Tirar a etapa ${i + 1}`}
                  className={classeDeBotao('fantasma', 'min-h-11 px-3 sm:min-h-9')}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={() =>
          mudar((ps) => {
            const n = nova();
            focar(n.chave);
            return [...ps, n];
          })
        }
        disabled={passos.length >= LIMITES_DA_FICHA.passos}
        className={classeDeBotao('secundario')}
      >
        Adicionar etapa
      </button>
      <p className={AJUDA}>Uma ação por etapa. A ordem aqui é a ordem na ficha e na impressão. Etapa em branco não é gravada.</p>

      {textoAnterior && (
        <div className="mt-2 border-t border-linha pt-4">
          <label htmlFor={`${idBase}-modoPreparo`} className="text-[14px] font-medium text-texto">
            Texto anterior do modo de preparo
          </label>
          <p className={AJUDA.replace('mt-1.5', 'mt-0.5')}>
            Guardado como estava. Nada foi dividido sozinho: se quiser, copie para as etapas, revise e, quando não precisar mais, apague o texto daqui.
          </p>
          <textarea
            id={`${idBase}-modoPreparo`}
            name="modoPreparo"
            rows={5}
            maxLength={LIMITES_DA_FICHA.modoPreparo}
            value={anterior}
            onChange={(e) => {
              setAnterior(e.target.value);
              aoMudar();
            }}
            className={`${CAMPO} mt-2 resize-y leading-relaxed`}
            aria-invalid={!!erros.modoPreparo}
            aria-describedby={erros.modoPreparo ? `${idBase}-modoPreparo-erro` : undefined}
          />
          <Erro id={`${idBase}-modoPreparo-erro`} texto={erros.modoPreparo} />
          {linhasDoAnterior.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  mudar((ps) => [...ps.filter((x) => x.texto.trim()), ...linhasDoAnterior.slice(0, LIMITES_DA_FICHA.passos).map((t) => nova(t))].slice(0, LIMITES_DA_FICHA.passos));
                  setCopiado(true);
                }}
                // Uma vez por edição: copiar de novo duplicaria as etapas.
                disabled={copiado}
                className={classeDeBotao('secundario')}
              >
                {inicial.length ? 'Acrescentar às etapas (uma por linha)' : 'Copiar para as etapas (uma por linha)'}
              </button>
              {copiado && (
                <span role="status" className="text-[13px] text-suave">
                  Copiado para as etapas acima. Revise; nada foi salvo ainda.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
