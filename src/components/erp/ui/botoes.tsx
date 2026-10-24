'use client';

/**
 * Botões do design system do ERP. Um único botão principal por contexto
 * (`acao`, #C41522: branco por cima dá ≈6:1; o #EA1D2C da marca não dá 4,5 em
 * texto de 14 px). Raio 7 px; 40 px no desktop, 44 px no celular. Estados:
 * hover, foco (anel do tokens.css), desabilitado e "em voo".
 *
 * React 18 / Next 14: o estado do form vem de `useFormState`/`useFormStatus`
 * do `react-dom` (`useActionState` é do React 19).
 */

import { useState, useTransition, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { classeDeBotao, classeDeBotaoDaCozinha, type Variante } from './estilos';

/** Envio de formulário: sabe se o form está em voo e impede duplo envio. */
export function BotaoEnviar({
  children,
  pendente = 'Salvando…',
  variante = 'primario',
  className = '',
  disabled = false,
  cozinha = false,
  nome,
  valor,
}: {
  children: ReactNode;
  /** Quando há mais de um botão de envio no mesmo formulário, qual deles foi apertado (`name`/`value` do botão). */
  nome?: string;
  valor?: string;
  pendente?: string;
  variante?: Variante;
  className?: string;
  disabled?: boolean;
  /** 3.3: o botão grande da tela da cozinha (56 px). */
  cozinha?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={nome}
      value={valor}
      disabled={pending || disabled}
      aria-busy={pending}
      className={cozinha ? classeDeBotaoDaCozinha(variante, className) : classeDeBotao(variante, className)}
    >
      {pending ? pendente : children}
    </button>
  );
}

/**
 * F5: envio com estado para botões que não têm a cara do design system (cartão de escolha, link "Sair", linha de menu).
 * Mesmo comportamento do `BotaoEnviar`: em voo fica desabilitado, `aria-busy` e, com `pendente`, troca o conteúdo.
 */
export function EnvioComEstado({ children, pendente, className = '', nome, valor }: { children: ReactNode; pendente?: ReactNode; className?: string; nome?: string; valor?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={nome} value={valor} disabled={pending} aria-busy={pending} className={`${className} disabled:cursor-progress disabled:opacity-70`}>
      {pending && pendente ? pendente : children}
    </button>
  );
}

export type RespostaDeAcao = { ok: boolean; mensagem: string };

/**
 * Botão que roda uma server action e mostra o resultado ali mesmo. O retorno
 * aparece na tela em vez de sumir: "não enviou" sem motivo visível é o que faz
 * alguém desconfiar da trava e desligá-la.
 */
export function BotaoAcao({
  acao,
  children,
  variante = 'secundario',
  confirmar,
  className = '',
}: {
  acao: () => Promise<RespostaDeAcao>;
  children: ReactNode;
  variante?: Variante;
  confirmar?: string;
  className?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<RespostaDeAcao | null>(null);

  return (
    <div className={className}>
      <button
        type="button"
        disabled={pendente}
        aria-busy={pendente}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          iniciar(async () => {
            try {
              setResposta(await acao());
            } catch (e) {
              setResposta({ ok: false, mensagem: e instanceof Error ? e.message : 'Falhou.' });
            }
          });
        }}
        className={classeDeBotao(variante, 'w-full')}
      >
        {pendente ? 'Executando…' : children}
      </button>
      <MensagemDeResposta resposta={resposta} className="mt-2" />
    </div>
  );
}

/** Resultado de uma action com `{ ok, mensagem }`. */
export function MensagemDeResposta({
  resposta,
  className = '',
}: {
  resposta: RespostaDeAcao | null;
  className?: string;
}) {
  if (!resposta) return null;
  return (
    <p
      role="status"
      className={`rounded-[7px] border px-3 py-2 text-[13px] ${
        resposta.ok ? 'border-ok/35 text-ok' : 'border-atencao/40 text-atencao'
      } ${className}`}
    >
      {resposta.mensagem}
    </p>
  );
}
