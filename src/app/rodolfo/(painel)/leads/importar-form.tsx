'use client';

import { useFormState } from 'react-dom';
import { BotaoEnviar, MensagemDeResposta } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, ROTULO } from '@/components/erp/ui/campos';
import { acaoImportarJson, type Resposta } from '../actions';

const inicial: Resposta | null = null;

export function ImportarForm() {
  const [estado, acao] = useFormState(acaoImportarJson, inicial);

  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="lote" className={ROTULO}>
          Nome do lote
        </label>
        <input id="lote" name="lote" required placeholder="ZonaOeste-2026-08" className={CAMPO} />
      </div>

      <div>
        <label htmlFor="linhas" className={ROTULO}>
          Linhas da planilha (JSON)
        </label>
        <textarea
          id="linhas"
          name="linhas"
          required
          rows={6}
          placeholder='[{"Nome":"…","Bairro":"…","Bloco":"A","Categoria":"…","Telefone/WhatsApp":"(21) 9…","Nota Google":"4,8","Avaliacoes":2936}]'
          className={`${CAMPO} py-2.5 font-mono text-[13px]`}
        />
        <p className={AJUDA}>
          Colunas exatas do <code>montar_pacote.py</code>, sem renomear. Conflito com o Bibi e opt-out são bloqueados na
          importação.
        </p>
      </div>

      <BotaoEnviar pendente="Importando…" className="w-full sm:w-auto">
        Importar lote
      </BotaoEnviar>

      <MensagemDeResposta resposta={estado} />
    </form>
  );
}
