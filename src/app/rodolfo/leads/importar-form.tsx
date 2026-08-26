'use client';

import { useFormState } from 'react-dom';
import { acaoImportarJson, type Resposta } from '../actions';
import { BotaoSubmit, MensagemForm } from '../botoes';

const inicial: Resposta | null = null;

export function ImportarForm() {
  const [estado, acao] = useFormState(acaoImportarJson, inicial);

  return (
    <form action={acao} className="space-y-3">
      <div>
        <label htmlFor="lote" className="mb-1.5 block text-xs font-medium text-surface/60">
          Nome do lote
        </label>
        <input
          id="lote"
          name="lote"
          required
          placeholder="ZonaOeste-2026-08"
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm outline-none placeholder:text-surface/25 focus:border-bright"
        />
      </div>

      <div>
        <label htmlFor="linhas" className="mb-1.5 block text-xs font-medium text-surface/60">
          Linhas da planilha (JSON)
        </label>
        <textarea
          id="linhas"
          name="linhas"
          required
          rows={6}
          placeholder='[{"Nome":"…","Bairro":"…","Bloco":"A","Categoria":"…","Telefone/WhatsApp":"(21) 9…","Nota Google":"4,8","Avaliacoes":2936}]'
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-mono text-xs outline-none placeholder:text-surface/25 focus:border-bright"
        />
        <p className="mt-1.5 text-xs text-surface/45">
          Colunas exatas do <code>montar_pacote.py</code>, sem renomear. Conflito com o Bibi e
          opt-out são bloqueados na importação.
        </p>
      </div>

      <BotaoSubmit pendenteRotulo="Importando…" className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bright disabled:opacity-50 sm:w-auto sm:px-6">Importar</BotaoSubmit>

      <MensagemForm resposta={estado} />
    </form>
  );
}
