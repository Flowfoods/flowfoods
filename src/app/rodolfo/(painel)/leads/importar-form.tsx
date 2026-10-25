'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { BotaoEnviar, MensagemDeResposta } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, ROTULO } from '@/components/erp/ui/campos';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { acaoImportarJson, type Resposta } from '../actions';

const inicial: Resposta | null = null;

export function ImportarForm() {
  const [estado, acao] = useFormState(acaoImportarJson, inicial);
  const form = useRef<HTMLFormElement>(null);

  // Importou: o formulário volta limpo. Um segundo toque com o mesmo conteúdo duplicaria as linhas sem telefone, que
  // não têm chave para reconhecer (decisão 468).
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);

  return (
    <form ref={form} action={acao} className="space-y-4">
      <div>
        <label htmlFor="lote" className={ROTULO}>
          Nome do lote
        </label>
        <input id="lote" name="lote" required placeholder="Zona Oeste, outubro de 2026" className={CAMPO} />
      </div>

      <div>
        <label htmlFor="linhas" className={ROTULO}>
          Cole o conteúdo exportado pelo ledsflowfoods
        </label>
        <textarea id="linhas" name="linhas" required rows={6} placeholder="Cole aqui, sem editar" className={`${CAMPO} py-2.5 font-mono text-[13px]`} />
        <p className={AJUDA}>Cole sem editar: o sistema lê as colunas com os nomes que o ledsflowfoods exporta.</p>
      </div>

      <BotaoEnviar pendente="Importando…" className="w-full sm:w-auto">
        Importar leads
      </BotaoEnviar>

      <MensagemDeResposta resposta={estado} />
      {estado?.ok && (
        <Link href="/rodolfo/leads" className={classeDeBotao('secundario', 'w-full sm:w-auto')}>
          Ver os leads
        </Link>
      )}
    </form>
  );
}
