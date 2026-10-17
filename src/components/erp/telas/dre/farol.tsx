/**
 * O farol na tela (2.4, decisão 176). A cor NUNCA vem sozinha: cada indicador colorido leva a régua de 5
 * casas (a POSIÇÃO da casa cheia diz a faixa, até em escala de cinza), a palavra e o desvio. A cor mora só
 * aqui, no glifo e na palavra: nunca em borda de card, fundo de linha, cabeçalho ou botão (teste-guarda por
 * grep em `tests/erp-farol-guarda.test.ts`). Sem dado que feche, a régua vem vazia e o motivo por extenso.
 */

import type { CorDoFarol } from '@/lib/erp/farol-campos';
import type { FarolDaLinha } from '@/lib/erp/farol-dre-campos';

/** Classes literais (o Tailwind só gera o que lê escrito inteiro). */
const TEXTO_DA_COR: Record<CorDoFarol, string> = {
  AZUL: 'text-farol-azul',
  VERDE: 'text-farol-verde',
  AMARELO: 'text-farol-amarelo',
  LARANJA: 'text-farol-laranja',
  VERMELHO: 'text-farol-vermelho',
};

const CASAS = [0, 1, 2, 3, 4];

/**
 * Cinco quadrados de 10 px; a casa da faixa cheia (azul à esquerda, vermelho à direita), as outras só o contorno.
 * `largura` encolhe a régua inteira (o painel no celular usa 44 px): o desenho escala junto.
 */
export function Regua({ posicao, cor, rotulo, largura = 62 }: { posicao: number | null; cor?: CorDoFarol; rotulo?: string; largura?: number }) {
  return (
    <svg
      width={largura}
      height={Math.round((largura * 10) / 62)}
      viewBox="0 0 62 10"
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      focusable="false"
      className={`shrink-0 overflow-visible ${cor ? TEXTO_DA_COR[cor] : 'text-suave'}`}
    >
      {CASAS.map((i) =>
        posicao === i + 1 ? (
          <rect key={i} x={i * 13} y="0" width="10" height="10" rx="2" fill="currentColor" />
        ) : (
          <rect key={i} x={i * 13 + 0.5} y="0.5" width="9" height="9" rx="1.5" fill="none" className="stroke-suave" strokeWidth="1" />
        ),
      )}
    </svg>
  );
}

/**
 * O farol de uma linha. `celula`: régua em cima e a palavra embaixo (a coluna "Farol" da tabela e os blocos);
 * `linha`: régua e palavra lado a lado (sob o nome da linha, no celular).
 */
export function Farol({ f, forma = 'celula' }: { f: FarolDaLinha; forma?: 'celula' | 'linha' }) {
  if (f.tipo === 'sem') {
    return (
      <span className={`inline-flex ${forma === 'linha' ? 'flex-wrap items-center gap-x-2 gap-y-0.5' : 'flex-col items-start gap-1'}`}>
        <Regua posicao={null} />
        <span className="text-[12px] font-normal leading-snug text-suave">sem cor: {f.motivo}</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex ${forma === 'linha' ? 'flex-wrap items-center gap-x-2 gap-y-0.5' : 'flex-col items-start gap-1'}`}>
      <Regua posicao={f.posicao} cor={f.cor} rotulo={f.rotulo} />
      <span aria-hidden className={`text-[12px] font-semibold leading-snug ${TEXTO_DA_COR[f.cor]}`}>
        {f.palavra}
      </span>
      {f.confira && <span className="text-[12px] font-normal leading-snug text-suave">{f.confira}</span>}
    </span>
  );
}

/** A palavra de uma faixa com a régua dela (a legenda do painel). */
export function FaixaComPalavra({ cor, posicao, palavra }: { cor: CorDoFarol; posicao: number; palavra: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${TEXTO_DA_COR[cor]}`}>
      <Regua posicao={posicao} cor={cor} />
      <span className="text-[12px] font-semibold">{palavra}</span>
    </span>
  );
}

/** O id da linha na tabela do DRE: o painel de faróis leva até ela. */
export const idDaLinha = (chave: string) => `linha-${chave.replace(/[^a-z0-9]/gi, '-')}`;
