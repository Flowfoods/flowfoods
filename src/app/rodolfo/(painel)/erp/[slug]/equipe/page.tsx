/**
 * ERP — equipe do parceiro pelo nível 1 (era a aba Acessos): pessoas, perfis
 * (prontos e próprios), setores e lojas de cada pessoa; criar acesso com link
 * de senha, editar, desativar/reativar, liberar tentativas de entrada. A MESMA
 * tela que o dono usa em /erp/equipe (`TelaEquipe`), com o alcance do nível 1.
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listarAcessos, listarPerfis } from '@/lib/erp/credenciais';
import { listarLojasDoAlcance } from '@/lib/erp/estrutura';
import { listarHistorico } from '@/lib/erp/historico';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { TelaEquipe } from '@/components/erp/telas/equipe/tela-equipe';
import {
  acaoAtualizarAcesso,
  acaoCriarAcesso,
  acaoDesativarAcesso,
  acaoExcluirPerfil,
  acaoLiberarEntrada,
  acaoNovoLink,
  acaoReativarAcesso,
  acaoSalvarPerfil,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AcessosPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { ver?: string; setor?: string };
}) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'acessos.gerir');
  const { parceiro, cliente, alcance } = ctx;
  const [pessoas, perfis, lojas, historico] = await Promise.all([
    listarAcessos(parceiro.id),
    listarPerfis(parceiro.id),
    listarLojasDoAlcance(cliente, alcance),
    listarHistorico(cliente, { entidades: ['AcessoParceiro', 'PerfilAcesso'], limite: 6, verPrecos: false }),
  ]);
  const slug = parceiro.slug;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="equipe"
        cor={COR.rede}
        titulo="Equipe"
        subtitulo={`${parceiro.nome} · pessoas, perfis e as lojas de cada uma`}
      />
      <TelaEquipe
        aba={searchParams.ver === 'perfis' ? 'perfis' : 'pessoas'}
        hrefBase={`/rodolfo/erp/${slug}/equipe`}
        setor={searchParams.setor}
        pessoas={pessoas}
        perfis={perfis}
        lojas={lojas}
        ator={{ alcance, acessoId: null }}
        bloqueio={null}
        historico={historico}
        historicoHref={`/rodolfo/erp/${slug}/historico?entidade=AcessoParceiro`}
        acoes={{
          criar: acaoCriarAcesso.bind(null, slug),
          atualizar: acaoAtualizarAcesso.bind(null, slug),
          gerarLink: acaoNovoLink.bind(null, slug),
          desativar: acaoDesativarAcesso.bind(null, slug),
          reativar: acaoReativarAcesso.bind(null, slug),
          liberar: acaoLiberarEntrada.bind(null, slug),
          salvarPerfil: acaoSalvarPerfil.bind(null, slug),
          excluirPerfil: acaoExcluirPerfil.bind(null, slug),
        }}
      />
    </div>
  );
}
