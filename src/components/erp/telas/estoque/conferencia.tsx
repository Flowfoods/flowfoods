// Scanner avoid-ai-design, SD4d (P2) aceito: "Seco · contou Ana", "Desde 16/10 · 7 insumos com saldo" e "custo de referência de hoje · 1 sem preço" são linhas de apoio da tabela densa, no padrão "A · B" das telas da 1.1–1.5. (O ignore do scanner não aceita id com minúscula.)
/**
 * Conferir e concluir a abertura (1.6): antes de virar saldo, o gerente vê
 * quanto foi contado, o valor do estoque inicial pelo custo de referência de
 * agora (um arredondamento por item; sem preço = pendente, fora da soma), o
 * que ficou sem contar (entra com zero só com a confirmação) e o que deu zero.
 * Concluir não se desfaz: correção é pela contagem (1.7).
 */

import Link from 'next/link';
import type { ConferenciaDaAbertura, LinhaDaConferencia } from '@/lib/erp/estoque';
import { COR } from '@/lib/erp/modulos';
import { CONSERVACOES } from '@/lib/erp/validade';
import { formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { IconeDaConservacao } from '../cadastro/validade';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from './estado';
import { FormConcluirAbertura } from './formularios';

function ListaCurta({ linhas, vazio, mostrarValor = false }: { linhas: LinhaDaConferencia[]; vazio: string; mostrarValor?: boolean }) {
  if (linhas.length === 0) return <p className="px-4 py-4 text-sm text-suave sm:px-5">{vazio}</p>;
  return (
    <ul className="divide-y divide-linha">
      {linhas.map((l) => (
        <li key={l.id} className="flex min-h-11 items-start justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
          <span className="flex min-w-0 flex-1 items-start gap-2.5">
            <span className="mt-0.5">
              <IconeDaConservacao conservacao={l.conservacao} />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-texto">{l.nome}</span>
              <span className="block text-[12px] text-suave">
                {CONSERVACOES[l.conservacao]}
                {l.por ? ` · contou ${l.por}` : ''}
              </span>
              {l.texto.includes('×') && <span className="block text-[12px] tabular-nums text-suave">{l.texto}</span>}
            </span>
          </span>
          <span className="shrink-0 text-right tabular-nums">
            {l.contadoMilesimos === null ? (
              <span className="block text-[13px] text-suave">sem contar</span>
            ) : (
              <span className="block font-semibold text-texto">{formatarQuantidade(l.contadoMilesimos, l.unidade)}</span>
            )}
            {mostrarValor && <span className="block text-[12px] text-suave">{l.valorCentavos === null ? 'valor pendente' : formatarDinheiro(l.valorCentavos)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TelaConferencia({
  c,
  base,
  contexto,
  acao,
  podeConcluir,
  bloqueio,
}: {
  c: ConferenciaDaAbertura;
  base: string;
  contexto?: string;
  acao: AcaoDeEstoque;
  podeConcluir: boolean;
  bloqueio: string | null;
}) {
  const loja = `${base}/${c.loja.id}`;
  const naoContados = c.linhas.filter((l) => l.contadoMilesimos === null);
  const zerados = c.linhas.filter((l) => l.contadoMilesimos === 0);
  const comSaldo = c.linhas.filter((l) => l.contadoMilesimos !== null && l.contadoMilesimos > 0);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: c.loja.nome, href: loja }, { rotulo: 'Conferir e concluir' }]} />
      <Voltar href={`${loja}/abertura`}>Voltar para a contagem</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo="Conferir e concluir"
        subtitulo={[contexto, `Abertura do estoque da ${c.loja.nome}`].filter(Boolean).join(' · ')}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Contados</div>
          <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">
            {c.resumo.contados} <span className="text-[18px] font-semibold text-suave">de {c.resumo.total}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-suave">
            {c.resumo.naoContados > 0 ? `${c.resumo.naoContados} sem contar` : 'todos contados'}
            {c.resumo.zerados > 0 ? ` · ${c.resumo.zerados} com zero` : ''}
          </div>
        </div>
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:col-span-2 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Valor do estoque inicial</div>
          <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{formatarDinheiro(c.valorCentavos)}</div>
          <div className="mt-1.5 text-[12px] text-suave">
            Pelo custo de referência de agora (último preço pago ou o cadastrado), um arredondamento por item. Fica fotografado na abertura.
            {c.semCusto.length > 0 && ` ${c.semCusto.length} ${c.semCusto.length === 1 ? 'insumo está' : 'insumos estão'} sem custo informado: entra a quantidade, o valor fica pendente.`}
          </div>
        </div>
      </div>

      {c.acimaDoTeto.length > 0 && (
        <Aviso tom="erro" titulo="Tem número grande demais nesta contagem: não dá para concluir assim.">
          <ul className="list-disc space-y-1 pl-5">
            {c.acimaDoTeto.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {c.notasDeHoje > 0 && (
        <Aviso tom="alerta" titulo={`${c.notasDeHoje} ${c.notasDeHoje === 1 ? 'nota de hoje já foi lançada' : 'notas de hoje já foram lançadas'} nesta loja.`}>
          O que veio nelas tem de estar na contagem: notas lançadas antes de concluir não entram de novo no estoque.
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="Sem contar" subtitulo="Entram com zero, só se você confirmar" semRespiro acessorio={naoContados.length > 0 ? <Selo tom="alerta">{naoContados.length}</Selo> : <Selo tom="ok">nenhum</Selo>}>
            <ListaCurta linhas={naoContados} vazio="Todos os insumos foram contados." />
            {naoContados.length > 0 && (
              <p className="border-t border-linha px-4 py-3 text-[13px] sm:px-5">
                <Link href={`${loja}/abertura`} className={LINK_DE_TEXTO}>
                  Contar os que faltam
                </Link>
              </p>
            )}
          </Painel>
          <Painel titulo="Contados com zero" subtitulo="Não tem nesta loja hoje (zero é contagem)" semRespiro>
            <ListaCurta linhas={zerados} vazio="Nenhum item com zero." />
          </Painel>
          <Painel titulo="Com quantidade" subtitulo="O que vira saldo, com o valor de cada um" semRespiro>
            <ListaCurta linhas={comSaldo} vazio="Nenhum item com quantidade ainda." mostrarValor />
          </Painel>
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20" aria-label="Concluir">
          <Painel titulo="Concluir a abertura">
            <div className="space-y-3 text-sm text-suave">
              <p>
                <span className="font-semibold text-texto">A contagem vira o saldo inicial</span> de cada insumo nesta loja. Daí em diante, nota lançada aqui entra no estoque na hora (nota de hoje lançada depois de concluir também).
              </p>
              <p>Não se desfaz: se algum número estiver errado, a correção é por uma contagem do dia a dia (Planejar contagem), com o antes e o depois no livro.</p>
            </div>
            <div className="mt-4 border-t border-linha pt-4">
              {bloqueio ? (
                <p className="text-sm text-suave">{bloqueio}</p>
              ) : podeConcluir ? (
                <FormConcluirAbertura acao={acao} versao={c.contagem!.versao} naoContados={c.resumo.naoContados} recarregar={`${loja}/abertura/conferir`} />
              ) : (
                <>
                  <p className="text-sm text-suave">Só gerente ou dona concluem.</p>
                  <Link href={`${loja}/abertura`} className={classeDeBotao('secundario', 'mt-3 w-full')}>
                    Voltar para a contagem
                  </Link>
                </>
              )}
            </div>
          </Painel>
        </aside>
      </div>
    </div>
  );
}
