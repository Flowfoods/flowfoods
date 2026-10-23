// Scanner avoid-ai-design, SD4d (P2) aceito: "Molho cheddar · 3 etiquetas 60 × 40 mm · emitida 23/10/2026 às 14:05 por Ana" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–3.3.
/**
 * Uma etiqueta emitida (3.4): a prévia do retrato (o que vai no papel), o painel de impressão (Zebra, arquivo .zpl, papel) e
 * os pedidos já feitos, cada um com o que aconteceu sem fingir ("enviada" é que a Zebra recebeu). Reimprimir é outro pedido
 * do MESMO retrato: a validade não muda. Lote estornado depois, ou a etiqueta vencida: não se imprime mais, e a tela diz em
 * vermelho o que fazer (rodada 1, decisão 417). No celular e no tablet, o painel de impressão vem antes da prévia.
 */

import Link from 'next/link';
import type { EmissaoDaTela } from '@/lib/erp/etiquetas';
import { FORMATOS, NOME_DO_PEDIDO, quandoNaTela, seloDoPedido, type SituacaoDaImpressao } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Contagem, Painel, Selo, Vazio, type Tom } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDeConfirmar, AcaoDePedir, AcaoDeResultado } from './executar';
import { PainelDeImpressao } from './painel-impressao';
import { AvisoDeBloqueio, SeloDaValidade } from './partes';
import { PreviaDaEtiqueta } from './previa';

export const TOM_DA_SITUACAO: Record<SituacaoDaImpressao, Tom> = { PREPARADA: 'alerta', ENVIADA: 'ok', EXPORTADA: 'neutro', FALHOU: 'erro' };

export function TelaDaEmissao({
  d,
  base,
  contexto,
  feito,
  pedir,
  resultado,
  confirmar,
  hrefImpressora,
  bloqueio,
}: {
  d: EmissaoDaTela;
  base: string;
  contexto?: string;
  feito?: string;
  pedir: AcaoDePedir;
  resultado: AcaoDeResultado;
  confirmar: AcaoDeConfirmar;
  hrefImpressora: string;
  bloqueio: string | null;
}) {
  const e = d.etiqueta;
  const daLoja = `${base}/${d.loja.id}`;
  const origem = d.origem.tipo === 'LOTE' ? { href: `${daLoja}/lote/${d.origem.id}`, rotulo: `Lote ${d.origem.codigo ?? ''}`.trim() } : { href: `${daLoja}/aberta/${d.origem.id}`, rotulo: e.nome };
  const aqui = `${daLoja}/${e.id}`;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: origem.rotulo, href: origem.href }, { rotulo: e.codigo }]} />
      <Voltar href={origem.href}>Voltar para {d.origem.tipo === 'LOTE' ? 'o lote' : 'a embalagem aberta'}</Voltar>
      <PageHeader
        icone="etiquetas"
        cor={COR.etiquetas}
        titulo={`Etiqueta ${e.codigo}`}
        subtitulo={[contexto, e.nome, `${e.quantas} ${e.quantas === 1 ? 'etiqueta' : 'etiquetas'} ${FORMATOS[e.formato].rotulo}`, e.emitidaEm ? `emitida ${quandoNaTela(e.emitidaEm)}${e.emitidaPorNome ? ` por ${e.emitidaPorNome}` : ''}` : null].filter(Boolean).join(' · ')}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SeloDaValidade situacao={e.situacao} />
          {e.regra === 'LOTE_SEM_VALIDADE' && <span className="text-[13px] text-suave">o lote foi concluído sem validade</span>}
        </div>
      </PageHeader>
      {d.bloqueio ? <AvisoDeBloqueio frase={d.bloqueio} /> : feito && <Aviso tom="ok" titulo={feito} />}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <Painel titulo="Imprimir" subtitulo={d.pedidos.length ? 'Cada pedido fica no histórico; reimprimir é outro pedido' : 'A primeira impressão desta etiqueta'}>
            {d.bloqueio ? (
              <p className="text-sm text-suave">Sem impressão: nem na Zebra, nem no arquivo, nem no papel.</p>
            ) : bloqueio ? (
              <p className="text-sm text-suave">{bloqueio}</p>
            ) : (
              <PainelDeImpressao
                copiasIniciais={e.quantas}
                pedir={pedir}
                resultado={resultado}
                confirmar={confirmar}
                naFila={d.naFila}
                aConfirmar={!!d.aConfirmar}
                hrefPapel={`${aqui}/papel`}
                hrefImpressora={hrefImpressora}
              />
            )}
          </Painel>
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Painel titulo="O que vai no papel" subtitulo="O retrato da emissão: reimprimir sai igual">
            <PreviaDaEtiqueta layout={d.layout} />
          </Painel>
        </div>
      </div>

      <Painel titulo="Pedidos de impressão" subtitulo="Quem pediu, quando, quantas cópias, como e o que aconteceu" acessorio={<Contagem>{d.pedidos.length}</Contagem>} semRespiro>
        {d.pedidos.length === 0 ? (
          <Vazio>Esta etiqueta ainda não foi para a impressora.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {d.pedidos.map((p) => {
              const selo = seloDoPedido(p);
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:px-5">
                  <span className="min-w-0">
                    <span className="block font-semibold tabular-nums text-texto">
                      {NOME_DO_PEDIDO[p.transporte]} · {p.copias === 1 ? '1 cópia' : `${p.copias} cópias`}
                    </span>
                    <span className="block text-[12px] tabular-nums text-suave">
                      {p.transporte !== 'PAPEL' ? `${p.resolucao} dpi · ` : ''}pedido {quandoNaTela(p.solicitadaEm)} por {p.solicitadaPorNome}
                    </span>
                    {p.confirmadaEm && (
                      <span className="block text-[12px] tabular-nums text-suave">
                        “Já imprimi”: {p.confirmadaPorNome}, {quandoNaTela(p.confirmadaEm)}
                      </span>
                    )}
                    {p.erro && <span className="block text-[12px] text-erro [overflow-wrap:anywhere]">{p.erro}</span>}
                  </span>
                  <Selo tom={selo.tom}>{selo.texto}</Selo>
                </li>
              );
            })}
          </ul>
        )}
      </Painel>
      <p className="text-[12px] text-suave">
        “Enviada à impressora” quer dizer que o Browser Print da Zebra recebeu: confira o papel. Baixar o arquivo ou abrir o papel não tira a etiqueta de “Esperando a impressora”: depois que sair, toque em “Já imprimi”.{' '}
        <Link href={hrefImpressora} className="inline-flex min-h-11 items-center underline decoration-linha-forte underline-offset-4">
          Impressora deste computador
        </Link>
      </p>
    </div>
  );
}
