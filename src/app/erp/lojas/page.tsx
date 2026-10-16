/**
 * ERP do parceiro — Lojas e marcas. Só as lojas do alcance da pessoa aparecem
 * (o filtro vai na consulta: `listarEstrutura(cliente, alcance)`); quem tem só
 * a loja X não vê a loja Y nem pelo nome. Cadastrar exige "cadastrar lojas e
 * marcas" e a rede inteira.
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { listarEstrutura } from '@/lib/erp/estrutura';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { FormNome } from '@/components/erp/telas/estrutura/form-nome';
import { resumoDaEstrutura, TelaEstrutura } from '@/components/erp/telas/estrutura/tela-estrutura';
import { acaoCadastrarLojaDaSessao, acaoCadastrarMarcaDaSessao } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpLojasPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'lojas.ver');
  const { lojas, marcas } = await listarEstrutura(ctx.cliente, ctx.alcance);
  const cadastra = pode(ctx.alcance, 'lojas.gerir');
  return (
    <div className="space-y-6">
      <PageHeader
        icone="lojas"
        cor={COR.rede}
        titulo="Lojas e marcas"
        subtitulo={`${ctx.alcance.lojas === 'todas' ? 'Rede Completa' : 'Suas lojas'} · ${resumoDaEstrutura(lojas, marcas)}`}
      />
      <TelaEstrutura
        lojas={lojas}
        marcas={marcas}
        bloqueio={ctx.bloqueio}
        formLoja={cadastra ? <FormNome acao={acaoCadastrarLojaDaSessao} tipo="loja" /> : undefined}
        formMarca={cadastra ? <FormNome acao={acaoCadastrarMarcaDaSessao} tipo="marca" /> : undefined}
      />
    </div>
  );
}
