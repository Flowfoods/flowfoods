/**
 * O relatório não coube agora (passou do teto de tempo do banco ou há outros relatórios grandes rodando): a frase no lugar dos
 * números, com a saída. Vale para todos os relatórios pesados; o erro vem do portão (`ErroDeRelatorio`), nunca um 500.
 */

import Link from 'next/link';
import type { ErroDeRelatorio } from '@/lib/erp/tenant';
import { classeDeBotao } from './estilos';
import { Painel, Vazio } from './superficies';

export function RelatorioGrande({ erro, caminho }: { erro: Pick<ErroDeRelatorio, 'titulo' | 'texto'>; caminho: string }) {
  return (
    <Painel semRespiro>
      <Vazio
        titulo={erro.titulo}
        acao={
          <Link href={caminho} className={classeDeBotao('secundario')}>
            Limpar e recomeçar
          </Link>
        }
      >
        {erro.texto}
      </Vazio>
    </Painel>
  );
}
