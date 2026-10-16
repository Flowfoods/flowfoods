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
 * `doCadastro`: a lista mora no detalhe desse insumo (ou ficha). O nome dele não se repete
 * em toda linha ("Alterou insumo"; "Criou embalagem · Caixa 10 kg").
 */
function alvoVisivel(alvo: string | null, doCadastro?: string): string | null {
  if (!alvo || !doCadastro) return alvo;
  if (alvo === doCadastro) return null;
  return alvo.startsWith(`${doCadastro} · `) ? alvo.slice(doCadastro.length + 3) : alvo;
}

export function ListaHistorico({
  linhas,
  compacta = false,
  doCadastro,
  titulos,
}: {
  linhas: LinhaDeHistorico[];
  compacta?: boolean;
  doCadastro?: string;
  /**
   * Dentro do detalhe de um documento, a ação vira o estado dele ("Pedida",
   * "Entregue"): quem lê o histórico da requisição quer saber o que ACONTECEU
   * com ela; o nome de quem fez já vem embaixo.
   */
  titulos?: Readonly<Record<string, string>>;
}) {
  return (
    <ol>
      {linhas.map((h) => {
        const quando = QUANDO.format(h.ocorridoEm).replace(',', '');
        const titulo = titulos?.[h.acao];
        const oQue = titulo ? (
          <span className="font-medium">{titulo}</span>
        ) : (
          <>
            <span className="font-medium">{rotuloAcao(h.acao)}</span>{' '}
            <span className="text-suave">{rotuloEntidade(h.entidade).toLowerCase()}</span>
            {alvoVisivel(h.alvo, doCadastro) && <span className="text-texto"> · {alvoVisivel(h.alvo, doCadastro)}</span>}
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
              {h.mudancas.map((m, k) => (
                <div key={k} className="[overflow-wrap:anywhere]">
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
