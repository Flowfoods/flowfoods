'use client';

/**
 * Conferir a nota recebida por XML (F.1b): para cada item da nota fiscal, a pessoa diz QUAL insumo é, em QUAL embalagem e QUANTAS
 * embalagens vêm em 1 unidade da nota ("1 PC = uma peça de 2 kg"; "1 CX = 10 pacotes de 1 kg"). A tela mostra a conta ao vivo
 * ("3 PC → 6 kg") com as mesmas funções do servidor, e o que o sistema já lembra deste fornecedor vem preenchido. Três botões:
 * "Salvar o que escolhi" (só guarda), "Conferir o impacto" (prévia, nada gravado) e "Conciliar e lançar a nota" (só com todos os
 * itens ligados e o total fechando). Item e total ficam à vista, o digitado nunca se perde: o erro volta ao lado do campo.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { FormularioDeNota } from '@/lib/erp/compras';
import { A_GRANEL, EMBALAGEM_PADRAO, embalagemDoItem, formatarData, formatarEmbalagens, PREFIXO_DA_EMBALAGEM } from '@/lib/erp/compra-campos';
import type { DocumentoDetalhado, ItemDoDocumento } from '@/lib/erp/documentos-fiscais';
import { contaDoItem, lerFator } from '@/lib/erp/documento-fiscal-campos';
import { formatarDinheiro, formatarQuantidade, UNIDADES } from '@/lib/erp/unidades';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';
import { AtalhoNovoInsumo, AvisoInsumoCriado } from '../insumos/atalho-novo-insumo';
import { ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { AvisoDeRascunho, AvisoDeRascunhoVelho, guardarRascunho, useRascunhoDaTela } from '../cadastro/rascunho';
import type { AcaoDeDocumento, EstadoDocumento } from './documentos-estado';
import { PreviaDoImpacto } from './previa';

type Intencao = 'salvar' | 'conferir' | 'conciliar';

const ROTULOS: Record<string, string> = { lojaId: 'Loja', fornecedorId: 'Fornecedor', data: 'Data da entrada', total: 'Total da nota', arquivo: 'Arquivo' };
const rotuloDoCampo = (c: string) => (c.startsWith('item-') ? `Item ${c.slice(5)}` : c.startsWith('fator-') ? `Fator do item ${c.slice(6)}` : (ROTULOS[c] ?? c));
const CAMPOS_COM_LUGAR = /^(item-\d+|fator-\d+|data|lojaId|fornecedorId|total|geral)$/;

function Enviar({ intencao, variante, children, disabled, descritoPor }: { intencao: Intencao; variante: 'primario' | 'secundario'; children: string; disabled: boolean; descritoPor?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="intencao" value={intencao} disabled={pending || disabled} aria-busy={pending} aria-describedby={disabled ? descritoPor : undefined} className={classeDeBotao(variante, 'sm:min-w-40')}>
      {pending ? (intencao === 'conferir' ? 'Conferindo…' : intencao === 'conciliar' ? 'Lançando…' : 'Salvando…') : children}
    </button>
  );
}

function BotaoLigar({ id, children }: { id: string; children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="ligar" value={id} disabled={pending} aria-busy={pending} className={classeDeBotao('secundario')}>
      {pending ? 'Ligando…' : children}
    </button>
  );
}

/**
 * "Ligar a esta nota". Com o mesmo total, é um clique. Com total DIFERENTE, pede confirmação explícita, com a diferença à vista: ligar
 * guarda só a chave da nota fiscal na nota lançada e não muda o valor dela, então quem liga tem de ter visto que os números não batem.
 */
function LigarComConfirmacao({ id, diferencaCentavos, lancadaCentavos, notaFiscalCentavos }: { id: string; diferencaCentavos: number; lancadaCentavos: number; notaFiscalCentavos: number }) {
  const [pedindo, setPedindo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pedindo) caixa.current?.focus();
  }, [pedindo]);
  if (diferencaCentavos === 0) return <BotaoLigar id={id}>Ligar a esta nota</BotaoLigar>;
  if (!pedindo) {
    return (
      <button type="button" aria-expanded={false} onClick={() => setPedindo(true)} className={classeDeBotao('secundario')}>
        Ligar a esta nota
      </button>
    );
  }
  return (
    <div ref={caixa} tabIndex={-1} role="group" aria-label="Confirmar a ligação" className="basis-full rounded-[10px] border border-atencao/50 px-4 py-3 text-sm outline-none">
      <p className="font-semibold text-atencao">Os valores são diferentes.</p>
      <p className="mt-1 tabular-nums text-texto">
        A nota lançada tem {formatarDinheiro(lancadaCentavos)} e a nota fiscal diz {formatarDinheiro(notaFiscalCentavos)}: <span className="font-semibold">{formatarDinheiro(Math.abs(diferencaCentavos))} de diferença.</span>
      </p>
      <p className="mt-1 text-suave">Ligar guarda a chave da nota fiscal nesta nota e NÃO muda o valor dela, nem o custo, nem o estoque. Só ligue se você tem certeza de que é a mesma nota.</p>
      <input type="hidden" name="confirmar_diferenca" value="1" />
      <div className="mt-3 flex flex-wrap gap-2">
        <BotaoLigar id={id}>Sim, é a mesma nota: ligar</BotaoLigar>
        <button type="button" onClick={() => setPedindo(false)} className={classeDeBotao('fantasma')}>
          Não ligar
        </button>
      </div>
    </div>
  );
}

interface Escolha {
  insumoId: string;
  embalagem: string;
  fator: string;
}

type Insumo = FormularioDeNota['insumos'][number];

type PropsDaConferencia = {
  acao: AcaoDeDocumento;
  /** A lista de notas recebidas de quem usa a tela (volta e "Recarregar"). */
  base: string;
  doc: Pick<DocumentoDetalhado, 'id' | 'versao' | 'loja' | 'lojasCandidatas' | 'fornecedoresCandidatos' | 'itens' | 'conferencia' | 'notaParaLigar' | 'totais' | 'emitidaEm'>;
  opcoesDeInsumos: Insumo[];
  hoje: string;
  /** A data de entrada que a tela oferece (dd/mm/aaaa). */
  dataInicial: string;
  bloqueio: string | null;
  /** Quem tem `fornecedores.editar` muda o que o sistema lembra do item; as outras pessoas, não. */
  podeEditarVinculos: boolean;
  /** O cadastro de insumo de quem usa a tela (só para quem pode cadastrar insumos): "Insumo que falta: cadastrar", por item, com volta para esta conferência. */
  novoInsumo?: string;
};

/** O que a pessoa tinha escolhido antes de sair para cadastrar o insumo que faltava (só no navegador desta aba; ver `rascunho.tsx`). */
interface RascunhoDaConferencia {
  escolhas: Record<number, Escolha>;
  lojaId: string;
  fornecedorId: string;
  data: string;
  /** O item que pediu o cadastro: é nele que o insumo novo entra na volta. */
  item: number;
}

const escolhasDoDocumento = (itens: PropsDaConferencia['doc']['itens']): Record<number, Escolha> =>
  Object.fromEntries(itens.map((i) => [i.nItem, { insumoId: i.insumoId ?? '', embalagem: i.insumoId ? i.embalagem : EMBALAGEM_PADRAO, fator: i.fator || '1' }]));

/** Voltou de "Insumo que falta: cadastrar"? O que estava escolhido volta junto e o insumo novo já entra no item que o pediu. */
export function FormConferencia(props: PropsDaConferencia) {
  const r = useRascunhoDaTela<RascunhoDaConferencia>(props.doc.versao);
  const [descartou, setDescartou] = useState(false);
  const recuperado = !descartou && r.valores ? r.valores : null;
  const criado = !descartou && r.insumoCriado ? props.opcoesDeInsumos.find((i) => i.id === r.insumoCriado) : undefined;
  let escolhas = escolhasDoDocumento(props.doc.itens);
  if (recuperado) {
    // Só vale o que ainda é da nota: item que sumiu ou sem forma de escolha volta ao que a tela leu.
    for (const it of props.doc.itens) {
      const e = recuperado.escolhas?.[it.nItem];
      if (e && typeof e.insumoId === 'string' && typeof e.embalagem === 'string' && typeof e.fator === 'string') escolhas[it.nItem] = e;
    }
  }
  let escolhido = false;
  if (criado) {
    const pedido = props.doc.itens.find((i) => i.nItem === recuperado?.item && !escolhas[i.nItem]?.insumoId);
    const vago = pedido ?? props.doc.itens.find((i) => !escolhas[i.nItem]?.insumoId);
    if (vago) {
      escolhas = { ...escolhas, [vago.nItem]: { ...escolhas[vago.nItem], insumoId: criado.id, embalagem: EMBALAGEM_PADRAO } };
      escolhido = true;
    }
  }
  return (
    <FormConferenciaBase
      // O rascunho só é lido depois do primeiro desenho: quando chega (ou se descarta), o formulário nasce de novo com os valores certos.
      key={r.valores === undefined ? 'carregando' : descartou ? 'descartado' : 'pronto'}
      {...props}
      escolhasIniciais={escolhas}
      lojaInicial={recuperado?.lojaId ?? ''}
      fornecedorInicial={recuperado?.fornecedorId ?? ''}
      dataInformada={recuperado?.data || props.dataInicial}
      chaveDoRascunho={r.chave}
      avisos={
        <>
          {criado && <AvisoInsumoCriado nome={criado.nome} escolhido={escolhido} />}
          <AvisoDeRascunhoVelho quando={r.versaoMudou} oQue="A nota fiscal" />
          <AvisoDeRascunho
            quando={!!recuperado}
            aoDescartar={() => {
              r.descartar();
              setDescartou(true);
            }}
          />
        </>
      }
    />
  );
}

function FormConferenciaBase({
  acao,
  base,
  doc,
  opcoesDeInsumos,
  hoje,
  bloqueio,
  podeEditarVinculos,
  novoInsumo,
  escolhasIniciais,
  lojaInicial,
  fornecedorInicial,
  dataInformada,
  chaveDoRascunho,
  avisos,
}: PropsDaConferencia & { escolhasIniciais: Record<number, Escolha>; lojaInicial: string; fornecedorInicial: string; dataInformada: string; chaveDoRascunho: string; avisos: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar] = useFormState<EstadoDocumento, FormData>(acao, null);
  const saida = useAvisoDeSaida(estado);
  const porId = useMemo(() => new Map(opcoesDeInsumos.map((i) => [i.id, i])), [opcoesDeInsumos]);
  const [escolhas, setEscolhas] = useState<Record<number, Escolha>>(escolhasIniciais);

  /** Antes de ir cadastrar o insumo que falta: guarda o que está escolhido (e em qual item a pessoa estava) para recuperar na volta. */
  function guardarOQueFoiEscolhido(item: number) {
    if (!formRef.current) return;
    const f = new FormData(formRef.current);
    const t = (k: string) => (typeof f.get(k) === 'string' ? (f.get(k) as string) : '');
    const valores: RascunhoDaConferencia = { escolhas, lojaId: t('lojaId'), fornecedorId: t('fornecedorId'), data: t('data'), item };
    guardarRascunho(chaveDoRascunho, valores, doc.versao);
  }
  const erros = estado?.erros ?? {};
  const outrosErros = Object.entries(erros).filter(([k, v]) => v && !CAMPOS_COM_LUGAR.test(k));
  const idBase = 'documento';
  const previa = estado?.previa;

  function mudar(n: number, m: Partial<Escolha>) {
    setEscolhas((e) => {
      const atual = e[n];
      const nova = { ...atual, ...m };
      // Trocou o insumo: a embalagem volta para a padrão dele.
      if (m.insumoId !== undefined && m.insumoId !== atual.insumoId) nova.embalagem = EMBALAGEM_PADRAO;
      return { ...e, [n]: nova };
    });
    saida.aoMudar();
  }

  // A conta ao vivo de cada item e quantos já estão ligados.
  const contas = useMemo(() => {
    const out: Record<number, { curta: string; longa: string } | null> = {};
    for (const it of doc.itens) {
      const e = escolhas[it.nItem];
      const ins = e?.insumoId ? porId.get(e.insumoId) : undefined;
      const emb = ins ? embalagemDoItem(ins, e.embalagem) : null;
      const f = lerFator(e?.fator ?? '', it.unidadeComercial);
      out[it.nItem] = ins && emb && f.ok ? contaDoItem({ qComMilesimos: it.qComMilesimos, unidadeComercial: it.unidadeComercial, fatorMilesimos: f.milesimos }, { conteudoMilesimos: emb.conteudoMilesimos, unidade: ins.unidade }) : null;
    }
    return out;
  }, [doc.itens, escolhas, porId]);
  const ligados = doc.itens.filter((i) => contas[i.nItem]).length;
  const faltam = doc.itens.length - ligados;
  const semResolver = !!(doc.lojasCandidatas.length > 0 || doc.fornecedoresCandidatos.length > 0);
  const motivoDoConciliar = faltam > 0 ? `Falta ligar ${faltam} ${faltam === 1 ? 'item' : 'itens'} a um insumo.` : !doc.conferencia.fecha ? 'O total da nota não fecha.' : null;

  const refDaPrevia = useRef<HTMLDivElement>(null);
  const vezDaPrevia = previa ? estado?.vez : undefined;
  useEffect(() => {
    if (vezDaPrevia === undefined || !refDaPrevia.current) return;
    const menosMovimento = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    refDaPrevia.current.scrollIntoView({ behavior: menosMovimento ? 'auto' : 'smooth', block: 'start' });
  }, [vezDaPrevia]);

  const temOutraNota = doc.notaParaLigar.some((n) => !n.mesmoFornecedor);

  return (
    <form ref={formRef} action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="versao" value={doc.versao} />
      {avisos}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoCampo} />
      {erros.geral && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
          <p className="text-erro">{erros.geral}</p>
          {estado?.conflito && (
            <a href={`${base}/${doc.id}`} className={classeDeBotao('secundario')}>
              Recarregar
            </a>
          )}
        </div>
      )}
      {outrosErros.length > 0 && (
        <div role="alert" className="rounded-[10px] border border-erro/40 px-4 py-3 text-sm text-erro">
          {outrosErros.map(([k, v]) => (
            <p key={k}>{v}</p>
          ))}
        </div>
      )}

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        {semResolver && (
          <Painel titulo="Antes de seguir">
            <div className="grid gap-4 sm:grid-cols-2">
              {doc.lojasCandidatas.length > 0 && (
                <div>
                  <label htmlFor={`${idBase}-lojaId`} className={ROTULO}>
                    Loja que recebeu
                  </label>
                  <select id={`${idBase}-lojaId`} name="lojaId" defaultValue={lojaInicial} className={`${CAMPO} pr-8`} aria-invalid={!!erros.lojaId} aria-describedby={`${idBase}-lojaId-ajuda${erros.lojaId ? ` ${idBase}-lojaId-erro` : ''}`}>
                    <option value="">Escolha a loja</option>
                    {doc.lojasCandidatas.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>
                  <p id={`${idBase}-lojaId-ajuda`} className={AJUDA}>
                    Mais de uma loja sua tem o CNPJ desta nota. Escolha a que recebeu a mercadoria.
                  </p>
                  <Erro id={`${idBase}-lojaId-erro`} texto={erros.lojaId} />
                </div>
              )}
              {doc.fornecedoresCandidatos.length > 0 && (
                <div>
                  <label htmlFor={`${idBase}-fornecedorId`} className={ROTULO}>
                    Fornecedor
                  </label>
                  <select id={`${idBase}-fornecedorId`} name="fornecedorId" defaultValue={fornecedorInicial} className={`${CAMPO} pr-8`} aria-invalid={!!erros.fornecedorId} aria-describedby={`${idBase}-fornecedorId-ajuda${erros.fornecedorId ? ` ${idBase}-fornecedorId-erro` : ''}`}>
                    <option value="">Escolha o fornecedor</option>
                    {doc.fornecedoresCandidatos.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                  <p id={`${idBase}-fornecedorId-ajuda`} className={AJUDA}>
                    Dois cadastros têm o CNPJ do emitente. O sistema não escolhe sozinho: diga qual é o desta nota.
                  </p>
                  <Erro id={`${idBase}-fornecedorId-erro`} texto={erros.fornecedorId} />
                </div>
              )}
            </div>
          </Painel>
        )}

        {doc.notaParaLigar.length > 0 && (
          <Painel titulo="Esta nota já foi lançada?" subtitulo="Você já lançou à mão uma nota com este número. Ligar não lança nada de novo.">
            <ul className="divide-y divide-linha">
              {doc.notaParaLigar.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-texto">
                      <Link href={`${base.replace(/\/recebidas$/, '')}/${n.id}`} className={LINK_DE_TEXTO}>
                        {n.rotulo}
                      </Link>{' '}
                      <span className="font-normal text-suave">
                        · {n.fornecedor} · {n.loja} · {formatarData(n.entradaEm)}
                      </span>
                    </p>
                    <p className="text-[13px] tabular-nums text-suave">
                      Lançada com {formatarDinheiro(n.totalCentavos)}; a nota fiscal diz {formatarDinheiro(doc.totais.vNfCentavos)}
                      {n.diferencaCentavos === 0 ? ' (confere).' : <span className="font-semibold text-atencao"> · {formatarDinheiro(Math.abs(n.diferencaCentavos))} de diferença ({n.diferencaCentavos > 0 ? 'a nota fiscal tem a mais' : 'a lançada tem a mais'}).</span>}
                    </p>
                    {!n.mesmoFornecedor && <p className="text-[12px] text-suave">O fornecedor dessa nota não tem CNPJ cadastrado: confira se é a mesma nota.</p>}
                  </div>
                  <LigarComConfirmacao id={n.id} diferencaCentavos={n.diferencaCentavos} lancadaCentavos={n.totalCentavos} notaFiscalCentavos={doc.totais.vNfCentavos} />
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-linha pt-3 text-[12px] text-suave">Ligar só guarda a chave da nota fiscal na nota que você lançou; o estoque e o custo ficam como estão. Depois de ligada, a nota não se edita mais.</p>
            {temOutraNota && (
              <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" name="outraNota" className="h-5 w-5 shrink-0 accent-[rgb(var(--ff-acao))]" />
                <span>Não é essa nota: concilie mesmo assim</span>
              </label>
            )}
          </Painel>
        )}

        <Painel titulo="Itens da nota fiscal" semRespiro>
          <p className="border-b border-linha px-4 py-3 text-[13px] text-suave sm:px-5" aria-live="polite">
            <span className="font-semibold text-texto tabular-nums">
              {ligados} de {doc.itens.length}
            </span>{' '}
            {doc.itens.length === 1 ? 'item ligado a um insumo' : 'itens ligados a um insumo'}
            {faltam > 0 ? `. Faltam ${faltam}.` : '. Pode conciliar.'}
          </p>
          <ul className="divide-y divide-linha">
            {doc.itens.map((it) => (
              <li key={it.nItem} className="px-4 py-4 sm:px-5">
                <input type="hidden" name="item_n" value={it.nItem} />
                <ItemDaConferencia
                  it={it}
                  e={escolhas[it.nItem]}
                  opcoesDeInsumos={opcoesDeInsumos}
                  porId={porId}
                  conta={contas[it.nItem]}
                  erro={erros[`item-${it.nItem}`]}
                  erroDoFator={erros[`fator-${it.nItem}`]}
                  podeEditarVinculos={podeEditarVinculos}
                  novoInsumo={novoInsumo}
                  aoSairParaCadastrar={() => guardarOQueFoiEscolhido(it.nItem)}
                  aoMudar={(m) => mudar(it.nItem, m)}
                />
              </li>
            ))}
          </ul>
        </Painel>

        <Painel titulo="Frete e total">
          <p className="text-sm tabular-nums" id={`${idBase}-total`}>
            Itens {formatarDinheiro(doc.conferencia.somaItensCentavos)} + frete {formatarDinheiro(doc.conferencia.freteCentavos)} ={' '}
            <span className="font-semibold">{formatarDinheiro(doc.conferencia.calculadoCentavos)}</span>
            {doc.conferencia.fecha ? <span className="font-semibold text-ok"> · confere com a nota</span> : <span className="font-semibold text-atencao"> · a nota diz {formatarDinheiro(doc.conferencia.totalDaNotaCentavos)}</span>}
          </p>
          <p className={AJUDA}>O frete da nota é dividido entre os itens pelo valor de cada um, como na nota digitada, e entra no custo.</p>
          {doc.conferencia.frase && <p className="mt-2 text-[13px] text-erro">{doc.conferencia.frase}</p>}
          <Erro id={`${idBase}-total-erro`} texto={erros.total} />
        </Painel>

        <Painel titulo="Entrada na loja">
          <div className="max-w-xs">
            <label htmlFor={`${idBase}-data`} className={ROTULO}>
              Data da entrada
            </label>
            <CampoData id={`${idBase}-data`} name="data" defaultValue={dataInformada} aria-invalid={!!erros.data} aria-describedby={`${idBase}-data-ajuda${erros.data ? ` ${idBase}-data-erro` : ''}`} />
            <p id={`${idBase}-data-ajuda`} className={AJUDA}>
              O dia em que a mercadoria entrou na loja (dd/mm/aaaa, até {formatarData(hoje)}). A nota foi emitida em {formatarData(doc.emitidaEm)}. É esta data que diz qual compra é a mais nova e em que período ela entra.
            </p>
            <Erro id={`${idBase}-data-erro`} texto={erros.data} />
          </div>
        </Painel>

        {previa && (
          <div ref={refDaPrevia} className="scroll-mt-20">
            <PreviaDoImpacto previa={previa} />
          </div>
        )}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={base} className={classeDeBotao('fantasma')}>
          Voltar para as notas
        </Link>
        <Enviar intencao="salvar" variante="secundario" disabled={!!bloqueio}>
          Salvar o que escolhi
        </Enviar>
        <Enviar intencao="conferir" variante="secundario" disabled={!!bloqueio || !!motivoDoConciliar} descritoPor={`${idBase}-conciliar-motivo`}>
          {previa ? 'Conferir de novo' : 'Conferir o impacto'}
        </Enviar>
        <Enviar intencao="conciliar" variante="primario" disabled={!!bloqueio || !!motivoDoConciliar} descritoPor={`${idBase}-conciliar-motivo`}>
          Conciliar e lançar a nota
        </Enviar>
      </div>
      <p id={`${idBase}-conciliar-motivo`} className="text-right text-[13px] text-suave" aria-live="polite">
        {bloqueio ?? (motivoDoConciliar ? `${motivoDoConciliar} Salvar o que escolhi já guarda o que você fez.` : '')}
      </p>
    </form>
  );
}

function ItemDaConferencia({
  it,
  e,
  opcoesDeInsumos,
  porId,
  conta,
  erro,
  erroDoFator,
  podeEditarVinculos,
  novoInsumo,
  aoSairParaCadastrar,
  aoMudar,
}: {
  it: ItemDoDocumento;
  e: Escolha;
  opcoesDeInsumos: Insumo[];
  porId: Map<string, Insumo>;
  conta: { curta: string; longa: string } | null;
  erro?: string;
  erroDoFator?: string;
  podeEditarVinculos: boolean;
  novoInsumo?: string;
  aoSairParaCadastrar: () => void;
  aoMudar: (m: Partial<Escolha>) => void;
}) {
  const n = it.nItem;
  const ins = e.insumoId ? porId.get(e.insumoId) : undefined;
  const u = ins ? UNIDADES[ins.unidade] : null;
  const descontoTxt = it.descontoCentavos > 0 ? ` − ${formatarDinheiro(it.descontoCentavos)} de desconto` : '';
  // A escolha mudou do que o sistema lembrava? Só quem edita fornecedores atualiza a memória.
  const mudouDaMemoria = it.origem === 'memoria' && (e.insumoId !== (it.insumoId ?? '') || e.embalagem !== it.embalagem || e.fator.trim().replace('.', ',') !== it.fator);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium text-texto">
            <span className="tabular-nums text-suave">{n}. </span>
            {it.descricao}
          </p>
          <p className="text-[12px] tabular-nums text-suave">
            código {it.codigoProduto} · {formatarEmbalagens(it.qComMilesimos)} {it.unidadeComercial} · {formatarDinheiro(it.valorCentavos)}
            {descontoTxt}
            {it.outrosCentavos > 0 ? ` + ${formatarDinheiro(it.outrosCentavos)} de impostos e despesas` : ''}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-texto">
          <span className="sr-only">Custo do item: </span>
          {formatarDinheiro(it.liquidoCentavos)}
        </p>
      </div>

      {it.origem === 'memoria' && !mudouDaMemoria && <Selo>Lembrado deste fornecedor</Selo>}
      {it.sugestao && !e.insumoId && (
        <p className="text-[13px] text-suave">
          O código de barras desta nota é o de “{it.sugestao.insumoNome} · {it.sugestao.varianteNome}”.{' '}
          <button
            type="button"
            className={`${LINK_DE_TEXTO} min-h-0 [@media(pointer:coarse)]:min-h-11`}
            onClick={() => aoMudar({ insumoId: it.sugestao!.insumoId, embalagem: `${PREFIXO_DA_EMBALAGEM}${it.sugestao!.varianteId}`, fator: '1' })}
          >
            Usar este
          </button>{' '}
          (confira antes de conciliar).
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_9.5rem]">
        <div>
          <label htmlFor={`documento-item-${n}`} className={ROTULO}>
            Insumo
          </label>
          <select
            id={`documento-item-${n}`}
            name="item_insumo"
            value={e.insumoId}
            onChange={(ev) => aoMudar({ insumoId: ev.target.value })}
            className={`${CAMPO} pr-8`}
            aria-invalid={!!erro}
            aria-describedby={erro ? `documento-item-${n}-erro` : undefined}
          >
            <option value="">Escolha o insumo</option>
            {opcoesDeInsumos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
                {i.ativo ? '' : ' (desativado)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`documento-item-${n}-emb`} className={ROTULO}>
            Embalagem
          </label>
          <select id={`documento-item-${n}-emb`} name="item_embalagem" value={e.embalagem} onChange={(ev) => aoMudar({ embalagem: ev.target.value })} className={`${CAMPO} pr-8`} disabled={!ins}>
            {ins ? (
              <>
                <option value={EMBALAGEM_PADRAO}>Padrão · {formatarQuantidade(ins.conteudoMilesimos, ins.unidade)}</option>
                {ins.embalagens
                  .filter((x) => x.ativo || e.embalagem === `${PREFIXO_DA_EMBALAGEM}${x.id}`)
                  .map((x) => (
                    <option key={x.id} value={`${PREFIXO_DA_EMBALAGEM}${x.id}`}>
                      {x.nome} · {formatarQuantidade(x.conteudoMilesimos, ins.unidade)}
                    </option>
                  ))}
                <option value={A_GRANEL}>A granel (por {u!.sigla})</option>
              </>
            ) : (
              <option value={EMBALAGEM_PADRAO}>Escolha o insumo antes</option>
            )}
          </select>
        </div>
        <div>
          <label htmlFor={`documento-fator-${n}`} className={ROTULO}>
            Quantas por {it.unidadeComercial}
          </label>
          <input
            id={`documento-fator-${n}`}
            name="item_fator"
            inputMode="decimal"
            autoComplete="off"
            value={e.fator}
            onChange={(ev) => aoMudar({ fator: ev.target.value })}
            className={`${CAMPO} text-right tabular-nums`}
            aria-invalid={!!erroDoFator}
            aria-describedby={`documento-fator-${n}-ajuda${erroDoFator ? ` documento-fator-${n}-erro` : ''}`}
          />
        </div>
      </div>
      <p id={`documento-fator-${n}-ajuda`} className="text-[12px] tabular-nums text-suave" aria-live="polite">
        {conta ? (
          <>
            <span className="font-semibold text-texto">{conta.curta}</span> · {conta.longa}
          </>
        ) : ins ? (
          `Diga quantas embalagens vêm em 1 ${it.unidadeComercial} da nota. Ex.: 1 PC = uma peça de 2 kg, fator 1; 1 CX = 10 pacotes, fator 10.`
        ) : (
          `Escolha o insumo; depois diga quantas embalagens vêm em 1 ${it.unidadeComercial} da nota.`
        )}
      </p>
      {!e.insumoId &&
        (novoInsumo ? (
          <AtalhoNovoInsumo href={novoInsumo} idDoCampo={`atalho-novo-insumo-${n}`} aoSair={aoSairParaCadastrar} />
        ) : (
          <p className="text-[12px] text-suave">Insumo que falta: peça a quem cuida dos insumos.</p>
        ))}
      {mudouDaMemoria && (
        <p className="text-[12px] text-atencao">
          {podeEditarVinculos ? 'Você mudou o que o sistema lembrava: ele passa a lembrar assim (fica no histórico). Notas já conciliadas não mudam.' : 'Mudou do que o sistema lembra deste item. Só quem edita fornecedores muda o que ele lembra: se for o caso, peça a essa pessoa.'}
        </p>
      )}
      <Erro id={`documento-fator-${n}-erro`} texto={erroDoFator} />
      <Erro id={`documento-item-${n}-erro`} texto={erro} />
    </div>
  );
}
