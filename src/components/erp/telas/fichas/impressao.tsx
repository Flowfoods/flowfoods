'use client';

/**
 * N.5 — Ficha técnica para IMPRIMIR ou salvar em PDF (A4 em pé), a mesma para o nível 1 e para a pessoa do parceiro.
 * Composição própria do papel (não é print da tela): identificação e foto, descrição comercial separada, ingredientes com
 * quantidade limpa e bruta, modo de preparo em etapas numeradas, onde fica e quanto dura.
 *
 * Decisão de 31/10/2026 — escolha explícita antes de imprimir: a página chega SEMPRE sem preços e custos (o servidor nem
 * envia os valores; URL direta, recarga e Ctrl+P imprimem essa versão). O botão Imprimir pergunta, a cada vez, "Sem
 * preços e custos" (padrão) ou "Com preços e custos". Com: a ação do servidor confere a permissão e devolve os valores
 * da mesma versão; a tela imprime e, fechada a janela do navegador, descarta os valores. Cancelar não imprime. Quem não
 * vê preços tem a opção indisponível — e o servidor recusa mesmo assim. A versão com valores mostra custo dos itens e a
 * área compacta por canal: custo físico, meta de CMV, preço, CMV e resultado após os custos informados (nunca "lucro").
 *
 * É sempre a versão GRAVADA (a página lê do banco): alteração não salva na edição não entra, e a barra diz isso.
 */

import Link from 'next/link';
import { useEffect, useReducer, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Printer } from 'lucide-react';
import type { FichaNoPapel } from '@/lib/erp/ficha-papel';
import type { ImpressaoFinanceira } from '@/lib/erp/ficha-impressao';
import { CANAIS } from '@/lib/erp/canal-campos';
import { parcelasEmTexto, porcentagemDoCmv, ROTULO_DO_RESULTADO, STATUS_DO_CMV, type CmvDoCanal } from '@/lib/erp/cmv-produto-campos';
import { custoIncompleto, formatarFator, formatarRendimento, porUnidadeDeRendimento, quantidadeBruta, TIPOS_DE_FICHA } from '@/lib/erp/ficha-campos';
import { formatarData, hojeNoRio } from '@/lib/erp/compra-campos';
import { formatarDinheiro, formatarFracao, formatarPontosBase, formatarQuantidade } from '@/lib/erp/unidades';
import { validadesEmTexto } from '@/lib/erp/validade';
import { classeDeBotao } from '../../ui/estilos';
import { Dialogo } from '../../ui/Dialogo';
import { urlDaFoto } from './miniatura';
import {
  chamarImpressaoDaTela,
  estadoInicialDaImpressao,
  quemAbriuAImpressao,
  transicaoDaImpressao,
  type ConteudoDaImpressao,
  type MarcadorDeImpressao,
} from './impressao-escolha';

const TH = 'border-b border-linha-forte px-2 py-1.5 text-left text-[11px] font-semibold text-suave print:text-black';
const TD = 'border-b border-linha px-2 py-1.5 align-top text-[12.5px] print:text-black';
const SECAO = 'break-inside-avoid-page space-y-2';
const TITULO = 'text-[11px] font-semibold uppercase tracking-wide text-suave print:text-black';

type DadosFinanceiros = { ficha: FichaNoPapel; canais: CmvDoCanal[] | null };

const FALHA_DE_REDE = 'Não foi possível carregar os preços e custos. Confira a conexão e tente de novo.';

const OPCOES: { valor: ConteudoDaImpressao; rotulo: string; ajuda: string }[] = [
  { valor: 'sem', rotulo: 'Sem preços e custos', ajuda: 'Ingredientes, quantidades, rendimento, preparo e foto. Nenhum valor em reais ou percentual financeiro.' },
  { valor: 'com', rotulo: 'Com preços e custos', ajuda: 'Acrescenta o custo dos itens e, por canal, custo físico, meta de CMV, preço, CMV e resultado.' },
];

export function TelaImpressaoFicha({
  ficha,
  podeFinanceiro,
  carregarFinanceiro,
  contexto,
  base,
  voltar,
  geradoEm,
}: {
  /** Sempre a versão sem valores: `fichaNoPapel(fichaNaTela(…, false))`. */
  ficha: FichaNoPapel;
  /** Permissão efetiva de ver preços. Só decide se a opção aparece disponível; quem decide é a ação do servidor. */
  podeFinanceiro: boolean;
  /** Ação do servidor: confere `precos.ver` e devolve os valores da mesma versão da ficha. */
  carregarFinanceiro: (id: string, versao: string) => Promise<ImpressaoFinanceira>;
  contexto: string;
  base: string;
  voltar: string;
  geradoEm: Date;
}) {
  const [estado, enviar] = useReducer(transicaoDaImpressao<DadosFinanceiros>, undefined, estadoInicialDaImpressao<DadosFinanceiros>);
  const botao = useRef<HTMLButtonElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const alerta = useRef<HTMLParagraphElement>(null);
  /** Ligado só durante o `window.print()` desta tela; o primeiro `beforeprint` o consome. */
  const marcador = useRef<MarcadorDeImpressao>({ nossa: false });
  /** Número do pedido em andamento: resposta de pedido cancelado é ignorada. */
  const pedido = useRef(0);

  useEffect(() => {
    // Impressão que não foi aberta por esta tela (Ctrl+P, menu) — inclusive depois de uma nossa que não terminou —
    // descarta qualquer valor ANTES de o navegador montar o papel.
    const antes = () => {
      if (quemAbriuAImpressao(marcador.current) === 'navegador') flushSync(() => enviar({ tipo: 'impressaoNativa' }));
    };
    const depois = () => enviar({ tipo: 'terminouImpressao' });
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', depois);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', depois);
    };
  }, []);

  useEffect(() => {
    if (estado.fase !== 'imprimir') return;
    enviar({ tipo: 'chamouImpressao' });
    // Se o navegador não abriu a impressão durante a chamada (bloqueada, desativada ou adiada), os valores são
    // descartados agora: uma impressão que começar depois sai sem eles.
    if (!chamarImpressaoDaTela(marcador.current, () => window.print())) enviar({ tipo: 'terminouImpressao' });
  }, [estado.fase]);

  const escolhendo = estado.fase === 'escolhendo' ? estado : null;
  const carregando = estado.fase === 'carregando';
  const aberto = escolhendo !== null || carregando;
  const dados = estado.dados;
  const erro = escolhendo?.erro ?? null;

  // Ao abrir, o foco vai à opção marcada (setas trocam a escolha); o diálogo já focou antes, este efeito vem depois.
  useEffect(() => {
    if (aberto) formulario.current?.querySelector<HTMLInputElement>('input[name="conteudo"]:checked')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura.
  }, [aberto]);
  // Recusa ou falha: o foco vai à mensagem, que o leitor de tela lê.
  useEffect(() => {
    if (erro) alerta.current?.focus();
  }, [erro]);

  async function confirmar() {
    if (!escolhendo) return;
    enviar({ tipo: 'confirmar', podeFinanceiro });
    if (escolhendo.escolha !== 'com' || !podeFinanceiro) return;
    const n = ++pedido.current;
    try {
      const r = await carregarFinanceiro(ficha.id, ficha.versao);
      if (n !== pedido.current) return;
      enviar(r.ok ? { tipo: 'carregou', dados: { ficha: r.ficha, canais: r.canais } } : { tipo: 'falhou', erro: r.erro });
    } catch {
      if (n === pedido.current) enviar({ tipo: 'falhou', erro: FALHA_DE_REDE });
    }
  }

  function cancelar() {
    pedido.current += 1;
    enviar({ tipo: 'cancelar' });
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-5">
      <style>{'@media print{@page{size:A4 portrait;margin:14mm}}'}</style>
      <div className="ff-nao-imprime flex flex-wrap items-center gap-2 rounded-[14px] border border-linha bg-painel p-4">
        <button ref={botao} type="button" onClick={() => enviar({ tipo: 'abrir' })} className={classeDeBotao('primario')} aria-haspopup="dialog">
          <Printer size={16} aria-hidden />
          Imprimir ou salvar em PDF
        </button>
        <Link href={voltar} className={classeDeBotao('secundario')}>
          Voltar para a ficha
        </Link>
        {dados && (
          <button type="button" onClick={() => enviar({ tipo: 'descartar' })} className={classeDeBotao('secundario')}>
            Voltar à versão sem valores
          </button>
        )}
        <p className="w-full text-[13px] text-suave" aria-live="polite">
          {dados
            ? 'Versão com preços e custos, carregada só para esta impressão. Fechada a janela de impressão, a tela volta à versão sem valores.'
            : 'Versão sem preços e custos. Ao imprimir, você escolhe se inclui preços e custos; a escolha vale só para aquela impressão.'}{' '}
          É a ficha como está salva; o que estiver sendo editado e não foi salvo não entra. Na janela de impressão, escolha “Salvar como PDF” para gerar o
          arquivo.
        </p>
      </div>

      <Dialogo aberto={aberto} aoFechar={cancelar} titulo="Imprimir a ficha" voltarPara={botao} className="ff-nao-imprime w-[min(32rem,calc(100vw-2rem))]">
        <form
          ref={formulario}
          aria-busy={carregando}
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          {/* Sem disabled no carregamento: o foco pode estar no rádio (Enter confirma) e não deve se perder; a troca é ignorada. */}
          <fieldset className="space-y-2" aria-disabled={carregando}>
            <legend className="mb-2 text-[14px] font-semibold text-texto">O que deve sair no papel?</legend>
            {OPCOES.map((o) => {
              const indisponivel = o.valor === 'com' && !podeFinanceiro;
              // Carregando só acontece depois de confirmar "Com preços e custos".
              const marcado = (escolhendo?.escolha ?? 'com') === o.valor;
              return (
                <label
                  key={o.valor}
                  className={`flex min-h-11 gap-3 rounded-[10px] border p-3 ${marcado && !indisponivel ? 'border-texto' : 'border-linha'} ${indisponivel ? 'opacity-60' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="conteudo"
                    value={o.valor}
                    checked={marcado && !indisponivel}
                    disabled={indisponivel}
                    onChange={() => enviar({ tipo: 'escolher', escolha: o.valor, podeFinanceiro })}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--ff-acao))]"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-[14px] font-semibold text-texto">{o.rotulo}</span>
                    <span className="block text-[13px] leading-relaxed text-suave">{indisponivel ? 'Seu acesso não inclui preços e custos.' : o.ajuda}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {erro && (
            <p ref={alerta} tabIndex={-1} role="alert" className="text-[13px] font-medium text-texto outline-none">
              {erro}
            </p>
          )}
          <p role="status" className="text-[13px] text-suave">
            {carregando ? 'Preparando os preços e custos desta impressão…' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* aria-disabled em vez de disabled: o foco não se perde enquanto carrega; o envio repetido é ignorado. */}
            <button type="submit" aria-disabled={carregando} className={classeDeBotao('primario', carregando ? 'opacity-60' : '')}>
              {carregando ? 'Preparando…' : 'Imprimir'}
            </button>
            <button type="button" onClick={cancelar} className={classeDeBotao('secundario')}>
              Cancelar
            </button>
          </div>
        </form>
      </Dialogo>

      <DocumentoDaFicha ficha={dados?.ficha ?? ficha} canais={dados?.canais ?? null} contexto={contexto} base={base} geradoEm={geradoEm} />
    </div>
  );
}

/** O papel. `ficha.verCustos` decide se os valores entram; sem eles, nenhum título ou coluna financeira fica vazio. */
export function DocumentoDaFicha({
  ficha: f,
  canais,
  contexto,
  base,
  geradoEm,
}: {
  ficha: FichaNoPapel;
  /** Só na versão com valores e só para prato. */
  canais: CmvDoCanal[] | null;
  contexto: string;
  base: string;
  geradoEm: Date;
}) {
  const rende = formatarRendimento(f.rendimentoMilesimos, f.unidadeRendimento, f.tipo);
  const validade = validadesEmTexto(f.validades);
  const gerencial = f.verCustos;
  return (
      <article className="space-y-6 rounded-[14px] border border-linha bg-painel p-6 print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="space-y-1 border-b-2 border-linha-forte pb-3">
          <p className={TITULO}>{contexto} · Ficha técnica · FlowFoods</p>
          <h1 className="font-display text-[28px] font-bold leading-tight">{f.nome}</h1>
          <p className="text-[13px] text-suave print:text-black">
            {TIPOS_DE_FICHA[f.tipo]} · rende {rende}
            {!f.ativa ? ' · desativada' : ''} · ficha de {formatarData(hojeNoRio(new Date(f.versao)))} · impressa em {formatarData(hojeNoRio(geradoEm))}
          </p>
        </header>

        <section className={`grid gap-5 ${f.foto ? 'sm:grid-cols-[minmax(0,1fr)_15rem] print:grid-cols-[minmax(0,1fr)_15rem]' : ''}`}>
          <div className="space-y-4">
            {f.descricao && (
              <div className="space-y-1">
                <h2 className={TITULO}>Descrição comercial</h2>
                <p className="text-[14px] leading-relaxed">{f.descricao}</p>
              </div>
            )}
            <div className="space-y-1">
              <h2 className={TITULO}>Onde fica e quanto dura</h2>
              <p className="text-[14px] leading-relaxed">{f.consumoImediato ? 'Consumo imediato: sai da cozinha para o cliente, sem ser guardado.' : (validade ?? 'Validade não informada.')}</p>
            </div>
            {f.custo && (
              <div className="space-y-1">
                <h2 className={TITULO}>Custo {porUnidadeDeRendimento(f.unidadeRendimento, f.tipo)}</h2>
                <p className="text-[14px] tabular-nums">
                  <strong className="font-semibold">{formatarFracao(f.custo.porRendimento)}</strong>
                  {custoIncompleto(f.custo) ? ` (incompleto: falta o custo de ${f.custo.faltaPreco.join(', ')})` : ''} · receita {formatarFracao(f.custo.total)}
                </p>
              </div>
            )}
          </div>
          {f.foto && (
            // eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro.
            <img src={urlDaFoto(base, f.id, f.foto)} alt={`Foto de ${f.nome}`} className="aspect-[4/3] w-full rounded-[10px] border border-linha object-cover" />
          )}
        </section>

        <section className={SECAO}>
          <h2 className={TITULO}>Ingredientes e pré-preparos</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Item</th>
                <th className={`${TH} text-right`}>Quantidade limpa</th>
                <th className={`${TH} text-right`}>Bruto (fator)</th>
                {gerencial && <th className={`${TH} text-right`}>Custo</th>}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {f.itens.map((i) => (
                <tr key={i.id} className="break-inside-avoid">
                  <td className={TD}>
                    {i.nome}
                    {i.preparo ? ' · pré-preparo' : ''}
                  </td>
                  <td className={`${TD} text-right`}>{formatarQuantidade(i.quantidadeMilesimos, i.unidade)}</td>
                  <td className={`${TD} text-right`}>
                    {i.fatorCorrecaoMilesimos === 1000
                      ? '—'
                      : `${formatarQuantidade(quantidadeBruta(i.quantidadeMilesimos, i.fatorCorrecaoMilesimos), i.unidade)} (${formatarFator(i.fatorCorrecaoMilesimos)})`}
                  </td>
                  {gerencial && <td className={`${TD} text-right`}>{i.custo ? formatarFracao(i.custo) : 'não informado'}</td>}
                </tr>
              ))}
            </tbody>
            {f.custo && (
              <tfoot>
                <tr>
                  <th className={`${TD} text-left font-semibold`} colSpan={3}>
                    Custo da receita (rende {rende})
                  </th>
                  <td className={`${TD} text-right font-semibold tabular-nums`}>
                    {formatarFracao(f.custo.total)}
                    {custoIncompleto(f.custo) ? ' + ?' : ''}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>

        <section className="space-y-2">
          <h2 className={TITULO}>Modo de preparo</h2>
          {f.passosPreparo.length > 0 ? (
            <ol className="space-y-2">
              {f.passosPreparo.map((p, n) => (
                <li key={n} className="grid break-inside-avoid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                  <span className="font-display text-[17px] font-bold leading-snug">{n + 1}</span>
                  <p className="whitespace-pre-line text-[14px] leading-relaxed">{p}</p>
                </li>
              ))}
            </ol>
          ) : !f.modoPreparo ? (
            <p className="text-[14px] text-suave print:text-black">Sem modo de preparo registrado.</p>
          ) : null}
          {f.modoPreparo && (
            <div className={f.passosPreparo.length > 0 ? 'border-t border-linha pt-2' : ''}>
              {f.passosPreparo.length > 0 && <p className="text-[11px] font-semibold text-suave print:text-black">Texto anterior</p>}
              <p className="whitespace-pre-line text-[14px] leading-relaxed">{f.modoPreparo}</p>
            </div>
          )}
        </section>

        {gerencial && canais && (
          <section className={SECAO}>
            <h2 className={TITULO}>Preço e CMV por canal (uma porção)</h2>
            {/* No celular a tabela rola dentro do bloco, sem rolar a página; no papel A4 ela cabe inteira. */}
            <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[34rem] border-collapse print:min-w-0">
              <thead>
                <tr>
                  <th className={TH}>Canal</th>
                  <th className={`${TH} text-right`}>Custo físico</th>
                  <th className={`${TH} text-right`}>Meta</th>
                  <th className={`${TH} text-right`}>Preço</th>
                  <th className={`${TH} text-right`}>CMV</th>
                  <th className={`${TH} text-right`}>{ROTULO_DO_RESULTADO}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {canais.map((x) => (
                  <tr key={x.canal} className="break-inside-avoid">
                    <td className={TD}>{CANAIS[x.canal].rotulo}</td>
                    {x.status === 'naoOfertado' ? (
                      <td className={`${TD} text-right`} colSpan={5}>
                        não ofertado
                      </td>
                    ) : (
                      <>
                        <td className={`${TD} text-right`}>
                          {formatarFracao(x.fisico.valor)}
                          {x.fisico.completo ? '' : ' + ?'}
                        </td>
                        <td className={`${TD} text-right`}>{x.metaBp === null ? 'sem meta' : formatarPontosBase(x.metaBp)}</td>
                        <td className={`${TD} text-right`}>{x.precoCentavos === null ? 'não definido' : formatarDinheiro(x.precoCentavos)}</td>
                        <td className={`${TD} text-right`}>
                          {x.cmvBp ? `${porcentagemDoCmv(x.cmvBp)} · ` : ''}
                          {STATUS_DO_CMV[x.status].rotulo}
                        </td>
                        <td className={`${TD} text-right`}>
                          {x.resultado.tipo === 'ok' ? (
                            <>
                              {x.resultado.negativo ? `−${formatarFracao({ num: -x.resultado.valor.num, den: x.resultado.valor.den })}` : formatarFracao(x.resultado.valor)} (
                              {porcentagemDoCmv(x.resultado.bp)})
                              <span className="block text-[11px] text-suave print:text-black">menos {parcelasEmTexto(x.canal, x.resultado.parcelas)}</span>
                            </>
                          ) : (
                            x.resultado.motivo
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="text-[11px] text-suave print:text-black">
              CMV teórico do prato ao preço definido, não o CMV real do estoque. O resultado desconta só o que está listado: aluguel, equipe, impostos e
              outras despesas não entram. A taxa do iFood fica fora do CMV.
            </p>
          </section>
        )}
      </article>
  );
}
