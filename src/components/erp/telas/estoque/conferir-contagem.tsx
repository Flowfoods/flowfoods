// Scanner avoid-ai-design, SD4d (P2) aceito: "Refrigerado · contou Caio às 14:02" e "R$ 18,98 a menos · fora da tolerância" são linhas de apoio da tabela densa, no padrão "A · B" das telas da 1.1–1.6.
/**
 * Conferir uma contagem do dia a dia ou o fechamento do período (1.7), a
 * MESMA tela no nível 1 e no parceiro. Para cada item contado: o que o livro
 * dizia quando contou (esperado), o contado, a diferença em quantidade e em
 * R$ (custo de referência de agora), o que entrou/saiu depois de contar e
 * em quanto o saldo fica. Diferença não é perda (a 1.8 cruza com a
 * requisição). Aplicar = gerente ou dona; no fechamento, só com a cobertura
 * do período no piso. Fechada: o resultado, sem botão.
 */

import { fraseDoSemPreco } from '@/lib/erp/cmv-campos';
import Link from 'next/link';
import type { ConferenciaDaContagem, LinhaDaDivergencia } from '@/lib/erp/contagem';
import { coberturaDe, fraseAbaixoDoPiso, ROTULO_DA_CONTAGEM, textoDoValorDaDiferenca } from '@/lib/erp/contagem-campos';
import { quantidadeComSinal, ROTULO_DO_MOVIMENTO } from '@/lib/erp/estoque-campos';
import { COR } from '@/lib/erp/modulos';
import { CONSERVACOES } from '@/lib/erp/validade';
import { formatarDinheiro, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { IconeDaConservacao } from '../cadastro/validade';
import { Voltar } from '../cadastro/partes';
import { CoberturaComPiso } from './cobertura';
import type { AcaoDeEstoque } from './estado';
import { fraseDoEstoque } from './estado';
import { FormConcluirContagem, FormDescartarContagem } from './formularios';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const quando = (d: Date) => DATA_HORA.format(d).replace(',', ' às');
const qtd = (m: number, u: Unidade) => (m < 0 ? `−${formatarQuantidade(-m, u)}` : formatarQuantidade(m, u));
/** "contou Caio às 07:44" (o primeiro nome basta na linha de apoio). */
const quemContou = (i: { por: string | null; em: Date | null }) => (i.por && i.em ? `contou ${i.por.split(' ')[0]} às ${HORA.format(new Date(i.em))}` : 'sem contar');
const dinheiroComSinal = (c: number) => (c < 0 ? `−${formatarDinheiro(-c)}` : formatarDinheiro(c));

function TomDoEstado({ e }: { e: ConferenciaDaContagem['estado'] }) {
  const tom = e === 'APLICADA' || e === 'APLICADA_SOZINHA' ? 'ok' : e === 'VENCIDA' || e === 'EM_CONTAGEM' ? 'alerta' : 'neutro';
  return <Selo tom={tom}>{ROTULO_DA_CONTAGEM[e]}</Selo>;
}

function Depois({ l, notasBase }: { l: LinhaDaDivergencia; notasBase?: string }) {
  if (l.depois.length === 0) return <span className="text-suave">nada</span>;
  return (
    <ul className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      {l.depois.map((m, i) => (
        <li key={i}>
          <span className="font-semibold text-texto">{quantidadeComSinal(m.quantidadeMilesimos, l.item.unidade)}</span>{' '}
          {m.notaId && notasBase ? (
            <Link href={`${notasBase}/${m.notaId}`} className={LINK_DE_TEXTO}>
              {m.estorno ? 'estorno de nota' : (m.motivo?.split(' · ')[0] ?? ROTULO_DO_MOVIMENTO[m.tipo])}
            </Link>
          ) : (
            <span className="text-suave">{m.estorno ? 'estorno' : ROTULO_DO_MOVIMENTO[m.tipo].toLowerCase()}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Diferenca({ l }: { l: LinhaDaDivergencia }) {
  const d = l.div;
  if (!d.contado) return <span className="text-suave">sem contar</span>;
  if (d.diferencaMilesimos === 0) return <span className="text-suave">bateu</span>;
  // Perda em vermelho, sobra em verde (a palavra "a menos"/"a mais" diz o mesmo sem a cor).
  const cor = d.diferencaMilesimos < 0 ? 'text-erro' : 'text-ok';
  return (
    <span>
      <span className={`block text-[15px] font-bold ${cor}`}>{quantidadeComSinal(d.diferencaMilesimos, l.item.unidade)}</span>
      <span className={`block text-[12px] ${d.valorCentavos === null ? 'text-atencao' : cor}`}>
        {textoDoValorDaDiferenca(d.valorCentavos)}
        {d.dentroDaTolerancia || d.valorCentavos === null ? '' : <span className="text-suave"> · confira</span>}
      </span>
    </span>
  );
}

function Tabela({ linhas, notasBase, legenda }: { linhas: LinhaDaDivergencia[]; notasBase?: string; legenda: string }) {
  return (
    <>
      <ul className="divide-y divide-linha md:hidden">
        {linhas.map((l) => (
          <li key={l.item.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5">
                  <IconeDaConservacao conservacao={l.conservacao} />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-texto">{l.item.nome}</span>
                  <span className="block text-[12px] text-suave">{quemContou(l.item)}</span>
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <Diferenca l={l} />
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-[12px] tabular-nums">
              <div>
                <dt className="text-suave">Livro ao contar</dt>
                <dd className="font-semibold text-texto">{qtd(l.esperadoMilesimos, l.item.unidade)}</dd>
              </div>
              <div>
                <dt className="text-suave">Contado</dt>
                <dd className="font-semibold text-texto">{l.item.contadoMilesimos === null ? '—' : qtd(l.item.contadoMilesimos, l.item.unidade)}</dd>
                {l.item.conta && <dd className="text-suave">{l.item.conta}</dd>}
              </div>
              <div>
                <dt className="text-suave">Fica em</dt>
                <dd className="font-semibold text-texto">{qtd(l.div.ficaEmMilesimos, l.item.unidade)}</dd>
              </div>
            </dl>
            {l.depois.length > 0 && (
              <div className="rounded-[7px] border border-linha px-2.5 py-2 text-[12px]">
                <span className="text-suave">Depois de contar: </span>
                <Depois l={l} notasBase={notasBase} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {/* Colunas fixas; "depois de contar" vira a 2ª linha do próprio item (como no celular). Rede de segurança: rola dentro do painel. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <caption className="sr-only">{legenda}</caption>
          <colgroup>
            <col />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[170px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                Insumo
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Livro ao contar
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Contado
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Diferença
              </th>
              <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                Fica em
              </th>
            </tr>
          </thead>
          {linhas.map((l) => (
            <tbody key={l.item.id} className="border-t border-linha tabular-nums">
              <tr className="align-top">
                <td className="py-2.5 pl-5 pr-3">
                  <span className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5">
                      <IconeDaConservacao conservacao={l.conservacao} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-texto">{l.item.nome}</span>
                      <span className="block truncate text-[12px] text-suave">
                        {CONSERVACOES[l.conservacao]} · {quemContou(l.item)}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-suave">{qtd(l.esperadoMilesimos, l.item.unidade)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-texto">
                  {l.item.contadoMilesimos === null ? '—' : qtd(l.item.contadoMilesimos, l.item.unidade)}
                  {/* Herança da 1.7: a conta das embalagens em linha própria, curta e inteira ("1 × 2 kg + 600 g"). */}
                  {l.item.conta && <span className="block whitespace-normal break-words text-[12px] font-normal leading-snug text-suave">{l.item.conta}</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Diferenca l={l} />
                </td>
                <td className="px-3 py-2.5 pr-5 text-right font-semibold text-texto">{qtd(l.div.ficaEmMilesimos, l.item.unidade)}</td>
              </tr>
              {l.depois.length > 0 && (
                <tr>
                  <td colSpan={5} className="px-5 pb-2.5 pt-0 text-[13px]">
                    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 rounded-[7px] border border-linha px-2.5 py-1.5">
                      <span className="text-suave">Depois de contar:</span>
                      <Depois l={l} notasBase={notasBase} />
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

export function TelaConferirContagem({
  c,
  base,
  contexto,
  feito,
  notasBase,
  acoes,
  podeAplicar,
  podeContar,
  bloqueio,
  voltar,
}: {
  c: ConferenciaDaContagem;
  base: string;
  contexto?: string;
  feito?: string;
  notasBase?: string;
  acoes: { concluir: AcaoDeEstoque; descartar: AcaoDeEstoque };
  podeAplicar: boolean;
  podeContar: boolean;
  bloqueio: string | null;
  /** L.4: de onde a pessoa veio (o consumo e a conciliação), já validado; sem isso, o "Voltar" de sempre. */
  voltar?: { href: string; rotulo: string } | null;
}) {
  const loja = `${base}/${c.loja.id}`;
  const aqui = `${loja}/contagens/${c.contagem.id}`;
  const fechamento = c.contagem.tipo === 'FECHAMENTO';
  const aberta = c.contagem.status === 'ABERTA' && c.estado !== 'VENCIDA';
  const comDiferenca = c.linhas.filter((l) => l.div.contado && l.div.diferencaMilesimos !== 0).sort((x, y) => Math.abs(y.div.valorCentavos ?? Infinity) - Math.abs(x.div.valorCentavos ?? Infinity));
  const bateram = c.linhas.filter((l) => l.div.contado && l.div.diferencaMilesimos === 0);
  const semContar = c.linhas.filter((l) => !l.div.contado);
  const mudaramDepois = c.linhas.filter((l) => l.div.contado && l.div.mudouDepoisMilesimos !== 0).length;
  const mensagem = fraseDoEstoque(feito);
  const cob = c.cobertura;
  const titulo = c.contagem.titulo ?? (fechamento ? 'Fechamento do período' : 'Contagem');
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: c.loja.nome, href: loja }, { rotulo: titulo, href: aberta ? aqui : undefined }, { rotulo: aberta ? 'Conferir' : 'Resultado' }]} />
      <Voltar href={aberta ? aqui : (voltar?.href ?? loja)}>{aberta ? 'Voltar para a contagem' : voltar ? `Voltar para ${voltar.rotulo}` : `Voltar para o estoque da ${c.loja.nome}`}</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo={aberta ? (fechamento ? 'Conferir e fechar' : 'Conferir divergências') : titulo}
        subtitulo={[contexto, c.loja.nome, aberta ? titulo : null, c.contagem.fechaAutomaticoEm && aberta ? `prazo ${quando(c.contagem.fechaAutomaticoEm)}` : null].filter(Boolean).join(' · ')}
        acao={<TomDoEstado e={c.estado} />}
      />
      {/* Fechada: uma faixa só (o resultado), sem repetir o "aplicada" do aviso de volta. */}
      {mensagem && (aberta || !['aplicada', 'ja-aplicada', 'periodo-fechado'].includes(feito ?? '')) && <Aviso tom="ok" titulo={mensagem} />}

      {!aberta && (
        <Aviso tom={c.estado === 'VENCIDA' ? 'alerta' : c.estado === 'DESCARTADA' ? 'neutro' : 'ok'} titulo={resultado(c)}>
          {c.estado === 'VENCIDA' ? 'Nada mudou no estoque: contagem velha não se aplica como se fosse de agora.' : null}
          {feito === 'ja-aplicada' ? 'Já tinha sido aplicada (por outra pessoa ou outra aba): nada foi gravado de novo. ' : null}
          {c.estado === 'APLICADA' || c.estado === 'APLICADA_SOZINHA' ? (
            <Link href={loja} className={LINK_DE_TEXTO}>
              Ver o livro do estoque
            </Link>
          ) : null}
        </Aviso>
      )}

      <div className={`grid gap-3 ${fechamento ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Contados</div>
          <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">
            {c.resumo.contados} <span className="text-[18px] font-semibold text-suave">de {c.resumo.total}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-suave">{c.resumo.naoContados ? `${c.resumo.naoContados} sem contar (ficam como estão)` : 'todos contados'}</div>
        </div>
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Diferença em R$</div>
          {(() => {
            const liquido = c.soma.sobraCentavos - c.soma.faltaCentavos;
            return <div className={`mt-2 font-display text-[28px] font-bold leading-none tabular-nums ${liquido < 0 ? 'text-erro' : liquido > 0 ? 'text-ok' : ''}`}>{dinheiroComSinal(liquido)}</div>;
          })()}
          <div className="mt-1.5 text-[12px] tabular-nums text-suave">
            <span className={c.soma.faltaCentavos ? 'font-semibold text-erro' : ''}>{formatarDinheiro(c.soma.faltaCentavos)} a menos</span> ·{' '}
            <span className={c.soma.sobraCentavos ? 'font-semibold text-ok' : ''}>{formatarDinheiro(c.soma.sobraCentavos)} a mais</span>
            {c.soma.semPreco ? ` · ${c.soma.semPreco} sem custo informado` : ''}
          </div>
        </div>
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Para conferir</div>
          <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{c.soma.foraDaTolerancia}</div>
          <div className="mt-1.5 text-[12px] text-suave">acima de {formatarDinheiro(c.regras.toleranciaCentavos)} por item, ou sem custo informado</div>
        </div>
        {fechamento && !aberta && c.contagem.valorTotalCentavos !== null && c.estado === 'APLICADA' && (
          <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
            <div className="text-[12px] font-medium text-suave">Estoque final fotografado</div>
            <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{formatarDinheiro(c.contagem.valorTotalCentavos)}</div>
            <div className="mt-1.5 text-[12px] text-suave">base do CMV real do período{fraseDoSemPreco(c.contagem.itensSemPreco ?? null, 'final') ? ` · ${fraseDoSemPreco(c.contagem.itensSemPreco ?? null, 'final')}` : ''}</div>
          </div>
        )}
        {fechamento && cob && aberta && (
          <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
            <div className="text-[12px] font-medium text-suave">{coberturaDe(cob.periodo.nome)}</div>
            <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{Math.floor(cob.cobertura.valor.bp / 100)} %</div>
            <div className="mt-1.5 text-[12px] text-suave">{cob.cobertura.atinge ? 'do valor · atinge o piso' : `do valor · piso ${cob.regras.pisoValorBp / 100} %`}</div>
          </div>
        )}
      </div>

      {c.acimaDoTeto.length > 0 && (
        <Aviso tom="erro" titulo="Tem número grande demais nesta contagem: não dá para aplicar assim.">
          <ul className="list-disc space-y-1 pl-5">
            {c.acimaDoTeto.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Aviso>
      )}
      {aberta && mudaramDepois > 0 && (
        <Aviso tom="alerta" titulo={`${mudaramDepois} ${mudaramDepois === 1 ? 'insumo teve' : 'insumos tiveram'} movimento depois de contado.`}>
          A diferença é contra o que o livro dizia na hora da contagem, e o que entrou depois continua no estoque. Se a mercadoria já estava na prateleira quando contou, reconte o item.
        </Aviso>
      )}
      {aberta && fechamento && cob && !cob.cobertura.atinge && (
        <Aviso tom="erro" titulo="Abaixo do piso: o período ainda não fecha.">
          {fraseAbaixoDoPiso(cob.cobertura, cob.regras)
            .replace(/^O período não fecha abaixo do piso: /, '')
            .replace(/; nada foi gravado\.$/, '.')}
        </Aviso>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Painel
            titulo="Com diferença"
            subtitulo="Diferença não é perda: pode ser consumo sem baixa, nota atrasada ou conta errada"
            semRespiro
            acessorio={<Selo tom={comDiferenca.length ? 'alerta' : 'ok'}>{comDiferenca.length || 'nenhum'}</Selo>}
          >
            {comDiferenca.length === 0 ? (
              <p className="px-4 py-4 text-sm text-suave sm:px-5">Tudo o que foi contado bateu com o livro.</p>
            ) : (
              <Tabela linhas={comDiferenca} notasBase={notasBase} legenda="Itens com diferença entre o contado e o livro." />
            )}
          </Painel>
          {semContar.length > 0 && (
            <Painel titulo="Sem contar" subtitulo="Ficam como estão no livro: não contado não é zero" semRespiro acessorio={<Selo tom="alerta">{semContar.length}</Selo>}>
              <ul className="divide-y divide-linha">
                {semContar.map((l) => (
                  <li key={l.item.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <IconeDaConservacao conservacao={l.conservacao} />
                      <span className="truncate font-medium text-texto">{l.item.nome}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-suave">livro: {qtd(l.atualMilesimos, l.item.unidade)}</span>
                  </li>
                ))}
              </ul>
              {aberta && podeContar && (
                <p className="border-t border-linha px-4 py-3 text-[13px] sm:px-5">
                  <Link href={aqui} className={LINK_DE_TEXTO}>
                    Contar os que faltam
                  </Link>
                </p>
              )}
            </Painel>
          )}
          {bateram.length > 0 && (
            <details className="group rounded-[14px] border border-linha bg-painel">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-semibold text-texto sm:px-5 [&::-webkit-details-marker]:hidden">
                <span>
                  Bateram com o livro <span className="font-normal text-suave">· {bateram.length}</span>
                </span>
                <span aria-hidden className="text-suave transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className="border-t border-linha">
                <Tabela linhas={bateram} notasBase={notasBase} legenda="Itens que bateram com o livro." />
              </div>
            </details>
          )}
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-20" aria-label={fechamento ? 'Fechar o período' : 'Aplicar'}>
          {fechamento && cob && aberta && (
            <Painel titulo={coberturaDe(cob.periodo.nome)} subtitulo="Com o que já foi contado nesta contagem">
              <CoberturaComPiso c={cob.cobertura} regras={cob.regras} />
            </Painel>
          )}
          {aberta && (
            <Painel titulo={fechamento ? 'Fechar o período' : 'Aplicar a contagem'}>
              <div className="space-y-3 text-sm text-suave">
                <p>
                  <span className="font-semibold text-texto">Cada diferença vira um lançamento no livro</span> (contagem, com o antes e o depois), somada ao saldo de agora. O valor é pelo custo de
                  referência de hoje.
                </p>
                {fechamento ? (
                  <p>Fecha só com a cobertura no piso. O estoque final fica fotografado: é a base do CMV do período.</p>
                ) : (
                  <p>Não se desfaz: se algum número estiver errado, conte de novo.</p>
                )}
              </div>
              <div className="mt-4 border-t border-linha pt-4">
                {bloqueio ? (
                  <p className="text-sm text-suave">{bloqueio}</p>
                ) : podeAplicar ? (
                  <FormConcluirContagem
                    acao={acoes.concluir}
                    versao={c.contagem.versao}
                    tipo={fechamento ? 'FECHAMENTO' : 'CICLICA'}
                    naoContados={c.resumo.naoContados}
                    recarregar={`${aqui}/conferir`}
                    rotulo={fechamento ? 'Fechar o período' : 'Aplicar os ajustes'}
                  />
                ) : (
                  <>
                    <p className="text-sm text-suave">Só gerente ou dona aplicam.</p>
                    {podeContar && (
                      <Link href={aqui} className={classeDeBotao('secundario', 'mt-3 w-full')}>
                        Voltar para a contagem
                      </Link>
                    )}
                  </>
                )}
              </div>
              {podeAplicar && !bloqueio && (
                <div className="mt-5 border-t border-linha pt-4">
                  <FormDescartarContagem acao={acoes.descartar} />
                </div>
              )}
            </Painel>
          )}
        </aside>
      </div>
    </div>
  );
}

function resultado(c: ConferenciaDaContagem): string {
  const k = c.contagem;
  if (c.estado === 'VENCIDA') return `Fechou sem aplicar: o prazo acabou${k.fechaAutomaticoEm ? ` em ${quando(k.fechaAutomaticoEm)}` : ''}.`;
  if (c.estado === 'DESCARTADA') return 'Contagem descartada: nada foi para o estoque.';
  const em = k.fechadaEm ? ` em ${quando(k.fechadaEm)}` : '';
  if (c.estado === 'APLICADA_SOZINHA') return `Fechou sozinha${em}: tudo bateu dentro da tolerância e os ajustes entraram no livro.`;
  if (k.tipo === 'FECHAMENTO') return `Período fechado${em}${k.fechadaPorNome ? ` por ${k.fechadaPorNome}` : ''}. Estoque final: ${formatarDinheiro(k.valorTotalCentavos ?? 0)}.`;
  return `Aplicada${em}${k.fechadaPorNome ? ` por ${k.fechadaPorNome}` : ''}: os ajustes entraram no livro do estoque.`;
}
