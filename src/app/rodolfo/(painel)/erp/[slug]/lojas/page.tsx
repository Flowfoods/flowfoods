/**
 * ERP — lojas e marcas do parceiro (N2 → N3) pelo nível 1: as lojas (onde a
 * operação acontece) e as marcas do grupo. Mesma tela de /erp/lojas.
 */

import { exigirParceiro, exigirPermissao } from '@/lib/erp/contexto';
import { listarEstrutura } from '@/lib/erp/estrutura';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { FormCanais } from '@/components/erp/telas/estrutura/form-canais';
import { FormCnpj } from '@/components/erp/telas/estrutura/form-cnpj';
import { FormNome } from '@/components/erp/telas/estrutura/form-nome';
import { resumoDaEstrutura, TelaEstrutura } from '@/components/erp/telas/estrutura/tela-estrutura';
import { acaoCadastrarLoja, acaoCadastrarMarca, acaoSalvarCanaisDaLoja, acaoSalvarCnpjDaLoja } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LojasDoParceiroPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'lojas.ver');
  const { lojas, marcas } = await listarEstrutura(ctx.cliente, ctx.alcance);
  const slug = ctx.parceiro.slug;
  return (
    <div className="space-y-6">
      <PageHeader
        icone="lojas"
        cor={COR.rede}
        titulo="Lojas e marcas"
        subtitulo={`${ctx.parceiro.nome} · ${resumoDaEstrutura(lojas, marcas)}`}
      />
      <TelaEstrutura
        lojas={lojas}
        marcas={marcas}
        bloqueio={ctx.bloqueio}
        mostrarLink
        formLoja={<FormNome acao={acaoCadastrarLoja.bind(null, slug)} tipo="loja" />}
        formMarca={<FormNome acao={acaoCadastrarMarca.bind(null, slug)} tipo="marca" />}
        formCnpj={ctx.bloqueio ? undefined : (l) => <FormCnpj acao={acaoSalvarCnpjDaLoja.bind(null, slug, l.id)} lojaId={l.id} nome={l.nome} cnpj={l.cnpj} />}
        formCanais={ctx.bloqueio ? undefined : (l) => <FormCanais acao={acaoSalvarCanaisDaLoja.bind(null, slug, l.id)} nome={l.nome} canais={l.canais} />}
      />
    </div>
  );
}
