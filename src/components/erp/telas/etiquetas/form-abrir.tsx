'use client';

/**
 * Abrir uma embalagem (3.4), celular primeiro: de qual lote ela é (um da lista, lido agora na embalagem, ou "não informado"),
 * onde vai ficar (é daí que sai o prazo depois de aberto) e quanto foi aberto (opcional). A data e a hora NÃO se digitam: são
 * as do registro. A tela mostra ao vivo a validade que isso dá (o menor entre o prazo e o vencimento do lote; sem prazo, sem
 * data) e recusa o lote vencido; o servidor refaz tudo com a hora dele.
 */

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { diaPorExtenso, fraseDaValidadeDaAbertura, validadeDaAbertura } from '@/lib/erp/etiqueta-campos';
import { lerData, mascararData } from '@/lib/erp/compra-campos';
import { CONSERVACOES, formatarValidade, ORDEM_DAS_CONSERVACOES, type Conservacao } from '@/lib/erp/validade';
import { UNIDADES, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { Painel } from '../../ui/superficies';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';
import { chaveNova } from './conteudo';

export interface LoteNaTela {
  id: string;
  codigo: string | null;
  vencimento: string | null;
  fabricacao: string | null;
  marca: string | null;
  origem: 'RECEBIMENTO' | 'ABERTURA';
  nota: { rotulo: string; fornecedor: string | null } | null;
  vencido: boolean;
  notaCancelada: boolean;
  aberturas: number;
}

export interface InsumoParaAbrir {
  id: string;
  nome: string;
  unidade: Unidade;
  conservacao: Conservacao;
  marcaReferencia: string | null;
  prazos: Record<Conservacao, number | null>;
}

const OPCAO =
  'ff-transicao flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-linha px-3.5 py-2.5 hover:border-linha-forte peer-checked:border-linha-forte peer-checked:bg-forte peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento peer-disabled:cursor-not-allowed peer-disabled:opacity-60';

function sugerida(i: InsumoParaAbrir): Conservacao {
  if (i.prazos[i.conservacao]) return i.conservacao;
  const com = ORDEM_DAS_CONSERVACOES.filter((c) => i.prazos[c]);
  return com.length === 1 ? com[0] : i.conservacao;
}

function descricaoDoLote(l: LoteNaTela): string {
  return [l.vencimento ? `vence ${diaPorExtenso(l.vencimento)}` : 'vencimento não informado', l.marca, l.nota ? `${l.nota.rotulo}${l.nota.fornecedor ? ` (${l.nota.fornecedor})` : ''}` : l.origem === 'ABERTURA' ? 'lido numa abertura' : null, l.aberturas ? `${l.aberturas} já ${l.aberturas === 1 ? 'aberta' : 'abertas'}` : null]
    .filter(Boolean)
    .join(' · ');
}

export function FormAbrir({ acao, envioInicial, insumo, lotes, recarregar, bloqueio }: { acao: AcaoDeEstoque; envioInicial: string; insumo: InsumoParaAbrir; lotes: LoteNaTela[]; recarregar: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const [envio, setEnvio] = useState(envioInicial);
  useEffect(() => setEnvio(chaveNova()), []);
  const validos = lotes.filter((l) => !l.vencido && !l.notaCancelada);
  const [lote, setLote] = useState<string>(validos[0]?.id ?? 'novo');
  const [vencimento, setVencimento] = useState('');
  const [conservacao, setConservacao] = useState<Conservacao>(sugerida(insumo));
  const [quanto, setQuanto] = useState('');
  const [escala, setEscala] = useState<'base' | 'menor'>('base');
  // A validade "se abrir agora": o relógio só existe no navegador (o servidor grava a hora dele).
  const [agoraMs, setAgoraMs] = useState<number | null>(null);
  useEffect(() => {
    setAgoraMs(Date.now());
    const t = setInterval(() => setAgoraMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const erros = estado?.erros ?? {};
  const u = UNIDADES[insumo.unidade];
  const escolhido = lotes.find((l) => l.id === lote) ?? null;
  const vencDigitado = lote === 'novo' && vencimento.trim() ? lerData(vencimento.trim()) : null;
  const vencimentoLote = lote === 'novo' ? vencDigitado : lote === 'sem' ? null : (escolhido?.vencimento ?? null);
  const prazo = insumo.prazos[conservacao];
  const v = agoraMs !== null ? validadeDaAbertura({ abertoEm: new Date(agoraMs), prazoMin: prazo, vencimentoLote }) : null;
  const travado = !!bloqueio;
  return (
    <form action={enviar} className="space-y-5 pb-28 min-[900px]:pb-0">
      <input type="hidden" name="envio" value={envio} />
      <input type="hidden" name="insumo" value={insumo.id} />
      <input type="hidden" name="escala" value={escala} />
      <fieldset disabled={travado} className="space-y-5">
        <Painel titulo="De qual lote é a embalagem" subtitulo="Os lotes deste insumo nesta loja, do que vence antes para o que vence depois">
          <fieldset aria-describedby={erros.lote ? 'abrir-lote-erro' : undefined}>
            <legend className="sr-only">Lote da embalagem</legend>
            <div className="grid gap-2">
              {lotes.map((l) => {
                const fora = l.vencido || l.notaCancelada;
                return (
                  <label key={l.id} className="relative block">
                    <input type="radio" name="lote" value={l.id} checked={lote === l.id} onChange={() => setLote(l.id)} disabled={fora} className="peer sr-only" />
                    <span className={OPCAO}>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-texto [overflow-wrap:anywhere]">{l.codigo ? `Lote ${l.codigo}` : 'Lote sem código'}</span>
                        <span className="block text-[12px] tabular-nums text-suave [overflow-wrap:anywhere]">{descricaoDoLote(l)}</span>
                      </span>
                      {fora && <span className="shrink-0 text-[12px] font-semibold text-erro">{l.vencido ? 'Venceu: não abra' : 'Nota cancelada'}</span>}
                    </span>
                  </label>
                );
              })}
              <label className="relative block">
                <input type="radio" name="lote" value="novo" checked={lote === 'novo'} onChange={() => setLote('novo')} className="peer sr-only" />
                <span className={OPCAO}>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-texto">Ler o lote na embalagem agora</span>
                    <span className="block text-[12px] text-suave">O código e o vencimento como estão impressos</span>
                  </span>
                </span>
              </label>
              <label className="relative block">
                <input type="radio" name="lote" value="sem" checked={lote === 'sem'} onChange={() => setLote('sem')} className="peer sr-only" />
                <span className={OPCAO}>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-texto">Lote não informado</span>
                    <span className="block text-[12px] text-suave">A embalagem não diz, ou não dá para ler: a etiqueta sai com NÃO INFORMADO</span>
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <Erro id="abrir-lote-erro" texto={erros.lote} />
          {lote === 'novo' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="abrir-codigo" className={ROTULO}>
                  Lote <span className="font-normal text-suave">(como está impresso)</span>
                </label>
                <input id="abrir-codigo" name="codigo" maxLength={40} autoComplete="off" className={CAMPO} aria-invalid={!!erros.codigo} aria-describedby={erros.codigo ? 'abrir-codigo-erro' : undefined} />
                <Erro id="abrir-codigo-erro" texto={erros.codigo} />
              </div>
              <div>
                <label htmlFor="abrir-vencimento" className={ROTULO}>
                  Vencimento do lote
                </label>
                <CampoData id="abrir-vencimento" name="vencimento" onChange={(e) => setVencimento(mascararData(e.currentTarget.value))} aria-invalid={!!erros.vencimento} aria-describedby={erros.vencimento ? 'abrir-vencimento-erro' : undefined} />
                <Erro id="abrir-vencimento-erro" texto={erros.vencimento} />
              </div>
              <div>
                <label htmlFor="abrir-fabricacao" className={ROTULO}>
                  Fabricação <span className="font-normal text-suave">(opcional)</span>
                </label>
                <CampoData id="abrir-fabricacao" name="fabricacao" aria-invalid={!!erros.fabricacao} aria-describedby={erros.fabricacao ? 'abrir-fabricacao-erro' : undefined} />
                <Erro id="abrir-fabricacao-erro" texto={erros.fabricacao} />
              </div>
              <div>
                <label htmlFor="abrir-marca" className={ROTULO}>
                  Marca <span className="font-normal text-suave">(opcional)</span>
                </label>
                <input id="abrir-marca" name="marca" maxLength={80} autoComplete="off" placeholder={insumo.marcaReferencia ?? undefined} className={CAMPO} aria-invalid={!!erros.marca} aria-describedby={erros.marca ? 'abrir-marca-erro' : undefined} />
                <Erro id="abrir-marca-erro" texto={erros.marca} />
              </div>
              <p className={`${AJUDA} sm:col-span-2`}>Diga pelo menos o lote ou o vencimento. Nada aqui é inventado: o que não estiver na embalagem fica em branco.</p>
            </div>
          )}
        </Painel>

        <Painel titulo="Onde a embalagem aberta vai ficar" subtitulo="O prazo depois de aberto depende disso (do cadastro do insumo)">
          <div role="radiogroup" aria-label="Conservação da embalagem aberta" className="grid gap-2 sm:grid-cols-2">
            {ORDEM_DAS_CONSERVACOES.map((c) => (
              <label key={c} className="relative block">
                <input type="radio" name="conservacao" value={c} checked={conservacao === c} onChange={() => setConservacao(c)} className="peer sr-only" />
                <span className={OPCAO}>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-texto">
                      {CONSERVACOES[c]}
                      {c === insumo.conservacao && <span className="ml-2 text-[12px] font-normal text-suave">a do cadastro</span>}
                    </span>
                    <span className={`block text-[12px] ${insumo.prazos[c] ? 'text-suave' : 'text-atencao'}`}>{insumo.prazos[c] ? `dura ${formatarValidade(insumo.prazos[c]!)} depois de aberto` : 'Prazo após abertura não informado'}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Erro id="abrir-conservacao-erro" texto={erros.conservacao} />
        </Painel>

        <Painel titulo="Quanto foi aberto" subtitulo="Opcional: vai na etiqueta">
          <div className="flex items-stretch gap-2">
            <label htmlFor="abrir-quanto" className="sr-only">
              Quanto foi aberto, em {escala === 'base' ? u.sigla : u.menor}
            </label>
            <input id="abrir-quanto" name="quanto" inputMode="decimal" autoComplete="off" value={quanto} onChange={(e) => setQuanto(e.target.value)} placeholder={insumo.unidade === 'UN' ? 'Ex.: 1' : escala === 'base' ? 'Ex.: 1' : 'Ex.: 1000'} className={`${CAMPO} min-w-0 flex-1 text-right tabular-nums`} aria-invalid={!!erros.quanto} aria-describedby={erros.quanto ? 'abrir-quanto-erro' : undefined} />
            {insumo.unidade !== 'UN' ? (
              <div role="radiogroup" aria-label="Unidade de quanto foi aberto" className="grid w-[112px] shrink-0 grid-cols-2 gap-1 rounded-[10px] border border-linha-forte bg-campo p-1">
                {(['base', 'menor'] as const).map((e) => (
                  <button key={e} type="button" role="radio" aria-checked={escala === e} onClick={() => setEscala(e)} className={`ff-transicao min-h-9 rounded-[7px] text-[14px] ${escala === e ? 'bg-forte font-semibold text-texto' : 'text-suave hover:text-texto'}`}>
                    {e === 'base' ? u.sigla : u.menor}
                  </button>
                ))}
              </div>
            ) : (
              <span className="flex w-[112px] shrink-0 items-center justify-center rounded-[10px] border border-linha text-[14px] text-suave">{u.sigla}</span>
            )}
          </div>
          <Erro id="abrir-quanto-erro" texto={erros.quanto} />
        </Painel>

        <div aria-live="polite" className="rounded-[14px] border border-linha bg-painel px-4 py-3 text-sm sm:px-5">
          <p className="text-[12px] font-medium text-suave">Se abrir agora</p>
          <p className={`mt-1 ${v && !v.ok ? 'font-semibold text-erro' : 'text-texto'}`}>
            {v === null
              ? 'A validade aparece aqui.'
              : !v.ok
                ? v.erro
                : fraseDaValidadeDaAbertura({ regra: v.regra, validadeEm: v.validadeEm, vencimentoLote, prazoMin: prazo, conservacao })}
          </p>
        </div>
      </fieldset>

      {(erros.geral || bloqueio) && (
        <p role="alert" className="text-[13px] text-erro">
          {erros.geral ?? bloqueio}{' '}
          {estado?.conflito && (
            <a href={recarregar} className="font-semibold underline underline-offset-4">
              Ver de novo
            </a>
          )}
        </p>
      )}

      <div data-barra-fixa className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 min-[900px]:static min-[900px]:border-0 min-[900px]:bg-transparent min-[900px]:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="min-w-0 text-[13px] text-suave">A data e a hora entram sozinhas</span>
          <BotaoEnviar pendente="Registrando…" disabled={travado || (v !== null && !v.ok)} className="min-w-[200px]">
            Registrar a abertura
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
