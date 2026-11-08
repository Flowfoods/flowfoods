import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { appPorId } from '@/lib/integracoes/core/apps';
import { appAceitaParecer, historicoDoParecer } from '@/lib/integracoes/core/homologacao';
import { type EstadoDoParecer } from '@/lib/integracoes/core/homologacao-campos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { HistoricoRecolhivel } from '@/components/erp/telas/historico/historico-recolhivel';
import { Aviso, Painel } from '@/components/erp/ui/superficies';
import { COR } from '@/lib/erp/modulos';
import { QUANDO, ROTULO_DA_HOMOLOGACAO, diaBr } from '../../rotulos';
import { FormParecer } from './form';

export const dynamic = 'force-dynamic';

export default async function ParecerAppPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feito?: string }> }) {
  await exigirNivel1();
  const { id } = await params;
  const app = await appPorId(id);
  if (!app || !appAceitaParecer(app)) notFound();
  const historico = await historicoDoParecer(id);
  const { feito } = await searchParams;
  return <div className="space-y-6">
    <PageHeader icone="canais" cor={COR.parceiros} titulo="Parecer do iFood" subtitulo={app.nome} acao={<Link href="/rodolfo/integracoes" className="text-sm underline underline-offset-4">Voltar às integrações</Link>} />
    {feito === 'parecer' && <Aviso titulo="Parecer registrado">A situação e a evidência foram guardadas no histórico. O registro não concede acesso a lojas nem altera a situação no iFood.</Aviso>}
    <Aviso titulo="Registro da conferência externa">
      O estado atual no ERP é {ROTULO_DA_HOMOLOGACAO[app.estadoHomologacao]}. Esta página registra o parecer que você conferiu no iFood; não consulta o provedor.
      Autorizações e ativação por loja continuam separadas. Retirar a homologação bloqueia novas coletas; os registros e vínculos existentes são preservados.
    </Aviso>
    <Painel titulo="App de produção · BI · Analytics">
      <p className="mb-4 break-all text-sm">Client ID: <span className="font-mono">{app.clientId}</span></p>
      <FormParecer key={app.atualizadoEm.toISOString()} appId={app.id} versao={app.atualizadoEm.toISOString()} estadoAtual={app.estadoHomologacao as EstadoDoParecer} referencia={`https://developer.ifood.com.br/pt-BR/developer/applications/${encodeURIComponent(app.clientId)}/details`} />
    </Painel>
    <HistoricoRecolhivel chave={`parecer:${app.id}`} titulo="Histórico de pareceres" subtitulo="Até os 20 registros mais recentes" quantidade={historico.length}>
      {!historico.length ? <p className="text-sm text-suave">Nenhum parecer registrado por esta tela.</p> : <ul className="divide-y divide-linha">
        {historico.map(h => <li key={h.id} className="space-y-1 py-3 text-sm">
          <p className="font-medium">{ROTULO_DA_HOMOLOGACAO[h.estado as EstadoDoParecer] ?? h.estado} · {QUANDO.format(h.criadoEm)}</p>
          <p className="text-suave">Validação técnica: {h.validacaoEm ? diaBr(h.validacaoEm) : 'Não informada'} · Liberação: {h.liberacaoEm ? diaBr(h.liberacaoEm) : 'Não informada'}</p>
          <p className="text-suave">Registrado por {h.autorNome}</p>
          {h.referencia && <a href={h.referencia} target="_blank" rel="noopener noreferrer" className="inline-block underline underline-offset-4">Consultar página usada no registro</a>}
        </li>)}
      </ul>}
    </HistoricoRecolhivel>
  </div>;
}
