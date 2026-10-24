'use client';

/**
 * F4 — "Alterar categoria" na própria lista de insumos. Marque um ou vários insumos DESTA página (as caixas ficam nas
 * linhas, ligadas a este formulário pelo atributo `form`), escolha o destino, revise o resumo e confirme. Nada se aplica
 * fora do que está marcado; o servidor confere a permissão, a categoria e cada insumo de novo, e registra no histórico
 * (a mesma regra da edição em lote da fila de revisão).
 */

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import type { OpcaoDeCategoria } from '@/lib/erp/categorias';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { FORM_DA_SELECAO } from './selecao';


interface Marcado {
  id: string;
  categoria: string;
}

function lerMarcados(): Marcado[] {
  const vistos = new Map<string, string>();
  document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_DA_SELECAO}"][name="ids"]:checked`).forEach((c) => vistos.set(c.value, c.dataset.categoria ?? 'Sem categoria'));
  return Array.from(vistos, ([id, categoria]) => ({ id, categoria }));
}

function marcarTodos(marcar: boolean) {
  document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_DA_SELECAO}"][name="ids"]`).forEach((c) => {
    c.checked = marcar;
  });
  document.dispatchEvent(new Event('change'));
}

export function BarraDeCategoria({ categorias, acao, de }: { categorias: OpcaoDeCategoria[]; acao: AcaoDeCadastro; de: string }) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const [marcados, setMarcados] = useState<Marcado[]>([]);
  const [destino, setDestino] = useState('');
  const [revisando, setRevisando] = useState(false);

  useEffect(() => {
    const atualizar = () => {
      setMarcados(lerMarcados());
      setRevisando(false);
    };
    document.addEventListener('change', atualizar);
    return () => document.removeEventListener('change', atualizar);
  }, []);

  const ativas = categorias.filter((c) => c.ativa);
  const nomeDoDestino = ativas.find((c) => c.id === destino)?.nome;
  const porCategoria = Array.from(
    marcados.reduce((m, x) => m.set(x.categoria, (m.get(x.categoria) ?? 0) + 1), new Map<string, number>()),
  );
  const erro = estado && !estado.ok ? (estado.erros?.geral ?? Object.values(estado.erros ?? {})[0]) : null;

  return (
    <form id={FORM_DA_SELECAO} action={enviar} aria-label="Alterar a categoria dos insumos marcados">
      <input type="hidden" name="de" value={de} />
      <input type="hidden" name="categoriaId" value={destino} />
      {marcados.length > 0 && (
        <div className="sticky bottom-3 z-20 rounded-[12px] border border-linha-forte bg-fundo p-3 shadow-lg sm:p-4" role="region" aria-label="Insumos marcados">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <p className="text-sm text-texto lg:flex-1" aria-live="polite">
              <strong className="font-semibold">
                {marcados.length} {marcados.length === 1 ? 'insumo marcado' : 'insumos marcados'}
              </strong>{' '}
              <span className="text-suave">nesta página (a marcação não passa para outras páginas).</span>
            </p>
            {!revisando ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label htmlFor="destino-da-categoria" className="sr-only">
                  Nova categoria
                </label>
                <select id="destino-da-categoria" value={destino} onChange={(e) => setDestino(e.target.value)} className={`${CAMPO} pr-8 sm:w-64`}>
                  <option value="">Mudar para a categoria…</option>
                  {ativas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button type="button" className={classeDeBotao('primario')} disabled={!destino} onClick={() => setRevisando(true)}>
                  Revisar
                </button>
                <button type="button" className={classeDeBotao('secundario')} onClick={() => marcarTodos(false)}>
                  Desmarcar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-sm text-texto">
                  {porCategoria.map(([nome, n]) => `${n} em “${nome}”`).join(', ')} → “{nomeDoDestino}”.
                </p>
                <BotaoEnviar pendente="Aplicando…">Confirmar</BotaoEnviar>
                <button type="button" className={classeDeBotao('secundario')} onClick={() => setRevisando(false)}>
                  Voltar
                </button>
              </div>
            )}
          </div>
          {erro && (
            <p role="alert" className="mt-2 text-[13px] text-erro">
              {erro}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

/** "Marcar todos desta página": botão pequeno no topo da lista (só com a barra). */
export function MarcarTodosDaPagina() {
  const [todos, setTodos] = useState(false);
  return (
    <button
      type="button"
      className={classeDeBotao('fantasma', 'px-2 text-[13px]')}
      onClick={() => {
        marcarTodos(!todos);
        setTodos(!todos);
      }}
    >
      {todos ? 'Desmarcar todos desta página' : 'Marcar todos desta página'}
    </button>
  );
}
