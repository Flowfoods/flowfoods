// Scanner avoid-ai-design, SD4d (P2) aceito: "Molho cheddar · 4,6 kg · refrigerado" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–3.3.
/**
 * A etiqueta de um lote produzido (3.4): o retrato da conclusão (validade, conservação, manipulação, quem fez) e o formulário
 * de emissão com a prévia. Lote não concluído, cancelado, estornado ou perdido diz por que não leva etiqueta. Lote concluído
 * sem validade (a ficha não dizia) sai com "VALIDADE NÃO INFORMADA": a etiqueta nunca inventa prazo.
 */

import type { LoteParaEtiqueta } from '@/lib/erp/etiquetas';
import { quandoNaTela } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { CONSERVACOES, formatarValidade } from '@/lib/erp/validade';
import { formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Linha, Painel } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeEstoque } from '../estoque/estado';
import { serializar } from './conteudo';
import { FormEmitir } from './form-emitir';
import { ListaDeEmissoes, SeloDaValidade } from './partes';

export function TelaEtiquetaDoLote({ d, base, contexto, acao, envio, hrefLote, bloqueio }: { d: LoteParaEtiqueta; base: string; contexto?: string; acao: AcaoDeEstoque; envio: string; /** O lote na Produção (quem vê a produção). */ hrefLote: string | null; bloqueio: string | null }) {
  const l = d.lote;
  const daLoja = `${base}/${d.loja.id}`;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: `Lote ${l.codigo}` }]} />
      <Voltar href={daLoja}>Voltar para as etiquetas</Voltar>
      <PageHeader
        icone="etiquetas"
        cor={COR.etiquetas}
        titulo={`Etiqueta do lote ${l.codigo}`}
        subtitulo={[contexto, l.nome, l.produzidoMilesimos ? formatarQuantidade(l.produzidoMilesimos, l.unidade) : null, l.conservacao ? CONSERVACOES[l.conservacao].toLowerCase() : null].filter(Boolean).join(' · ')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeloDaValidade situacao={l.situacao} />
        </div>
      </PageHeader>

      {d.motivo ? (
        <Aviso tom="alerta" titulo={d.motivo}>
          {hrefLote && (
            <a href={hrefLote} className="font-semibold underline underline-offset-4">
              Abrir o lote na Produção
            </a>
          )}
        </Aviso>
      ) : (
        <>
          {!l.validadeEm && (
            <Aviso tom="alerta" titulo="Este lote foi concluído sem validade.">
              A etiqueta sai com VALIDADE NÃO INFORMADA: ninguém inventa prazo. Peça a quem cuida das fichas para informar quanto o pré-preparo dura; os próximos lotes já saem com a data.
            </Aviso>
          )}
          <Painel titulo="O lote" subtitulo="Fotografado na conclusão: mudar a ficha depois não muda esta etiqueta">
            <dl className="space-y-2 text-sm tabular-nums">
              <Linha rotulo="Manipulado (concluído)">{l.concluidaEm ? quandoNaTela(l.concluidaEm) : 'sem data'}</Linha>
              <Linha rotulo="Validade">{l.validadeEm ? `${quandoNaTela(l.validadeEm)}${l.validadeMin ? ` (${formatarValidade(l.validadeMin)})` : ''}` : 'não informada'}</Linha>
              <Linha rotulo="Conservação">{l.conservacao ? CONSERVACOES[l.conservacao] : 'não informada'}</Linha>
              <Linha rotulo="Quem fez">{l.quemFez ?? 'não registrado'}</Linha>
              {hrefLote && (
                <Linha rotulo="Na Produção">
                  <a href={hrefLote} className="underline decoration-linha-forte underline-offset-4">
                    lote {l.codigo}
                  </a>
                </Linha>
              )}
            </dl>
          </Painel>
          <FormEmitir acao={acao} envioInicial={envio} previa={serializar(d.previa)} origem="LOTE" unidade={l.unidade} produzidoMilesimos={l.produzidoMilesimos} recarregar={`${daLoja}/lote/${l.id}`} bloqueio={bloqueio} />
        </>
      )}

      <ListaDeEmissoes emissoes={d.emissoes} base={daLoja} />
    </div>
  );
}
