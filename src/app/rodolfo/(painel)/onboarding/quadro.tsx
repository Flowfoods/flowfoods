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
import { FiltroEmLinks } from '@/components/erp/ui/filtros';
import { Selo } from '@/components/erp/ui/superficies';

const COR_DA_COLUNA: Record<EtapaDoPedido, { texto: string; barra: string }> = {
  NOVO: { texto: 'text-atencao', barra: 'bg-atencao' },
  EM_CONVERSA: { texto: 'text-texto', barra: 'bg-texto/70' },
  ATIVADO: { texto: 'text-ok', barra: 'bg-ok' },
  RECUSADO: { texto: 'text-suave', barra: 'bg-suave/60' },
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
    <li>
      <Link
        href={`/rodolfo/onboarding/${c.id}`}
        className={`ff-transicao block rounded-[10px] border border-linha bg-painel px-3.5 py-3 hover:border-linha-forte ${atrasado ? 'border-l-2 border-l-erro pl-[13px]' : ''}`}
        aria-label={`${c.nomeGrupo}, ${ROTULO_DA_ETAPA[c.status]}${atrasado ? `, ${c.atrasoDias} dias de atraso` : ''}`}
      >
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
          <span>
            {FECHADA[c.status]} {textoDaEtapa(c.etapaDesde, agora)}
          </span>
        </div>
        <div className="mt-1 text-[12px] text-suave">
          {c.origem === 'LANDING' ? 'Veio do site' : 'Digitado por você'}
          {c.reenvios > 0 && !fechado ? ` · mandou de novo ${c.reenvios}×` : ''}
        </div>
      </Link>
    </li>
  );
}

function Coluna({ etapa, cartoes, ativa, agora }: { etapa: EtapaDoPedido; cartoes: CartaoDoPedido[]; ativa: boolean; agora: Date }) {
  const cor = COR_DA_COLUNA[etapa];
  const id = `coluna-${CHAVE_DA_ABA[etapa]}`;
  const recente = etapa === 'ATIVADO' || etapa === 'RECUSADO';
  return (
    // Celular: só a aba escolhida; de 768 px em diante, todas.
    <section aria-labelledby={id} className={`min-w-0 ${ativa ? 'block' : 'hidden md:block'}`}>
      <header className="pb-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={id} className={`text-[13px] font-semibold ${cor.texto}`}>
            {ROTULO_DA_ETAPA[etapa]}
          </h2>
          <span className="text-[12px] tabular-nums text-suave">
            {cartoes.length}
            {recente ? ' · 30 dias' : ''}
          </span>
        </div>
        <div aria-hidden className={`mt-2 h-0.5 rounded-full ${cor.barra}`} />
      </header>
      {cartoes.length === 0 ? (
        <p className="rounded-[10px] border border-dashed border-linha px-3.5 py-5 text-center text-[13px] text-suave">Nenhum pedido nesta etapa</p>
      ) : (
        <ol className="space-y-2">
          {cartoes.map((c) => (
            <Cartao key={c.id} c={c} agora={agora} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function QuadroDePedidos({ quadro, etapa }: { quadro: QuadroDePedidos; etapa: EtapaDoPedido }) {
  const agora = new Date();
  return (
    <>
      <div className="md:hidden">
        <FiltroEmLinks
          rotulo="Etapa do pedido"
          opcoes={ORDEM_DAS_ETAPAS.map((e) => ({
            href: `/rodolfo/onboarding?etapa=${CHAVE_DA_ABA[e]}`,
            rotulo: `${ROTULO_DA_ETAPA[e]} ${quadro[e].length}`,
            ativo: e === etapa,
          }))}
        />
      </div>
      <div className="grid gap-x-4 gap-y-7 md:grid-cols-2 xl:grid-cols-4">
        {ORDEM_DAS_ETAPAS.map((e) => (
          <Coluna key={e} etapa={e} cartoes={quadro[e]} ativa={e === etapa} agora={agora} />
        ))}
      </div>
    </>
  );
}
