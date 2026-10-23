/**
 * A prévia da etiqueta (3.4), proporcional ao papel: o MESMO layout que vira ZPL (`montarEtiqueta`), desenhado em SVG com o
 * tamanho em milímetros. A etiqueta é papel: fundo branco e tinta preta também no tema escuro (como a prévia de um PDF). Para
 * o leitor de tela, uma imagem com todo o texto da etiqueta. O que não coube (opcional) e o que impede o formato vêm em
 * palavras, embaixo.
 */

import { FORMATOS } from '@/lib/erp/etiqueta-campos';
import type { LayoutDaEtiqueta } from '@/lib/erp/etiqueta-zpl';

/** A fonte da Zebra (0) é uma sem serifa condensada e negrita; na tela, a mais parecida que o aparelho tiver. */
const FONTE = "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";

export function textoDaPrevia(l: LayoutDaEtiqueta): string {
  const linhas: string[] = [];
  let campo = '';
  for (const e of l.elementos) {
    if (e.tipo !== 'texto') continue;
    if (e.campo === campo && linhas.length) linhas[linhas.length - 1] += ` ${e.texto}`;
    else linhas.push(e.texto);
    campo = e.campo;
  }
  return linhas.join('; ');
}

export function PreviaDaEtiqueta({ layout, largura = 360, className = '' }: { layout: LayoutDaEtiqueta; /** Largura máxima na tela, em px. */ largura?: number; className?: string }) {
  const f = FORMATOS[layout.formato];
  const descricao = layout.erro ? `Etiqueta ${f.rotulo} que não cabe: ${layout.erro}` : `Prévia da etiqueta ${f.rotulo}: ${textoDaPrevia(layout)}`;
  return (
    <figure className={`min-w-0 ${className}`}>
      <div className="mx-auto w-full overflow-hidden rounded-[6px] border border-linha-forte" style={{ maxWidth: largura }}>
        <svg role="img" aria-label={descricao} viewBox={`0 0 ${layout.larguraPontos} ${layout.alturaPontos}`} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
          <rect x="0" y="0" width={layout.larguraPontos} height={layout.alturaPontos} fill="#ffffff" />
          {layout.erro ? (
            <text x={layout.larguraPontos / 2} y={layout.alturaPontos / 2} textAnchor="middle" fontFamily={FONTE} fontWeight={700} fontSize={Math.round(layout.larguraPontos / 18)} fill="#111111">
              Não cabe neste tamanho
            </text>
          ) : (
            layout.elementos.map((e, i) =>
              e.tipo === 'filete' ? (
                <rect key={i} x={e.x} y={e.y} width={e.largura} height={e.espessura} fill="#111111" />
              ) : (
                <text key={i} x={e.x} y={e.y + Math.round(e.altura * 0.8)} fontFamily={FONTE} fontWeight={700} fontSize={e.altura} fill="#111111">
                  {e.texto}
                </text>
              ),
            )
          )}
        </svg>
      </div>
      <figcaption className="mt-2 text-center text-[12px] text-suave">
        {f.rotulo} · tamanho proporcional ao papel
      </figcaption>
      {layout.erro && (
        <p role="alert" className="mt-2 text-center text-[13px] text-erro">
          {layout.erro}
        </p>
      )}
      {!layout.erro && layout.fora.length > 0 && <p className="mt-2 text-center text-[13px] text-atencao">Não coube neste tamanho e fica de fora: {layout.fora.join(', ')}.</p>}
    </figure>
  );
}
