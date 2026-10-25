/**
 * Respostas de um cliente, item a item: recebido, marcado ou pendente.
 *
 * A ordem é a do questionário, não a do preenchimento — a reunião de
 * diagnóstico segue o formulário, e o painel tem de bater com ele.
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { questionario, ROTULO_MARCACAO } from '@/lib/portal/questionario';
import { calcularProgresso, type EstadoItem } from '@/lib/portal/progresso';
import { formatarTamanho } from '@/lib/portal/arquivos';
import { ehAudio } from '@/lib/portal/audio';
import { origemPublica } from '@/lib/portal/http';
import { COR } from '@/lib/erp/modulos';
import { BotaoAcao } from '@/components/erp/ui/botoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao } from '@/components/erp/ui/estilos';
import { Numero, Painel, Selo } from '@/components/erp/ui/superficies';
import { acaoZerarPortal } from '../actions';
import { CopiarLink } from '../copiar';
import { formatarQuando } from '../formatar';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';

export const dynamic = 'force-dynamic';

const SELO: Record<EstadoItem, { tom: 'ok' | 'alerta' | 'neutro'; rotulo: string }> = {
  RECEBIDO: { tom: 'ok', rotulo: 'Recebido' },
  MARCADO: { tom: 'alerta', rotulo: 'Pulado com motivo' },
  PENDENTE: { tom: 'neutro', rotulo: 'Pendente' },
};

export default async function PortalClientePage({ params }: { params: { id: string } }) {
  // O middleware já exige a sessão; a página confere de novo (o layout não substitui a checagem).
  await exigirNivel1();
  const cliente = await prisma.portalCliente.findUnique({
    where: { id: params.id },
    include: {
      respostas: true,
      arquivos: { orderBy: { criadoEm: 'asc' } },
    },
  });
  if (!cliente) notFound();
  const q = questionario(cliente.questionario);
  if (!q) notFound();

  const p = calcularProgresso(q.itens, cliente.respostas, cliente.arquivos);
  const situacao = new Map(p.situacoes.map((s) => [s.item.id, s]));
  const zerar = acaoZerarPortal.bind(null, cliente.id);

  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: cliente.nome }]} />
      <Voltar href="/rodolfo/portal">Voltar para o Portal do cliente</Voltar>
      <PageHeader
        icone="portal"
        cor={COR.clientes}
        titulo={cliente.nome}
        subtitulo={`${p.recebidos} recebidos, ${p.marcados} pulados com motivo e ${p.pendentes} pendentes de ${p.total} itens`}
        acao={
          <a href={`/rodolfo/portal/${cliente.id}/contexto`} className={classeDeBotao('secundario')}>
            Baixar contexto (.md)
          </a>
        }
      />

      <Painel titulo="Link do cliente">
        <CopiarLink url={`${origemPublica()}/portal/${cliente.token}`} />
        <p className="mt-2 text-[13px] text-suave">
          O contexto (.md, no botão do topo) traz tudo que o cliente respondeu, marcou e enviou, item a item. Guarde em{' '}
          <code className="break-all">clientes/{cliente.slug}/</code> no repositório.
        </p>
      </Painel>

      <Painel titulo="Situação">
        <div className="grid grid-cols-3 gap-4">
          <Numero valor={p.recebidos} rotulo="Recebidos" detalhe={`de ${p.total}`} />
          <Numero
            valor={p.marcados}
            rotulo="Pulados com motivo"
            detalhe={`${p.porMarcacao.NAO_TENHO} não tenho · ${p.porMarcacao.NAO_SEI} não sei · ${p.porMarcacao.AGORA_NAO} agora não`}
          />
          <Numero valor={p.pendentes} rotulo="Pendentes" />
        </div>
        <dl className="mt-4 grid gap-1 text-sm text-suave">
          <div>
            <dt className="inline text-suave">Enviado: </dt>
            <dd className="inline">{cliente.finalizadoEm ? formatarQuando(cliente.finalizadoEm) : 'ainda não'}</dd>
          </div>
          <div>
            <dt className="inline text-suave">Última atividade: </dt>
            <dd className="inline">
              {cliente.ultimaAtividadeEm ? formatarQuando(cliente.ultimaAtividadeEm) : 'nenhuma'}
            </dd>
          </div>
          <div>
            <dt className="inline text-suave">Aviso no WhatsApp: </dt>
            <dd className="inline">
              {cliente.avisoEnviadoEm
                ? `enviado ${formatarQuando(cliente.avisoEnviadoEm)}`
                : cliente.avisoErro
                  ? `falhou — ${cliente.avisoErro}`
                  : 'nenhum'}
            </dd>
          </div>
        </dl>
      </Painel>

      {q.blocos.map((b) => (
        <Painel key={b.bloco} titulo={b.titulo}>
          <ul className="divide-y divide-linha">
            {b.itens.map((item) => {
              const s = situacao.get(item.id)!;
              const arquivos = cliente.arquivos.filter((a) => a.itemId === item.id);
              return (
                <li key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      <span className="mr-1.5 text-suave">{item.id}</span>
                      {item.rotulo}
                    </p>
                    <Selo tom={SELO[s.estado].tom}>{SELO[s.estado].rotulo}</Selo>
                  </div>
                  {s.marcacao && (
                    <p className="mt-1 text-[12px] font-semibold text-atencao">{ROTULO_MARCACAO[s.marcacao]}</p>
                  )}
                  {s.texto?.trim() && <p className="mt-2 whitespace-pre-wrap text-sm text-texto">{s.texto}</p>}
                  {arquivos.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {arquivos.map((a) => (
                        <li key={a.id} className="text-sm">
                          <a
                            href={`/rodolfo/portal/arquivo/${a.id}`}
                            className="font-medium text-texto underline decoration-linha-forte underline-offset-4 hover:decoration-texto"
                          >
                            {a.nomeOriginal}
                          </a>{' '}
                          <span className="text-suave">
                            · {formatarTamanho(a.tamanho)} · {formatarQuando(a.criadoEm)}
                          </span>
                          {ehAudio(a.nomeOriginal) && (
                            // Gravado no formulário (ou anexado): toca aqui, sem baixar.
                            <audio
                              controls
                              preload="none"
                              src={`/rodolfo/portal/arquivo/${a.id}`}
                              className="mt-1 h-10 w-full max-w-md"
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Painel>
      ))}

      {/* Ação que apaga respostas reais: fica fechada embaixo e diz o nome do cliente (antes: "Limpar dados de teste", em qualquer cliente). */}
      <details className="rounded-[14px] border border-linha bg-painel px-4 py-1 sm:px-5">
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] font-medium text-texto">Apagar as respostas de {cliente.nome}</summary>
        <p className="mb-3 mt-1 text-sm text-suave">
          Apaga todas as respostas e arquivos deste cliente, no banco e no disco, para recomeçar o formulário. O cadastro e o
          link continuam os mesmos. Não tem volta.
        </p>
        <BotaoAcao
          acao={zerar}
          variante="perigo"
          confirmar={`Apagar TODAS as respostas e arquivos de ${cliente.nome}? Não tem volta.`}
        >
          Apagar respostas e arquivos
        </BotaoAcao>
        <div className="h-3" />
      </details>
    </div>
  );
}
