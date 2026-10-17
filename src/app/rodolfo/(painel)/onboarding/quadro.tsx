// Scanner avoid-ai-design, SD4d (P2) aceito: "Caio · Rio/RJ", "3 lojas · 2 marcas" são a linha de apoio do cartão, no padrão "A · B" das telas da 1.1–1.8.
/**
 * Quadro "Aguardando liberação" (0.5, nível 1): Novo, Em conversa, Ativado e
 * Recusado (as duas últimas mostram 30 dias). Cartão = grupo, quem pediu e de
 * onde, lojas e marcas, há quanto tempo está na etapa; atrasado (Novo > 2
 * dias, Em conversa > 7 dias sem movimento) = filete vermelho de 2 px à
 * esquerda + "Xd de atraso" (a cor nunca é o único sinal). Sem arrastar:
 * muda-se de etapa no detalhe. No celular as colunas viram abas (links, sem
 * JavaScript); de 768 px em diante, todas à vista.
 */

import Link from 'next/link';
import type { CartaoDoPedido, QuadroDePedidos } from '@/lib/erp/pedidos';
import { ORDEM_DAS_ETAPAS, ROTULO_DA_ETAPA, textoDaEtapa, type EtapaDoPedido } from '@/lib/erp/pedido-campos';
import { Selo } from '@/components/erp/ui/superficies';
import { CartaoDoQuadro, ColunaDoQuadro, GradeDoQuadro, type TomDaColuna } from '@/components/erp/telas/quadro/quadro';

const TOM_DA_COLUNA: Record<EtapaDoPedido, TomDaColuna> = {
  NOVO: 'atencao',
  EM_CONVERSA: 'neutro',
  ATIVADO: 'ok',
  RECUSADO: 'suave',
};

export const CHAVE_DA_ABA: Record<EtapaDoPedido, string> = {
  NOVO: 'novo',
  EM_CONVERSA: 'em-conversa',
  ATIVADO: 'ativado',
  RECUSADO: 'recusado',
};

export function etapaDaAba(valor: string | undefined): EtapaDoPedido {
  return ORDEM_DAS_ETAPAS.find((e) => CHAVE_DA_ABA[e] === valor) ?? 'NOVO';
}

const FECHADA: Record<EtapaDoPedido, string> = {
  NOVO: 'chegou',
  EM_CONVERSA: 'em conversa',
  ATIVADO: 'ativado',
  RECUSADO: 'recusado',
};

function Cartao({ c, agora }: { c: CartaoDoPedido; agora: Date }) {
  const atrasado = c.atrasoDias > 0;
  const fechado = c.status === 'ATIVADO' || c.status === 'RECUSADO';
  return (
    <CartaoDoQuadro href={`/rodolfo/onboarding/${c.id}`} atrasado={atrasado} filete={2} rotulo={`${c.nomeGrupo}, ${ROTULO_DA_ETAPA[c.status]}${atrasado ? `, ${c.atrasoDias} dias de atraso` : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-[14px] font-semibold text-texto">{c.nomeGrupo}</span>
        {atrasado && <Selo tom="erro">{`${c.atrasoDias}d de atraso`}</Selo>}
      </div>
      {!c.excluido && (
        <div className="mt-1 break-words text-[13px] text-suave">
          {c.responsavel} · {c.cidade}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] tabular-nums text-suave">
        <span>
          {c.lojas} {c.lojas === 1 ? 'loja' : 'lojas'} · {c.marcas} {c.marcas === 1 ? 'marca' : 'marcas'}
        </span>
        <span className={atrasado ? 'font-semibold text-erro' : ''}>
          {FECHADA[c.status]} {textoDaEtapa(c.etapaDesde, agora)}
        </span>
      </div>
      <div className="mt-1 text-[12px] text-suave">
        {c.origem === 'LANDING' ? 'Veio do site' : 'Digitado por você'}
        {c.reenvios > 0 && !fechado ? ` · mandou de novo ${c.reenvios}×` : ''}
      </div>
    </CartaoDoQuadro>
  );
}

function Coluna({ etapa, cartoes, ativa, agora }: { etapa: EtapaDoPedido; cartoes: CartaoDoPedido[]; ativa: boolean; agora: Date }) {
  const recente = etapa === 'ATIVADO' || etapa === 'RECUSADO';
  return (
    // Celular: só a aba escolhida; de 768 px em diante, todas.
    <ColunaDoQuadro
      id={`coluna-${CHAVE_DA_ABA[etapa]}`}
      titulo={ROTULO_DA_ETAPA[etapa]}
      contador={`${cartoes.length}${recente ? ' · 30 dias' : ''}`}
      tom={TOM_DA_COLUNA[etapa]}
      vazio="Nenhum pedido nesta etapa"
      vazia={cartoes.length === 0}
      soNoCelularQuandoAtiva={ativa}
    >
      {cartoes.map((c) => (
        <Cartao key={c.id} c={c} agora={agora} />
      ))}
    </ColunaDoQuadro>
  );
}

export function QuadroDePedidos({ quadro, etapa }: { quadro: QuadroDePedidos; etapa: EtapaDoPedido }) {
  const agora = new Date();
  return (
    <>
      {/* Celular: 4 abas iguais, rótulo e contagem em duas linhas (nada corta, nada rola). */}
      <nav aria-label="Etapa do pedido" className="md:hidden">
        <ul className="grid grid-cols-4 gap-1 rounded-[10px] border border-linha bg-painel p-1">
          {ORDEM_DAS_ETAPAS.map((e) => (
            <li key={e}>
              <Link
                href={`/rodolfo/onboarding?etapa=${CHAVE_DA_ABA[e]}`}
                aria-current={e === etapa ? 'page' : undefined}
                className="ff-transicao flex min-h-11 flex-col items-center justify-center rounded-[7px] px-1 text-center text-[12px] leading-tight text-suave hover:bg-texto/5 hover:text-texto aria-[current=page]:bg-forte aria-[current=page]:font-semibold aria-[current=page]:text-texto"
              >
                <span>{ROTULO_DA_ETAPA[e]}</span>
                <span className="tabular-nums">{quadro[e].length}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <GradeDoQuadro>
        {ORDEM_DAS_ETAPAS.map((e) => (
          <Coluna key={e} etapa={e} cartoes={quadro[e]} ativa={e === etapa} agora={agora} />
        ))}
      </GradeDoQuadro>
    </>
  );
}
