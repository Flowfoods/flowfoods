'use client';

/**
 * O CNPJ da loja (F.1a): o destinatário das notas fiscais de compra. Só quem cadastra lojas (rede inteira) vê o controle; o
 * servidor confere de novo (permissão, dígitos verificadores, versão lida) e guarda o antes e o depois no histórico. Em branco
 * remove. O mesmo CNPJ em duas lojas é permitido (as duas operam na mesma empresa): a frase de depois avisa.
 */

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, type EstadoForm } from '../../ui/campos';

export function FormCnpj({
  acao,
  lojaId,
  nome,
  cnpj,
}: {
  acao: (anterior: EstadoForm, form: FormData) => Promise<EstadoForm>;
  lojaId: string;
  nome: string;
  /** O CNPJ como está gravado (só dígitos) ou vazio; formatado na tela. */
  cnpj: string;
}) {
  const [estado, enviar] = useFormState<EstadoForm, FormData>(acao, null);
  const id = `cnpj-${lojaId}`;
  const formatado = cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : cnpj;
  return (
    <details className="mt-1 text-[13px]" open={!!estado}>
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-suave underline decoration-linha-forte underline-offset-4 hover:text-texto [@media(pointer:coarse)]:min-h-11">
        CNPJ da loja
      </summary>
      <form action={enviar} noValidate className="mt-2 space-y-2 rounded-[10px] border border-linha bg-campo p-3">
        <input type="hidden" name="lido" value={cnpj} />
        <label htmlFor={id} className="block text-[12px] text-suave">
          CNPJ de {nome} (destinatário das notas fiscais)
        </label>
        <input
          id={id}
          name="cnpj"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          defaultValue={formatado}
          placeholder="00.000.000/0000-00"
          className={`${CAMPO} tabular-nums sm:max-w-xs`}
          aria-invalid={!!estado?.erros?.cnpj}
          aria-describedby={`${id}-ajuda${estado?.erros?.cnpj ? ` ${id}-erro` : ''}`}
        />
        <p id={`${id}-ajuda`} className={AJUDA}>
          Com ou sem pontos. Em branco remove. Duas lojas na mesma empresa podem ter o mesmo CNPJ.
        </p>
        <Erro id={`${id}-erro`} texto={estado?.erros?.cnpj} />
        <div className="flex flex-wrap items-center gap-3">
          <BotaoEnviar variante="secundario" pendente="Salvando…">
            Salvar CNPJ
          </BotaoEnviar>
          <p aria-live="polite" role="status" className="text-[13px]">
            {estado?.ok && estado.mensagem && <span className="text-ok">{estado.mensagem}</span>}
            {estado && !estado.ok && estado.erros?.geral && <span className="text-erro">{estado.erros.geral}</span>}
          </p>
        </div>
      </form>
    </details>
  );
}
