// Scanner avoid-ai-design, SD4d (P2) aceito: "Molho cheddar · 3 etiquetas 60 × 40 mm · emitida 23/10/2026 às 14:05 por Ana" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–3.3.
/**
 * Uma etiqueta emitida (3.4): a prévia do retrato (o que vai no papel), o painel de impressão (Zebra, arquivo .zpl, papel) e
 * os pedidos já feitos, cada um com o que aconteceu sem fingir ("enviada" é que a Zebra recebeu). Reimprimir é outro pedido
 * do MESMO retrato: a validade não muda. Lote estornado depois: a etiqueta não se imprime mais.
 */

import Link from 'next/link';
import type { EmissaoDaTela } from '@/lib/erp/etiquetas';
import { FORMATOS, quandoNaTela, ROTULO_DA_SITUACAO, ROTULO_DO_TRANSPORTE, type SituacaoDaImpressao } from '@/lib/erp/etiqueta-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Contagem, Painel, Selo, Vazio, type Tom } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { AcaoDePedir, AcaoDeResultado } from './executar';
import { PainelDeImpressao } from './painel-impressao';
import { SeloDaValidade } from './partes';
import { PreviaDaEtiqueta } from './previa';

export const TOM_DA_SITUACAO: Record<SituacaoDaImpressao, Tom> = { PREPARADA: 'alerta', ENVIADA: 'ok', EXPORTADA: 'neutro', FALHOU: 'erro' };

export function TelaDaEmissao({
  d,
  base,
  contexto,
  feito,
  pedir,
  resultado,
  hrefImpressora,
  bloqueio,
}: {
  d: EmissaoDaTela;
  base: string;
  contexto?: string;
  feito?: string;
  pedir: AcaoDePedir;
  resultado: AcaoDeResultado;
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
          {e.regra === 'PRAZO_NAO_INFORMADO' && <span className="text-[13px] text-suave">prazo depois de aberto não informado</span>}
        </div>
      </PageHeader>
      {feito && <Aviso tom="ok" titulo={feito} />}
      {d.origem.estornado && <Aviso tom="alerta" titulo="O lote desta etiqueta foi estornado depois: saiu do estoque.">A etiqueta não se imprime mais. Separe o que tiver dele.</Aviso>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Painel titulo="O que vai no papel" subtitulo="O retrato da emissão: reimprimir sai igual">
          <PreviaDaEtiqueta layout={d.layout} />
        </Painel>
        <Painel titulo="Imprimir" subtitulo={d.pedidos.length ? 'Cada pedido fica no histórico; reimprimir é outro pedido' : 'A primeira impressão desta etiqueta'}>
          {d.origem.estornado ? (
            <p className="text-sm text-suave">Lote estornado: sem impressão.</p>
          ) : bloqueio ? (
            <p className="text-sm text-suave">{bloqueio}</p>
          ) : (
            <PainelDeImpressao copiasIniciais={e.quantas} pedir={pedir} resultado={resultado} hrefPapel={`${aqui}/papel`} hrefImpressora={hrefImpressora} />
          )}
        </Painel>
      </div>

      <Painel titulo="Pedidos de impressão" subtitulo="Quem pediu, quando, quantas cópias, como e o que aconteceu" acessorio={<Contagem>{d.pedidos.length}</Contagem>} semRespiro>
        {d.pedidos.length === 0 ? (
          <Vazio>Esta etiqueta ainda não foi para a impressora.</Vazio>
        ) : (
          <ul className="divide-y divide-linha">
            {d.pedidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0">
                  <span className="block font-semibold tabular-nums text-texto">
                    {p.sequencia === 1 ? 'Primeira impressão' : `Reimpressão ${p.sequencia - 1}`} · {p.copias === 1 ? '1 cópia' : `${p.copias} cópias`}
                  </span>
                  <span className="block text-[12px] tabular-nums text-suave">
                    {ROTULO_DO_TRANSPORTE[p.transporte]}
                    {p.transporte !== 'PAPEL' ? ` · ${p.resolucao} dpi` : ''} · {quandoNaTela(p.solicitadaEm)} por {p.solicitadaPorNome}
                  </span>
                  {p.erro && <span className="block text-[12px] text-erro [overflow-wrap:anywhere]">{p.erro}</span>}
                </span>
                <Selo tom={TOM_DA_SITUACAO[p.situacao]}>{ROTULO_DA_SITUACAO[p.situacao]}</Selo>
              </li>
            ))}
          </ul>
        )}
      </Painel>
      <p className="text-[12px] text-suave">
        “Enviada à impressora” quer dizer que o Browser Print da Zebra recebeu: confira o papel. “Arquivo gerado” é o .zpl ou o papel baixado, que ainda precisa ir para a impressora.{' '}
        <Link href={hrefImpressora} className="underline decoration-linha-forte underline-offset-4">
          Impressora deste computador
        </Link>
      </p>
    </div>
  );
}
