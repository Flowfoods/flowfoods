/**
 * O papel (3.4): as etiquetas de um pedido em tamanho real (60 × 40 ou 60 × 60 mm) numa folha A4, para a impressora comum ou
 * para salvar em PDF. Sai do mesmo layout do ZPL. O resto da tela (cabeçalho, instrução, botão) não vai para o papel. A margem
 * da folha e a altura mínima do app na impressão são desta página só (o estilo de impressão do ERP não muda): sem isso, 2
 * cópias saíam em 2 folhas, a segunda em branco (rodada 1, UX 3). Abrir esta página não tira a etiqueta da fila: depois de
 * imprimir, "Já imprimi" (decisão 418). Etiqueta de lote estornado ou vencida: nenhuma etiqueta, só o aviso (Guardião I1).
 */

import type { PapelDoPedido } from '@/lib/erp/etiquetas';
import { FORMATOS } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import { BotaoImprimir } from '../compras/botao-imprimir';
import type { AcaoDeConfirmar } from './executar';
import { JaImprimiDoPapel } from './painel-impressao';
import { AvisoDeBloqueio } from './partes';
import { textoDaPrevia } from './previa';

const FONTE = "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif";

/** Só a impressão desta página: sem a altura mínima da tela (que empurrava uma folha em branco) e sem margem antes das etiquetas. */
const IMPRESSAO = '@page { size: A4; margin: 8mm; } @media print { .ff-app:has(.ff-papel-etiquetas) .min-h-dvh { min-height: 0 !important; } .ff-papel-etiquetas { margin-top: 0 !important; } }';

export function TelaDoPapel({ d, base, contexto, confirmar }: { d: PapelDoPedido; base: string; contexto?: string; confirmar: AcaoDeConfirmar }) {
  const f = FORMATOS[d.etiqueta.formato];
  const daLoja = `${base}/${d.loja.id}`;
  const daEmissao = `${daLoja}/${d.etiqueta.id}`;
  const l = d.layout;
  const copias = Array.from({ length: d.pedido.copias }, (_, i) => i);
  return (
    <div className="space-y-5">
      <style>{IMPRESSAO}</style>
      <div className="ff-nao-imprime space-y-5">
        <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: d.etiqueta.codigo, href: daEmissao }, { rotulo: 'Papel' }]} />
        <Voltar href={daEmissao}>Voltar para a etiqueta</Voltar>
        <PageHeader
          icone="etiquetas"
          cor={COR.etiquetas}
          titulo={`Papel · ${d.etiqueta.codigo}`}
          subtitulo={[contexto, d.etiqueta.nome, `${d.pedido.copias} ${d.pedido.copias === 1 ? 'etiqueta' : 'etiquetas'} ${f.rotulo}`].filter(Boolean).join(' · ')}
          acao={l.erro || d.bloqueio ? undefined : <BotaoImprimir />}
        />
        {d.bloqueio ? (
          <AvisoDeBloqueio frase={d.bloqueio} />
        ) : (
          <>
            <p className="text-sm text-suave">
              Imprima em tamanho real (100%, sem ajustar à página) e recorte nas linhas. Em papel adesivo A4, cada etiqueta sai com {f.larguraMm} × {f.alturaMm} mm.
            </p>
            {d.naFila && !l.erro && <JaImprimiDoPapel confirmar={confirmar} voltar={daEmissao} />}
          </>
        )}
      </div>
      {d.bloqueio ? null : l.erro ? (
        <p role="alert" className="text-sm text-erro">
          {l.erro}
        </p>
      ) : (
        <section aria-label={`${d.pedido.copias} ${d.pedido.copias === 1 ? 'etiqueta' : 'etiquetas'} em tamanho real`} className="ff-papel-etiquetas flex flex-wrap gap-[2mm]">
          {copias.map((i) => (
            <div key={i} className="shrink-0 overflow-hidden border border-dashed border-linha-forte [break-inside:avoid]" style={{ width: `${f.larguraMm}mm`, height: `${f.alturaMm}mm` }}>
              <svg role="img" aria-label={i === 0 ? `Etiqueta ${f.rotulo}: ${textoDaPrevia(l)}` : `Cópia ${i + 1}`} viewBox={`0 0 ${l.larguraPontos} ${l.alturaPontos}`} className="block h-full w-full">
                <rect x="0" y="0" width={l.larguraPontos} height={l.alturaPontos} fill="#ffffff" />
                {l.elementos.map((e, k) =>
                  e.tipo === 'filete' ? (
                    <rect key={k} x={e.x} y={e.y} width={e.largura} height={e.espessura} fill="#000000" />
                  ) : (
                    <text key={k} x={e.x} y={e.y + Math.round(e.altura * 0.8)} fontFamily={FONTE} fontWeight={700} fontSize={e.altura} fill="#000000">
                      {e.texto}
                    </text>
                  ),
                )}
              </svg>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
