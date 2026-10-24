// Scanner avoid-ai-design, SD4d (P2) aceito: "Lote 261017-01 · 5 kg", "Caio · 10:42" são a linha de apoio do cartão, no padrão "A · B" das telas da 1.1–1.8.
/**
 * Produção da loja (3.1): o quadro por etapa — Planejadas, Em produção, Concluídas hoje e Canceladas hoje. Coluna = título
 * na cor do estado + barra fina + contador (o esqueleto é o mesmo dos quadros de requisições e de pedidos). Cartão = a ficha,
 * o código do lote, quanto, para quando, e a situação dos insumos ("falta entregar #12" / "entregues"); atrasado = borda
 * esquerda vermelha + "2d de atraso" (a cor nunca é o único sinal). O cartão inteiro abre o lote. Celular primeiro: a cozinha
 * usa pelo celular. A mesma tela no nível 1 e na pessoa do parceiro.
 */

import Link from 'next/link';
import type { CartaoDoLote, QuadroDaProducao } from '@/lib/erp/producao';
import { COLUNA_DO_QUADRO, formatarRendimento, ORDEM_DO_QUADRO, rendimentoDoLote, situacaoDosInsumos, type StatusDaProducao } from '@/lib/erp/producao-campos';
import { textoDoParaDia } from '@/lib/erp/requisicao-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao } from '../../ui/estilos';
import { Aviso } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { CartaoDoQuadro, ColunaDoQuadro, GradeDoQuadro, type TomDaColuna } from '../quadro/quadro';
import { quandoDoCartao, SeloDoAtraso } from '../requisicoes/partes';
import { ExplicacaoNoPonto } from '../../ui/ponto-de-ajuda';

const TOM_DA_COLUNA: Record<StatusDaProducao, TomDaColuna> = {
  PLANEJADA: 'atencao',
  EM_EXECUCAO: 'neutro',
  CONCLUIDA: 'ok',
  CANCELADA: 'suave',
};

function Cartao({ c, aqui, hoje }: { c: CartaoDoLote; aqui: string; hoje: string }) {
  const atrasado = c.atrasoDias > 0;
  const pendente = c.status === 'PLANEJADA' || c.status === 'EM_EXECUCAO';
  const falta = c.requisicao && c.requisicao.status !== 'ATENDIDA' && c.requisicao.status !== 'CANCELADA';
  const r = c.status === 'CONCLUIDA' && c.produzidoMilesimos !== null ? rendimentoDoLote(c.planejadoMilesimos, c.produzidoMilesimos) : null;
  const quem =
    c.status === 'CONCLUIDA' && c.concluidaEm
      ? `concluída por ${c.concluidaPorNome ?? '—'} · ${quandoDoCartao(c.concluidaEm, hoje)}`
      : c.status === 'CANCELADA' && c.canceladaEm
        ? `${c.estornado ? 'estornada' : 'cancelada'} · ${quandoDoCartao(c.canceladaEm, hoje)}`
        : c.responsavel
          ? `com ${c.responsavel.nome} · ${c.responsavel.passadoPor ? `recebeu ${quandoDoCartao(c.responsavel.desde, hoje)} (passado por ${c.responsavel.passadoPor})` : `pegou ${quandoDoCartao(c.responsavel.desde, hoje)}`}`
          : c.iniciadaEm
            ? `começou ${quandoDoCartao(c.iniciadaEm, hoje)} · sem ninguém`
            : `planejada ${quandoDoCartao(c.criadoEm, hoje)}`;
  return (
    <CartaoDoQuadro
      href={`${aqui}/${c.id}`}
      atrasado={atrasado}
      apagado={c.status === 'CANCELADA'}
      rotulo={`Lote ${c.codigoLote}, ${c.fichaNome}${atrasado ? `, ${c.atrasoDias} dias de atraso` : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-[14px] font-semibold text-texto">{c.fichaNome}</span>
        {atrasado ? <SeloDoAtraso dias={c.atrasoDias} /> : pendente ? <span className="shrink-0 text-[12px] text-suave">{textoDoParaDia(c.dataPlanejada, hoje)}</span> : null}
      </div>
      <div className="mt-1 text-[13px] tabular-nums text-suave">
        Lote <span className="text-texto">{c.codigoLote}</span> · {c.status === 'CONCLUIDA' && c.produzidoMilesimos !== null ? `${formatarQuantidade(c.produzidoMilesimos, c.unidade)} de ${formatarQuantidade(c.planejadoMilesimos, c.unidade)}${r ? ` · rendeu ${formatarRendimento(r.rendimentoBp)}` : ''}` : formatarQuantidade(c.planejadoMilesimos, c.unidade)}
      </div>
      {pendente && c.requisicao && <div className={`mt-2 text-[12px] ${falta ? 'text-atencao' : 'text-suave'}`}>{situacaoDosInsumos(c.requisicao.status, c.requisicao.numero)}</div>}
      <div className={`mt-1 text-[12px] ${c.responsavel && pendente ? 'font-semibold text-texto' : 'text-suave'}`}>{quem}</div>
    </CartaoDoQuadro>
  );
}

function Coluna({ status, cartoes, aqui, hoje }: { status: StatusDaProducao; cartoes: CartaoDoLote[]; aqui: string; hoje: string }) {
  return (
    <ColunaDoQuadro id={`coluna-${status.toLowerCase()}`} titulo={COLUNA_DO_QUADRO[status]} contador={String(cartoes.length)} tom={TOM_DA_COLUNA[status]} vazio="Nenhum lote nesta etapa" vazia={cartoes.length === 0}>
      {cartoes.map((c) => (
        <Cartao key={c.id} c={c} aqui={aqui} hoje={hoje} />
      ))}
    </ColunaDoQuadro>
  );
}

export function TelaQuadroDaProducao({
  q,
  base,
  contexto,
  feito,
  pode,
  bloqueio,
}: {
  q: QuadroDaProducao;
  base: string;
  contexto?: string;
  feito?: string;
  pode: { registrar: boolean };
  bloqueio: string | null;
}) {
  const aqui = `${base}/${q.loja.id}`;
  const pendentes = q.colunas.PLANEJADA.length + q.colunas.EM_EXECUCAO.length;
  const atrasadas = [...q.colunas.PLANEJADA, ...q.colunas.EM_EXECUCAO].filter((c) => c.atrasoDias > 0).length;
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: q.loja.nome }]} />
      <PageHeader
        icone="producao"
        cor={COR.producao}
        titulo={`Produção da ${q.loja.nome}`}
        subtitulo={[contexto, pendentes ? `${pendentes} ${pendentes === 1 ? 'lote pendente' : 'lotes pendentes'}` : 'nada pendente', atrasadas ? `${atrasadas} com atraso` : null].filter(Boolean).join(' · ')}
        acao={
          pode.registrar && !bloqueio && q.aberto ? (
            <>
              <Link href={`${base}/tarefas/${q.loja.id}`} className={classeDeBotao('secundario')}>
                Tarefas da cozinha
              </Link>
              <Link href={`${aqui}/nova`} className={classeDeBotao('primario')}>
                Nova produção
              </Link>
            </>
          ) : undefined
        }
      />
      {feito && <Aviso tom="ok" titulo={feito} />}
      {!q.aberto && <Aviso tom="alerta" titulo={`O estoque da ${q.loja.nome} ainda não foi aberto.`}>A produção baixa os insumos do estoque e põe o lote nele: ela começa depois da contagem de abertura.</Aviso>}
      {bloqueio && <Aviso tom="alerta" titulo={bloqueio} />}

      <ExplicacaoNoPonto ponto="fluxo">
        <p className="max-w-3xl text-sm text-suave">
          Planeje o lote pela ficha: os insumos saem do estoque pela requisição, que o estoque entrega. Quem vai fazer pega o lote em Tarefas; quando ficar pronto, conclui dizendo quanto saiu de verdade e ele entra no estoque da loja.
        </p>
      </ExplicacaoNoPonto>

      <GradeDoQuadro>
        {ORDEM_DO_QUADRO.map((s) => (
          <Coluna key={s} status={s} cartoes={q.colunas[s]} aqui={aqui} hoje={q.hoje} />
        ))}
      </GradeDoQuadro>
    </div>
  );
}
