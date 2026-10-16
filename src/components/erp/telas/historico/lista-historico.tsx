/**
 * Lista de alterações (HistoricoAlteracao): quando, o quê, de quanto para
 * quanto, quem. Denso no desktop (4 colunas), empilhado no celular.
 */

import { rotuloAcao, rotuloEntidade, type LinhaDeHistorico } from '@/lib/erp/historico';

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/**
 * `doInsumo`: a lista mora no detalhe desse insumo. O nome dele não se repete
 * em toda linha ("Alterou insumo"; "Criou embalagem · Caixa 10 kg").
 */
function alvoVisivel(alvo: string | null, doInsumo?: string): string | null {
  if (!alvo || !doInsumo) return alvo;
  if (alvo === doInsumo) return null;
  return alvo.startsWith(`${doInsumo} · `) ? alvo.slice(doInsumo.length + 3) : alvo;
}

export function ListaHistorico({
  linhas,
  compacta = false,
  doInsumo,
}: {
  linhas: LinhaDeHistorico[];
  compacta?: boolean;
  doInsumo?: string;
}) {
  return (
    <ol>
      {linhas.map((h) => {
        const quando = QUANDO.format(h.ocorridoEm).replace(',', '');
        const oQue = (
          <>
            <span className="font-medium">{rotuloAcao(h.acao)}</span>{' '}
            <span className="text-suave">{rotuloEntidade(h.entidade).toLowerCase()}</span>
            {alvoVisivel(h.alvo, doInsumo) && <span className="text-texto"> · {alvoVisivel(h.alvo, doInsumo)}</span>}
          </>
        );
        return (
          <li
            key={h.id}
            className={`grid grid-cols-1 gap-x-4 gap-y-1 border-t border-linha px-5 py-3 text-sm first:border-t-0 ${
              compacta ? '' : 'sm:grid-cols-[112px_150px_minmax(0,1fr)_140px] sm:items-baseline'
            }`}
          >
            {/* Cabeçalho da linha: o quê à esquerda, quando à direita (celular e modo compacto). */}
            <div className={`flex items-baseline justify-between gap-3 text-texto ${compacta ? '' : 'sm:hidden'}`}>
              {/* Compacta (coluna estreita): o quê quebra linha em vez de cortar. */}
              <div className={`min-w-0 ${compacta ? '[overflow-wrap:anywhere]' : 'truncate'}`}>{oQue}</div>
              <time dateTime={h.ocorridoEm.toISOString()} className="shrink-0 text-[12px] tabular-nums text-suave">
                {quando}
              </time>
            </div>
            {!compacta && (
              <>
                <time
                  dateTime={h.ocorridoEm.toISOString()}
                  className="hidden text-[12px] tabular-nums text-suave sm:block"
                >
                  {quando}
                </time>
                <div className="hidden text-texto sm:block">{oQue}</div>
              </>
            )}
            <div className="min-w-0 text-[13px] text-suave">
              {h.mudancas.length === 0 && <span className="text-suave">—</span>}
              {h.mudancas.map((m) => (
                <div key={m.campo} className="[overflow-wrap:anywhere]">
                  <span className="text-suave">{m.campo}: </span>
                  {m.antes !== null && (
                    <>
                      <span className="text-suave line-through decoration-suave">{m.antes}</span>
                      <span aria-hidden className="mx-1.5 text-suave">
                        →
                      </span>
                      <span className="sr-only"> para </span>
                    </>
                  )}
                  <span className="tabular-nums text-texto">{m.depois}</span>
                </div>
              ))}
              {h.motivo && <div className="mt-0.5 text-[12px] italic text-suave">“{h.motivo}”</div>}
            </div>
            <div
              className={`truncate text-[12px] text-suave ${compacta ? '' : 'sm:text-right sm:text-[12px] sm:text-suave'}`}
            >
              {h.autorNome}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
