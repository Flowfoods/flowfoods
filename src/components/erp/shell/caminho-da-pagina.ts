'use client';

/**
 * O caminho da página que o shell descreve. Com a janela de módulo aberta (UX-MOD-2, piloto do nível 1), o endereço é o da
 * janela, mas a página do shell é a de trás: a trilha, o menu ativo, a ajuda e o Voltar do shell continuam os dela (a
 * página de trás não sai do lugar). Sem janela, é o caminho do endereço, como sempre.
 *
 * Os segmentos são os do layout do shell (`/rodolfo`): eles seguem o espaço principal, que é a página de trás.
 */

import { usePathname, useSelectedLayoutSegments } from 'next/navigation';
import { fundoDaJanelaNoShell } from '@/lib/erp/janela';

export function useCaminhoDaPagina(): string {
  const caminho = usePathname() ?? '';
  const segmentos = useSelectedLayoutSegments() ?? [];
  return fundoDaJanelaNoShell(caminho, segmentos) ?? caminho;
}
