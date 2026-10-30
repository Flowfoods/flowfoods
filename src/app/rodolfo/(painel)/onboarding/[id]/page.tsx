/**
 * Um pedido de acesso (0.5): quem pediu, o que já existe no sistema com esse
 * contato (só o nível 1 vê), o histórico (etapa antes/depois, motivo e autor) e
 * a decisão. Tudo que veio do lead é texto: o React escapa; os links
 * (WhatsApp, e-mail) são montados aqui, só de dado conferido.
 */

import { HistoricoRecolhivel } from '@/components/erp/telas/historico/historico-recolhivel';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirNivel1 } from '@/lib/erp/contexto';
import { contaDoEmail } from '@/lib/erp/credenciais';
import { COR } from '@/lib/erp/modulos';
import {
  ROTULO_DA_ETAPA,
  formatarWhatsapp,
  guardadoAte,
  linkDoEmail,
  linkDoWhatsApp,
  textoDaEtapa,
  textoDoEvento,
} from '@/lib/erp/pedido-campos';
import { obterPedido } from '@/lib/erp/pedidos';
import { PageHeader } from '@/components/erp/ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '@/components/erp/ui/estilos';
import { Aviso, Linha, Painel, Selo } from '@/components/erp/ui/superficies';
import { TrilhaDaPagina } from '@/components/erp/shell/trilha';
import { Voltar } from '@/components/erp/telas/cadastro/partes';
import { acaoAtivarPedido, acaoExcluirDadosDoPedido, acaoMoverPedido, acaoRecusarPedido } from '../actions';
import { DecisaoDoPedido, ExcluirDados } from './decisao';

export const dynamic = 'force-dynamic';

const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DIA_ANO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

const SITUACAO_DO_LEAD: Record<string, string> = {
  NOVO: 'novo',
  EM_CADENCIA: 'em cadência',
  RESPONDEU: 'respondeu',
  DIAGNOSTICO_PREENCHIDO: 'diagnóstico preenchido',
  DIAGNOSTICO_AGENDADO: 'diagnóstico agendado',
  DIAGNOSTICO_FEITO: 'diagnóstico feito',
  PROPOSTA: 'proposta',
  CLIENTE: 'cliente',
  PERDIDO: 'perdido',
  OPT_OUT: 'pediu para não receber mensagens',
  CONFLITO: 'em conflito',
};

const TOM = { NOVO: 'alerta', EM_CONVERSA: 'neutro', ATIVADO: 'ok', RECUSADO: 'neutro' } as const;

export default async function PedidoPage({ params, searchParams }: { params: { id: string }; searchParams: { feito?: string } }) {
  await exigirNivel1();
  const p = await obterPedido(params.id);
  if (!p) notFound();

  const conta = p.email ? await contaDoEmail(p.email) : { existe: false, parceiros: [] };
  const conversa = linkDoWhatsApp(
    p.whatsapp,
    `Oi, ${p.responsavel.split(' ')[0]}! Aqui é o Rodolfo, da FlowFoods. Recebi o pedido de vocês e queria entender melhor a operação.`,
  );
  const email = linkDoEmail(p.email);
  const decidiu = p.eventos.find((e) => e.acao === 'ATIVOU' || e.acao === 'RECUSOU');
  const aberto = p.status === 'NOVO' || p.status === 'EM_CONVERSA';

  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: p.nomeGrupo }]} />
      <Voltar href="/rodolfo/onboarding">Voltar para Aguardando liberação</Voltar>
      <PageHeader
        icone="acesso"
        cor={COR.parceiros}
        titulo={p.nomeGrupo}
        subtitulo={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Selo tom={TOM[p.status]}>{ROTULO_DA_ETAPA[p.status]}</Selo>
            {p.atrasoDias > 0 && <Selo tom="erro">{`${p.atrasoDias}d de atraso`}</Selo>}
            <span>{aberto ? `na etapa ${textoDaEtapa(p.etapaDesde)}` : `${ROTULO_DA_ETAPA[p.status].toLowerCase()} ${textoDaEtapa(p.etapaDesde)}`}</span>
          </span>
        }
      />
      {searchParams.feito === 'manual' && <Aviso tom="ok" titulo="Pedido cadastrado." />}
      {p.leadDoBarney && (
        <Aviso tom="alerta" titulo={`Este WhatsApp já está no Barney: ${SITUACAO_DO_LEAD[p.leadDoBarney] ?? p.leadDoBarney}.`}>
          Só aviso: nada foi pausado na cadência.
        </Aviso>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)] lg:grid-rows-[auto_1fr]">
        <Painel titulo="Quem pediu" className="self-start lg:col-start-1">
          {p.excluido ? (
            <p className="text-sm text-suave">Os dados pessoais deste pedido foram excluídos.</p>
          ) : (
            <dl className="space-y-3 text-sm">
              <Linha rotulo="Responsável">{p.responsavel}</Linha>
              <Linha rotulo="WhatsApp">
                {conversa ? (
                  <a href={conversa} target="_blank" rel="noopener noreferrer" className={`${LINK_DE_TEXTO} tabular-nums`}>
                    {formatarWhatsapp(p.whatsapp)}
                  </a>
                ) : (
                  <span className="tabular-nums">{formatarWhatsapp(p.whatsapp)}</span>
                )}
              </Linha>
              <Linha rotulo="E-mail">
                {email ? (
                  <a href={email} className={`${LINK_DE_TEXTO} break-all`}>
                    {p.email}
                  </a>
                ) : (
                  <span className="break-all">{p.email}</span>
                )}
              </Linha>
              <Linha rotulo="Cidade">{p.cidade}</Linha>
              <Linha rotulo="Lojas e marcas">
                <span className="tabular-nums">
                  {p.lojas} {p.lojas === 1 ? 'loja' : 'lojas'} · {p.marcas} {p.marcas === 1 ? 'marca' : 'marcas'}
                </span>
              </Linha>
              <Linha rotulo="Origem">{p.origem === 'LANDING' ? 'Formulário do site' : 'Digitado por você'}</Linha>
              <Linha rotulo="Chegou em">
                <span className="tabular-nums">{DIA_HORA.format(p.criadoEm).replace(',', ' às')}</span>
              </Linha>
              {p.reenvios > 0 && (
                <Linha rotulo="Mandou de novo">
                  <span className="tabular-nums">{p.reenvios}×</span>
                </Linha>
              )}
              <Linha rotulo="Autorização (LGPD)">
                {p.consentimentoEm ? (
                  <span className="tabular-nums">
                    aceita em {DIA_HORA.format(p.consentimentoEm).replace(',', ' às')} · texto {p.consentimentoVersao}
                  </span>
                ) : (
                  'não pedida (pedido digitado)'
                )}
              </Linha>
            </dl>
          )}
        </Painel>

        <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <DecisaoDoPedido
            status={p.status}
            versao={p.versao}
            padrao={{ nomeParceiro: p.nomeGrupo, donoNome: p.responsavel, donoEmail: p.email }}
            conflito={conta.existe ? { email: p.email } : null}
            ativar={acaoAtivarPedido.bind(null, p.id)}
            mover={acaoMoverPedido.bind(null, p.id)}
            recusar={acaoRecusarPedido.bind(null, p.id)}
          />
          {p.status === 'ATIVADO' && p.parceiro && (
            <Painel titulo="Ativado">
              <div className="space-y-3 text-sm">
                <p className="text-suave">
                  Parceiro{' '}
                  <Link href={`/rodolfo/erp/${p.parceiro.slug}`} className={LINK_DE_TEXTO}>
                    {p.parceiro.nome}
                  </Link>
                  {decidiu ? `, ativado em ${DIA_HORA.format(decidiu.ocorridoEm).replace(',', ' às')} por ${decidiu.autorNome}` : ''}.
                </p>
                <p className="text-[13px] text-suave">Perdeu o link do dono? Gere outro na Equipe do parceiro.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/rodolfo/erp/${p.parceiro.slug}`} className={classeDeBotao('secundario')}>
                    Abrir o parceiro
                  </Link>
                  <Link href={`/rodolfo/erp/${p.parceiro.slug}/equipe`} className={classeDeBotao('fantasma')}>
                    Equipe
                  </Link>
                </div>
              </div>
            </Painel>
          )}
          {p.status === 'RECUSADO' && (
            <Painel titulo="Recusado">
              <div className="space-y-4 text-sm">
                <p className="break-words text-texto">
                  <span className="text-suave">Motivo: </span>
                  {p.motivoRecusa}
                </p>
                {decidiu && (
                  <p className="text-[13px] text-suave">
                    Recusado em {DIA_HORA.format(decidiu.ocorridoEm).replace(',', ' às')} por {decidiu.autorNome}.
                  </p>
                )}
                {!p.excluido && (
                  <p className="text-[13px] text-suave">Os dados ficam guardados até {DIA_ANO.format(guardadoAte(p.etapaDesde))} (180 dias).</p>
                )}
                <ExcluirDados excluir={acaoExcluirDadosDoPedido.bind(null, p.id)} jaExcluido={p.excluido} />
              </div>
            </Painel>
          )}
        </div>

        <HistoricoRecolhivel chave={p.id} quantidade={p.eventos.length} titulo="Histórico" subtitulo="Só a etapa, o motivo e quem fez." className="self-start lg:col-start-1">
          <ol className="space-y-3 text-sm">
            {p.eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <span className="min-w-0 break-words text-texto">{textoDoEvento(e)}</span>
                <span className="shrink-0 text-[12px] tabular-nums text-suave">
                  {DIA_HORA.format(e.ocorridoEm).replace(',', ' às')} · {e.autorNome}
                </span>
              </li>
            ))}
          </ol>
        </HistoricoRecolhivel>
      </div>
    </div>
  );
}
