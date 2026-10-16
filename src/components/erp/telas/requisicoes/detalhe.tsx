// Scanner avoid-ai-design, SD4d (P2) aceito: "Cozinha · para hoje · pedida por Caio" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–1.7.
/**
 * Uma requisição (1.8): o pedido × o que saiu × o que voltou, item a item,
 * com o saldo de agora da loja; o que saiu do LIVRO (cada baixa e cada
 * estorno com o saldo antes › depois); entregar (quem atende), receber de
 * volta, cancelar a pedida; e o histórico. A mesma tela no nível 1 e na pessoa.
 */

import Link from 'next/link';
import type { RequisicaoDaLoja } from '@/lib/erp/requisicao';
import { numeroDaRequisicao, pendente, TITULO_NO_HISTORICO_DA_REQUISICAO, quantidadeNegativa, rotuloDoSetor, textoDoParaDia } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso, Painel, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import { LivroDoEstoque } from '../estoque/livro';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoDeEstoque } from '../estoque/estado';
import { FormCancelarRequisicao, FormDevolver } from './formularios';
import { quandoLongo, SeloDaRequisicao, SeloDoAtraso } from './partes';

export function TelaDetalheDaRequisicao({
  d,
  base,
  contexto,
  feito,
  pode,
  acoes,
  bloqueio,
}: {
  d: RequisicaoDaLoja;
  base: string;
  contexto?: string;
  feito?: string;
  pode: { atender: boolean; cancelar: boolean };
  acoes: { devolver: AcaoDeEstoque; cancelar: AcaoDeEstoque };
  bloqueio: string | null;
}) {
  const r = d.requisicao;
  const daLoja = `${base}/${d.loja.id}`;
  const quadro = `${daLoja}/requisicoes`;
  const aqui = `${quadro}/${r.id}`;
  const podeEntregar = pode.atender && !bloqueio && d.aberto && pendente(r.status);
  const corte = r.status === 'ATENDIDA' ? d.itens.filter((i) => i.faltaMilesimos > 0) : [];
  const podeDevolver = pode.atender && !bloqueio && d.aberto && r.status !== 'CANCELADA' && d.itens.some((i) => i.atendidoMilesimos > 0);
  const podeCancelar = pode.cancelar && !bloqueio && r.status === 'ABERTA';
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: quadro }, { rotulo: numeroDaRequisicao(r.numero) }]} />
      <Voltar href={quadro}>Voltar para as requisições</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo={`Requisição ${numeroDaRequisicao(r.numero)}`}
        subtitulo={[contexto, rotuloDoSetor(r.setor), textoDoParaDia(r.paraDia, d.hoje), `pedida por ${r.pedidaPorNome ?? '—'} em ${quandoLongo(r.solicitadaEm)}`].filter(Boolean).join(' · ')}
        acao={
          podeEntregar ? (
            <Link href={`${aqui}/atender`} className={classeDeBotao('primario')}>
              {r.status === 'PARCIAL' ? 'Entregar o resto' : 'Entregar'}
            </Link>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeloDaRequisicao status={r.status} />
          <SeloDoAtraso dias={d.atrasoDias} />
          {r.fichaNomeSnapshot && <span className="text-[13px] text-suave">da ficha {r.fichaNomeSnapshot}</span>}
        </div>
      </PageHeader>
      {feito && <Aviso tom="ok" titulo={feito} />}
      {r.status === 'CANCELADA' && (
        <Aviso tom="neutro" titulo={`Cancelada por ${r.canceladaPorNome ?? '—'}${r.canceladaEm ? ` em ${quandoLongo(r.canceladaEm)}` : ''}.`}>
          {r.motivoCancelamento}
        </Aviso>
      )}
      {corte.length > 0 && (
        <Aviso tom="alerta" titulo="Encerrada com corte:">
          {corte.map((i) => `${i.nome} ${formatarQuantidade(i.faltaMilesimos, i.unidade)}`).join(' · ')} não saiu.
        </Aviso>
      )}
      {r.observacao && (
        <p className="rounded-[10px] border border-linha px-3.5 py-2.5 text-sm text-texto">
          <span className="text-suave">Observação: </span>
          {r.observacao}
        </p>
      )}

      <Painel titulo="Itens" subtitulo="Pedido, o que saiu (líquido das devoluções) e o saldo da loja agora" semRespiro>
        <ul className="divide-y divide-linha md:hidden">
          {d.itens.map((i) => (
            <li key={i.id} className="space-y-1.5 px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-texto">{i.nome}</span>
                <span className="shrink-0 tabular-nums text-texto">{formatarQuantidade(i.solicitadoMilesimos, i.unidade)}</span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[12px] tabular-nums">
                <div>
                  <dt className="text-suave">Saiu</dt>
                  <dd className="font-semibold text-texto">{formatarQuantidade(i.atendidoMilesimos, i.unidade)}</dd>
                </div>
                <div>
                  <dt className="text-suave">{i.devolvidoMilesimos > 0 ? 'Voltou' : 'Falta'}</dt>
                  <dd className={`font-semibold ${i.faltaMilesimos > 0 && i.devolvidoMilesimos === 0 ? 'text-atencao' : 'text-texto'}`}>{formatarQuantidade(i.devolvidoMilesimos > 0 ? i.devolvidoMilesimos : i.faltaMilesimos, i.unidade)}</dd>
                </div>
                <div>
                  <dt className="text-suave">No livro</dt>
                  <dd className={`font-semibold ${i.saldoMilesimos < 0 ? 'text-erro' : 'text-texto'}`}>{quantidadeNegativa(i.saldoMilesimos, i.unidade)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <table className="hidden w-full text-sm md:table">
          <caption className="sr-only">Itens da requisição: pedido, saída, devolução, falta e saldo da loja.</caption>
          <thead>
            <tr className="bg-forte text-left text-[12px] text-suave">
              <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                Insumo
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Pedido
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Saiu
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Voltou
              </th>
              <th scope="col" className="h-10 px-3 text-right font-semibold">
                Falta
              </th>
              <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                No livro agora
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {d.itens.map((i) => (
              <tr key={i.id} className="h-11 border-t border-linha">
                <td className="py-2.5 pl-5 pr-3 font-medium text-texto">{i.nome}</td>
                <td className="px-3 py-2.5 text-right">{formatarQuantidade(i.solicitadoMilesimos, i.unidade)}</td>
                <td className="px-3 py-2.5 text-right font-semibold">{formatarQuantidade(i.atendidoMilesimos, i.unidade)}</td>
                <td className="px-3 py-2.5 text-right text-suave">{i.devolvidoMilesimos ? formatarQuantidade(i.devolvidoMilesimos, i.unidade) : '—'}</td>
                <td className={`px-3 py-2.5 text-right ${i.faltaMilesimos > 0 ? 'text-atencao' : 'text-suave'}`}>{i.faltaMilesimos ? formatarQuantidade(i.faltaMilesimos, i.unidade) : '—'}</td>
                <td className={`px-3 py-2.5 pr-5 text-right font-semibold ${i.saldoMilesimos < 0 ? 'text-erro' : ''}`}>
                  {quantidadeNegativa(i.saldoMilesimos, i.unidade)}
                  {i.saldoMilesimos < 0 && <span className="block text-[12px] font-normal">abaixo de zero</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      <Painel titulo="O que saiu do livro" subtitulo="Cada baixa e cada estorno, com o saldo antes e depois" semRespiro>
        {d.movimentos.length === 0 ? <Vazio>Nada saiu ainda: a baixa acontece na entrega.</Vazio> : <LivroDoEstoque movimentos={[...d.movimentos].reverse()} />}
      </Painel>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {(podeDevolver || podeCancelar) && (
          <div className="space-y-5">
            {podeDevolver && (
              <Painel titulo="Voltou para o estoque" subtitulo="A cozinha devolveu o que não usou">
                <FormDevolver acao={acoes.devolver} versao={r.versao} itens={d.itens} recarregar={aqui} />
              </Painel>
            )}
            {podeCancelar && (
              <Painel titulo="Cancelar" subtitulo="Só enquanto nada saiu do estoque">
                <FormCancelarRequisicao acao={acoes.cancelar} />
              </Painel>
            )}
          </div>
        )}
        <Painel titulo="Histórico" semRespiro className={podeDevolver || podeCancelar ? '' : 'lg:col-span-2'}>
          {d.historico.length === 0 ? <Vazio>Sem alterações.</Vazio> : <ListaHistorico linhas={d.historico} compacta doCadastro={`Requisição ${numeroDaRequisicao(r.numero)} · ${d.loja.nome}`} titulos={TITULO_NO_HISTORICO_DA_REQUISICAO} />}
        </Painel>
      </div>
    </div>
  );
}
