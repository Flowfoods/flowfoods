/**
 * Aguardando liberação (0.5): o quadro dos pedidos de acesso que chegam pelo
 * site (ou que o Rodolfo digita). Só o nível 1 lê; a pessoa do parceiro não tem
 * rota, ação nem busca que devolva pedido.
 */

import Link from 'next/link';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { COR } from '@/lib/erp/modulos';
import { listarQuadro } from '@/lib/erp/pedidos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Aviso } from '@/components/erp/ui/superficies';
import { etapaDaAba, QuadroDePedidos } from './quadro';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: { etapa?: string; feito?: string } }) {
  await exigirNivel1();
  const quadro = await listarQuadro();
  const abertos = quadro.NOVO.length + quadro.EM_CONVERSA.length;
  const atrasados = [...quadro.NOVO, ...quadro.EM_CONVERSA].filter((c) => c.atrasoDias > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icone="acesso"
        cor={COR.parceiros}
        titulo="Aguardando liberação"
        subtitulo={[
          abertos ? `${abertos} ${abertos === 1 ? 'pedido aberto' : 'pedidos abertos'}` : 'Nenhum pedido aberto',
          atrasados ? `${atrasados} com atraso` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        acao={
          <Link href="/rodolfo/onboarding/novo" className={classeDeBotao('primario')}>
            Cadastrar pedido manual
          </Link>
        }
      />
      {searchParams.feito === 'manual' && <Aviso tom="ok" titulo="Pedido cadastrado." />}
      <p className="max-w-3xl text-sm text-suave">
        Quem pede para começar chega aqui, vindo do site ou digitado por você. Nada é criado antes da sua decisão: ao ativar, o sistema
        cria de uma vez o parceiro, o acesso do dono e o link de primeiro acesso. Novo passa do prazo depois de 2 dias; Em conversa, depois de 7 dias sem
        movimento.
      </p>
      <QuadroDePedidos quadro={quadro} etapa={etapaDaAba(searchParams.etapa)} />
    </div>
  );
}
