/**
 * L.1 — "Remover insumo", a MESMA tela para o nível 1 e para a pessoa do parceiro. Mostra, antes de qualquer coisa, o que está
 * ligado ao insumo (ficha, nota, estoque, produção, histórico de preço...). Com vínculo: só desativar (tudo fica como está).
 * Sem nenhum vínculo: desativar ou excluir de vez, com confirmação explícita. A decisão final é sempre do servidor, que lê os
 * vínculos de novo dentro da transação.
 */

import Link from 'next/link';
import type { InsumoParaRemover } from '@/lib/erp/insumo-remocao';
import { TIPOS, type TipoInsumo } from '@/lib/erp/insumo-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { FormSituacao } from '../cadastro/form-situacao';
import { Voltar } from '../cadastro/partes';
import { FormExcluir } from './form-excluir';

export function TelaRemoverInsumo({
  insumo: i,
  base,
  de,
  contexto,
  bloqueio,
  acaoSituacao,
  acaoExcluir,
}: {
  insumo: InsumoParaRemover;
  /** /erp/insumos ou /rodolfo/erp/<slug>/insumos */
  base: string;
  /** A lista como estava (filtros, página, tamanho), já filtrada. */
  de: string;
  contexto?: string;
  bloqueio: string | null;
  acaoSituacao: AcaoDeCadastro;
  acaoExcluir: AcaoDeCadastro;
}) {
  const lista = `${base}${de ? `?${de}` : ''}`;
  const aqui = `${base}/${i.id}`;
  const semVinculo = i.total === 0;
  const ocultos = { ...(de ? { de } : {}), origem: 'lista' };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: i.nome, href: aqui }, { rotulo: 'Remover' }]} />
      <Voltar href={lista}>Voltar para a lista</Voltar>
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo="Remover insumo"
        subtitulo={[contexto, i.nome, TIPOS[i.tipo as TipoInsumo] ?? i.tipo, i.categoria ?? 'sem categoria', i.ativo ? null : 'desativado'].filter(Boolean).join(' · ')}
      />

      <Painel
        titulo="O que está ligado a este insumo"
        subtitulo={semVinculo ? 'Nada, em lugar nenhum' : `${i.vinculos.length} ${i.vinculos.length === 1 ? 'tipo de registro' : 'tipos de registro'}`}
      >
        {semVinculo ? (
          <p className="text-sm text-texto">
            Nenhuma ficha técnica, nota de compra, estoque, produção nem histórico de preço usa “{i.nome}”. Por isso ele pode ser excluído de vez.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-linha text-sm" aria-label={`Registros ligados a ${i.nome}`}>
              {i.vinculos.map((v) => (
                <li key={v.chave} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="min-w-8 shrink-0 text-right font-semibold tabular-nums text-texto">{v.n}</span>
                  <span className="text-texto">{v.frase}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-linha pt-3 text-[13px] text-suave">
              Tudo isso continua existindo exatamente como está, com ou sem o insumo na lista. Nenhum movimento de estoque é apagado e nenhuma ficha fica sem o insumo dela.
            </p>
          </>
        )}
      </Painel>

      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}

      <Painel
        titulo={i.ativo ? 'Desativar' : 'Já está desativado'}
        subtitulo={semVinculo ? 'O caminho mais seguro' : 'É o que dá para fazer com um insumo que já foi usado'}
      >
        {i.ativo ? (
          <>
            {!semVinculo && (
              <p className="mb-3 text-sm text-texto">
                Como há registros ligados, “{i.nome}” <strong className="font-semibold">não pode ser excluído de vez</strong>. Desativar o tira da lista e da busca padrão; ficha, nota, estoque, produção e histórico ficam como estão, e dá para reativar quando quiser.
              </p>
            )}
            <fieldset disabled={!!bloqueio} className="min-w-0">
              <FormSituacao acao={acaoSituacao} ativo oQue="insumo" idBase="remover-situacao" ocultos={ocultos} />
            </fieldset>
          </>
        ) : (
          <p className="text-sm text-texto">
            “{i.nome}” já está desativado: fora da lista padrão e da busca, com tudo preservado.{' '}
            <Link href={aqui} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}>
              Reativar no detalhe
            </Link>
          </p>
        )}
      </Painel>

      {semVinculo && (
        <Painel titulo="Excluir de vez" subtitulo="Só porque nada usa este insumo">
          <fieldset disabled={!!bloqueio} className="min-w-0">
            <FormExcluir acao={acaoExcluir} nome={i.nome} de={de} recarregar={`${aqui}/remover${de ? `?de=${encodeURIComponent(de)}` : ''}`} />
          </fieldset>
        </Painel>
      )}
    </div>
  );
}
