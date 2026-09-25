/**
 * Respostas de um cliente, item a item: recebido, marcado ou pendente.
 *
 * A ordem é a do questionário, não a do preenchimento — a reunião de
 * diagnóstico segue o formulário, e o painel tem de bater com ele.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { questionario, ROTULO_MARCACAO } from '@/lib/portal/questionario';
import { calcularProgresso, type EstadoItem } from '@/lib/portal/progresso';
import { formatarTamanho, pastaBase } from '@/lib/portal/arquivos';
import { origemPublica } from '@/lib/portal/http';
import { Cartao, Numero, Selo } from '../../ui';
import { BotaoAcao } from '../../botoes';
import { acaoZerarPortal } from '../actions';
import { CopiarLink } from '../copiar';
import { formatarQuando } from '../formatar';

export const dynamic = 'force-dynamic';

const SELO: Record<EstadoItem, { tom: 'ok' | 'alerta' | 'neutro'; rotulo: string }> = {
  RECEBIDO: { tom: 'ok', rotulo: 'Recebido' },
  MARCADO: { tom: 'alerta', rotulo: 'Marcado' },
  PENDENTE: { tom: 'neutro', rotulo: 'Pendente' },
};

export default async function PortalClientePage({ params }: { params: { id: string } }) {
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
    <div className="space-y-4">
      <Link href="/rodolfo/portal" className="text-sm text-surface/60 hover:text-surface">
        ← Portal
      </Link>
      <h1 className="font-display text-2xl font-bold">{cliente.nome}</h1>

      <Cartao titulo="Link do cliente">
        <CopiarLink url={`${origemPublica()}/portal/${cliente.token}`} />
        <p className="mt-2 text-xs text-surface/50">
          Arquivos no VPS: <code>{pastaBase()}/{cliente.token}/&lt;bloco&gt;/</code>
        </p>
      </Cartao>

      <Cartao titulo="Situação">
        <div className="grid grid-cols-3 gap-4">
          <Numero valor={p.recebidos} rotulo="Recebidos" detalhe={`de ${p.total}`} />
          <Numero
            valor={p.marcados}
            rotulo="Marcados"
            detalhe={`${p.porMarcacao.NAO_TENHO} não tenho · ${p.porMarcacao.NAO_SEI} não sei · ${p.porMarcacao.AGORA_NAO} agora não`}
          />
          <Numero valor={p.pendentes} rotulo="Pendentes" />
        </div>
        <dl className="mt-4 grid gap-1 text-sm text-surface/70">
          <div>
            <dt className="inline text-surface/50">Enviado: </dt>
            <dd className="inline">{cliente.finalizadoEm ? formatarQuando(cliente.finalizadoEm) : 'ainda não'}</dd>
          </div>
          <div>
            <dt className="inline text-surface/50">Última atividade: </dt>
            <dd className="inline">
              {cliente.ultimaAtividadeEm ? formatarQuando(cliente.ultimaAtividadeEm) : 'nenhuma'}
            </dd>
          </div>
          <div>
            <dt className="inline text-surface/50">Aviso no WhatsApp: </dt>
            <dd className="inline">
              {cliente.avisoEnviadoEm
                ? `enviado ${formatarQuando(cliente.avisoEnviadoEm)}`
                : cliente.avisoErro
                  ? `falhou — ${cliente.avisoErro}`
                  : 'nenhum'}
            </dd>
          </div>
        </dl>
      </Cartao>

      {q.blocos.map((b) => (
        <Cartao key={b.bloco} titulo={b.titulo}>
          <ul className="divide-y divide-white/10">
            {b.itens.map((item) => {
              const s = situacao.get(item.id)!;
              const arquivos = cliente.arquivos.filter((a) => a.itemId === item.id);
              return (
                <li key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      <span className="mr-1.5 text-surface/40">{item.id}</span>
                      {item.rotulo}
                    </p>
                    <Selo tom={SELO[s.estado].tom}>{SELO[s.estado].rotulo}</Selo>
                  </div>
                  {s.marcacao && (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-warning">
                      {ROTULO_MARCACAO[s.marcacao]}
                    </p>
                  )}
                  {s.texto?.trim() && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-surface/80">{s.texto}</p>
                  )}
                  {arquivos.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {arquivos.map((a) => (
                        <li key={a.id} className="text-sm">
                          <a
                            href={`/rodolfo/portal/arquivo/${a.id}`}
                            className="text-bright hover:underline"
                          >
                            {a.nomeOriginal}
                          </a>{' '}
                          <span className="text-surface/50">
                            · {formatarTamanho(a.tamanho)} · {formatarQuando(a.criadoEm)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      ))}

      <Cartao titulo="Limpar dados de teste">
        <p className="mb-3 text-sm text-surface/60">
          Apaga todas as respostas e arquivos deste cliente, no banco e no disco. O cadastro e o
          link continuam os mesmos.
        </p>
        <BotaoAcao
          acao={zerar}
          variante="perigo"
          confirmar={`Apagar TODAS as respostas e arquivos de ${cliente.nome}? Não tem volta.`}
        >
          Apagar respostas e arquivos
        </BotaoAcao>
      </Cartao>
    </div>
  );
}
