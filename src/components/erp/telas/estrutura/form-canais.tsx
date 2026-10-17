'use client';

/**
 * Em quais canais a loja vende (2.1): Loja, Delivery próprio e iFood. A unidade
 * só delivery desliga a Loja, e o calendário do faturamento deixa de cobrar
 * salão. Só quem cadastra lojas (rede inteira) vê o controle; o servidor
 * confere de novo e guarda o antes e o depois no histórico. Desligar um canal
 * não apaga o que já foi lançado nele.
 */

import { useFormState } from 'react-dom';
import { CANAIS } from '@/lib/erp/canal-campos';
import { CANAIS_EM_ORDEM, type CanalVenda } from '@/lib/erp/faturamento-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { MARCAR } from '../../ui/campos';
import type { AcaoDosCanais, EstadoDosCanais } from '../faturamento/estado';

export function FormCanais({ acao, nome, canais }: { acao: AcaoDosCanais; nome: string; canais: readonly CanalVenda[] }) {
  const [estado, enviar] = useFormState<EstadoDosCanais, FormData>(acao, null);
  return (
    <details className="mt-1 text-[13px]">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-suave underline decoration-linha-forte underline-offset-4 hover:text-texto">
        Canais de venda
      </summary>
      <form action={enviar} className="mt-2 space-y-2 rounded-[10px] border border-linha bg-campo p-3">
        <input type="hidden" name="lidos" value={canais.join(',')} />
        <fieldset className="space-y-1">
          <legend className="mb-1 text-[12px] text-suave">Onde {nome} vende</legend>
          {CANAIS_EM_ORDEM.map((c) => (
            <label key={c} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-texto">
              <input type="checkbox" name={`canal_${c}`} defaultChecked={canais.includes(c)} className={MARCAR} />
              {CANAIS[c].rotulo}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <BotaoEnviar variante="secundario" pendente="Salvando…">
            Salvar canais
          </BotaoEnviar>
          <p aria-live="polite" className="text-[13px]">
            {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
            {estado && !estado.ok && estado.erros?.geral && <span className="text-erro">{estado.erros.geral}</span>}
          </p>
        </div>
      </form>
    </details>
  );
}
