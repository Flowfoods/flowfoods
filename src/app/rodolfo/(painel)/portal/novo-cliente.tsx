'use client';

/**
 * Cadastrar um cliente no Portal (decisão 477): o nome, o questionário e a confirmação da marca. Cada questionário é de uma
 * marca e cita a marca nas perguntas: nenhum vem marcado, e a tela pede para confirmar que o cliente é daquela marca. O
 * endereço e o link nascem no servidor; depois de cadastrar, abre a página do cliente com o link para copiar.
 */

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { acaoCadastrarCliente } from './actions';
import type { Resposta } from '../actions';
import { BotaoEnviar, MensagemDeResposta } from '@/components/erp/ui/botoes';
import { AJUDA, CAMPO, MARCAR, ROTULO } from '@/components/erp/ui/campos';

const inicial: Resposta | null = null;

export function NovoCliente({ questionarios }: { questionarios: { chave: string; rotulo: string; marca: string }[] }) {
  const [estado, acao] = useFormState(acaoCadastrarCliente, inicial);
  const [escolhido, setEscolhido] = useState('');
  const marca = questionarios.find((q) => q.chave === escolhido)?.marca ?? null;
  return (
    <form action={acao} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="novo-nome" className={ROTULO}>
            Nome do cliente
          </label>
          <input id="novo-nome" name="nome" required minLength={2} maxLength={80} autoComplete="off" autoCapitalize="words" className={CAMPO} placeholder="Ex.: Hamburgueria do Bairro" />
          <p className={AJUDA}>É o título que o cliente vê no formulário e não se muda pela tela: confira a grafia.</p>
        </div>
        <div>
          <label htmlFor="novo-questionario" className={ROTULO}>
            Questionário
          </label>
          <select id="novo-questionario" name="questionario" required className={CAMPO} value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
            <option value="" disabled>
              Escolha o questionário
            </option>
            {questionarios.map((q) => (
              <option key={q.chave} value={q.chave}>
                {q.rotulo}
              </option>
            ))}
          </select>
          <p className={AJUDA}>Cada questionário é de uma marca. Questionário de outra marca entra pelo repositório (docs/PORTAL.md).</p>
        </div>
      </div>
      {marca && (
        // A chave refaz a caixa ao trocar de questionário: a confirmação de uma marca não vale para outra.
        <label key={escolhido} className="flex items-start gap-3 rounded-[7px] border border-linha bg-texto/[0.03] p-3">
          <input type="checkbox" name="confirmaMarca" required className={`${MARCAR} mt-0.5`} />
          <span className="text-sm">
            <span className="block font-semibold">Confirmo que este cliente é do {marca}</span>
            <span className="mt-0.5 block text-[13px] text-suave">As perguntas citam o {marca}: um cliente de outra marca leria o nome errado.</span>
          </span>
        </label>
      )}
      <BotaoEnviar pendente="Cadastrando…">Cadastrar e gerar o link</BotaoEnviar>
      <MensagemDeResposta resposta={estado} />
    </form>
  );
}
