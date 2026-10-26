/**
 * Respostas de um cliente, item a item: recebido, marcado ou pendente.
 *
 * A ordem é a do questionário, não a do preenchimento — a reunião de
 * diagnóstico segue o formulário, e o painel tem de bater com ele.
 * Decisão 472: cada bloco diz quantos itens já chegaram, e o filtro da URL
 * (`?estado=PENDENTE`) mostra só os itens daquela situação, para cobrar o
 * cliente pelo que falta sem rolar o formulário inteiro.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { questionario, ROTULO_MARCACAO } from '@/lib/portal/questionario';
import { calcularProgresso, type EstadoItem } from '@/lib/portal/progresso';
import { blocosNoPainel, contagemDoBloco, FILTROS_DE_ITEM, lerFiltroDeItem, mostradosNoBloco, resumoDoProgresso, vazioDoFiltro } from '@/lib/portal/painel';
import { formatarTamanho } from '@/lib/portal/arquivos';
import { ehAudio } from '@/lib/portal/audio';
import { origemPublica } from '@/lib/portal/http';
import { COR } from '@/lib/erp/modulos';
import { BotaoAcao } from '@/components/erp/ui/botoes';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { FiltroEmLinks } from '@/components/erp/ui/filtros';
import { Aviso, Contagem, Numero, Painel, Selo, Vazio } from '@/components/erp/ui/superficies';
import { acaoZerarPortal } from '../actions';
import { CopiarLink } from '../copiar';
import { formatarQuando } from '../formatar';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { LevarParaVista } from '@/components/erp/telas/producao/form-lista';

export const dynamic = 'force-dynamic';

const SELO: Record<EstadoItem, { tom: 'ok' | 'alerta' | 'neutro'; rotulo: string }> = {
  RECEBIDO: { tom: 'ok', rotulo: 'Recebido' },
  MARCADO: { tom: 'alerta', rotulo: 'Pulado com motivo' },
  PENDENTE: { tom: 'neutro', rotulo: 'Pendente' },
};

export default async function PortalClientePage({
  params,
  searchParams = {},
}: {
  params: { id: string };
  searchParams?: { estado?: string | string[]; feito?: string | string[] };
}) {
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
  const filtro = lerFiltroDeItem(searchParams.estado);
  const blocos = blocosNoPainel(q.blocos, p.situacoes, filtro);
  const quantos: Record<'' | EstadoItem, number> = { '': p.total, RECEBIDO: p.recebidos, MARCADO: p.marcados, PENDENTE: p.pendentes };
  const base = `/rodolfo/portal/${cliente.id}`;
  const zerar = acaoZerarPortal.bind(null, cliente.id);

  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: cliente.nome }]} />
      <Voltar href="/rodolfo/portal">Voltar para o Portal do cliente</Voltar>
      <PageHeader
        icone="portal"
        cor={COR.clientes}
        titulo={cliente.nome}
        subtitulo={resumoDoProgresso(p)}
        acao={
          <a href={`/rodolfo/portal/${cliente.id}/contexto`} className={classeDeBotao('secundario')}>
            Baixar contexto (.md)
          </a>
        }
      />

      {searchParams.feito === 'cadastrado' && (
        // O formulário fica no fim da lista e a rolagem viria junto: o aviso e o link vêm para a vista (decisão 477).
        <LevarParaVista vez={`cadastrado:${cliente.id}:0`}>
          <Aviso tom="ok" titulo={`${cliente.nome} cadastrado.`}>
            Copie o link abaixo e mande pelo WhatsApp do cliente. As respostas aparecem aqui conforme ele preenche.
          </Aviso>
        </LevarParaVista>
      )}

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

      <section id="itens" aria-labelledby="itens-titulo" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="itens-titulo" className="text-[13px] font-semibold text-texto">
            Itens do formulário
          </h2>
          {/* O link desce até aqui (#itens): o filtro troca a lista, não o topo da página. */}
          <FiltroEmLinks
            rotulo="Filtrar itens por situação"
            quebra
            opcoes={FILTROS_DE_ITEM.map((f) => ({
              href: f.chave ? `${base}?estado=${f.chave}#itens` : `${base}#itens`,
              rotulo: `${f.rotulo} (${quantos[f.chave]})`,
              ativo: (filtro ?? '') === f.chave,
            }))}
          />
        </div>

        {filtro && blocos.length === 0 ? (
          <Painel>
            <Vazio
              titulo={vazioDoFiltro(filtro)}
              acao={
                <Link href={`${base}#itens`} className={`${LINK_DE_TEXTO} ff-toque`}>
                  Ver todos os itens
                </Link>
              }
            />
          </Painel>
        ) : (
          blocos.map((b) => (
            <Painel
              key={b.bloco}
              titulo={b.titulo}
              subtitulo={filtro ? mostradosNoBloco(b.situacoes.length, filtro) : undefined}
              acessorio={
                <span className="shrink-0 whitespace-nowrap">
                  <Contagem>{contagemDoBloco(b)}</Contagem>
                </span>
              }
            >
              <ul className="divide-y divide-linha">
                {b.situacoes.map((s) => {
                  const item = s.item;
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
          ))
        )}
      </section>

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
