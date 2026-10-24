/**
 * F4 — a lixeira da lista de fichas, a MESMA tela para o nível 1 e para a pessoa do parceiro. Mostra onde a ficha é usada e
 * então oferece DESATIVAR (não existe excluir ficha de vez). Desativada: o caminho é reativar no detalhe. A decisão final é
 * do servidor (`mudarSituacaoFicha`), que confere a permissão e a versão de novo.
 */

import Link from 'next/link';
import type { FichaParaRemover } from '@/lib/erp/fichas';
import { TIPOS_DE_FICHA } from '@/lib/erp/ficha-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { FormSituacao } from '../cadastro/form-situacao';
import { Voltar } from '../cadastro/partes';

const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** As frases do que está ligado, só o que existe. */
export function vinculosDaFicha(f: FichaParaRemover): string[] {
  const v: string[] = [];
  if (f.usadaEm.length > 0) v.push(`Entra em ${vezes(f.usadaEm.length, 'outra ficha', 'outras fichas')}: ${f.usadaEm.map((u) => u.nome).join(', ')}.`);
  if (f.produtos > 0) v.push(`Tem ${vezes(f.produtos, 'produto de venda', 'produtos de venda')} com preço por canal.`);
  if (f.ordens > 0) v.push(`Aparece em ${vezes(f.ordens, 'produção registrada', 'produções registradas')}.`);
  if (f.listas > 0) v.push(`Está em ${vezes(f.listas, 'lista do dia', 'listas do dia')} da produção.`);
  if (f.requisicoes > 0) v.push(`Aparece em ${vezes(f.requisicoes, 'requisição', 'requisições')} do estoque.`);
  if (f.insumoProduzido) v.push(`Produz o item de estoque “${f.insumoProduzido.nome}”${f.lojasComSaldo > 0 ? `, com saldo em ${vezes(f.lojasComSaldo, 'loja', 'lojas')}` : ''}.`);
  return v;
}

export function TelaRemoverFicha({
  ficha: f,
  base,
  de,
  contexto,
  bloqueio,
  acaoSituacao,
}: {
  ficha: FichaParaRemover;
  /** /erp/fichas ou /rodolfo/erp/<slug>/fichas */
  base: string;
  /** A lista como estava (filtros e página), já filtrada. */
  de: string;
  contexto?: string;
  bloqueio: string | null;
  acaoSituacao: AcaoDeCadastro;
}) {
  const lista = `${base}${de ? `?${de}` : ''}`;
  const aqui = `${base}/${f.id}${de ? `?de=${encodeURIComponent(de)}` : ''}`;
  const vinculos = vinculosDaFicha(f);
  const ocultos = { ...(de ? { de } : {}), origem: 'lista' };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: f.nome, href: aqui }, { rotulo: 'Remover' }]} />
      <Voltar href={lista}>Voltar para a lista</Voltar>
      <PageHeader
        icone="fichas"
        cor={COR.fichas}
        titulo="Remover ficha"
        subtitulo={[contexto, f.nome, TIPOS_DE_FICHA[f.tipo], f.ativa ? null : 'desativada'].filter(Boolean).join(' · ')}
      />

      <Painel titulo="Onde esta ficha é usada" subtitulo={vinculos.length === 0 ? 'Em nenhum outro lugar' : vezes(vinculos.length, 'tipo de registro', 'tipos de registro')}>
        {vinculos.length === 0 ? (
          <p className="text-sm text-texto">Nenhuma outra ficha, produção, lista do dia, requisição ou produto de venda usa “{f.nome}”.</p>
        ) : (
          <ul className="divide-y divide-linha text-sm" aria-label={`Registros ligados a ${f.nome}`}>
            {vinculos.map((v) => (
              <li key={v} className="py-2 text-texto first:pt-0 last:pb-0">
                {v}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-linha pt-3 text-[13px] text-suave">
          Remover uma ficha é desativar: ela sai da lista padrão e da escolha nas outras fichas e na produção. Nada é apagado: receita, preços, produções e histórico continuam como estão, e dá para reativar.
        </p>
      </Painel>

      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}

      <Painel titulo={f.ativa ? 'Desativar' : 'Já está desativada'}>
        {f.ativa ? (
          <fieldset disabled={!!bloqueio} className="min-w-0">
            <FormSituacao acao={acaoSituacao} ativo oQue="ficha" idBase="remover-ficha" ocultos={ocultos} />
          </fieldset>
        ) : (
          <p className="text-sm text-texto">
            “{f.nome}” já está desativada, com tudo preservado. Para editar, reative primeiro.{' '}
            <Link href={aqui} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0 [@media(pointer:coarse)]:min-h-11`}>
              Reativar no detalhe
            </Link>
          </p>
        )}
      </Painel>
    </div>
  );
}
