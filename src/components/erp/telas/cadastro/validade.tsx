/**
 * Validade por conservação (1.4) na tela — peças de SERVIDOR comuns à ficha
 * técnica e ao insumo: o ícone de cada conservação (funcional: o cozinheiro
 * reconhece o lugar antes de ler) e a lista "onde fica e quanto dura", com a
 * principal marcada por palavra. O formulário está em `campos-validade.tsx`.
 */

import type { ReactNode } from 'react';
import { Package, Refrigerator, Snowflake, ThermometerSnowflake, type LucideIcon } from 'lucide-react';
import { aceitas, CONSERVACOES, formatarValidade, type Conservacao, type Validades } from '@/lib/erp/validade';

export const ICONE_DA_CONSERVACAO: Record<Conservacao, LucideIcon> = {
  SECO: Package,
  PISTA_FRIA: ThermometerSnowflake,
  REFRIGERADO: Refrigerator,
  CONGELADO: Snowflake,
};

export function IconeDaConservacao({ conservacao, tamanho = 16 }: { conservacao: Conservacao; tamanho?: number }) {
  const Icone = ICONE_DA_CONSERVACAO[conservacao];
  return <Icone size={tamanho} aria-hidden className="shrink-0 text-suave" />;
}

/**
 * Onde o item fica e quanto dura em cada lugar, a principal primeiro.
 * `vazio`: o que dizer quando não há validade (ficha da 1.2/1.3, insumo sem).
 */
export function ValidadesDoItem({ validades, vazio }: { validades: Validades | null; vazio: ReactNode }) {
  const lista = validades ? aceitas(validades) : [];
  // 1.5 (herança d): o "não informada" no tamanho do texto, não de nota de rodapé.
  if (lista.length === 0) return <div className="text-[15px] leading-relaxed text-suave">{vazio}</div>;
  return (
    <ul className="divide-y divide-linha" aria-label="Onde fica e quanto dura">
      {lista.map((a) => (
        <li key={a.conservacao} className="flex min-h-10 items-center gap-2.5 py-1.5 text-sm">
          <IconeDaConservacao conservacao={a.conservacao} />
          <span className="text-texto">{CONSERVACOES[a.conservacao]}</span>
          {a.principal && lista.length > 1 && <span className="text-[12px] text-suave">principal</span>}
          <span className="ml-auto font-semibold tabular-nums text-texto">{formatarValidade(a.minutos)}</span>
        </li>
      ))}
    </ul>
  );
}
