'use client';

/**
 * A página que aparece quando uma tela de Compras não acha o que foi pedido (nota, nota fiscal recebida, fornecedor): em português,
 * dentro do ERP, com o caminho de volta. Serve às duas árvores (`/erp` e `/rodolfo/erp/<slug>`): o link de volta sai do próprio
 * endereço. Não diz se o item existe para outra pessoa, outra loja ou outro parceiro: "não achamos", só isso.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { classeDeBotao } from '../../ui/estilos';
import { Painel, Vazio } from '../../ui/superficies';

export function NaoEncontradaEmCompras() {
  const caminho = usePathname() ?? '';
  const recebidas = /\/compras\/recebidas(\/|$)/.test(caminho);
  const raiz = caminho.replace(/\/compras(\/.*)?$/, '/compras');
  const volta = recebidas ? `${raiz}/recebidas` : raiz;
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <Painel semRespiro>
        <Vazio
          titulo={recebidas ? 'Não achamos esta nota fiscal.' : 'Não achamos esta página.'}
          acao={
            <Link href={volta} className={classeDeBotao('primario')}>
              {recebidas ? 'Voltar para as notas recebidas' : 'Voltar para Compras'}
            </Link>
          }
        >
          {recebidas
            ? 'Ela não está entre as notas recebidas que você pode ver. Confira o endereço ou abra a nota pela lista.'
            : 'O endereço pode estar errado, ou o que você procura não está entre as suas compras. Volte e abra pela lista.'}
        </Vazio>
      </Painel>
    </div>
  );
}
