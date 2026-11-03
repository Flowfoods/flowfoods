'use client';

/**
 * Campo de senha com o botão de mostrar e ocultar (decisão 515), usado no
 * /entrar, no link de senha e no login do /rodolfo. Só interface: a senha fica
 * no próprio campo — nada de estado com o valor, registro ou armazenamento.
 *
 * - O botão é `type="button"`: nunca envia o formulário e não tem `name`, então
 *   não vai junto no envio.
 * - O nome acessível é fixo ("Mostrar senha"); o estado vai no `aria-pressed`.
 *   Trocar o nome E marcar pressionado diria duas vezes a mesma coisa.
 * - Cada carregamento da página começa oculto; durante a tentativa vale o que
 *   a pessoa escolheu (erro de senha não esconde de novo).
 * - Visível, o campo vira texto comum: sem corretor, maiúscula automática nem
 *   verificação ortográfica, que pode mandar o texto a um serviço de fora.
 * - O clique com mouse ou dedo não tira o foco do campo, e a posição do cursor
 *   (ou o trecho selecionado) volta depois da troca de tipo.
 */

import { useRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  id: string;
  /** Nome do botão para quem usa leitor de tela, um por campo ("Mostrar senha repetida"). */
  rotuloDoBotao?: string;
};

export function CampoDeSenha({ id, rotuloDoBotao = 'Mostrar senha', className = '', ...campo }: Props) {
  const [visivel, setVisivel] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function alternar() {
    const c = ref.current;
    setVisivel((v) => !v);
    if (!c || document.activeElement !== c || c.selectionStart === null || c.selectionEnd === null) return;
    const [inicio, fim] = [c.selectionStart, c.selectionEnd];
    // O Chrome leva o cursor ao início quando o tipo muda depois de um clique, e
    // devolver na hora não fica: devolve no quadro seguinte, já com o tipo novo.
    requestAnimationFrame(() => {
      if (document.activeElement === c) c.setSelectionRange(inicio, fim);
    });
  }

  return (
    <div className="relative">
      <input
        {...campo}
        ref={ref}
        id={id}
        type={visivel ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={`${className} pr-12`}
      />
      <button
        type="button"
        aria-controls={id}
        aria-pressed={visivel}
        aria-label={rotuloDoBotao}
        onMouseDown={(e) => e.preventDefault()}
        onClick={alternar}
        className="ff-transicao absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[7px] text-suave hover:text-texto aria-pressed:text-texto"
      >
        {visivel ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
}
