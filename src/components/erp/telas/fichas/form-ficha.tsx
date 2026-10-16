// Scanner avoid-ai-design, SD4d (P2) aceito: "Prato · rende 1 porção" e "R$ 3,20 · R$ 1,60 por porção" seguem o subtítulo do contrato ("Rede Completa · N fichas") como linha de apoio, igual aos insumos da 1.1. (O ignore do scanner não aceita id com minúscula.)
'use client';

/**
 * Formulário da ficha técnica (nova e editar), a MESMA peça para o nível 1 e
 * para a pessoa do parceiro: a action vem de quem usa a tela. Tudo vai como
 * texto (a foto já foi enviada pela rota própria: vai só o nome); o servidor converte g/kg/ml/L/un, calcula o
 * custo e confere permissão, versão lida e insumos do parceiro. A conta que
 * aparece aqui embaixo é PRÉVIA, feita com a mesma regra.
 */

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { LIMITES_DA_FICHA, RENDE_DO_PREPARO, RENDE_EM, TIPOS_DE_FICHA, type RendeEm, type TipoFicha } from '@/lib/erp/ficha-campos';
import type { InsumoDoFormulario } from '@/lib/erp/fichas';
import {
  custoExatoDaQuantidade,
  escalaDaSigla,
  formatarFracao,
  lerInteiro,
  lerQuantidadeNa,
  porRendimento,
  SIGLAS_DIGITAVEIS,
  somar,
  ZERO,
  type Fracao,
} from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Segmentos } from '../../ui/segmentos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, ResumoDeErros, useAvisoDeSaida } from '../cadastro/erros';
import { CampoFoto } from './campo-foto';

export interface LinhaDoItem {
  insumoId: string;
  quantidade: string;
  unidade: string;
}

export interface ValoresDaFicha {
  nome: string;
  tipo: TipoFicha;
  descricao: string;
  modoPreparo: string;
  rendimento: string;
  rendimentoUnidade: RendeEm;
  itens: LinhaDoItem[];
}

const VAZIA: LinhaDoItem = { insumoId: '', quantidade: '', unidade: '' };
const NOVA: ValoresDaFicha = {
  nome: '',
  tipo: 'PRATO',
  descricao: '',
  modoPreparo: '',
  rendimento: '1',
  rendimentoUnidade: 'porcao',
  itens: [VAZIA],
};

const ROTULOS: Record<string, string> = {
  nome: 'Nome',
  tipo: 'Tipo',
  descricao: 'Descrição',
  foto: 'Foto',
  rendimento: 'Rendimento',
  itens: 'Insumos',
  modoPreparo: 'Modo de preparo',
};
const rotuloDoCampo = (c: string) => ROTULOS[c] ?? (c.startsWith('item-') ? `Insumo ${Number(c.slice(5)) + 1}` : c);

/** Custo da linha na prévia (null = sem preço ou ainda incompleta). */
function custoDaLinha(l: LinhaDoItem, insumo: InsumoDoFormulario | undefined): Fracao | 'sem-preco' | null {
  if (!insumo) return null;
  const escala = escalaDaSigla(l.unidade, insumo.unidade);
  const q = escala ? lerQuantidadeNa(l.quantidade.trim(), insumo.unidade, escala) : null;
  if (!q) return null;
  if (!insumo.custo) return 'sem-preco';
  return custoExatoDaQuantidade(insumo.custo, q);
}

export function FormFicha({
  acao,
  modo,
  base,
  aqui,
  cancelar,
  opcoes,
  inicial = NOVA,
  fotoAtual = null,
  versao,
  bloqueio = null,
  novoInsumo,
}: {
  acao: AcaoDeCadastro;
  modo: 'criar' | 'editar';
  /** Lista de fichas de quem usa a tela (link da desativada). */
  base: string;
  aqui: string;
  cancelar: string;
  opcoes: InsumoDoFormulario[];
  inicial?: ValoresDaFicha;
  fotoAtual?: string | null;
  versao?: string;
  bloqueio?: string | null;
  /** Link para cadastrar insumo (só para quem pode). */
  novoInsumo?: string;
}) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  const saida = useAvisoDeSaida();
  const [tipo, setTipo] = useState<TipoFicha>(inicial.tipo);
  const [nome, setNome] = useState(inicial.nome);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [rendimento, setRendimento] = useState(inicial.rendimento);
  const [rendeEm, setRendeEm] = useState<RendeEm>(inicial.tipo === 'PRATO' ? 'kg' : inicial.rendimentoUnidade);
  const proximaChave = useRef(inicial.itens.length);
  const [linhas, setLinhas] = useState(() => inicial.itens.map((l, i) => ({ ...l, chave: i })));
  const erros = estado?.erros ?? {};
  const idBase = 'ficha';
  const porId = useMemo(() => new Map(opcoes.map((i) => [i.id, i])), [opcoes]);

  function mudarLinha(chave: number, mudanca: Partial<LinhaDoItem>) {
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const nova = { ...l, ...mudanca };
        // Trocou o insumo: a unidade passa a ser a dele (g para kg, ml para L, un).
        if (mudanca.insumoId !== undefined) {
          const ins = porId.get(mudanca.insumoId);
          if (ins && !SIGLAS_DIGITAVEIS[ins.unidade].includes(nova.unidade)) nova.unidade = SIGLAS_DIGITAVEIS[ins.unidade][0];
        }
        return nova;
      }),
    );
    saida.aoMudar();
  }

  // Prévia da conta, com a mesma regra do servidor.
  const previa = useMemo(() => {
    let total: Fracao = ZERO;
    const semPreco: string[] = [];
    const porLinha = new Map<number, Fracao | 'sem-preco' | null>();
    for (const l of linhas) {
      const c = custoDaLinha(l, porId.get(l.insumoId));
      porLinha.set(l.chave, c);
      if (c === 'sem-preco') semPreco.push(porId.get(l.insumoId)!.nome);
      else if (c) total = somar(total, c);
    }
    let rende: number | null = null;
    if (tipo === 'PRATO') {
      const n = lerInteiro(rendimento.trim() || '1');
      rende = n ? n * 1000 : null;
    } else {
      const { unidade, escala } = RENDE_EM[rendeEm];
      rende = lerQuantidadeNa(rendimento.trim(), unidade, escala) || null;
    }
    return { total, semPreco, porLinha, porRende: rende ? porRendimento(total, rende) : null };
  }, [linhas, porId, tipo, rendimento, rendeEm]);

  const unidadeDoRende = tipo === 'PRATO' ? 'porção' : RENDE_EM[rendeEm].rotulo.replace(/s$/, '');

  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className="space-y-4">
      {versao && <input type="hidden" name="versao" value={versao} />}
      <ResumoDeErros erros={erros} idBase={idBase} rotulos={rotuloDoCampo} />
      <ErroGeral estado={estado} recarregar={aqui} />

      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="O que é">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idBase}-nome`} className={ROTULO}>
                Nome da ficha
              </label>
              <input
                id={`${idBase}-nome`}
                name="nome"
                required
                maxLength={LIMITES_DA_FICHA.nome}
                autoComplete="off"
                defaultValue={inicial.nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: X-Burger da casa"
                className={CAMPO}
                aria-invalid={!!erros.nome}
                aria-describedby={erros.nome ? `${idBase}-nome-erro` : undefined}
              />
              <Erro id={`${idBase}-nome-erro`} texto={erros.nome} />
              {estado?.desativadoId && (
                <Link href={`${base}/${estado.desativadoId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-block`}>
                  Abrir a ficha desativada para reativar
                </Link>
              )}
            </div>
            <div>
              <Segmentos
                nome="tipo"
                legenda="É um prato ou um pré-preparo?"
                opcoes={[
                  ['PRATO', TIPOS_DE_FICHA.PRATO],
                  ['PRE_PREPARO', TIPOS_DE_FICHA.PRE_PREPARO],
                ]}
                valor={tipo}
                aoMudar={setTipo}
              />
              <p className={AJUDA}>
                {tipo === 'PRATO' ? 'Prato rende porções: o custo sai por porção.' : 'Pré-preparo (molho, massa, recheio) rende em kg, L ou un.'}
              </p>
            </div>
            <div>
              <label htmlFor={`${idBase}-descricao`} className={ROTULO}>
                Descrição <span className="font-normal text-suave">(uma ou duas linhas)</span>
              </label>
              <textarea
                id={`${idBase}-descricao`}
                name="descricao"
                rows={2}
                maxLength={LIMITES_DA_FICHA.descricao}
                defaultValue={inicial.descricao}
                placeholder="Ex.: Pão brioche, blend 180 g, cheddar e molho da casa"
                className={`${CAMPO} resize-y`}
                aria-invalid={!!erros.descricao}
                aria-describedby={erros.descricao ? `${idBase}-descricao-erro` : undefined}
              />
              <Erro id={`${idBase}-descricao-erro`} texto={erros.descricao} />
            </div>
            <CampoFoto atual={fotoAtual} nome={nome} erro={erros.foto} idBase={idBase} envio={`${base}/fotos`} aoMudar={saida.aoMudar} aoOcupar={setEnviandoFoto} />
          </div>
        </Painel>

        <Painel titulo="Rendimento">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label htmlFor={`${idBase}-rendimento`} className={ROTULO}>
                Rende
              </label>
              <input
                id={`${idBase}-rendimento`}
                name="rendimento"
                inputMode="decimal"
                autoComplete="off"
                value={rendimento}
                onChange={(e) => setRendimento(e.target.value)}
                className={`${CAMPO} text-right tabular-nums`}
                aria-invalid={!!erros.rendimento}
                aria-describedby={erros.rendimento ? `${idBase}-rendimento-erro` : undefined}
              />
            </div>
            {tipo === 'PRATO' ? (
              <p className="flex min-h-11 items-center text-sm text-texto sm:min-h-[42px]">porções</p>
            ) : (
              <div className="w-28">
                <label htmlFor={`${idBase}-rende-em`} className="sr-only">
                  Unidade do rendimento
                </label>
                <select
                  id={`${idBase}-rende-em`}
                  name="rendimentoUnidade"
                  value={rendeEm}
                  onChange={(e) => setRendeEm(e.target.value as RendeEm)}
                  className={CAMPO}
                >
                  {RENDE_DO_PREPARO.map((r) => (
                    <option key={r} value={r}>
                      {RENDE_EM[r].rotulo}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <Erro id={`${idBase}-rendimento-erro`} texto={erros.rendimento} />
        </Painel>

        <Painel titulo="Insumos" semRespiro>
          {erros.itens && (
            <p id={`${idBase}-itens`} className="border-b border-linha px-4 py-3 text-[13px] text-erro sm:px-5">
              {erros.itens}
            </p>
          )}
          <ul className="divide-y divide-linha">
            {linhas.map((l, n) => {
              const ins = porId.get(l.insumoId);
              const siglas = ins ? SIGLAS_DIGITAVEIS[ins.unidade] : ['g', 'kg', 'ml', 'L', 'un'];
              const c = previa.porLinha.get(l.chave);
              const erro = erros[`item-${n}`];
              return (
                <li key={l.chave} className="px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-[5.5rem_4.75rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_7rem_auto] sm:items-center">
                    <div className="col-span-4 sm:col-span-1">
                      <label htmlFor={`${idBase}-item-${n}`} className="sr-only">
                        Insumo {n + 1}
                      </label>
                      <select
                        id={`${idBase}-item-${n}`}
                        name="item_insumo"
                        value={l.insumoId}
                        onChange={(e) => mudarLinha(l.chave, { insumoId: e.target.value })}
                        className={CAMPO}
                        aria-invalid={!!erro}
                        aria-describedby={erro ? `${idBase}-item-${n}-erro` : undefined}
                      >
                        <option value="">Escolha o insumo</option>
                        {opcoes.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome}
                            {i.ativo ? '' : ' (desativado)'}
                            {i.custo ? '' : ' · sem preço'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${idBase}-item-${n}-qtd`} className="sr-only">
                        Quantidade do insumo {n + 1}
                      </label>
                      <input
                        id={`${idBase}-item-${n}-qtd`}
                        name="item_quantidade"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Qtd."
                        value={l.quantidade}
                        onChange={(e) => mudarLinha(l.chave, { quantidade: e.target.value })}
                        className={`${CAMPO} text-right tabular-nums`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${idBase}-item-${n}-un`} className="sr-only">
                        Unidade do insumo {n + 1}
                      </label>
                      <select
                        id={`${idBase}-item-${n}-un`}
                        name="item_unidade"
                        value={l.unidade || siglas[0]}
                        onChange={(e) => mudarLinha(l.chave, { unidade: e.target.value })}
                        className={CAMPO}
                      >
                        {siglas.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="flex min-h-11 items-center justify-end text-right text-[13px] tabular-nums text-suave sm:min-h-[42px]" aria-live="polite">
                      {c === 'sem-preco' ? <span className="text-atencao">sem preço</span> : c ? formatarFracao(c) : '—'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLinhas((ls) => (ls.length === 1 ? [{ ...VAZIA, chave: proximaChave.current++ }] : ls.filter((x) => x.chave !== l.chave)));
                        saida.aoMudar();
                      }}
                      aria-label={`Tirar ${ins?.nome ?? `o insumo ${n + 1}`} da ficha`}
                      className={classeDeBotao('fantasma', 'px-3')}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
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
                  setLinhas((ls) => [...ls, { ...VAZIA, chave: proximaChave.current++ }]);
                  saida.aoMudar();
                }}
                disabled={linhas.length >= LIMITES_DA_FICHA.itens}
                className={classeDeBotao('secundario')}
              >
                Adicionar insumo
              </button>
              {novoInsumo && (
                <Link href={novoInsumo} className={LINK_DE_TEXTO}>
                  Insumo que falta: cadastrar
                </Link>
              )}
            </div>
            <p className="text-right text-sm tabular-nums" aria-live="polite">
              <span className="text-suave">Prévia: </span>
              <span className="font-semibold">{formatarFracao(previa.total)}</span>
              {previa.porRende && (
                <span className="text-suave">
                  {' · '}
                  {formatarFracao(previa.porRende)} por {unidadeDoRende}
                </span>
              )}
              {previa.semPreco.length > 0 && <span className="block text-[12px] text-atencao">Custo incompleto: falta preço em {previa.semPreco.join(', ')}.</span>}
            </p>
          </div>
        </Painel>

        <Painel titulo="Modo de preparo">
          <label htmlFor={`${idBase}-modoPreparo`} className="sr-only">
            Modo de preparo
          </label>
          <textarea
            id={`${idBase}-modoPreparo`}
            name="modoPreparo"
            rows={7}
            maxLength={LIMITES_DA_FICHA.modoPreparo}
            defaultValue={inicial.modoPreparo}
            placeholder={'Passo a passo, um por linha. Ex.:\nSelar o blend 2 min de cada lado.\nDerreter o cheddar por cima.\nMontar: pão, molho, blend.'}
            className={`${CAMPO} resize-y leading-relaxed`}
            aria-invalid={!!erros.modoPreparo}
            aria-describedby={erros.modoPreparo ? `${idBase}-modoPreparo-erro` : undefined}
          />
          <Erro id={`${idBase}-modoPreparo-erro`} texto={erros.modoPreparo} />
        </Painel>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={cancelar} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <BotaoEnviar disabled={!!bloqueio || enviandoFoto} className="sm:min-w-44">
          {modo === 'criar' ? 'Cadastrar ficha' : 'Salvar alterações'}
        </BotaoEnviar>
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
