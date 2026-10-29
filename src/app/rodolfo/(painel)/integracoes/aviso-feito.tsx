'use client';

/**
 * Central de Integrações — o aviso do que acabou de acontecer (`?feito=`), um canal só para todo sucesso na página do
 * parceiro. Depois que o aviso aparece na página, recebe o foco (no celular a página volta rolada; o foco traz o aviso para a
 * tela e o leitor de tela anuncia) e o `?feito` sai do endereço (recarregar não repete um aviso velho). Some no próximo envio
 * de formulário.
 */

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Aviso } from '@/components/erp/ui/superficies';

export function AvisoDoFeito({ texto }: { texto: string | null }) {
  // `vez` faz o mesmo texto, chegando de novo (ex.: pausar duas vezes), contar como aviso novo.
  const [mostrado, setMostrado] = useState<{ texto: string; vez: number } | null>(texto ? { texto, vez: 1 } : null);
  const caixa = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const caminho = usePathname();
  // Lidos por ref: o efeito do foco roda só quando o aviso muda (nunca de novo por causa da navegação que ele mesmo faz).
  const rota = useRef({ router, caminho });
  rota.current = { router, caminho };

  // O primeiro aviso já vem no estado inicial; depois, cada texto que chega (o `?feito` some entre um e outro) é aviso novo.
  const ultimo = useRef<string | null>(texto);
  useEffect(() => {
    if (texto && texto !== ultimo.current) setMostrado((m) => ({ texto, vez: (m?.vez ?? 0) + 1 }));
    ultimo.current = texto;
  }, [texto]);

  // Roda depois que o aviso já está na página: o foco não se perde.
  useEffect(() => {
    if (!mostrado) return;
    caixa.current?.focus();
    rota.current.router.replace(rota.current.caminho, { scroll: false });
  }, [mostrado]);

  useEffect(() => {
    const limpar = () => setMostrado(null);
    document.addEventListener('submit', limpar, true);
    return () => document.removeEventListener('submit', limpar, true);
  }, []);

  if (!mostrado) return null;
  return (
    <div ref={caixa} tabIndex={-1} className="scroll-mt-24 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ff-acao))]">
      <Aviso tom="ok" titulo={mostrado.texto} />
    </div>
  );
}
