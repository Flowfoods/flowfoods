/**
 * Shell do nível 1 (o Rodolfo): o MESMO shell do /erp, com os módulos do
 * Barney antigo (Comercial, Clientes, Sistema) e os Parceiros Flow. Fica num
 * grupo de rota para o login e a definição de senha ficarem de fora.
 *
 * A sessão é a do next-auth (`exigirNivel1`), separada da sessão das pessoas
 * dos parceiros. O layout não substitui a checagem: cada página continua
 * chamando a sua (o middleware também exige a sessão em /rodolfo).
 */

import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { AJUDA_DE_USO_ERP } from '@/lib/constants';
import { ajudaParaATela } from '@/lib/erp/ajuda';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { VERSAO_DO_ERP } from '@/lib/erp/modulos';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { COOKIE_MENU, COOKIE_TEMA, lerMenuRecolhido, lerTema } from '@/lib/erp/tema';
import { contarPedidosAbertos } from '@/lib/erp/pedidos';
import { ALCANCE_FLOWFOODS } from '@/lib/erp/permissoes';
import { navegacaoDoNivel1 } from '@/lib/rodolfo/modulos';
import { contarRespostasSemClassificar } from '@/lib/rodolfo/notificacoes';
import { AppShell } from '@/components/erp/shell/AppShell';
import { EscopoDoRascunho } from '@/components/erp/telas/cadastro/rascunho';
import type { Notificacao } from '@/components/erp/shell/tipos';
import { acaoBuscarNoParceiro, acaoEscolherVisaoDoParceiro, acaoVisaoDoParceiro } from './acoes-do-shell';

export const dynamic = 'force-dynamic';

const parceirosDoShell = cache(() =>
  prisma.parceiroFlow.findMany({ select: { slug: true, nome: true, status: true }, orderBy: { nome: 'asc' } }),
);

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirNivel1();
  const [parceiros, semClassificar, pedidos] = await Promise.all([
    parceirosDoShell(),
    contarRespostasSemClassificar(),
    contarPedidosAbertos(),
  ]);
  const c = cookies();

  const notificacoes: Notificacao[] = [];
  if (pedidos.abertos > 0) {
    notificacoes.push({
      titulo: `${pedidos.abertos} ${pedidos.abertos === 1 ? 'pedido aguardando' : 'pedidos aguardando'} liberação`,
      detalhe: pedidos.atrasados > 0 ? `Parceiros Flow · ${pedidos.atrasados} com atraso` : 'Parceiros Flow · dentro do prazo',
      href: '/rodolfo/onboarding',
    });
  }
  if (semClassificar > 0) {
    notificacoes.push({
      titulo: `${semClassificar} resposta${semClassificar === 1 ? '' : 's'} sem classificar`,
      detalhe: 'Inbox · a IA ainda não leu',
      href: '/rodolfo/inbox',
    });
  }

  return (
    <AppShell
      navegacao={navegacaoDoNivel1()}
      contexto="Nível 1 · FlowFoods"
      usuario={{ nome: sessao.autorNome, papel: 'Nível 1 · FlowFoods' }}
      tema={lerTema(c.get(COOKIE_TEMA)?.value)}
      menuRecolhido={lerMenuRecolhido(c.get(COOKIE_MENU)?.value)}
      versao={VERSAO_DO_ERP}
      visao={{
        modo: 'nivel1',
        parceiros: parceiros.map((p) => ({
          slug: p.slug,
          nome: p.nome,
          rotuloStatus: STATUS_DO_PARCEIRO[p.status].rotulo,
        })),
        carregar: acaoVisaoDoParceiro,
        escolher: acaoEscolherVisaoDoParceiro,
      }}
      notificacoes={notificacoes}
      links={[{ rotulo: 'Config do Barney', href: '/rodolfo/config' }]}
      sair={null}
      buscarInsumosDoParceiro={acaoBuscarNoParceiro}
      // Nível 1: só o botão "?" dentro do parceiro (a ajuda lê o mesmo registro). Sem caixa, sem pergunta e sem preferência.
      ajuda={{ entradas: ajudaParaATela(ALCANCE_FLOWFOODS), preferencia: null, acoes: null, contato: AJUDA_DE_USO_ERP }}
    >
      <EscopoDoRascunho escopo={`n1:${sessao.userId}`}>{children}</EscopoDoRascunho>
    </AppShell>
  );
}
