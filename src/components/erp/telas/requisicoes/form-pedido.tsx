'use client';

/**
 * Nova requisição (1.8), celular primeiro: a cozinha pede pelo celular, no
 * meio do serviço. Setor (o da pessoa já vem marcado), para quando (hoje,
 * amanhã, outro dia), os insumos com quanto (kg|g, L|ml, un) em campos de
 * 48 px, observação opcional e o botão fixo no rodapé com quantos itens vão.
 * Linhas vazias são ignoradas pelo servidor; quem decide é ele.
 */

import { useFormState } from 'react-dom';
import type { OpcaoDeInsumo } from '@/lib/erp/requisicao';
import type { LinhaDigitada } from '@/lib/erp/requisicao-campos';
import { LISTA_DE_SETORES, SETORES, type Setor } from '@/lib/erp/permissoes';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';
import { ListaDeLinhas, ParaQuando, useLinhasDeInsumos } from './campos-do-pedido';

export function FormPedido({
  acao,
  listaDeInsumos,
  setorInicial,
  linhasIniciais,
  ficha,
  bloqueio,
}: {
  acao: AcaoDeEstoque;
  listaDeInsumos: OpcaoDeInsumo[];
  setorInicial: Setor | null;
  linhasIniciais: LinhaDigitada[];
  ficha: { id: string; nome: string; quantidadeMilesimos: number; texto: string } | null;
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const lista = useLinhasDeInsumos(linhasIniciais);
  const erros = estado?.erros ?? {};
  const errosDeLinha = Object.keys(erros).filter((k) => k.startsWith('item:')).length;
  // O servidor numera as linhas na ordem enviada (`item:<n>`), contando as vazias.
  return (
    <form action={enviar} className="space-y-5 pb-24 sm:pb-0">
      {ficha && (
        <>
          <input type="hidden" name="fichaId" value={ficha.id} />
          <input type="hidden" name="fichaQuantidade" value={ficha.quantidadeMilesimos} />
        </>
      )}
      <fieldset disabled={!!bloqueio} className="space-y-5">
        <Painel titulo="Para quem e para quando">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pedido-setor" className={ROTULO}>
                Setor
              </label>
              <select id="pedido-setor" name="setor" defaultValue={setorInicial ?? ''} required className={`${CAMPO} min-h-12 text-base sm:text-sm`} aria-invalid={!!erros.setor} aria-describedby={erros.setor ? 'pedido-setor-erro' : undefined}>
                <option value="" disabled>
                  Escolha o setor
                </option>
                {LISTA_DE_SETORES.map((s) => (
                  <option key={s} value={s}>
                    {SETORES[s]}
                  </option>
                ))}
              </select>
              <Erro id="pedido-setor-erro" texto={erros.setor} />
            </div>
            <ParaQuando prefixo="pedido" erro={erros.paraDia} />
          </div>
        </Painel>

        <ListaDeLinhas
          titulo="O que vai sair do estoque"
          subtitulo={ficha ? `Lista da ficha ${ficha.nome} (${ficha.texto}): confira e mude o que precisar` : 'Um insumo por linha; o que ficar vazio não vai'}
          listaDeInsumos={listaDeInsumos}
          estado={lista}
          erros={erros}
          prefixo="pedido"
        />

        <div>
          <label htmlFor="pedido-obs" className={ROTULO}>
            Observação <span className="font-normal text-suave">(opcional)</span>
          </label>
          <textarea id="pedido-obs" name="observacao" rows={2} maxLength={280} placeholder="Ex.: para o almoço; o bacon em tiras" className={`${CAMPO} text-base sm:text-sm`} />
          <p className={AJUDA}>Quem entrega lê antes de separar.</p>
          <Erro id="pedido-obs-erro" texto={erros.observacao} />
        </div>
      </fieldset>

      {(estado?.erros.geral || errosDeLinha > 1) && (
        <p role="alert" className="text-[13px] text-erro">
          {estado?.erros.geral ?? `${errosDeLinha} linhas precisam de ajuste: veja embaixo de cada uma.`}
        </p>
      )}
      {bloqueio && <p className="text-sm text-suave">{bloqueio}</p>}

      {/* No celular, o pedido fica sempre à mão no rodapé. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-[13px] tabular-nums text-suave">{lista.prontos === 0 ? 'Nenhum insumo ainda' : lista.prontos === 1 ? '1 insumo' : `${lista.prontos} insumos`}</span>
          <BotaoEnviar pendente="Pedindo…" disabled={!!bloqueio} className="min-w-[160px]">
            Pedir ao estoque
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
