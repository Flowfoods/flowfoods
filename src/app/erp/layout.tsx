/**
 * ERP do parceiro: a área das pessoas do Parceiro Flow, dentro do shell
 * ÚNICO (o mesmo do /rodolfo). O parceiro vem SÓ da sessão
 * (`exigirParceiroDaSessao`), nunca da URL: não existe endereço que escolha
 * outro parceiro. Sessão própria (não é a do /rodolfo).
 *
 * O layout monta o que o shell desenha (menu filtrado pelo alcance, visão
 * conferida contra as lojas do alcance, tema do cookie); cada página continua
 * conferindo a própria permissão (`exigirPermissaoNaPagina`).
 */

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { exigirParceiroDaSessao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { navegacaoDoParceiro, VERSAO_DO_ERP } from '@/lib/erp/modulos';
import { STATUS_DO_PARCEIRO } from '@/lib/erp/parceiros';
import { COOKIE_MENU, COOKIE_TEMA, lerMenuRecolhido, lerTema } from '@/lib/erp/tema';
import { AppShell } from '@/components/erp/shell/AppShell';
import { Aviso } from '@/components/erp/ui/superficies';
import { acaoSair } from '../entrar/actions';
import { acaoBuscarNoErp, acaoEscolherVisao } from './actions';

export const metadata: Metadata = {
  title: 'FlowFoods ERP',
  robots: 'noindex, nofollow, noarchive',
};

export const dynamic = 'force-dynamic';

const AVISO = {
  SUSPENSO: 'Você pode consultar tudo, mas cadastros e alterações estão parados. Fale com a FlowFoods.',
  RASCUNHO: 'Este parceiro ainda não foi liberado. Fale com a FlowFoods.',
} as const;

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const ctx = await exigirParceiroDaSessao();
  const { parceiro, pessoa, bloqueio, alcance } = ctx;
  const status = STATUS_DO_PARCEIRO[parceiro.status];
  const { opcoes, valor } = await visaoDaRequisicao(ctx);
  const c = cookies();

  const links = [{ rotulo: 'Seu acesso', href: '/erp/acesso' }];
  if (pessoa.parceiros.length > 1) links.push({ rotulo: 'Trocar de parceiro', href: '/entrar/escolher' });

  return (
    <AppShell
      navegacao={navegacaoDoParceiro(alcance)}
      contexto={`${parceiro.nome} · ${status.rotulo}`}
      usuario={{
        nome: pessoa.usuario.nome,
        papel: pessoa.perfilRotulo ?? 'Acesso próprio',
        email: pessoa.usuario.email,
      }}
      tema={lerTema(c.get(COOKIE_TEMA)?.value)}
      menuRecolhido={lerMenuRecolhido(c.get(COOKIE_MENU)?.value)}
      versao={VERSAO_DO_ERP}
      visao={{ modo: 'parceiro', opcoes, valor, escolher: acaoEscolherVisao }}
      notificacoes={[]}
      links={links}
      sair={acaoSair}
      buscarInsumos={acaoBuscarNoErp}
    >
      <div className="space-y-6">
        {bloqueio && (parceiro.status === 'SUSPENSO' || parceiro.status === 'RASCUNHO') && (
          <Aviso tom={parceiro.status === 'SUSPENSO' ? 'erro' : 'alerta'} titulo={`${status.rotulo}.`}>
            {AVISO[parceiro.status]}
          </Aviso>
        )}
        {children}
      </div>
    </AppShell>
  );
}
