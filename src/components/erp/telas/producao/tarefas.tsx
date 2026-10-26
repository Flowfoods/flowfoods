// Scanner avoid-ai-design, SD4d (P2) aceito: "Lote 261021-01 · da lista" e "Caio · 10:42" são a linha de apoio do cartão, no padrão "A · B" das telas da 1.1–3.2.
/**
 * A tela da cozinha (3.3): as tarefas de HOJE de uma loja, para o celular e o tablet compartilhado (botões de 56 px, poucas
 * palavras, uma ação por cartão). Em cima, quem está usando ("Você está como Caio. Não é você? Trocar de pessoa": no tablet
 * da cozinha cada um entra com o próprio acesso). Depois: "Com você" (o que eu peguei: concluir ou soltar), "Para pegar"
 * (lotes de hoje ou atrasados sem ninguém e as linhas da lista de hoje que ainda não viraram lote), "Com outras pessoas"
 * (quem pegou e desde quando; a gerência solta ou passa) e "Feitas hoje". Concluir é a tela da 3.1 (rendimento, motivo,
 * validade), que volta para cá. A mesma tela no nível 1 (que vê e gerencia, mas não pega).
 */

import { FormQueLimpaRascunhos } from '../cadastro/form-que-limpa-rascunhos';
import Link from 'next/link';
import { AtualizarSozinho } from './atualizar-sozinho';
import type { LinhaDaTarefa, LoteDaTarefa, TarefasDoDia } from '@/lib/erp/producao-equipe';
import { formatarRendimento, rendimentoDoLote, situacaoDosInsumos } from '@/lib/erp/producao-campos';
import { etiquetaDaFeita, horaDoDia, quandoPegou } from '@/lib/erp/producao-equipe-campos';
import { textoDoAtraso } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotaoDaCozinha, LINK_DE_TEXTO } from '../../ui/estilos';
import { EnvioComEstado } from '../../ui/botoes';
import { Aviso, Selo, Vazio } from '../../ui/superficies';
import { AvisoDoPeriodoFechado } from '../../ui/aviso-periodo-fechado';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeEstoque } from '../estoque/estado';
import { LevarParaVista } from './form-lista';
import { FormPassar, FormPegar, FormSoltar } from './form-tarefas';

const primeiraMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export interface AcoesDaCozinha {
  pegarLote: AcaoDeEstoque;
  pegarLinha: AcaoDeEstoque;
  soltar: AcaoDeEstoque;
  passar: AcaoDeEstoque;
  /** Trocar de pessoa no tablet compartilhado (sair); null no nível 1. */
  sair: (() => Promise<void>) | null;
}

function Secao({ id, titulo, contagem, children }: { id: string; titulo: string; contagem: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-linha pb-2">
        <h2 id={id} className="text-[15px] font-semibold text-texto">
          {titulo}
        </h2>
        <span className="text-[13px] tabular-nums text-suave">{contagem}</span>
      </div>
      {children}
    </section>
  );
}

/** O cartão de uma tarefa: o pré-preparo e quanto, grandes; embaixo, o lote, o atraso, os insumos e quem está com ele. */
function Cartao({ nome, quanto, apoio, selos, atrasado, children }: { nome: string; quanto: string; apoio: (string | null)[]; selos?: React.ReactNode; atrasado?: boolean; children?: React.ReactNode }) {
  return (
    <li className={`rounded-[14px] border border-linha bg-painel p-4 ${atrasado ? 'border-l-[3px] border-l-erro pl-[13px]' : ''}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-[18px] font-semibold leading-snug text-texto [overflow-wrap:anywhere]">{nome}</p>
          <p className="font-display text-[26px] font-bold leading-none tabular-nums text-texto">{quanto}</p>
          {apoio.filter(Boolean).length > 0 && <p className="pt-1 text-[13px] tabular-nums text-suave">{apoio.filter(Boolean).join(' · ')}</p>}
          {selos && <div className="flex flex-wrap gap-2 pt-1">{selos}</div>}
        </div>
        {children && <div className="flex shrink-0 flex-col gap-2 md:w-[15rem]">{children}</div>}
      </div>
    </li>
  );
}

function Insumos({ l }: { l: LoteDaTarefa }) {
  if (!l.requisicaoDoLote) return null;
  const entregues = l.requisicaoDoLote.status === 'ATENDIDA';
  return <span className={`text-[13px] font-medium ${entregues ? 'text-ok' : 'text-atencao'}`}>{situacaoDosInsumos(l.requisicaoDoLote.status, l.requisicaoDoLote.numero)}</span>;
}

function apoioDoLote(l: LoteDaTarefa) {
  return [`Lote ${l.codigo}`, l.daLista ? 'da lista' : null];
}

export function TelaTarefas({
  t,
  base,
  contexto,
  feito,
  eu,
  pessoas,
  acoes,
  bloqueio,
  periodosHref,
  etiquetaHref = null,
  veEtiquetas = false,
}: {
  t: TarefasDoDia;
  /** `/erp/producao` ou o espelho do nível 1. */
  base: string;
  contexto?: string;
  feito?: string;
  /** Quem está usando (a pessoa do login); null no nível 1. */
  eu: { nome: string } | null;
  /** Quem pode receber um lote (só para a gerência; vazio para a cozinha). */
  pessoas: readonly { usuarioId: string; nome: string }[];
  acoes: AcoesDaCozinha;
  bloqueio: string | null;
  periodosHref: string | null;
  /** Depois de concluir pelas Tarefas: a etiqueta do lote que acabou de sair (só para quem imprime etiquetas). */
  etiquetaHref?: string | null;
  /** Quem imprime etiquetas na loja vê, em "Feitas hoje", se o lote já tem etiqueta (decisão 475). */
  veEtiquetas?: boolean;
}) {
  const aqui = `${base}/tarefas/${t.loja.id}`;
  const doLote = `${base}/${t.loja.id}`;
  const pega = t.pode.pegar && !bloqueio;
  const gerencia = t.pode.gerenciar && !bloqueio;
  const vez = String(Date.now());
  const linhas = t.paraPegar.filter((x): x is LinhaDaTarefa => x.tipo === 'LINHA');
  const subtitulo = [contexto, t.loja.nome, primeiraMaiuscula(t.rotuloDeHoje)].filter(Boolean).join(' · ');
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AtualizarSozinho />
      <TrilhaDaPagina itens={[{ rotulo: t.loja.nome }]} />
      <PageHeader icone="producao" cor={COR.producao} titulo="Tarefas da cozinha" subtitulo={subtitulo}>
        {eu ? (
          <div className="flex flex-col gap-2 rounded-[14px] border border-linha bg-painel px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-texto">
              Você está como <span className="font-semibold">{eu.nome}</span>.
            </p>
            {acoes.sair && (
              <FormQueLimpaRascunhos action={acoes.sair} className="self-start sm:self-auto">
                <EnvioComEstado pendente="Trocando…" className={classeDeBotaoDaCozinha('fantasma', '!px-0 text-[15px] underline decoration-linha-forte underline-offset-4 sm:!px-3')}>
                  Não é você? Trocar de pessoa
                </EnvioComEstado>
              </FormQueLimpaRascunhos>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-suave">A FlowFoods vê as tarefas e pode soltar ou passar um lote; quem pega é a equipe da loja.</p>
        )}
      </PageHeader>
      {feito && (
        <LevarParaVista vez={`${feito}:${vez}`}>
          <Aviso tom="ok" titulo={feito} />
          {etiquetaHref && (
            <Link href={etiquetaHref} className={classeDeBotaoDaCozinha('primario', 'mt-3 w-full sm:w-auto')}>
              Imprimir a etiqueta do lote
            </Link>
          )}
        </LevarParaVista>
      )}
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}
      {t.periodoFechado && <AvisoDoPeriodoFechado periodo={t.periodoFechado} href={periodosHref} frase="Hoje é desse período: a lista não vira lote e o lote não conclui (pegar e soltar continuam valendo)." />}
      {!t.aberto && <Aviso tom="alerta" titulo={`O estoque da ${t.loja.nome} ainda não foi aberto.`}>A produção baixa os insumos do estoque: ela começa depois da contagem de abertura.</Aviso>}

      {(t.comigo.length > 0 || eu) && (
        <Secao id="tarefas-comigo" titulo="Com você" contagem={t.comigo.length}>
          {t.comigo.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-linha px-4 py-5 text-center text-[15px] text-suave">Nada com você agora. Pegue uma tarefa abaixo.</p>
          ) : (
            <ol className="space-y-3">
              {t.comigo.map((l) => {
                const entregues = l.requisicaoDoLote?.status === 'ATENDIDA';
                const motivo = `falta-${l.id}`;
                return (
                  <Cartao
                    key={l.id}
                    nome={l.nome}
                    quanto={formatarQuantidade(l.planejadoMilesimos, l.unidade)}
                    apoio={[...apoioDoLote(l), quandoPegou(l.responsavel!.desde, t.hoje, l.responsavel!.passadoPor)]}
                    atrasado={l.atrasoDias > 0}
                    selos={
                      <>
                        {l.atrasoDias > 0 && <Selo tom="erro">{textoDoAtraso(l.atrasoDias)}</Selo>}
                        <Insumos l={l} />
                      </>
                    }
                  >
                    {pega && entregues ? (
                      <Link href={`${aqui}/${l.id}/concluir`} className={classeDeBotaoDaCozinha('primario', 'w-full')}>
                        Concluir
                      </Link>
                    ) : pega ? (
                      <>
                        <button type="button" disabled aria-describedby={motivo} className={classeDeBotaoDaCozinha('secundario', 'w-full')}>
                          Concluir
                        </button>
                        <span id={motivo} className="text-[13px] text-suave">
                          Falta o estoque entregar os insumos.
                        </span>
                      </>
                    ) : null}
                    {pega && <FormSoltar key={`soltar-${l.id}-${l.versao}`} acao={acoes.soltar} lote={l.id} versao={l.versao} recarregar={aqui} voltar="tarefas" />}
                    <Link href={`${doLote}/${l.id}`} className={`${LINK_DE_TEXTO} ff-toque inline-flex min-h-11 items-center self-start text-[14px]`}>
                      Abrir o lote {l.codigo}
                    </Link>
                  </Cartao>
                );
              })}
            </ol>
          )}
        </Secao>
      )}

      <Secao id="tarefas-pegar" titulo="Para pegar" contagem={t.paraPegar.length}>
        {/* Estoque não aberto e período fechado: o aviso do alto já diz (uma vez só); aqui, só a loja desativada. */}
        {t.naoGeraLinha && t.aberto && !t.periodoFechado && linhas.length > 0 && <Aviso tom="alerta" titulo={t.naoGeraLinha} />}
        {t.paraPegar.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-linha">
            <Vazio titulo="Nada para pegar agora.">Quem define o que produzir é a gerência, na Lista do dia.</Vazio>
          </div>
        ) : (
          <ol className="space-y-3">
            {t.paraPegar.map((x) =>
              x.tipo === 'LOTE' ? (
                <Cartao
                  key={x.id}
                  nome={x.nome}
                  quanto={formatarQuantidade(x.planejadoMilesimos, x.unidade)}
                  apoio={[...apoioDoLote(x), x.status === 'EM_EXECUCAO' ? 'começado, sem ninguém' : null]}
                  atrasado={x.atrasoDias > 0}
                  selos={
                    <>
                      {x.atrasoDias > 0 && <Selo tom="erro">{textoDoAtraso(x.atrasoDias)}</Selo>}
                      <Insumos l={x} />
                    </>
                  }
                >
                  {pega && <FormPegar key={`pegar-${x.id}-${x.versao}`} acao={acoes.pegarLote} campos={{ lote: x.id, versao: String(x.versao) }} rotulo={`Pegar ${x.nome}, ${formatarQuantidade(x.planejadoMilesimos, x.unidade)}`} recarregar={aqui} voltar="tarefas" />}
                  {gerencia && x.status === 'EM_EXECUCAO' && <FormPassar key={`passar-${x.id}-${x.versao}`} acao={acoes.passar} lote={x.id} versao={x.versao} pessoas={pessoas} atual={null} recarregar={aqui} voltar="tarefas" />}
                  <Link href={`${doLote}/${x.id}`} className={`${LINK_DE_TEXTO} ff-toque inline-flex min-h-11 items-center self-start text-[14px]`}>
                    Abrir o lote {x.codigo}
                  </Link>
                </Cartao>
              ) : (
                <Cartao key={x.linhaId} nome={x.nome} quanto={formatarQuantidade(x.quantidadeMilesimos, x.unidade)} apoio={['da lista de hoje', 'vira lote ao pegar']}>
                  {!x.disponivel ? (
                    <p className="text-[13px] text-atencao">A ficha não vira lote (desativada ou mudou de unidade): fale com a gerência.</p>
                  ) : pega && !t.naoGeraLinha ? (
                    <FormPegar acao={acoes.pegarLinha} campos={{ linha: x.linhaId, ficha: x.fichaId, quantidade: String(x.quantidadeMilesimos) }} rotulo={`Pegar ${x.nome}, ${formatarQuantidade(x.quantidadeMilesimos, x.unidade)}`} recarregar={aqui} voltar="tarefas" />
                  ) : null}
                </Cartao>
              ),
            )}
          </ol>
        )}
      </Secao>

      <Secao id="tarefas-outros" titulo="Com outras pessoas" contagem={t.comOutros.length}>
        {t.comOutros.length === 0 ? (
          <p className="text-[14px] text-suave">Ninguém mais está com lote agora.</p>
        ) : (
          <ol className="space-y-3">
            {t.comOutros.map((l) => (
              <Cartao
                key={l.id}
                nome={l.nome}
                quanto={formatarQuantidade(l.planejadoMilesimos, l.unidade)}
                apoio={apoioDoLote(l)}
                atrasado={l.atrasoDias > 0}
                selos={
                  <>
                    <span className="text-[14px] font-semibold text-texto">
                      com {l.responsavel!.nome} · {quandoPegou(l.responsavel!.desde, t.hoje, l.responsavel!.passadoPor)}
                    </span>
                    {l.atrasoDias > 0 && <Selo tom="erro">{textoDoAtraso(l.atrasoDias)}</Selo>}
                    <Insumos l={l} />
                  </>
                }
              >
                {gerencia && (
                  <>
                    <FormPassar key={`passar-${l.id}-${l.versao}`} acao={acoes.passar} lote={l.id} versao={l.versao} pessoas={pessoas} atual={l.responsavel!.nome} recarregar={aqui} voltar="tarefas" />
                    <FormSoltar key={`soltar-${l.id}-${l.versao}`} acao={acoes.soltar} lote={l.id} versao={l.versao} recarregar={aqui} voltar="tarefas" deOutro={l.responsavel!.nome} />
                  </>
                )}
                <Link href={`${doLote}/${l.id}`} className={`${LINK_DE_TEXTO} ff-toque inline-flex min-h-11 items-center self-start text-[14px]`}>
                  Abrir o lote {l.codigo}
                </Link>
              </Cartao>
            ))}
          </ol>
        )}
      </Secao>

      <Secao id="tarefas-feitas" titulo="Feitas hoje" contagem={t.feitasHoje.length}>
        {t.feitasHoje.length === 0 ? (
          <p className="text-[14px] text-suave">Nenhum lote concluído hoje ainda.</p>
        ) : (
          <ul className="divide-y divide-linha rounded-[14px] border border-linha bg-painel">
            {t.feitasHoje.map((f) => {
              const perdido = f.produzidoMilesimos === 0;
              const r = perdido ? null : rendimentoDoLote(f.planejadoMilesimos, f.produzidoMilesimos);
              const etiqueta = etiquetaDaFeita(f, veEtiquetas);
              return (
                <li key={f.id}>
                  <Link href={`${doLote}/${f.id}`} className="ff-transicao flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-texto/[0.03] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="min-w-0 text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">
                      {f.nome} <span className="whitespace-nowrap font-normal tabular-nums text-suave">· lote {f.codigo}</span>
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-suave">
                      {perdido ? <span className="font-semibold text-erro">lote perdido</span> : `${formatarQuantidade(f.produzidoMilesimos, f.unidade)} de ${formatarQuantidade(f.planejadoMilesimos, f.unidade)} · rendeu ${formatarRendimento(r!.rendimentoBp)}`}
                      {r?.foraDaFaixa && <span className="text-atencao"> · fora de ±10%</span>}
                      {/* Lote que saiu e ainda não tem etiqueta: escrito, não só cor (o lote perdido não leva etiqueta). */}
                      {etiqueta === 'com etiqueta' && ' · com etiqueta'}
                      {etiqueta === 'sem etiqueta' && <span className="font-semibold text-atencao"> · sem etiqueta</span>}
                      {' · '}
                      {f.feitoPor ?? 'sem quem fez'} · {horaDoDia(f.concluidaEm, t.hoje)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      <p className="text-[13px] text-suave">
        {t.depois > 0 ? `Mais ${t.depois} ${t.depois === 1 ? 'lote planejado' : 'lotes planejados'} para os próximos dias. ` : ''}
        <Link href={`${base}/${t.loja.id}`} className={`${LINK_DE_TEXTO} ff-toque`}>
          Ver todos os lotes
        </Link>
        {' · '}
        <Link href={`${base}/lista/${t.loja.id}`} className={`${LINK_DE_TEXTO} ff-toque`}>
          Ver a lista do dia
        </Link>
      </p>
    </div>
  );
}
