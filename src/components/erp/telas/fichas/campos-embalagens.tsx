'use client';

/**
 * Embalagens por canal da ficha (1.9), a MESMA peça no nível 1 e na pessoa
 * do parceiro. Dois painéis — Delivery próprio e iFood —, cada um com as suas
 * linhas: embalagem (só insumo tipo Embalagem do estoque) + quanto vai em UMA
 * porção (un, ou g/kg, ml/L). Sem fator: a embalagem entra inteira. A conta
 * ao lado é PRÉVIA, pela mesma regra; quem decide é o servidor (permissão,
 * lista lida, insumo do parceiro, tipo).
 */

import { useEffect, useMemo, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { EmbalagemDoFormulario } from '@/lib/erp/canais';
import type { LinhaMaterialDaFicha } from '@/lib/erp/ficha-unificada-campos';
import { CANAIS, CANAIS_COM_EMBALAGEM, chaveDaEmbalagem, embalagensTambemNaReceita, lerEmbalagens, LIMITES_DO_CANAL, type CanalComEmbalagem, type EmbalagemDoCadastro } from '@/lib/erp/canal-campos';
import { contaDoSugeridoPorCmv } from '@/lib/erp/cmv-produto-campos';
import { AVISO_DO_ARREDONDAMENTO, FarolDeCmv } from './farol';
import { custoDoUso, custoPorUnidade, escalaDaSigla, formatarDinheiro, formatarFracao, formatarPontosBase, lerQuantidadeNa, SIGLAS_DIGITAVEIS, somar, ZERO, type Fracao } from '@/lib/erp/unidades';
import { AJUDA, CAMPO, Erro } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';
import { AtalhoNovoInsumo } from '../insumos/atalho-novo-insumo';
import { contaDasEmbalagensNaTela, type ContaDasEmbalagens, type EmbalagemNaTela, type PrecosDasEmbalagens } from './conta-das-embalagens';

export type LinhaDaEmbalagem = LinhaMaterialDaFicha;

const AJUDA_DO_CANAL: Record<CanalComEmbalagem, string> = {
  DELIVERY_PROPRIO: 'Embalagens para cada porção: caixa, sacola, guardanapo e talher. Sem taxa de marketplace.',
  IFOOD: 'O que vai junto no pedido do iFood (pode ser diferente do delivery: sacola lacrada, por exemplo).',
};

export type LinhaDaEmbalagemNaTela = LinhaDaEmbalagem & { chave: number };

/** Campos controlados: o formulário pai possui envio, rascunho e confirmação. */
export function CamposEmbalagens({ opcoes, linhas, aoMudar, gravadas, porcao, faltaPreco, precos, naReceita, novoInsumo, aoCadastrar, erros = {}, desabilitado = false, receitaPendente = null, idBase = 'embalagens' }: {
  opcoes: EmbalagemDoFormulario[];
  linhas: LinhaDaEmbalagemNaTela[];
  aoMudar: (linhas: LinhaDaEmbalagemNaTela[]) => void;
  gravadas: readonly LinhaDaEmbalagem[];
  porcao: Fracao | null;
  faltaPreco: string[];
  precos?: PrecosDasEmbalagens | null;
  naReceita?: readonly string[];
  novoInsumo?: string;
  aoCadastrar?: (canal: CanalComEmbalagem, chave?: number) => boolean | void;
  erros?: Partial<Record<string, string>>;
  desabilitado?: boolean;
  receitaPendente?: string | null;
  idBase?: string;
}) {
  const proxima = useRef(Math.max(-1, ...linhas.map(l => l.chave)) + 1);
  const area = useRef<HTMLFieldSetElement>(null);
  const foco = useRef<{ chave?: number; canal: CanalComEmbalagem } | null>(null);
  useEffect(() => {
    const pedido = foco.current;
    if (!pedido) return;
    foco.current = null;
    const seletor = pedido.chave !== undefined ? `[data-emb-linha="${pedido.chave}"]` : `[data-emb-adicionar="${pedido.canal}"]`;
    area.current?.querySelector<HTMLElement>(seletor)?.focus();
  }, [linhas]);
  const porId = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes]);
  const custoDaPorcao = porcao ?? ZERO;
  const ativas = opcoes.filter((o) => o.embalagem && o.ativo);
  // A mesma regra que o servidor aplica ao salvar (tipo, ativa, repetida, limites): linha que ele recusaria não acende farol.
  const cadastro = useMemo(
    () => new Map<string, EmbalagemDoCadastro>(opcoes.map((o) => [o.id, { id: o.id, nome: o.nome, unidade: o.unidade, tipo: o.embalagem ? 'EMBALAGEM' : 'OUTRO', ativo: o.ativo }])),
    [opcoes],
  );
  const jaNoCanal = useMemo(() => new Set(gravadas.filter((l) => l.insumoId).map((l) => `${l.canal}:${l.insumoId}`)), [gravadas]);

  function mudar(chave: number, m: Partial<LinhaDaEmbalagem>) {
    aoMudar(
      linhas.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, ...m };
        // Trocou a embalagem: a unidade passa a ser a dela (un, ou g/kg, ml/L).
        if (m.insumoId !== undefined) {
          const o = porId.get(m.insumoId);
          if (o && !SIGLAS_DIGITAVEIS[o.unidade].includes(nova.unidade)) nova.unidade = SIGLAS_DIGITAVEIS[o.unidade][0];
        }
        return nova;
      }),
    );
  }
  const nova = (canal: CanalComEmbalagem, base?: Omit<LinhaDaEmbalagem, 'canal'>) => {
    proxima.current = Math.max(proxima.current, ...linhas.map(l => l.chave + 1));
    return ({
    canal,
    insumoId: '',
    quantidade: '1',
    unidade: 'un',
    ...base,
    chave: proxima.current++,
    });
  };

  /** Prévia de uma linha: o custo exato dela (null = sem preço) e o que entra na conta do canal; null = linha incompleta. */
  function contaDaLinha(l: LinhaDaEmbalagem): { valor: Fracao | null; semPreco: boolean; naTela: EmbalagemNaTela } | null {
    const o = porId.get(l.insumoId);
    if (!o) return null;
    const escala = escalaDaSigla(l.unidade, o.unidade);
    const q = escala ? lerQuantidadeNa(l.quantidade.trim(), o.unidade, escala) : null;
    if (!q) return null;
    const naTela: EmbalagemNaTela = { nome: o.nome, unidade: o.unidade, quantidadeMilesimos: q, custo: o.custo };
    if (!o.custo) return { valor: null, semPreco: true, naTela };
    return { valor: custoDoUso(custoPorUnidade(o.custo), q), semPreco: false, naTela };
  }

  // Erros do servidor vêm pela posição da linha PREENCHIDA no canal (linha em branco não vai).
  const posicaoNoCanal = new Map<number, number>();
  for (const canal of CANAIS_COM_EMBALAGEM) {
    linhas.filter((l) => l.canal === canal && (l.insumoId || l.quantidade.trim())).forEach((l, i) => posicaoNoCanal.set(l.chave, i));
  }
  const regraDoServidor = lerEmbalagens(
    linhas.filter((l) => l.insumoId || l.quantidade.trim()),
    cadastro,
    jaNoCanal,
  );
  const recusaDoCanal = (canal: CanalComEmbalagem): string | null =>
    regraDoServidor.ok ? null : (Object.entries(regraDoServidor.erros).find(([k]) => k === `emb-${canal}` || k.startsWith(`emb-${canal}-`))?.[1] ?? null);
  return (
      <fieldset ref={area} disabled={desabilitado} className="min-w-0 space-y-4">
        {CANAIS_COM_EMBALAGEM.map((canal) => {
          const doCanal = linhas.filter((l) => l.canal === canal);
          let total = ZERO;
          let semPreco = 0;
          let linhasPendentes = 0;
          const naTela: EmbalagemNaTela[] = [];
          for (const l of doCanal) {
            const c = contaDaLinha(l);
            if (c?.valor) total = somar(total, c.valor);
            if (c?.semPreco) semPreco++;
            if (c) naTela.push(c.naTela);
            if (!c && (l.insumoId || l.quantidade.trim())) linhasPendentes++;
          }
          // Linha que o servidor recusaria (repetida, acima do limite…): nenhum total, nem parcial, conta com ela.
          const recusa = linhasPendentes > 0 ? null : recusaDoCanal(canal);
          const incompleto = !!receitaPendente || faltaPreco.length > 0 || semPreco > 0 || linhasPendentes > 0 || recusa !== null;
          const fisico = somar(custoDaPorcao, total);
          const repetidas = naReceita
            ? embalagensTambemNaReceita(naReceita, doCanal.flatMap((l) => (porId.get(l.insumoId) ? [{ insumoId: l.insumoId, nome: porId.get(l.insumoId)!.nome }] : [])))
            : [];
          const delivery = linhas.filter((l) => l.canal === 'DELIVERY_PROPRIO' && l.insumoId);
          return (
            <Painel
              key={canal}
              titulo={CANAIS[canal].rotulo}
              subtitulo={AJUDA_DO_CANAL[canal]}
              acessorio={
                <span className="shrink-0 text-right text-[12px] tabular-nums text-suave">
                  <span className="block text-[13px] font-semibold text-texto">{recusa || (total.num === 0n && (semPreco > 0 || linhasPendentes > 0)) ? '—' : formatarFracao(total)}</span>
                  {recusa ? <span className="text-atencao">Corrija as embalagens</span> : semPreco > 0 || linhasPendentes > 0 ? <span className="text-atencao">Embalagens incompletas</span> : 'por porção'}
                </span>
              }
            >
              <Erro id={`${idBase}-emb-${canal}-erro`} texto={erros[`emb-${canal}`]} />
              {doCanal.length === 0 ? (
                <p className="text-[13px] text-suave">Nenhuma embalagem neste canal.</p>
              ) : (
                <ol className="space-y-3">
                  {doCanal.map((l, n) => {
                    const o = porId.get(l.insumoId);
                    const pos = posicaoNoCanal.get(l.chave);
                    const erro = pos !== undefined ? erros[chaveDaEmbalagem(canal, pos)] : undefined;
                    const idL = `${idBase}-${chaveDaEmbalagem(canal, pos ?? 900 + n)}`;
                    const conta = contaDaLinha(l);
                    const lista = o && !ativas.some((a) => a.id === o.id) ? [o, ...ativas] : ativas;
                    return (
                      <li key={l.chave} className="rounded-[10px] border border-linha p-3">
                        <input type="hidden" name="emb_canal" value={canal} />
                        <label htmlFor={idL} className="sr-only">
                          Embalagem da linha {n + 1} ({CANAIS[canal].rotulo})
                        </label>
                        <select
                          data-emb-linha={l.chave}
                          id={idL}
                          name="emb_insumo"
                          value={l.insumoId}
                          onChange={(e) => mudar(l.chave, { insumoId: e.target.value })}
                          className={`${CAMPO} min-h-11 text-base sm:text-sm`}
                          aria-invalid={!!erro}
                          aria-describedby={erro ? `${idL}-erro` : undefined}
                        >
                          <option value="">Escolha a embalagem</option>
                          {lista.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nome}
                              {!x.ativo ? ' (desativada)' : !x.embalagem ? ' (não é embalagem)' : ''}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 flex items-stretch gap-2">
                          <label htmlFor={`${idL}-q`} className="sr-only">
                            Quanto vai em uma porção{o ? ` (${o.nome})` : ''}
                          </label>
                          {/* O CAMPO é w-full: a largura fixa vem do invólucro. */}
                          <div className="w-20 shrink-0 sm:w-24">
                            <input
                              id={`${idL}-q`}
                              name="emb_quantidade"
                              inputMode="decimal"
                              autoComplete="off"
                              value={l.quantidade}
                              onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                              className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums sm:text-sm`}
                              aria-invalid={!!erro}
                              aria-describedby={erro ? `${idL}-erro` : undefined}
                            />
                          </div>
                          {o && o.unidade !== 'UN' ? (
                            <div className="w-20 shrink-0">
                              <select
                                name="emb_unidade"
                                value={l.unidade}
                                onChange={(e) => mudar(l.chave, { unidade: e.target.value })}
                                aria-label="Unidade"
                                className={`${CAMPO} min-h-11 text-base sm:text-sm`}
                              >
                                {SIGLAS_DIGITAVEIS[o.unidade].map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <>
                              <input type="hidden" name="emb_unidade" value="un" />
                              <span className="flex w-12 shrink-0 items-center text-[14px] text-suave">un</span>
                            </>
                          )}
                          <span className="flex min-w-0 flex-1 items-center justify-end text-right text-[13px] tabular-nums">
                            {conta ? (
                              conta.valor ? (
                                <span className="text-texto">{formatarFracao(conta.valor)}</span>
                              ) : (
                                <span className="text-atencao">custo não informado</span>
                              )
                            ) : null}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              foco.current = { canal };
                              aoMudar(linhas.filter((x) => x.chave !== l.chave));
                            }}
                            className={classeDeBotao('fantasma', 'min-h-11 shrink-0 px-3')}
                            aria-label={`Tirar ${o ? o.nome : `a linha ${n + 1}`} do ${CANAIS[canal].rotulo}`}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </div>
                        <Erro id={`${idL}-erro`} texto={erro} />
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  data-emb-adicionar={canal}
                  type="button"
                  disabled={doCanal.length >= LIMITES_DO_CANAL.embalagens}
                  onClick={() => {
                    const linha = nova(canal);
                    foco.current = { canal, chave: linha.chave };
                    aoMudar([...linhas, linha]);
                  }}
                  className={classeDeBotao('secundario', 'w-full sm:w-auto')}
                >
                  Mais uma embalagem
                </button>
                {canal === 'IFOOD' && doCanal.length === 0 && delivery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const copiadas = delivery.map((d) => nova('IFOOD', { insumoId: d.insumoId, quantidade: d.quantidade, unidade: d.unidade }));
                      foco.current = { canal: 'IFOOD', chave: copiadas[0]?.chave };
                      aoMudar([...linhas, ...copiadas]);
                    }}
                    className={classeDeBotao('fantasma', 'w-full sm:w-auto')}
                  >
                    Começar com as do delivery
                  </button>
                )}
              </div>
              {novoInsumo && <div className="mt-3"><AtalhoNovoInsumo href={novoInsumo} tipo="EMBALAGEM" rotulo="Embalagem que falta: cadastrar" idDoCampo={idBase + "-" + canal + "-novo"} aoSair={() => aoCadastrar?.(canal, doCanal.find(l => !l.insumoId)?.chave)} /></div>}
              {receitaPendente && <p className="mt-3 text-[13px] text-atencao">{receitaPendente}</p>}
              <p className="mt-3 text-[12px] tabular-nums text-suave">
                {incompleto ? 'Custo físico parcial conhecido' : 'Custo físico da receita e embalagens'}: {receitaPendente || recusa || (incompleto && fisico.num === 0n) ? '—' : `${formatarFracao(fisico)} por porção`}
                {canal === 'IFOOD' ? ', antes da taxa do iFood' : ''}.
              </p>
              {faltaPreco.length > 0 && <p className="mt-1 text-[12px] text-atencao">Custo da receita incompleto: falta o custo de {faltaPreco.join(', ')}.</p>}
              {semPreco > 0 && <p className="mt-1 text-[12px] text-atencao">Falta informar o custo de {semPreco} {semPreco === 1 ? 'embalagem' : 'embalagens'}.</p>}
              {linhasPendentes > 0 && <p className="mt-1 text-[12px] text-atencao">Complete as embalagens e quantidades para conferir o custo.</p>}
              {repetidas.length > 0 && (
                <p className="mt-1 text-[12px] text-atencao">
                  {repetidas.map((n) => `“${n}”`).join(', ')} também {repetidas.length === 1 ? 'está' : 'estão'} na receita: se for o mesmo uso, o custo entra duas vezes no {CANAIS[canal].rotulo}. Usos diferentes do mesmo insumo podem ficar.
                </p>
              )}
              {precos && (
                <PrecoComEstasEmbalagens
                  canal={canal}
                  // Linha pela metade ou que o servidor recusaria não entra na conta: em vez de um canal "completo" falso, nada.
                  recusa={receitaPendente ?? recusa}
                  conta={receitaPendente || !porcao || linhasPendentes > 0 || recusa ? null : contaDasEmbalagensNaTela({ canal, porcao: custoDaPorcao, faltaPreco, embalagens: naTela, preco: precos[canal] })}
                />
              )}
            </Painel>
          );
        })}
        {ativas.length === 0 && (
          <p className={AJUDA}>
            Nenhum insumo do tipo Embalagem no cadastro.{' '}
            {novoInsumo ? 'Use o cadastro no canal em que deseja incluir a embalagem.' : 'Peça a quem cuida dos insumos.'}
          </p>
        )}
      </fieldset>
  );
}

const TRACO = <span className="text-suave">—</span>;

/** Sugestão pela meta, com a conta por extenso; sem número quando falta custo, meta ou custo (nunca R$ 0,00). */
function SugestaoPelaMeta({ x }: { x: ContaDasEmbalagens }) {
  const s = x.sugerido;
  if (s.tipo === 'incompleto') return <Selo tom="alerta">Custo incompleto</Selo>;
  if (s.tipo === 'semMeta') return TRACO;
  if (s.tipo === 'semCusto') return <span className="text-suave">sem custo</span>;
  if (s.tipo === 'acimaDoLimite') return <span className="text-atencao">acima do limite</span>;
  return (
    <>
      <span className="font-semibold text-texto">{formatarDinheiro(s.centavos)}</span>
      {/* Como no detalhe: o valor acima e a conta até o "÷". */}
      <span className="block text-[12px] text-suave">{contaDoSugeridoPorCmv(x.fisico.valor, x.metaBp!, s).replace(/ = .*$/, '')}</span>
    </>
  );
}

/**
 * Embalagens → preço sem sair da tela: meta, sugestão pela meta, preço escolhido e CMV a esse preço, pela mesma conta do
 * detalhe e com as embalagens que estão na tela. Só leitura: o preço muda no passo de preços.
 */
function PrecoComEstasEmbalagens({ canal, conta: x, recusa }: { canal: CanalComEmbalagem; conta: ContaDasEmbalagens | null; recusa: string | null }) {
  return (
    // aria-live no grupo (não no dl, que entra e sai): a passagem de "Corrija"/"Complete" para os valores também é anunciada.
    <div role="group" aria-live="polite" aria-label={`Preço e CMV do ${CANAIS[canal].rotulo} com estas embalagens`} className="mt-3 border-t border-linha pt-3">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-suave">Com estas embalagens</p>
      {recusa ? (
        <p className="mt-1 text-[13px] text-suave">Corrija antes de ver o preço sugerido e o CMV: {recusa}</p>
      ) : !x ? (
        <p className="mt-1 text-[13px] text-suave">Complete as embalagens para ver o preço sugerido e o CMV.</p>
      ) : !x.ofertado ? (
        <p className="mt-1 text-[13px] text-suave">
          Não ofertado: este prato não está marcado como vendido neste canal. As embalagens continuam configuradas; sem sugestão nem farol.
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] tabular-nums sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">Meta de CMV</dt>
            <dd className="text-texto">{x.metaBp === null ? <span className="text-suave">sem meta</span> : formatarPontosBase(x.metaBp)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">Preço sugerido</dt>
            <dd>
              <SugestaoPelaMeta x={x} />
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">Seu preço</dt>
            <dd>{x.precoCentavos === null ? <span className="text-suave">não definido</span> : <span className="font-semibold text-texto">{formatarDinheiro(x.precoCentavos)}</span>}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[12px] text-suave">CMV ao seu preço</dt>
            <dd>
              <FarolDeCmv conta={x} />
            </dd>
          </div>
        </dl>
      )}
      <p className="mt-2 text-[12px] text-suave">
        Prévia com o que está na tela, antes de salvar. O preço muda só no passo de preços. {AVISO_DO_ARREDONDAMENTO}
        {canal === 'IFOOD' ? ' A taxa do iFood fica fora do custo físico e do CMV.' : ''}
      </p>
    </div>
  );
}
