'use client';

/**
 * L.1: os filtros da lista de insumos num bloco "Filtros (n)" que abre e fecha no CELULAR (abaixo de 640 px) e fica sempre aberto de
 * 640 px para cima. A busca fica fora dele, sempre à vista. Nasce FECHADO no celular (nada de piscar aberto e fechar): o que está
 * valendo aparece nos chips logo abaixo. Os campos continuam no formulário mesmo fechados (o envio leva todos). O formulário é
 * remontado a cada mudança de filtro (`key`), então depois de filtrar o bloco volta a nascer fechado.
 */

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { classeDeBotao } from '../../ui/estilos';

export function FiltrosRecolhiveis({
  ativos,
  children,
  id = 'insumos-filtros',
  grade = 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  abertoNoInicio = false,
}: {
  ativos: number;
  children: ReactNode;
  /** L.2: os relatórios reaproveitam o bloco (outro id e outra grade); o padrão é o da lista de insumos. */
  id?: string;
  grade?: string;
  /** L.2: a tela que ainda não tem o que mostrar (nenhum insumo escolhido) nasce com os filtros abertos no celular. */
  abertoNoInicio?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoNoInicio);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-controls={id}
        className={classeDeBotao('secundario', 'w-full justify-between sm:hidden')}
      >
        <span>{ativos > 0 ? `Filtros (${ativos})` : 'Filtros'}</span>
        <ChevronDown size={16} aria-hidden className={aberto ? 'rotate-180' : ''} />
      </button>
      {/* Fechado só no celular: de 640 px para cima o `sm:grid` mostra sempre. */}
      <div id={id} className={`${aberto ? 'grid' : 'hidden'} mt-2 ${grade} gap-2 sm:mt-0 sm:grid`}>
        {children}
      </div>
    </div>
  );
}
