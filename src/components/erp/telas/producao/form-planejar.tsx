'use client';

/**
 * Planejar o lote (3.1), celular primeiro: a cozinha planeja pelo celular. O pré-preparo e a quantidade já foram escolhidos
 * (a lista de insumos veio da receita, bruta e com o fator de correção); aqui a pessoa confere e muda a lista, diz para
 * quando e planeja. O envio leva uma chave sorteada na tela: planejar duas vezes o mesmo formulário (duplo clique, rede que
 * volta) dá um lote só. Quem decide é o servidor.
 */

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import type { OpcaoDeInsumo } from '@/lib/erp/requisicao';
import type { LinhaDigitada } from '@/lib/erp/requisicao-campos';
import { BotaoEnviar } from '../../ui/botoes';
import { AJUDA, CAMPO, Erro, ROTULO } from '../../ui/campos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeEstoque, EstadoEstoque } from '../estoque/estado';
import { ListaDeLinhas, ParaQuando, useLinhasDeInsumos } from '../requisicoes/campos-do-pedido';

export function FormPlanejar({
  acao,
  listaDeInsumos,
  linhasIniciais,
  ficha,
  bloqueio,
}: {
  acao: AcaoDeEstoque;
  listaDeInsumos: OpcaoDeInsumo[];
  linhasIniciais: LinhaDigitada[];
  /** O pré-preparo e quanto, como a pessoa digitou (o servidor lê o texto de novo). */
  ficha: { id: string; nome: string; quantidade: string; texto: string; validade: string | null };
  bloqueio: string | null;
}) {
  const [estado, enviar] = useFormState<EstadoEstoque, FormData>(acao, null);
  const lista = useLinhasDeInsumos(linhasIniciais);
  const [envio, setEnvio] = useState('');
  // A chave nasce no navegador (sem ela o envio ainda funciona, só não é protegido contra o duplo clique).
  useEffect(() => setEnvio(`env-${globalThis.crypto.randomUUID()}`), []);
  const erros = estado?.erros ?? {};
  const errosDeLinha = Object.keys(erros).filter((k) => k.startsWith('item:')).length;
  return (
    <form action={enviar} className="space-y-5 pb-24 sm:pb-0">
      <input type="hidden" name="fichaId" value={ficha.id} />
      <input type="hidden" name="quantidade_ficha" value={ficha.quantidade} />
      <input type="hidden" name="envio" value={envio} />
      <fieldset disabled={!!bloqueio} className="space-y-5">
        <Painel titulo="O lote" subtitulo={ficha.validade ? `Validade da ficha: ${ficha.validade}` : 'A ficha ainda não diz quanto o lote dura: peça a quem cuida das fichas'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className={ROTULO}>Vai produzir</p>
              <p className="min-h-12 rounded-[10px] border border-linha px-3 py-3 text-[15px] font-semibold text-texto">
                {ficha.nome} <span className="font-normal text-suave">· {ficha.texto}</span>
              </p>
              <Erro id="planejar-ficha-erro" texto={erros.ficha ?? erros.quantidade} />
            </div>
            <ParaQuando prefixo="planejar" erro={erros.paraDia} legenda="Para quando" />
          </div>
        </Painel>

        <ListaDeLinhas
          titulo="O que vai sair do estoque"
          subtitulo={`Lista da receita de ${ficha.nome} para ${ficha.texto}, já com o fator de correção: confira e mude o que precisar`}
          listaDeInsumos={listaDeInsumos}
          estado={lista}
          erros={erros}
          prefixo="planejar"
        />

        <div>
          <label htmlFor="planejar-obs" className={ROTULO}>
            Observação <span className="font-normal text-suave">(opcional)</span>
          </label>
          <textarea id="planejar-obs" name="observacao" rows={2} maxLength={280} placeholder="Ex.: para o almoço de sábado" className={`${CAMPO} text-base sm:text-sm`} />
          <p className={AJUDA}>Quem entrega os insumos lê antes de separar.</p>
          <Erro id="planejar-obs-erro" texto={erros.observacao} />
        </div>
      </fieldset>

      {(erros.geral || errosDeLinha > 1) && (
        <p role="alert" className="text-[13px] text-erro">
          {erros.geral ?? `${errosDeLinha} linhas precisam de ajuste: veja embaixo de cada uma.`}
        </p>
      )}
      {bloqueio && <p className="text-sm text-suave">{bloqueio}</p>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-linha bg-painel px-4 py-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-[13px] tabular-nums text-suave">{lista.prontos === 0 ? 'Nenhum insumo ainda' : lista.prontos === 1 ? '1 insumo' : `${lista.prontos} insumos`}</span>
          <BotaoEnviar pendente="Planejando…" disabled={!!bloqueio} className="min-w-[160px]">
            Planejar o lote
          </BotaoEnviar>
        </div>
      </div>
    </form>
  );
}
