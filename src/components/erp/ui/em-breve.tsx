/**
 * Selo "Em breve" do catálogo de módulos futuros: o mesmo no hub e no seletor de áreas. Sempre com a palavra (cor não é
 * o sinal), sem data nem fase. Com `cadeado`, o cadeado previsto no catálogo acompanha o selo e é lido como "Com cadeado":
 * descreve o ícone, sem afirmar bloqueio de acesso (não é falta de permissão nem de liberação).
 * É só apresentação: não é link, botão nem controle.
 */

import { Lock } from 'lucide-react';

export function SeloEmBreve({ cadeado = false, className = '' }: { cadeado?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex w-max shrink-0 items-center gap-1 rounded-[7px] border border-linha-forte px-2 py-0.5 text-[12px] font-medium text-suave ${className}`}
    >
      {cadeado && (
        <>
          <Lock size={12} aria-hidden />
          <span className="sr-only">Com cadeado. </span>
        </>
      )}
      Em breve
    </span>
  );
}
