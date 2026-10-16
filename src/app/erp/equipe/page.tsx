/**
 * ERP do parceiro — Equipe: quem tem "cuidar da equipe" (o dono, por padrão)
 * cria e ajusta acessos, perfis, setores e lojas de cada pessoa. A mesma tela
 * da aba Acessos do nível 1, com o alcance DESTA pessoa: o que ela não pode
 * dar aparece travado, e o servidor recusa do mesmo jeito.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { listarAcessos, listarPerfis } from '@/lib/erp/credenciais';
import { listarLojasDoAlcance } from '@/lib/erp/estrutura';
import { listarHistorico } from '@/lib/erp/historico';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { TelaEquipe } from '@/components/erp/telas/equipe/tela-equipe';
import {
  acaoAtualizarPessoa,
  acaoCriarPessoa,
  acaoDesativarPessoa,
  acaoExcluirPerfilDaEquipe,
  acaoLinkDaPessoa,
  acaoReativarPessoa,
  acaoSalvarPerfilDaEquipe,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function ErpEquipePage({ searchParams }: { searchParams: { ver?: string; setor?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'acessos.gerir');
  const rede = ctx.alcance.lojas === 'todas';
  const [pessoas, perfis, lojas, historico] = await Promise.all([
    listarAcessos(ctx.parceiro.id),
    listarPerfis(ctx.parceiro.id),
    listarLojasDoAlcance(ctx.cliente, ctx.alcance),
    rede ? listarHistorico(ctx.cliente, { entidades: ['AcessoParceiro', 'PerfilAcesso'], limite: 6 }) : undefined,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        icone="equipe"
        cor={COR.rede}
        titulo="Equipe"
        subtitulo={`${ctx.parceiro.nome} · pessoas, perfis e as lojas de cada uma`}
      />
      <TelaEquipe
        aba={searchParams.ver === 'perfis' ? 'perfis' : 'pessoas'}
        hrefBase="/erp/equipe"
        setor={searchParams.setor}
        pessoas={pessoas}
        perfis={perfis}
        lojas={lojas}
        ator={{ alcance: ctx.alcance, acessoId: ctx.pessoa.acessoId }}
        bloqueio={ctx.bloqueio}
        historico={historico}
        historicoHref={pode(ctx.alcance, 'historico.ver') ? '/erp/historico?entidade=AcessoParceiro' : undefined}
        acoes={{
          criar: acaoCriarPessoa,
          atualizar: acaoAtualizarPessoa,
          gerarLink: acaoLinkDaPessoa,
          desativar: acaoDesativarPessoa,
          reativar: acaoReativarPessoa,
          salvarPerfil: acaoSalvarPerfilDaEquipe,
          excluirPerfil: acaoExcluirPerfilDaEquipe,
        }}
      />
    </div>
  );
}
