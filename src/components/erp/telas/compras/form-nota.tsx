'use client';

/**
 * Formulário da nota de compra (lançar e editar), o MESMO no nível 1 e na
 * pessoa do parceiro: a action vem de quem usa a tela. Cabeçalho (loja,
 * fornecedor, número, série, data), itens adicionáveis (insumo, embalagem,
 * quantidade, valor total do item como está na nota), frete e total.
 *
 * A conta ao vivo aqui embaixo (quantidade, custo por unidade com o frete
 * rateado, soma conferida com o total) usa as MESMAS funções do servidor. O
 * "Conferir" pede ao servidor a prévia completa — o que muda no custo de cada
 * insumo e das fichas, em cascata — sem gravar. Quem decide é o servidor.
 */

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import type { FormularioDeNota } from '@/lib/erp/compras';
import {
  A_GRANEL,
  custoDaCompra,
  EMBALAGEM_PADRAO,
  embalagemDoItem,
  LIMITES_DA_NOTA,
  PREFIXO_DA_EMBALAGEM,
  quantidadeDoItem,
  ratearFrete,
} from '@/lib/erp/compra-campos';
import { formatarCusto, formatarDinheiro, formatarQuantidade, lerDinheiro, lerQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import { ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import type { AcaoDeNota, EstadoNota } from './estado';
import { PreviaDoImpacto } from './previa';

export interface LinhaDaNota {
  insumoId: string;
  embalagem: string;
  quantidade: string;
  valor: string;
}

export interface ValoresDaNota {
  lojaId: string;
  fornecedorId: string;
  numero: string;
  serie: string;
  data: string;
  frete: string;
  total: string;
  itens: LinhaDaNota[];
}

const VAZIA: LinhaDaNota = { insumoId: '', embalagem: EMBALAGEM_PADRAO, quantidade: '', valor: '' };

const ROTULOS: Record<string, string> = {
  lojaId: 'Loja',
  fornecedorId: 'Fornecedor',
  numero: 'Número',
  serie: 'Série',
  data: 'Data',
  frete: 'Frete',
  total: 'Total da nota',
  itens: 'Itens',
};
const rotuloDoCampo = (c: string) => ROTULOS[c] ?? (c.startsWith('item-') ? `Item ${Number(c.slice(5)) + 1}` : c);

/** Botão de envio com a intenção ("conferir" só calcula; "lancar" grava). */
function Enviar({ intencao, variante, children, disabled }: { intencao: 'conferir' | 'lancar'; variante: 'primario' | 'secundario'; children: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="intencao" value={intencao} disabled={pending || disabled} aria-busy={pending} className={classeDeBotao(variante, 'sm:min-w-40')}>
      {pending ? (intencao === 'conferir' ? 'Conferindo…' : 'Gravando…') : children}
    </button>
  );
}

export function FormNota({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  opcoes,
  inicial,
  versao,
  hoje,
  bloqueio = null,
  novoFornecedor,
  novoInsumo,
}: {
  acao: AcaoDeNota;
  modo: 'lancar' | 'editar';
  /** Lista de notas de quem usa a tela (link da nota repetida). */
  base: string;
  aqui: string;
  cancelar: string;
  opcoes: FormularioDeNota;
  inicial: ValoresDaNota;
  versao?: string;
  /** "2026-10-16" (no Rio): a data da nota não passa disso. */
  hoje: string;
  bloqueio?: string | null;
  novoFornecedor?: string;
  novoInsumo?: string;
}) {
  const [estado, enviar] = useFormState<EstadoNota, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  // A primeira chave livre: a nota nova já nasce com uma linha vazia (chave 0).
  const proxima = useRef(Math.max(1, inicial.itens.length));
  const [linhas, setLinhas] = useState(() => (inicial.itens.length ? inicial.itens : [VAZIA]).map((l, i) => ({ ...l, chave: i })));
  const [frete, setFrete] = useState(inicial.frete);
  const [total, setTotal] = useState(inicial.total);
  const erros = estado?.erros ?? {};
  const idBase = 'nota';
  const porId = useMemo(() => new Map(opcoes.insumos.map((i) => [i.id, i])), [opcoes.insumos]);

  function mudar(chave: number, m: Partial<LinhaDaNota>) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, ...m };
        // Trocou o insumo: a embalagem volta para a padrão dele.
        if (m.insumoId !== undefined && m.insumoId !== l.insumoId) nova.embalagem = EMBALAGEM_PADRAO;
        return nova;
      }),
    );
    saida.aoMudar();
  }

  // Conta ao vivo, com as funções do servidor: quantidade, frete rateado, custo por unidade, soma.
  const conta = useMemo(() => {
    const lidas = linhas.map((l) => {
      const ins = porId.get(l.insumoId);
      const emb = ins ? embalagemDoItem(ins, l.embalagem) : null;
      const embalagens = l.quantidade.trim() ? lerQuantidade(l.quantidade.trim()) : null;
      const valor = l.valor.trim() ? lerDinheiro(l.valor.trim()) : null;
      const quantidade = emb && embalagens ? quantidadeDoItem(embalagens, emb.conteudoMilesimos) : null;
      return { ins, emb, quantidade, valor };
    });
    const valores = lidas.map((x) => x.valor ?? 0);
    const freteC = frete.trim() ? lerDinheiro(frete.trim()) : 0;
    const partes = ratearFrete(valores, freteC ?? 0);
    const soma = valores.reduce((s, v) => s + v, 0);
    const totalC = total.trim() ? lerDinheiro(total.trim()) : null;
    return {
      linhas: lidas.map((x, i) => ({
        ...x,
        custo: x.ins && x.quantidade && x.valor ? custoDaCompra([{ valorCentavos: x.valor, freteRateadoCentavos: partes[i], quantidadeMilesimos: x.quantidade }]) : null,
      })),
      soma,
      frete: freteC,
      total: totalC,
    };
  }, [linhas, porId, frete, total]);

  const diferenca = conta.total !== null && conta.frete !== null ? conta.total - (conta.soma + conta.frete) : null;
  const previa = estado?.previa;

  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoCampo} />
      {erros.geral && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href={aqui} className={classeDeBotao('secundario')}>
              Recarregar
            </a>
          )}
        </div>
      )}

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="A nota">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-lojaId`} className={ROTULO}>
                Loja que recebeu
              </label>
              <select
                id={`${idBase}-lojaId`}
                name="lojaId"
                defaultValue={inicial.lojaId}
                className={`${CAMPO} pr-8`}
                aria-invalid={!!erros.lojaId}
                aria-describedby={erros.lojaId ? `${idBase}-lojaId-erro` : undefined}
              >
                {opcoes.lojas.length !== 1 && <option value="">Escolha a loja</option>}
                {opcoes.lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                    {l.ativa ? '' : ' (desativada)'}
                  </option>
                ))}
              </select>
              <Erro id={`${idBase}-lojaId-erro`} texto={erros.lojaId} />
            </div>
            <div>
              <label htmlFor={`${idBase}-fornecedorId`} className={ROTULO}>
                Fornecedor
              </label>
              <select
                id={`${idBase}-fornecedorId`}
                name="fornecedorId"
                defaultValue={inicial.fornecedorId}
                className={`${CAMPO} pr-8`}
                aria-invalid={!!erros.fornecedorId}
                aria-describedby={erros.fornecedorId ? `${idBase}-fornecedorId-erro` : undefined}
              >
                <option value="">Escolha o fornecedor</option>
                {opcoes.fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.ativo ? '' : ' (desativado)'}
                  </option>
                ))}
              </select>
              <Erro id={`${idBase}-fornecedorId-erro`} texto={erros.fornecedorId} />
              {novoFornecedor && (
                <Link href={novoFornecedor} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Fornecedor novo: cadastrar
                </Link>
              )}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <div>
                <label htmlFor={`${idBase}-numero`} className={ROTULO}>
                  Número da nota
                </label>
                <input
                  id={`${idBase}-numero`}
                  name="numero"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={LIMITES_DA_NOTA.numero}
                  defaultValue={inicial.numero}
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.numero}
                  aria-describedby={erros.numero ? `${idBase}-numero-erro` : undefined}
                />
              </div>
              <div>
                <label htmlFor={`${idBase}-serie`} className={ROTULO}>
                  Série
                </label>
                <input
                  id={`${idBase}-serie`}
                  name="serie"
                  autoComplete="off"
                  maxLength={LIMITES_DA_NOTA.serie}
                  defaultValue={inicial.serie}
                  className={`${CAMPO} tabular-nums`}
                  aria-invalid={!!erros.serie}
                />
              </div>
              <div className="col-span-2 -mt-2">
                <Erro id={`${idBase}-numero-erro`} texto={erros.numero ?? erros.serie} />
                {estado?.duplicadaId && (
                  <Link href={`${base}/${estado.duplicadaId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                    Abrir a nota já lançada
                  </Link>
                )}
              </div>
            </div>
            <div>
              <label htmlFor={`${idBase}-data`} className={ROTULO}>
                Data da nota
              </label>
              <input
                id={`${idBase}-data`}
                name="data"
                type="date"
                max={hoje}
                defaultValue={inicial.data}
                className={`${CAMPO} tabular-nums`}
                aria-invalid={!!erros.data}
                aria-describedby={`${idBase}-data-ajuda${erros.data ? ` ${idBase}-data-erro` : ''}`}
              />
              <p id={`${idBase}-data-ajuda`} className={AJUDA}>
                A data impressa na nota. É ela que diz qual compra é a mais nova.
              </p>
              <Erro id={`${idBase}-data-erro`} texto={erros.data} />
            </div>
          </div>
        </Painel>

        <Painel titulo="Itens" semRespiro>
          <p className="border-b border-linha px-4 py-3 text-[12px] leading-relaxed text-suave sm:px-5">
            Valor do item = o <strong className="font-semibold text-texto">total da linha</strong> na nota. O preço por kg, L ou un sai da conta, com o frete rateado.
          </p>
          {erros.itens && (
            <p id={`${idBase}-itens`} className="border-b border-linha px-4 py-3 text-[13px] text-erro sm:px-5">
              {erros.itens}
            </p>
          )}
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,1fr)_11rem_5.5rem_7.5rem_2.75rem] gap-2 border-b border-linha bg-forte px-5 py-2 text-[12px] font-semibold text-suave md:grid"
          >
            <span>Insumo</span>
            <span>Embalagem</span>
            <span className="text-right">Quantidade</span>
            <span className="text-right">Valor do item</span>
            <span />
          </div>
          <ul className="divide-y divide-linha">
            {linhas.map((l, n) => {
              const c = conta.linhas[n];
              const ins = c?.ins;
              const erro = erros[`item-${n}`];
              const u = ins ? UNIDADES[ins.unidade] : null;
              return (
                <li key={l.chave} className="px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2 md:grid-cols-[minmax(0,1fr)_11rem_5.5rem_7.5rem_2.75rem] md:items-center">
                    <div className="col-span-2 md:col-span-1">
                      <label htmlFor={`${idBase}-item-${n}`} className="sr-only">
                        Insumo do item {n + 1}
                      </label>
                      <select
                        id={`${idBase}-item-${n}`}
                        name="item_insumo"
                        value={l.insumoId}
                        onChange={(e) => mudar(l.chave, { insumoId: e.target.value })}
                        className={`${CAMPO} pr-8`}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? `${idBase}-item-${n}-erro` : undefined}
                      >
                        <option value="">Escolha o insumo</option>
                        {opcoes.insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome}
                            {i.ativo ? '' : ' (desativado)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLinhas((ls) => (ls.length === 1 ? [{ ...VAZIA, chave: proxima.current++ }] : ls.filter((x) => x.chave !== l.chave)));
                        saida.aoMudar();
                      }}
                      aria-label={`Tirar ${ins?.nome ?? `o item ${n + 1}`} da nota`}
                      className={classeDeBotao('fantasma', 'px-3 md:order-last')}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                    <div className="col-span-3 md:col-span-1">
                      <label htmlFor={`${idBase}-item-${n}-emb`} className="sr-only">
                        Embalagem do item {n + 1}
                      </label>
                      <select
                        id={`${idBase}-item-${n}-emb`}
                        name="item_embalagem"
                        value={l.embalagem}
                        onChange={(e) => mudar(l.chave, { embalagem: e.target.value })}
                        className={`${CAMPO} pr-8`}
                      >
                        {ins ? (
                          <>
                            <option value={EMBALAGEM_PADRAO}>Padrão · {formatarQuantidade(ins.conteudoMilesimos, ins.unidade)}</option>
                            {ins.embalagens
                              .filter((e) => e.ativo || l.embalagem === `${PREFIXO_DA_EMBALAGEM}${e.id}`)
                              .map((e) => (
                                <option key={e.id} value={`${PREFIXO_DA_EMBALAGEM}${e.id}`}>
                                  {e.nome} · {formatarQuantidade(e.conteudoMilesimos, ins.unidade)}
                                </option>
                              ))}
                            <option value={A_GRANEL}>A granel (por {u!.sigla})</option>
                          </>
                        ) : (
                          <option value={EMBALAGEM_PADRAO}>Embalagem</option>
                        )}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label htmlFor={`${idBase}-item-${n}-qtd`} className="mb-1 block text-[12px] text-suave md:sr-only">
                        {l.embalagem === A_GRANEL && u ? `Quantos ${u.sigla}` : 'Quantas embalagens'}
                      </label>
                      <input
                        id={`${idBase}-item-${n}-qtd`}
                        name="item_quantidade"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={l.embalagem === A_GRANEL && u ? u.sigla : 'Qtd.'}
                        value={l.quantidade}
                        onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                        className={`${CAMPO} text-right tabular-nums`}
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label htmlFor={`${idBase}-item-${n}-valor`} className="mb-1 block text-[12px] text-suave md:sr-only">
                        Valor do item (R$)
                      </label>
                      <input
                        id={`${idBase}-item-${n}-valor`}
                        name="item_valor"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="R$"
                        value={l.valor}
                        onChange={(e) => mudar(l.chave, { valor: e.target.value })}
                        className={`${CAMPO} text-right tabular-nums`}
                      />
                    </div>
                  </div>
                  {ins && (
                    <p className="mt-1.5 text-[12px] tabular-nums text-suave" aria-live="polite">
                      {c.quantidade ? `${formatarQuantidade(c.quantidade, ins.unidade)}` : `Medido em ${u!.nome.toLowerCase()}`}
                      {c.custo ? (
                        <>
                          {' · '}
                          <span className="font-semibold text-texto">{formatarCusto(c.custo, ins.unidade)}</span>
                          {conta.frete ? ' com frete' : ''}
                        </>
                      ) : null}
                      {' · hoje '}
                      {formatarCusto(ins.custo, ins.unidade)}
                    </p>
                  )}
                  <Erro id={`${idBase}-item-${n}-erro`} texto={erro} />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setLinhas((ls) => [...ls, { ...VAZIA, chave: proxima.current++ }]);
                  saida.aoMudar();
                }}
                disabled={linhas.length >= LIMITES_DA_NOTA.itens}
                className={classeDeBotao('secundario')}
              >
                Adicionar item
              </button>
              {novoInsumo && (
                <Link href={novoInsumo} className={LINK_DE_TEXTO}>
                  Insumo que falta: cadastrar
                </Link>
              )}
            </div>
            <p className="text-sm tabular-nums">
              <span className="text-suave">Itens: </span>
              <span className="font-semibold">{formatarDinheiro(conta.soma)}</span>
            </p>
          </div>
        </Painel>

        <Painel titulo="Frete e total">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-frete`} className={ROTULO}>
                Frete da nota <span className="font-normal text-suave">(se tiver)</span>
              </label>
              <input
                id={`${idBase}-frete`}
                name="frete"
                inputMode="decimal"
                autoComplete="off"
                placeholder="R$"
                value={frete}
                onChange={(e) => setFrete(e.target.value)}
                className={`${CAMPO} text-right tabular-nums`}
                aria-invalid={!!erros.frete}
                aria-describedby={`${idBase}-frete-ajuda${erros.frete ? ` ${idBase}-frete-erro` : ''}`}
              />
              <p id={`${idBase}-frete-ajuda`} className={AJUDA}>
                Dividido entre os itens pelo valor de cada um; entra no custo.
              </p>
              <Erro id={`${idBase}-frete-erro`} texto={erros.frete} />
            </div>
            <div>
              <label htmlFor={`${idBase}-total`} className={ROTULO}>
                Total da nota
              </label>
              <input
                id={`${idBase}-total`}
                name="total"
                inputMode="decimal"
                autoComplete="off"
                placeholder="R$"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className={`${CAMPO} text-right tabular-nums`}
                aria-invalid={!!erros.total}
                aria-describedby={`${idBase}-total-conta${erros.total ? ` ${idBase}-total-erro` : ''}`}
              />
              <p id={`${idBase}-total-conta`} className="mt-1.5 text-[12px] tabular-nums text-suave" aria-live="polite">
                {formatarDinheiro(conta.soma)} + {formatarDinheiro(conta.frete ?? 0)} de frete = {formatarDinheiro(conta.soma + (conta.frete ?? 0))}
                {diferenca === null ? (
                  ''
                ) : diferenca === 0 ? (
                  <span className="font-semibold text-ok"> · confere com a nota</span>
                ) : (
                  <span className="font-semibold text-atencao"> · diferença de {formatarDinheiro(Math.abs(diferenca))}</span>
                )}
              </p>
              <Erro id={`${idBase}-total-erro`} texto={erros.total} />
            </div>
          </div>
        </Painel>

        {previa && <PreviaDoImpacto previa={previa} />}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <Enviar intencao="conferir" variante="secundario" disabled={!!bloqueio}>
          {previa ? 'Conferir de novo' : 'Conferir o impacto'}
        </Enviar>
        <Enviar intencao="lancar" variante="primario" disabled={!!bloqueio}>
          {modo === 'lancar' ? 'Lançar nota' : 'Salvar alterações'}
        </Enviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
