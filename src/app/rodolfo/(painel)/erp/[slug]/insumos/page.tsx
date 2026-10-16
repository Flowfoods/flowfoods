/**
 * ERP — Insumos de um Parceiro Flow, pelo nível 1. Tudo o que esta tela lê
 * passa pelo cliente de `exigirParceiro` (portão de tenant + RLS); trocar de
 * parceiro é trocar de URL, e a URL só escolhe — o isolamento é o portão.
 */

import { exigirParceiro, exigirPermissao, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarInsumos } from '@/lib/erp/insumos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { TelaInsumos } from '@/components/erp/telas/insumos/tela-insumos';
import { FormInsumo } from '@/components/erp/telas/insumos/form-insumo';
import { subtituloDosInsumos } from '@/components/erp/telas/insumos/subtitulo';
import { acaoCadastrarInsumo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ParceiroInsumosPage({ params }: { params: { slug: string } }) {
  const ctx = await exigirParceiro(params.slug);
  exigirPermissao(ctx, 'insumos.ver');
  const { parceiro, cliente, bloqueio } = ctx;
  const [insumos, { visao }] = await Promise.all([listarInsumos(cliente), visaoDaRequisicao(ctx)]);
  return (
    <div className="space-y-6">
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo="Insumos"
        subtitulo={`${parceiro.nome} · ${subtituloDosInsumos(visao, insumos.length)}`}
        acao={
          bloqueio ? undefined : (
            <a href="#novo-insumo" className={classeDeBotao('primario')}>
              + Novo insumo
            </a>
          )
        }
      />
      <TelaInsumos
        linhas={insumos}
        bloqueio={bloqueio}
        formulario={<FormInsumo acao={acaoCadastrarInsumo.bind(null, parceiro.slug)} />}
      />
    </div>
  );
}
