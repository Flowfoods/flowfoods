// Scanner avoid-ai-design, SD4d (P2) aceito: "Mais caro (A) · R$ 840,00" e "3 de 5 contados · prazo 17/10" são linhas de apoio da lista densa, no padrão "A · B" das telas da 1.1–1.6.
/**
 * Período e contagens da loja (1.7), a MESMA tela no nível 1 e no parceiro:
 * a cobertura do período contra o piso (valor e insumos), o que falta contar
 * (os "para o piso" primeiro), o fechamento (abre nos 3 últimos dias; não
 * fecha abaixo do piso), as contagens da loja e as regras (piso, frequência,
 * tolerância), que só quem cadastra lojas muda.
 *
 * `PainelDaContagem` é o resumo que aparece no estoque da loja.
 */

import Link from 'next/link';
import type { ResumoDaContagemDaLoja, SituacaoDoPeriodo } from '@/lib/erp/contagem';
import { camposDasRegras, porcento, ROTULO_DA_CONTAGEM } from '@/lib/erp/contagem-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Barra, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { IconeDaConservacao } from '../cadastro/validade';
import { Voltar } from '../cadastro/partes';
import { CoberturaComPiso } from './cobertura';
import type { AcaoDeEstoque } from './estado';
import { fraseDoEstoque } from './estado';
import { FormIniciarFechamento, FormRegrasDaContagem } from './formularios';

type Aberta = Extract<SituacaoDoPeriodo, { aberto: true }>;

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date) => DATA_HORA.format(d).replace(',', ' às');
const dataCurta = (iso: string) => formatarData(iso, true);

export function SeloDaContagem({ c }: { c: Pick<ResumoDaContagemDaLoja, 'estado'> }) {
  const tom = c.estado === 'APLICADA' || c.estado === 'APLICADA_SOZINHA' ? 'ok' : c.estado === 'VENCIDA' || c.estado === 'EM_CONTAGEM' ? 'alerta' : 'neutro';
  return <Selo tom={tom}>{ROTULO_DA_CONTAGEM[c.estado]}</Selo>;
}

function ListaDeContagens({ contagens, aqui, vazio }: { contagens: ResumoDaContagemDaLoja[]; aqui: string; vazio: string }) {
  if (contagens.length === 0) return <p className="px-4 py-4 text-sm text-suave sm:px-5">{vazio}</p>;
  return (
    <ul className="divide-y divide-linha">
      {contagens.map((c) => {
        const aberta = c.estado === 'EM_CONTAGEM' || c.estado === 'PRONTA';
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <Link href={`${aqui}/contagens/${c.id}${aberta ? '' : '/conferir'}`} className="font-medium text-texto underline-offset-4 hover:underline">
                {c.titulo}
              </Link>
              <div className="mt-0.5 text-[12px] tabular-nums text-suave">
                {c.contados} de {c.total} contados
                {aberta && c.fechaAutomaticoEm ? ` · prazo ${quando(c.fechaAutomaticoEm)}` : ''}
                {!aberta && c.fechadaEm ? ` · ${quando(c.fechadaEm)}` : ''}
              </div>
              {aberta && (
                <div className="mt-1.5 max-w-xs">
                  <Barra valor={c.contados} total={c.total} tom={c.estado === 'PRONTA' ? 'ok' : 'alerta'} rotulo={`${c.contados} de ${c.total} contados`} />
                </div>
              )}
            </div>
            <SeloDaContagem c={c} />
          </li>
        );
      })}
    </ul>
  );
}

/** Resumo no estoque da loja: cobertura do período, contagens abertas e os atalhos. */
export function PainelDaContagem({ s, aqui, pode }: { s: Aberta; aqui: string; pode: { planejar: boolean } }) {
  const abertas = s.contagens.filter((c) => c.estado === 'EM_CONTAGEM' || c.estado === 'PRONTA');
  const falta = s.cobertura.paraOPiso.length;
  return (
    <Painel
      titulo="Contagem do dia a dia"
      subtitulo={`${s.periodo.nome} · ${s.cobertura.atinge ? 'cobertura no piso' : `faltam ${falta} ${falta === 1 ? 'insumo' : 'insumos'} para o piso`}`}
      acessorio={
        <Link href={`${aqui}/periodo`} className={LINK_DE_TEXTO}>
          Período e regras
        </Link>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CoberturaComPiso c={s.cobertura} regras={s.regras} />
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-texto">Em andamento</div>
          {abertas.length === 0 ? (
            <p className="mt-1 text-sm text-suave">Nenhuma contagem aberta.</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {abertas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`${aqui}/contagens/${c.id}`} className="min-w-0 truncate font-medium text-texto underline-offset-4 hover:underline">
                    {c.titulo}
                  </Link>
                  <span className="shrink-0 text-[12px] tabular-nums text-suave">
                    {c.contados} de {c.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {pode.planejar && (
              <Link href={`${aqui}/contagens/nova`} className={classeDeBotao('primario', 'w-full sm:w-auto')}>
                Planejar contagem
              </Link>
            )}
            <Link href={`${aqui}/periodo`} className={classeDeBotao('secundario', 'w-full sm:w-auto')}>
              Ver o período
            </Link>
          </div>
        </div>
      </div>
    </Painel>
  );
}

export function TelaPeriodo({
  s,
  base,
  contexto,
  feito,
  pode,
  acoes,
  bloqueio,
}: {
  s: Aberta;
  base: string;
  contexto?: string;
  feito?: string;
  pode: { ajustar: boolean; contar: boolean; regras: boolean };
  acoes: { fechar: AcaoDeEstoque; regras: AcaoDeEstoque };
  bloqueio: string | null;
}) {
  const aqui = `${base}/${s.loja.id}`;
  const f = s.fechamento;
  const mensagem = fraseDoEstoque(feito);
  const mostrados = s.faltam.slice(0, 40);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: s.loja.nome, href: aqui }, { rotulo: 'Período e contagens' }]} />
      <Voltar href={aqui}>Voltar para o estoque da {s.loja.nome}</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo="Período e contagens"
        subtitulo={[contexto, s.loja.nome, s.periodo.nome.includes(dataCurta(s.periodo.inicio)) ? s.periodo.nome : `${s.periodo.nome} (${dataCurta(s.periodo.inicio)} a ${dataCurta(s.periodo.fim)})`].filter(Boolean).join(' · ')}
        acao={f?.status === 'FECHADA' ? <Selo tom="ok">Período fechado</Selo> : s.cobertura.atinge ? <Selo tom="ok">No piso</Selo> : <Selo tom="alerta">Abaixo do piso</Selo>}
      />
      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {s.aviso && <Aviso tom="alerta" titulo={s.aviso} />}
      {s.anterior && (
        <Aviso tom="alerta" titulo={`O período anterior (${s.anterior.periodo.nome}) ficou sem fechar.`}>
          {pode.ajustar && !bloqueio ? (
            <span className="mt-2 block">
              <FormIniciarFechamento acao={acoes.fechar} inicio={s.anterior.periodo.inicio} rotulo="Fechar o período anterior" variante="secundario" />
            </span>
          ) : (
            'Gerente ou dona fecham.'
          )}
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Painel
            titulo="Cobertura do período"
            subtitulo={`Insumos com contagem aplicada de ${dataCurta(s.periodo.inicio)} a ${dataCurta(s.periodo.fim)}, sobre os que têm saldo`}
          >
            <CoberturaComPiso c={s.cobertura} regras={s.regras} />
            <p className="mt-4 border-t border-linha pt-3 text-sm text-suave">
              {f?.status === 'FECHADA' ? (
                <span className="font-semibold text-texto">O estoque deste período já fechou. A cobertura acima é a de agora, com o saldo depois dos ajustes.</span>
              ) : s.cobertura.atinge ? (
                <span className="font-semibold text-texto">A cobertura chegou ao piso: o período pode fechar.</span>
              ) : (
                <>
                  <span className="font-semibold text-texto">
                    Para fechar, conte mais {s.cobertura.paraOPiso.length} {s.cobertura.paraOPiso.length === 1 ? 'insumo' : 'insumos'}
                  </span>{' '}
                  (os marcados “para o piso” abaixo, do maior valor para o menor).
                </>
              )}
            </p>
          </Painel>

          <Painel titulo="O que falta contar no período" subtitulo="Sem contagem aplicada desde o início do período" semRespiro acessorio={<Selo tom={s.faltam.length ? 'alerta' : 'ok'}>{s.faltam.length || 'nada'}</Selo>}>
            {s.faltam.length === 0 ? (
              <Vazio>Todos os insumos com saldo já foram contados neste período.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {mostrados.map((i) => (
                  <li key={i.insumoId} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <IconeDaConservacao conservacao={i.conservacao} />
                      <span className="min-w-0 truncate font-medium text-texto">{i.nome}</span>
                      {i.paraOPiso && <Selo tom="alerta">para o piso</Selo>}
                    </span>
                    <span className="shrink-0 tabular-nums text-suave">{i.valorCentavos === null ? 'sem preço' : formatarDinheiro(i.valorCentavos)}</span>
                  </li>
                ))}
                {s.faltam.length > mostrados.length && <li className="px-4 py-2.5 text-[13px] text-suave sm:px-5">E mais {s.faltam.length - mostrados.length} insumos.</li>}
              </ul>
            )}
          </Painel>

          <Painel
            titulo="Contagens da loja"
            subtitulo="As abertas e as últimas fechadas"
            semRespiro
            acessorio={
              pode.ajustar && !bloqueio && !(f?.status === 'ABERTA') ? (
                <Link href={`${aqui}/contagens/nova`} className={LINK_DE_TEXTO}>
                  Planejar contagem
                </Link>
              ) : undefined
            }
          >
            <ListaDeContagens contagens={s.contagens} aqui={aqui} vazio="Nenhuma contagem do dia a dia ainda." />
          </Painel>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20" aria-label="Fechamento e regras">
          <Painel titulo="Fechamento do período" subtitulo="O estoque final fotografado é a base do CMV">
            {s.periodoFechadoNoDre ? (
              <p className="text-sm text-suave">Este período já foi fechado no DRE.</p>
            ) : f?.status === 'FECHADA' ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-texto">Fechado{f.fechadaEm ? ` em ${quando(f.fechadaEm)}` : ''}{f.fechadaPorNome ? ` por ${f.fechadaPorNome}` : ''}.</p>
                <p className="text-suave">
                  Estoque final: <span className="font-semibold tabular-nums text-texto">{formatarDinheiro(f.valorTotalCentavos ?? 0)}</span>
                </p>
                <Link href={`${aqui}/contagens/${f.id}/conferir`} className={LINK_DE_TEXTO}>
                  Ver o fechamento
                </Link>
              </div>
            ) : f?.status === 'ABERTA' ? (
              <div className="space-y-3 text-sm">
                <p className="text-suave">
                  Começado{f.iniciadaPorNome ? ` por ${f.iniciadaPorNome}` : ''} em {quando(f.criadoEm)}. Conte o que falta e feche quando a cobertura chegar ao piso.
                </p>
                <div className="flex flex-col gap-2">
                  {pode.contar && !bloqueio && (
                    <Link href={`${aqui}/contagens/${f.id}`} className={classeDeBotao('secundario', 'w-full')}>
                      Continuar a contagem
                    </Link>
                  )}
                  <Link href={`${aqui}/contagens/${f.id}/conferir`} className={classeDeBotao(pode.ajustar ? 'primario' : 'secundario', 'w-full')}>
                    {pode.ajustar ? 'Conferir e fechar' : 'Ver o andamento'}
                  </Link>
                </div>
              </div>
            ) : s.janela.pode ? (
              <div className="space-y-3 text-sm text-suave">
                <p>A lista traz o que ainda não foi contado no período. O período só fecha com a cobertura no piso.</p>
                {pode.ajustar && !bloqueio ? <FormIniciarFechamento acao={acoes.fechar} inicio={s.periodo.inicio} /> : <p>Gerente ou dona começam o fechamento.</p>}
              </div>
            ) : (
              <p className="text-sm text-suave">
                Abre em <span className="font-semibold text-texto">{dataCurta(s.janela.abreEm)}</span> (os 3 últimos dias do período). Até lá, siga com as contagens do dia a dia.
              </p>
            )}
          </Painel>

          <Painel titulo="Regras da contagem" subtitulo={pode.regras ? 'Valem para esta loja' : 'Só quem cadastra lojas muda'}>
            {pode.regras && !bloqueio ? (
              <FormRegrasDaContagem acao={acoes.regras} campos={camposDasRegras(s.regras)} lidas={JSON.stringify(s.regras)} />
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-suave">Piso para fechar</dt>
                  <dd className="tabular-nums text-texto">
                    {porcento(s.regras.pisoValorBp)} do valor · {porcento(s.regras.pisoItensBp)} dos insumos
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-suave">Contar a cada</dt>
                  <dd className="tabular-nums text-texto">
                    mais caros (A) {s.regras.freqADias} dias · médios (B) {s.regras.freqBDias} · menores (C) {s.regras.freqCDias}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-suave">Fecha sozinha até</dt>
                  <dd className="tabular-nums text-texto">{formatarDinheiro(s.regras.toleranciaCentavos)} por item</dd>
                </div>
              </dl>
            )}
          </Painel>
        </aside>
      </div>
    </div>
  );
}
