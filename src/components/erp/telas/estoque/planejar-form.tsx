'use client';

/**
 * O formulário do planejamento (1.7): a lista por lugar com a caixa de marcar
 * (linha inteira clicável, 48 px), "marcar o lugar todo", quantos estão
 * marcados e o "Começar a contagem". O servidor confere tudo de novo
 * (`iniciarCiclo`): insumo noutra contagem aberta, lista vazia, permissão.
 */

import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { CONSERVACOES, ORDEM_DAS_CONSERVACOES, type Conservacao } from '@/lib/erp/validade';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Vazio } from '../../ui/superficies';
import { IconeDaConservacao } from '../cadastro/validade';
import type { AcaoDeEstoque, EstadoEstoque } from './estado';

export interface LinhaParaPlanejar {
  insumoId: string;
  nome: string;
  conservacao: Conservacao;
  apoio: string;
  vencido: boolean;
  quantidade: string;
  valor: string;
  emOutraContagem: string | null;
  sugerido: boolean;
}

export function FormPlanejarCiclo({ linhas, lugar, acao, bloqueio }: { linhas: LinhaParaPlanejar[]; lugar: Conservacao | ''; acao: AcaoDeEstoque; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.sugerido).map((l) => l.insumoId)));
  const visiveis = useMemo(() => linhas.filter((l) => !lugar || l.conservacao === lugar), [linhas, lugar]);
  const grupos = ORDEM_DAS_CONSERVACOES.map((c) => ({ c, linhas: visiveis.filter((l) => l.conservacao === c) })).filter((g) => g.linhas.length > 0);
  const trocar = (id: string, sim: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (sim) n.add(id);
      else n.delete(id);
      return n;
    });
  const marcarGrupo = (ids: string[], sim: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      for (const id of ids) {
        if (sim) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const total = Array.from(marcados).filter((id) => visiveis.some((l) => l.insumoId === id)).length;

  if (visiveis.length === 0) return <Vazio titulo="Nenhum insumo neste lugar.">Escolha outro lugar.</Vazio>;

  return (
    <form action={enviar} className="space-y-4">
      {grupos.map((g) => {
        const livres = g.linhas.filter((l) => !l.emOutraContagem).map((l) => l.insumoId);
        const todosMarcados = livres.length > 0 && livres.every((id) => marcados.has(id));
        const nMarcados = g.linhas.filter((l) => marcados.has(l.insumoId)).length;
        return (
          <section key={g.c} aria-labelledby={`lugar-${g.c}`} className="overflow-hidden rounded-[14px] border border-linha bg-painel">
            <header className="flex min-h-12 items-center justify-between gap-2 border-b border-linha px-4 py-2 sm:px-5">
              <h2 id={`lugar-${g.c}`} className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-texto">
                <IconeDaConservacao conservacao={g.c} />
                <span className="min-w-0">
                  {CONSERVACOES[g.c]}
                  <span className="block font-normal tabular-nums text-suave sm:ml-1.5 sm:inline">
                    {nMarcados} de {g.linhas.length} marcados
                  </span>
                </span>
              </h2>
              {livres.length > 0 && !bloqueio && (
                <button type="button" onClick={() => marcarGrupo(livres, !todosMarcados)} className={classeDeBotao('fantasma', 'min-h-11 shrink-0 px-3 text-[13px]')}>
                  {todosMarcados ? 'Desmarcar o lugar' : 'Marcar o lugar todo'}
                </button>
              )}
            </header>
            <ul className="divide-y divide-linha">
              {g.linhas.map((l) => {
                const preso = !!l.emOutraContagem;
                return (
                  <li key={l.insumoId}>
                    <label className={`flex min-h-12 items-center gap-3 px-4 py-2.5 sm:px-5 ${preso || bloqueio ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-texto/[0.03]'}`}>
                      <input
                        type="checkbox"
                        name="insumo"
                        value={l.insumoId}
                        checked={marcados.has(l.insumoId)}
                        disabled={preso || !!bloqueio}
                        onChange={(e) => trocar(l.insumoId, e.target.checked)}
                        className={MARCAR}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-texto">{l.nome}</span>
                        <span className={`block text-[12px] ${l.vencido ? 'text-atencao' : 'text-suave'}`}>{preso ? `Já está na contagem “${l.emOutraContagem}”` : l.apoio}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block text-sm font-semibold text-texto">{l.quantidade}</span>
                        <span className="block text-[12px] text-suave">{l.valor}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div data-barra-fixa className="sticky bottom-0 z-20 -mx-4 border-t border-linha bg-fundo px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {bloqueio ? (
          <p className="text-sm text-suave">{bloqueio}</p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* No celular, o nome sai da frente (é opcional; o automático diz o lugar e quantos). */}
            <div className="hidden min-w-0 flex-1 sm:block">
              <label htmlFor="ciclo-titulo" className={ROTULO}>
                Nome da contagem <span className="font-normal text-suave">(opcional)</span>
              </label>
              <input id="ciclo-titulo" name="titulo" maxLength={120} autoComplete="off" placeholder={lugar ? `${CONSERVACOES[lugar]} · ${total} insumos` : `${total} insumos`} className={CAMPO} aria-describedby="ciclo-titulo-ajuda" />
              <p id="ciclo-titulo-ajuda" className={AJUDA}>
                Prazo: até o fim de amanhã. Depois disso ela fecha sem mexer no estoque.
              </p>
            </div>
            <BotaoEnviar pendente="Começando…" className="w-full sm:w-auto" disabled={total === 0}>
              {total === 0 ? 'Marque o que contar' : `Começar a contagem (${total})`}
            </BotaoEnviar>
            <p className="text-[12px] text-suave sm:hidden">Prazo: até o fim de amanhã.</p>
          </div>
        )}
        <Erro id="ciclo-erro-lista" texto={estado?.erros.lista} />
        {estado?.erros.geral && (
          <p role="alert" className="mt-1 text-[13px] text-erro">
            {estado.erros.geral}
          </p>
        )}
      </div>
    </form>
  );
}
