/**
 * Abrir uma embalagem (3.4): primeiro o insumo comprado (pré-preparo não: a etiqueta dele vem do lote produzido), depois o lote,
 * a conservação e quanto. A escolha do insumo é um formulário GET (funciona sem JavaScript; voltar funciona). O nível 1 vê a
 * tela mas não abre: quem abre assina a etiqueta.
 */

import Link from 'next/link';
import type { OpcoesDeAbertura } from '@/lib/erp/etiquetas';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormAbrir, type LoteNaTela } from './form-abrir';

const CAMPO_DO_INSUMO = 'ff-transicao block min-h-11 w-full min-w-0 rounded-[7px] border border-linha-forte bg-campo px-3 text-base text-texto sm:min-h-10 sm:text-sm';

export function TelaAbrirEmbalagem({
  d,
  base,
  contexto,
  acao,
  envio,
  podeAbrir,
  motivoSemAbrir,
  bloqueio,
}: {
  d: OpcoesDeAbertura;
  base: string;
  contexto?: string;
  acao: AcaoDeEstoque;
  envio: string;
  podeAbrir: boolean;
  motivoSemAbrir: string | null;
  bloqueio: string | null;
}) {
  const daLoja = `${base}/${d.loja.id}`;
  const aqui = `${daLoja}/abrir`;
  const lotes: LoteNaTela[] = d.lotes.map((l) => ({ id: l.id, codigo: l.codigo, vencimento: l.vencimento, fabricacao: l.fabricacao, marca: l.marca, origem: l.origem, nota: l.nota ? { rotulo: l.nota.rotulo, fornecedor: l.nota.fornecedor } : null, vencido: l.vencido, notaCancelada: l.notaCancelada, aberturas: l.aberturas }));
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome }]} />
      <Voltar href={daLoja}>Voltar para as etiquetas</Voltar>
      <PageHeader icone="insumo" cor={COR.etiquetas} titulo="Abrir uma embalagem" subtitulo={[contexto, d.loja.nome, 'a data e a hora entram sozinhas'].filter(Boolean).join(' · ')} />
      {!podeAbrir && motivoSemAbrir && <Aviso tom="neutro" titulo={motivoSemAbrir} />}

      <Painel titulo="O que foi aberto" subtitulo="Insumos comprados e ativos. Pré-preparo tem a etiqueta do lote produzido">
        {d.insumos.length === 0 ? (
          <Vazio titulo="Nenhum insumo comprado ativo.">Cadastre os insumos em Insumos para registrar a abertura.</Vazio>
        ) : (
          <form method="get" action={aqui} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="abrir-insumo" className="mb-1.5 block text-[13px] font-medium text-texto">
                Insumo
              </label>
              <select id="abrir-insumo" name="insumo" defaultValue={d.escolhido?.id ?? ''} required className={CAMPO_DO_INSUMO}>
                <option value="" disabled>
                  Escolha o insumo
                </option>
                {d.insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={classeDeBotao(d.escolhido ? 'secundario' : 'primario', 'min-h-11 sm:min-h-10')}>
              {d.escolhido ? 'Trocar' : 'Continuar'}
            </button>
          </form>
        )}
      </Painel>

      {d.escolhido &&
        (podeAbrir ? (
          <FormAbrir key={d.escolhido.id} acao={acao} envioInicial={envio} insumo={d.escolhido} lotes={lotes} recarregar={`${aqui}?insumo=${d.escolhido.id}`} bloqueio={bloqueio} />
        ) : (
          <Painel titulo={`Lotes de ${d.escolhido.nome} nesta loja`} semRespiro>
            {lotes.length === 0 ? (
              <Vazio>Nenhum lote registrado.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {lotes.map((l) => (
                  <li key={l.id} className="px-4 py-3 text-sm sm:px-5">
                    <span className="font-semibold text-texto">{l.codigo ? `Lote ${l.codigo}` : 'Lote sem código'}</span>
                    <span className="block text-[12px] tabular-nums text-suave">{l.vencimento ? `vence ${l.vencimento.split('-').reverse().join('/')}` : 'vencimento não informado'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        ))}
      {!d.escolhido && d.insumos.length > 0 && (
        <p className="text-[13px] text-suave">
          Etiqueta de pré-preparo? Ela sai do lote produzido, em{' '}
          <Link href={daLoja} className="inline-flex min-h-11 items-center underline decoration-linha-forte underline-offset-4">
            Imprimir
          </Link>
          .
        </p>
      )}
    </div>
  );
}
