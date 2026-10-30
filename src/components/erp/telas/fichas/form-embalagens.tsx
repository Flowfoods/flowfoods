'use client';

/**
 * Embalagens por canal da ficha (1.9), a MESMA peça no nível 1 e na pessoa
 * do parceiro. Dois painéis — Delivery próprio e iFood —, cada um com as suas
 * linhas: embalagem (só insumo tipo Embalagem do estoque) + quanto vai em UMA
 * porção (un, ou g/kg, ml/L). Sem fator: a embalagem entra inteira. A conta
 * ao lado é PRÉVIA, pela mesma regra; quem decide é o servidor (permissão,
 * lista lida, insumo do parceiro, tipo).
 */

import Link from 'next/link';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useFormState } from 'react-dom';
import { Trash2 } from 'lucide-react';
import type { EmbalagemDoFormulario } from '@/lib/erp/canais';
import { CANAIS, CANAIS_COM_EMBALAGEM, chaveDaEmbalagem, LIMITES_DO_CANAL, type CanalComEmbalagem } from '@/lib/erp/canal-campos';
import { custoDoUso, custoPorUnidade, escalaDaSigla, formatarFracao, lerQuantidadeNa, SIGLAS_DIGITAVEIS, somar, ZERO, type Fracao } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { AvisoDeRascunho, AvisoDeRascunhoVelho, guardarRascunho, useRascunhoDaTela } from '../cadastro/rascunho';
import { AtalhoNovoInsumo, AvisoInsumoCriado } from '../insumos/atalho-novo-insumo';

export interface LinhaDaEmbalagem {
  canal: CanalComEmbalagem;
  insumoId: string;
  quantidade: string;
  unidade: string;
}

const AJUDA_DO_CANAL: Record<CanalComEmbalagem, string> = {
  DELIVERY_PROPRIO: 'Embalagens para cada porção: caixa, sacola, guardanapo e talher. Sem taxa de marketplace.',
  IFOOD: 'O que vai junto no pedido do iFood (pode ser diferente do delivery: sacola lacrada, por exemplo).',
};

export function FormEmbalagens(props: PropsDoFormEmbalagens) {
  // I.1b: voltou de "Cadastrar em Insumos"? O que estava preenchido volta junto, e a embalagem nova já está na lista.
  const r = useRascunhoDaTela<LinhaDaEmbalagem[]>(props.impressao);
  const [descartou, setDescartou] = useState(false);
  const recuperado = !descartou && Array.isArray(r.valores) ? r.valores : null;
  const criado = !descartou && r.insumoCriado ? props.opcoes.find((o) => o.id === r.insumoCriado && o.embalagem) : undefined;
  let linhas = recuperado ?? props.inicial;
  let escolhido = false;
  if (criado) {
    const vaga = linhas.findIndex((l) => !l.insumoId);
    if (vaga >= 0) {
      linhas = linhas.map((l, n) => (n === vaga ? { ...l, insumoId: criado.id, unidade: SIGLAS_DIGITAVEIS[criado.unidade].includes(l.unidade) ? l.unidade : SIGLAS_DIGITAVEIS[criado.unidade][0] } : l));
      escolhido = true;
    }
  }
  return (
    <FormEmbalagensBase
      // O rascunho só é lido depois do primeiro desenho: quando chega (ou se descarta), o formulário nasce de novo com os valores certos.
        key={r.valores === undefined ? 'carregando' : descartou ? 'descartado' : 'pronto'}
      {...props}
      inicial={linhas}
      chaveDoRascunho={r.chave}
      avisos={
        <>
          {criado && <AvisoInsumoCriado nome={criado.nome} escolhido={escolhido} />}
          <AvisoDeRascunhoVelho quando={r.versaoMudou} oQue="A lista de embalagens da ficha" />
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

type PropsDoFormEmbalagens = {
  acao: AcaoDeCadastro;
  aqui: string;
  cancelar: string;
  opcoes: EmbalagemDoFormulario[];
  inicial: LinhaDaEmbalagem[];
  /** A lista que esta tela leu (o servidor confere antes de gravar). */
  impressao: string;
  /** Custo de uma porção da ficha (fração em texto: BigInt não atravessa). */
  porcao: { num: string; den: string };
  /** A parte conhecida da receita não pode parecer um custo completo. */
  faltaPreco: string[];
  podeConferirPrecos: boolean;
  bloqueio: string | null;
  /** Link para cadastrar insumo (só para quem pode). */
  novoInsumo?: string;
};

function FormEmbalagensBase({
  acao,
  aqui,
  cancelar,
  opcoes,
  inicial,
  impressao,
  porcao,
  faltaPreco,
  podeConferirPrecos,
  bloqueio,
  novoInsumo,
  chaveDoRascunho,
  avisos,
}: PropsDoFormEmbalagens & { chaveDoRascunho: string; avisos: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida(estado);
  const proxima = useRef(inicial.length);
  const [linhas, setLinhas] = useState(() => inicial.map((l, i) => ({ ...l, chave: i })));
  const erros = estado?.erros ?? {};
  const porId = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes]);
  const custoDaPorcao: Fracao = useMemo(() => ({ num: BigInt(porcao.num), den: BigInt(porcao.den) }), [porcao]);
  const ativas = opcoes.filter((o) => o.embalagem && o.ativo);

  function mudar(chave: number, m: Partial<LinhaDaEmbalagem>) {
    setLinhas((ls) =>
      ls.map((l) => {
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
    saida.aoMudar();
  }
  const nova = (canal: CanalComEmbalagem, base?: Omit<LinhaDaEmbalagem, 'canal'>) => ({
    canal,
    insumoId: '',
    quantidade: '1',
    unidade: 'un',
    ...base,
    chave: proxima.current++,
  });

  /** Prévia de uma linha: o custo exato dela (null = sem preço ou número inválido). */
  function contaDaLinha(l: LinhaDaEmbalagem): { valor: Fracao | null; semPreco: boolean } | null {
    const o = porId.get(l.insumoId);
    if (!o) return null;
    const escala = escalaDaSigla(l.unidade, o.unidade);
    const q = escala ? lerQuantidadeNa(l.quantidade.trim(), o.unidade, escala) : null;
    if (!q) return null;
    if (!o.custo) return { valor: null, semPreco: true };
    return { valor: custoDoUso(custoPorUnidade(o.custo), q), semPreco: false };
  }

  // Erros do servidor vêm pela posição da linha PREENCHIDA no canal (linha em branco não vai).
  const posicaoNoCanal = new Map<number, number>();
  for (const canal of CANAIS_COM_EMBALAGEM) {
    linhas.filter((l) => l.canal === canal && (l.insumoId || l.quantidade.trim())).forEach((l, i) => posicaoNoCanal.set(l.chave, i));
  }
  /** I.1b: antes de ir cadastrar a embalagem que falta, guarda as linhas da tela para recuperar na volta. */
  function guardarOQueFoiPreenchido() {
    guardarRascunho(chaveDoRascunho, linhas.map(({ chave: _c, ...l }) => l), impressao);
  }
  const idBase = 'embalagens';
  const rotuloDoErro = (campo: string) => {
    const m = /^emb-(DELIVERY_PROPRIO|IFOOD)-(\d+)$/.exec(campo);
    return m ? `${CANAIS[m[1] as CanalComEmbalagem].rotulo}, linha ${Number(m[2]) + 1}` : campo;
  };

  return (
    <form ref={formRef} action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      <input type="hidden" name="impressao" value={impressao} />
      {avisos}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoErro} />
      <ErroGeral estado={estado} recarregar={aqui} />

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        {CANAIS_COM_EMBALAGEM.map((canal) => {
          const doCanal = linhas.filter((l) => l.canal === canal);
          let total = ZERO;
          let semPreco = 0;
          let linhasPendentes = 0;
          for (const l of doCanal) {
            const c = contaDaLinha(l);
            if (c?.valor) total = somar(total, c.valor);
            if (c?.semPreco) semPreco++;
            if (!c && (l.insumoId || l.quantidade.trim())) linhasPendentes++;
          }
          const incompleto = faltaPreco.length > 0 || semPreco > 0 || linhasPendentes > 0;
          const fisico = somar(custoDaPorcao, total);
          const delivery = linhas.filter((l) => l.canal === 'DELIVERY_PROPRIO' && l.insumoId);
          return (
            <Painel
              key={canal}
              titulo={CANAIS[canal].rotulo}
              subtitulo={AJUDA_DO_CANAL[canal]}
              acessorio={
                <span className="shrink-0 text-right text-[12px] tabular-nums text-suave">
                  <span className="block text-[13px] font-semibold text-texto">{total.num === 0n && (semPreco > 0 || linhasPendentes > 0) ? '—' : formatarFracao(total)}</span>
                  {semPreco > 0 || linhasPendentes > 0 ? <span className="text-atencao">Embalagens incompletas</span> : 'por porção'}
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
                              setLinhas((ls) => ls.filter((x) => x.chave !== l.chave));
                              saida.aoMudar();
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
                  type="button"
                  disabled={doCanal.length >= LIMITES_DO_CANAL.embalagens}
                  onClick={() => {
                    setLinhas((ls) => [...ls, nova(canal)]);
                    saida.aoMudar();
                  }}
                  className={classeDeBotao('secundario', 'w-full sm:w-auto')}
                >
                  Mais uma embalagem
                </button>
                {canal === 'IFOOD' && doCanal.length === 0 && delivery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setLinhas((ls) => [...ls, ...delivery.map((d) => nova('IFOOD', { insumoId: d.insumoId, quantidade: d.quantidade, unidade: d.unidade }))]);
                      saida.aoMudar();
                    }}
                    className={classeDeBotao('fantasma', 'w-full sm:w-auto')}
                  >
                    Começar com as do delivery
                  </button>
                )}
              </div>
              <p className="mt-3 text-[12px] tabular-nums text-suave">
                {incompleto ? 'Custo físico parcial conhecido' : 'Custo físico da receita e embalagens'}: {incompleto && fisico.num === 0n ? '—' : `${formatarFracao(fisico)} por porção`}
                {canal === 'IFOOD' ? ', antes da taxa do iFood' : ''}.
              </p>
              {faltaPreco.length > 0 && <p className="mt-1 text-[12px] text-atencao">Custo da receita incompleto: falta o custo de {faltaPreco.join(', ')}.</p>}
              {semPreco > 0 && <p className="mt-1 text-[12px] text-atencao">Falta informar o custo de {semPreco} {semPreco === 1 ? 'embalagem' : 'embalagens'}.</p>}
              {linhasPendentes > 0 && <p className="mt-1 text-[12px] text-atencao">Complete as embalagens e quantidades para conferir o custo.</p>}
            </Painel>
          );
        })}
        {ativas.length === 0 && (
          <p className={AJUDA}>
            Nenhum insumo do tipo Embalagem no cadastro.{' '}
            {novoInsumo ? (
              <AtalhoNovoInsumo href={novoInsumo} tipo="EMBALAGEM" rotulo="Cadastrar em Insumos" aoSair={guardarOQueFoiPreenchido} />
            ) : (
              'Peça a quem cuida dos insumos.'
            )}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio} variante={podeConferirPrecos ? 'secundario' : 'primario'} className="sm:min-w-44">
          Salvar embalagens
        </BotaoEnviar>
        {podeConferirPrecos && <BotaoEnviar nome="continuar" valor="precos" disabled={!!bloqueio}>Salvar e conferir preços</BotaoEnviar>}
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
