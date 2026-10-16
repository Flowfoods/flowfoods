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

export function ListaHistorico({ linhas, compacta = false }: { linhas: LinhaDeHistorico[]; compacta?: boolean }) {
  return (
    <ol>
      {linhas.map((h) => {
        const quando = QUANDO.format(h.ocorridoEm).replace(',', '');
        const oQue = (
          <>
            <span className="font-medium">{rotuloAcao(h.acao)}</span>{' '}
            <span className="text-surface/55">{rotuloEntidade(h.entidade).toLowerCase()}</span>
          </>
        );
        return (
          <li
            key={h.id}
            className={`grid gap-x-4 gap-y-1 border-t border-white/[0.06] px-5 py-3 text-sm first:border-t-0 ${
              compacta ? '' : 'sm:grid-cols-[112px_150px_minmax(0,1fr)_140px] sm:items-baseline'
            }`}
          >
            {/* Cabeçalho da linha: o quê à esquerda, quando à direita (celular e modo compacto). */}
            <div className={`flex items-baseline justify-between gap-3 text-surface ${compacta ? '' : 'sm:hidden'}`}>
              <div className="min-w-0 truncate">{oQue}</div>
              <time dateTime={h.ocorridoEm.toISOString()} className="shrink-0 text-[12px] tabular-nums text-surface/45">
                {quando}
              </time>
            </div>
            {!compacta && (
              <>
                <time
                  dateTime={h.ocorridoEm.toISOString()}
                  className="hidden text-[12px] tabular-nums text-surface/45 sm:block"
                >
                  {quando}
                </time>
                <div className="hidden text-surface sm:block">{oQue}</div>
              </>
            )}
            <div className="min-w-0 text-[13px] text-surface/70">
              {h.mudancas.length === 0 && <span className="text-surface/35">—</span>}
              {h.mudancas.map((m) => (
                <div key={m.campo} className="[overflow-wrap:anywhere]">
                  <span className="text-surface/40">{m.campo}: </span>
                  {m.antes !== null && (
                    <>
                      <span className="text-surface/50 line-through decoration-surface/25">{m.antes}</span>
                      <span aria-hidden className="mx-1.5 text-surface/30">
                        →
                      </span>
                      <span className="sr-only"> para </span>
                    </>
                  )}
                  <span className="tabular-nums text-surface">{m.depois}</span>
                </div>
              ))}
              {h.motivo && <div className="mt-0.5 text-[12px] italic text-surface/50">“{h.motivo}”</div>}
            </div>
            <div
              className={`truncate text-[11px] text-surface/40 ${compacta ? '' : 'sm:text-right sm:text-[12px] sm:text-surface/45'}`}
            >
              {h.autorNome}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
