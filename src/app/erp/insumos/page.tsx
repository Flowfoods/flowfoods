/**
 * ERP do parceiro — Insumos. A mesma tela do nível 1, com o cliente do portão
 * resolvido pela SESSÃO da pessoa (`exigirParceiroDaSessao`). Ver exige
 * "ver insumos"; o cadastro só aparece com "cadastrar e editar insumos" (e a
 * action recusa do mesmo jeito, venha de onde vier).
 */

import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode, visaoDaRequisicao } from '@/lib/erp/contexto';
import { listarInsumos } from '@/lib/erp/insumos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { TelaInsumos } from '@/components/erp/telas/insumos/tela-insumos';
import { FormInsumo } from '@/components/erp/telas/insumos/form-insumo';
import { subtituloDosInsumos } from '@/components/erp/telas/insumos/subtitulo';
import { acaoCadastrarInsumoDaSessao } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ErpInsumosPage() {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'insumos.ver');
  const [insumos, { visao }] = await Promise.all([listarInsumos(ctx.cliente), visaoDaRequisicao(ctx)]);
  const cadastra = pode(ctx.alcance, 'insumos.editar');
  return (
    <div className="space-y-6">
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo="Insumos"
        subtitulo={subtituloDosInsumos(visao, insumos.length)}
        acao={
          cadastra && !ctx.bloqueio ? (
            <a href="#novo-insumo" className={classeDeBotao('primario')}>
              + Novo insumo
            </a>
          ) : undefined
        }
      />
      <TelaInsumos
        linhas={insumos}
        bloqueio={ctx.bloqueio}
        formulario={cadastra ? <FormInsumo acao={acaoCadastrarInsumoDaSessao} /> : undefined}
      />
    </div>
  );
}
