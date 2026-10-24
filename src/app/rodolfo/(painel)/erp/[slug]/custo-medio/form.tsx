'use client';

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '@/components/erp/ui/botoes';
import { Erro, MARCAR, Resultado, type EstadoForm } from '@/components/erp/ui/campos';
import { acaoLigarCustoMedio } from '../../actions';

/** Ligar o custo médio numa loja: pede a confirmação de que o impacto foi lido. Não tem volta (o livro segue para a frente). */
export function FormLigarCustoMedio({ slug, lojaId, loja }: { slug: string; lojaId: string; loja: string }) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acaoLigarCustoMedio.bind(null, slug, lojaId), null);
  const id = `li-${lojaId}`;
  return (
    <form action={enviar} noValidate className="space-y-3 border-t border-linha pt-4">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[14px] text-texto">
        <input id={id} type="checkbox" name="li" value="sim" className={`${MARCAR} mt-0.5`} aria-describedby={`${id}-erro`} />
        <span>Li o impacto da {loja}. Daqui para a frente, as saídas e o fechamento desta loja valem pelo custo médio dela; o que já foi gravado não muda.</span>
      </label>
      <Erro id={`${id}-erro`} texto={estado?.erros?.li} />
      <Erro id={`${id}-geral`} texto={estado?.erros?.geral} />
      <BotaoEnviar>Ligar o custo médio nesta loja</BotaoEnviar>
      <Resultado estado={estado} />
    </form>
  );
}
