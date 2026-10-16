// Scanner avoid-ai-design, SD4d (P2) aceito: "#12 · Cozinha", "Caio · 10:42" são a linha de apoio do cartão, no padrão "A · B" das telas da 1.1–1.7.
/**
 * Requisições da loja (1.8): o quadro por estado — Pedidas, Atendidas em
 * parte, Atendidas e Canceladas (as duas últimas da semana). Coluna = título
 * na cor do estado + barra fina + contador; vazia diz "Nenhum item nesta
 * etapa". Cartão = número, setor, os itens (pedido, ou "saiu X de Y"), quem
 * pediu e quando; atrasado = filete vermelho à esquerda + "2d de atraso" (a
 * cor nunca é o único sinal). O cartão inteiro abre o detalhe. A mesma tela
 * no nível 1 e na pessoa do parceiro.
 */

import Link from 'next/link';
import type { CartaoDaRequisicao, QuadroDeRequisicoes } from '@/lib/erp/requisicao';
import { COLUNA_DO_QUADRO, numeroDaRequisicao, ORDEM_DO_QUADRO, rotuloDoSetor, textoDoParaDia, type StatusDaRequisicao } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import { quandoCurto, quantoDoItem, SeloDoAtraso } from './partes';

/** Cor do título e da barra de cada coluna (estado), sempre com a palavra ao lado. */
const COR_DA_COLUNA: Record<StatusDaRequisicao, { texto: string; barra: string }> = {
  ABERTA: { texto: 'text-atencao', barra: 'bg-atencao' },
  PARCIAL: { texto: 'text-texto', barra: 'bg-texto/70' },
  ATENDIDA: { texto: 'text-ok', barra: 'bg-ok' },
  CANCELADA: { texto: 'text-suave', barra: 'bg-suave/60' },
};

const ITENS_NO_CARTAO = 3;

function Cartao({ c, aqui, hoje }: { c: CartaoDaRequisicao; aqui: string; hoje: string }) {
  const atrasada = c.atrasoDias > 0;
  const saiu = c.status === 'PARCIAL' || c.status === 'ATENDIDA';
  const resto = c.itens.length - ITENS_NO_CARTAO;
  const quem =
    c.status === 'ATENDIDA' && c.atendidaEm
      ? `entregue por ${c.atendidaPorNome ?? '—'} · ${quandoCurto(c.atendidaEm, hoje)}`
      : c.status === 'CANCELADA' && c.canceladaEm
        ? `cancelada · ${quandoCurto(c.canceladaEm, hoje)}`
        : `${c.pedidaPorNome ?? '—'} · ${quandoCurto(c.solicitadaEm, hoje)}`;
  return (
    <li>
      <Link
        href={`${aqui}/${c.id}`}
        className={`ff-transicao block rounded-[10px] border border-linha bg-painel px-3.5 py-3 hover:border-linha-forte ${atrasada ? 'border-l-[3px] border-l-erro pl-[12px]' : ''} ${c.status === 'CANCELADA' ? 'opacity-75' : ''}`}
        aria-label={`Requisição ${numeroDaRequisicao(c.numero)}, ${rotuloDoSetor(c.setor)}${atrasada ? `, ${c.atrasoDias} dias de atraso` : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-[14px] font-semibold text-texto">
            <span className="tabular-nums">{numeroDaRequisicao(c.numero)}</span> · {rotuloDoSetor(c.setor)}
          </span>
          {atrasada ? <SeloDoAtraso dias={c.atrasoDias} /> : c.status === 'ABERTA' || c.status === 'PARCIAL' ? <span className="shrink-0 text-[12px] text-suave">{textoDoParaDia(c.paraDia, hoje)}</span> : null}
        </div>
        <ul className="mt-2 space-y-0.5 text-[13px]">
          {c.itens.slice(0, ITENS_NO_CARTAO).map((i) => (
            <li key={i.nome} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-texto">{i.nome}</span>
              <span className={`shrink-0 tabular-nums ${saiu && i.atendidoMilesimos < i.solicitadoMilesimos ? 'text-atencao' : 'text-suave'}`}>{quantoDoItem(i, saiu)}</span>
            </li>
          ))}
          {resto > 0 && <li className="text-[12px] text-suave">e mais {resto === 1 ? '1 insumo' : `${resto} insumos`}</li>}
        </ul>
        <div className="mt-2 text-[12px] text-suave">
          {quem}
          {c.fichaNome ? ` · da ficha ${c.fichaNome}` : ''}
        </div>
      </Link>
    </li>
  );
}

function Coluna({ status, cartoes, aqui, hoje }: { status: StatusDaRequisicao; cartoes: CartaoDaRequisicao[]; aqui: string; hoje: string }) {
  const cor = COR_DA_COLUNA[status];
  const id = `coluna-${status.toLowerCase()}`;
  const recente = status === 'ATENDIDA' || status === 'CANCELADA';
  return (
    <section aria-labelledby={id} className="min-w-0">
      <header className="pb-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={id} className={`text-[13px] font-semibold ${cor.texto}`}>
            {COLUNA_DO_QUADRO[status]}
          </h2>
          <span className="text-[12px] tabular-nums text-suave">
            {cartoes.length}
            {recente ? ' · 7 dias' : ''}
          </span>
        </div>
        <div aria-hidden className={`mt-2 h-0.5 rounded-full ${cor.barra}`} />
      </header>
      {cartoes.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-linha px-3.5 py-5 text-center text-[13px] text-suave">Nenhum item nesta etapa</p>
      ) : (
        <ol className="space-y-2">
          {cartoes.map((c) => (
            <Cartao key={c.id} c={c} aqui={aqui} hoje={hoje} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function TelaQuadroDeRequisicoes({
  q,
  base,
  contexto,
  feito,
  pode,
  bloqueio,
}: {
  q: QuadroDeRequisicoes;
  base: string;
  contexto?: string;
  feito?: string;
  pode: { pedir: boolean; atender: boolean; divergencias: boolean };
  bloqueio: string | null;
}) {
  const daLoja = `${base}/${q.loja.id}`;
  const aqui = `${daLoja}/requisicoes`;
  const pendentes = q.colunas.ABERTA.length + q.colunas.PARCIAL.length;
  const atrasadas = [...q.colunas.ABERTA, ...q.colunas.PARCIAL].filter((c) => c.atrasoDias > 0).length;
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: q.loja.nome }]} />
      <Voltar href={daLoja}>Voltar para o estoque da {q.loja.nome}</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo={`Requisições da ${q.loja.nome}`}
        subtitulo={[contexto, pendentes ? `${pendentes} ${pendentes === 1 ? 'pendente' : 'pendentes'}` : 'nada pendente', atrasadas ? `${atrasadas} com atraso` : null].filter(Boolean).join(' · ')}
        acao={
          pode.pedir && !bloqueio && q.aberto ? (
            <Link href={`${aqui}/nova`} className={classeDeBotao('primario')}>
              Nova requisição
            </Link>
          ) : undefined
        }
      />
      {feito && <Aviso tom="ok" titulo={feito} />}
      {!q.aberto && <Aviso tom="alerta" titulo={`O estoque da ${q.loja.nome} ainda não foi aberto.`}>A requisição baixa do estoque: ela começa depois da contagem de abertura.</Aviso>}
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}

      <p className="max-w-3xl text-sm text-suave">
        O setor pede; o estoque entrega e dá baixa no livro, item a item. O que sai em parte fica em “atendidas em parte” até sair o resto ou alguém encerrar.
        {pode.divergencias && (
          <>
            {' '}
            O que a contagem acusa sem requisição aparece em{' '}
            <Link href={`${daLoja}/divergencias`} className={LINK_DE_TEXTO}>
              Divergências
            </Link>
            .
          </>
        )}
      </p>

      <div className="grid gap-x-4 gap-y-7 md:grid-cols-2 xl:grid-cols-4">
        {ORDEM_DO_QUADRO.map((s) => (
          <Coluna key={s} status={s} cartoes={q.colunas[s]} aqui={aqui} hoje={q.hoje} />
        ))}
      </div>
    </div>
  );
}
