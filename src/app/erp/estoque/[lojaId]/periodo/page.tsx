/**
 * ERP do parceiro — período e contagens da loja (1.7): cobertura × piso, o
 * que falta, o fechamento e as regras. Ver exige "ver o estoque" NA loja;
 * fechar, "ajustar saldo"; mudar as regras, "cadastrar lojas" (rede inteira).
 */

import { notFound, redirect } from 'next/navigation';
import { exigirParceiroDaSessao, exigirPermissaoNaPagina, pode } from '@/lib/erp/contexto';
import { situacaoDoPeriodo } from '@/lib/erp/contagem';
import { TelaPeriodo } from '@/components/erp/telas/estoque/periodo';
import { acaoIniciarFechamento, acaoSalvarRegrasDaContagem } from '../../actions';

export const dynamic = 'force-dynamic';

const BASE = '/erp/estoque';

export default async function ErpPeriodoDaLojaPage({ params, searchParams }: { params: { lojaId: string }; searchParams: { feito?: string } }) {
  const ctx = await exigirParceiroDaSessao();
  exigirPermissaoNaPagina(ctx, 'estoque.ver');
  const s = await situacaoDoPeriodo(ctx.cliente, ctx.alcance, params.lojaId);
  if (!s) notFound();
  if (!s.aberto) redirect(`${BASE}/${s.loja.id}`);
  const lojaId = s.loja.id;
  return (
    <TelaPeriodo
      s={s}
      base={BASE}
      feito={searchParams.feito}
      pode={{ ajustar: pode(ctx.alcance, 'estoque.ajustar', { lojaId }), contar: pode(ctx.alcance, 'estoque.contar', { lojaId }), regras: pode(ctx.alcance, 'lojas.gerir'), periodos: pode(ctx.alcance, 'dre.ver') }}
      acoes={{ fechar: acaoIniciarFechamento.bind(null, lojaId), regras: acaoSalvarRegrasDaContagem.bind(null, lojaId) }}
      bloqueio={ctx.bloqueio}
      verValores={pode(ctx.alcance, 'compras.ver', { lojaId })}
    />
  );
}
