'use client';

/**
 * Central de Integrações — o aviso do que acabou de acontecer (`?feito=`), um canal só para todo sucesso na página do
 * parceiro. Ao aparecer, recebe o foco (no celular a página volta rolada; o foco traz o aviso para a tela e o leitor de tela
 * anuncia) e o `?feito` sai do endereço (recarregar não repete um aviso velho). Some no próximo envio de formulário.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Aviso } from '@/components/erp/ui/superficies';

export function AvisoDoFeito({ texto }: { texto: string | null }) {
  const [mostrado, setMostrado] = useState<string | null>(texto);
  const caixa = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const caminho = usePathname();

  useEffect(() => {
    if (!texto) return;
    setMostrado(texto);
    requestAnimationFrame(() => caixa.current?.focus());
    router.replace(caminho, { scroll: false });
  }, [texto, caminho, router]);

  useEffect(() => {
    const limpar = () => setMostrado(null);
    document.addEventListener('submit', limpar, true);
    return () => document.removeEventListener('submit', limpar, true);
  }, []);

  if (!mostrado) return null;
  return (
    <div ref={caixa} tabIndex={-1} className="scroll-mt-24 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ff-acao))]">
      <Aviso tom="ok" titulo={mostrado} />
    </div>
  );
}
