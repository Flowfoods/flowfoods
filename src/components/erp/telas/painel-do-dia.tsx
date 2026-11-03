/**
 * Resumo existente: indicadores e pendências das fontes autorizadas. Estados
 * independentes não convertem erro/ausência em zero nem criam autorização.
 */
import Link from 'next/link';
import type { NaturezaDaPendencia, PainelDoDia, PendenciaDoDia } from '@/lib/erp/painel-do-dia';
import type { XmlAguardandoHome } from '@/lib/erp/home-xml-aguardando';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { LINK_DE_TEXTO } from '../ui/estilos';
import { Barra, Painel, Selo } from '../ui/superficies';
import { AtualizarResumo } from './atualizar-resumo';
import { CmvDaHomeNaTela } from './cmv-da-home';

const QUANDO = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});

export function PainelDoDiaNaTela({ painel }: { painel: PainelDoDia }) {
  const estados = painel.estados ?? [];
  const temResumo = estados.length > 0 || Boolean(painel.cmv);
  const blocos = estados.length
    ? [
      ...estados.map((estado) => ({ chave: estado.chave, estado, indicador: painel.indicadores.find((i) => i.chave === estado.chave) })),
      ...painel.indicadores.filter((i) => !estados.some((e) => e.chave === i.chave)).map((indicador) => ({ chave: indicador.chave, estado: undefined, indicador })),
    ]
    : painel.indicadores.map((indicador) => ({ chave: indicador.chave, estado: undefined, indicador }));
  if (blocos.length === 0 && painel.pendencias.length === 0 && !painel.cmv) return null;
  return (
    <section aria-label={temResumo ? 'Resumo da operação' : 'Resumo de hoje'} className="space-y-4">
      {blocos.length > 0 && (
        <div className={'grid gap-3 ' + (blocos.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2')}>
          {blocos.map(({ chave, indicador: i, estado }) => i ? (
            <Link
              key={chave}
              href={i.href}
              className="ff-transicao group flex min-w-0 flex-col rounded-[14px] border border-linha bg-painel px-4 py-3.5 hover:border-linha-forte sm:px-5"
            >
              <span className="text-[12px] font-medium text-suave">{i.rotulo}</span>
              {i.escopo && <span className="mt-0.5 break-words text-[12px] font-medium text-texto">{i.escopo}</span>}
              {estado && <span className="mt-0.5 text-[12px] text-suave">{estado.referencia}</span>}
              <span className="mt-2 truncate font-display text-[26px] font-bold leading-none tabular-nums text-texto">
                {i.valor.tipo === 'dinheiro' ? (
                  i.valor.centavos === null ? <><span aria-hidden>—</span><span className="sr-only">Sem lançamentos</span></> : formatarDinheiro(i.valor.centavos)
                ) : i.valor.tipo === 'numero' ? (
                  i.valor.numero === null ? '—' : i.valor.numero.toLocaleString('pt-BR')
                ) : (
                  <>
                    {i.valor.de}
                    <span className="ml-1 font-sans text-[15px] font-medium text-suave">de {i.valor.total}</span>
                  </>
                )}
              </span>
              {i.valor.tipo === 'fracao' && (
                <span className="mt-2.5 block">
                  <Barra valor={i.valor.de} total={i.valor.total} tom={i.valor.de === i.valor.total ? 'ok' : i.valor.de < i.valor.total && i.valor.parcialEhNormal ? 'neutro' : 'alerta'} rotulo={i.rotulo + ': ' + i.valor.de + ' de ' + i.valor.total} />
                </span>
              )}
              <span className="mt-1.5 break-words text-[12px] leading-snug text-suave">{i.contexto}</span>
              {(estado?.estado === 'parcial' || estado?.estado === 'sem_dados') && (
                <span className="mt-2 space-y-1">
                  <Selo tom={estado.estado === 'parcial' ? 'alerta' : 'neutro'}>{estado.estado === 'parcial' ? 'Parcial' : 'Sem dados'}</Selo>
                  <span className="block text-[12px] leading-snug text-suave">{estado.mensagem}</span>
                </span>
              )}
            </Link>
          ) : estado ? (
            <div key={chave} role="group" aria-label={estado.rotulo} className="flex min-w-0 flex-col rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
              <span className="text-[12px] font-medium text-suave">{estado.rotulo}</span>
              <span className="mt-0.5 break-words text-[12px] font-medium text-texto">{estado.escopo}</span>
              <span className="mt-0.5 text-[12px] text-suave">{estado.referencia}</span>
              <span className="mt-3"><Selo tom={estado.estado === 'erro' ? 'alerta' : 'neutro'}>{estado.estado === 'erro' ? 'Não foi possível carregar' : 'Sem dados'}</Selo></span>
              <p className="mt-2 text-[13px] leading-snug text-suave">{estado.mensagem}</p>
              <Link href={estado.href} className={LINK_DE_TEXTO + ' mt-2 inline-flex min-h-11 items-center self-start'}>{estado.acao}</Link>
            </div>
          ) : null)}
        </div>
      )}
      {painel.cmv && <CmvDaHomeNaTela cmv={painel.cmv} />}
      <PendenciasDoResumo pendencias={painel.pendencias} />
      {temResumo && <AtualizacaoDoResumo consultadoEm={painel.consultadoEm ?? painel.cmv?.consultadoEm} />}
    </section>
  );
}

/** Decisão 518: os dois grupos, na ordem em que as fontes já vinham (o grupo não é urgência nem nota). */
const GRUPOS: readonly { natureza: NaturezaDaPendencia; rotulo: string }[] = [
  { natureza: 'completar_dados', rotulo: 'Completar dados' },
  { natureza: 'resolver_operacao', rotulo: 'Resolver operação' },
];

function ItemDaPendencia({ p, n }: { p: PendenciaDoDia; n: number }) {
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
      <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-linha-forte text-[12px] font-semibold text-texto">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-texto">{p.titulo}</p>
        {p.escopo && <p className="text-[12px] font-medium text-suave">{p.escopo}</p>}
        {p.leitura === 'nao_conferida' && <span className="mt-1 inline-flex"><Selo tom="alerta">Não conferido</Selo></span>}
        <p className="text-[13px] leading-relaxed text-suave">{p.texto}</p>
        {p.indicador && <p className="text-[12px] text-suave">Indicador afetado: {p.indicador}</p>}
      </div>
      <Link href={p.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 shrink-0 basis-full items-center pl-9 text-[13px] sm:min-h-9 sm:basis-auto sm:pl-0 sm:pt-0.5'}>
        {p.acao}
      </Link>
    </li>
  );
}

/** A mesma lista acionável também compõe a Home de uma loja. */
export function PendenciasDoResumo({ pendencias, xmlAguardando: xml }: { pendencias: readonly PendenciaDoDia[]; xmlAguardando?: XmlAguardandoHome }) {
  const contagem = xml?.estado === 'ok' && Number.isSafeInteger(xml.aguardando) && xml.aguardando !== null && xml.aguardando >= 0 ? xml.aguardando : null;
  const escopoXml = xml ? `${xml.loja.nome} · fila atual, sem recorte mensal${xml.loja.ativa === false ? ' · loja desativada' : ''}` : '';
  const filaMaisAmpla = 'A fila também pode incluir notas recebidas ou com erro.';
  const lista: readonly PendenciaDoDia[] = xml && contagem !== null && contagem > 0 ? [...pendencias, {
    chave: 'xml-aguardando-conferencia',
    titulo: `${contagem.toLocaleString('pt-BR')} XML aguardando conferência`,
    escopo: escopoXml,
    texto: `Só documentos atribuídos a esta loja. XML recebido ainda não é compra lançada e não entra em Compras, estoque ou CMV. ${filaMaisAmpla}`,
    href: xml.detalhe.href,
    acao: xml.detalhe.rotulo,
    natureza: 'resolver_operacao',
  }] : pendencias;
  if (!lista.length && !xml) return null;
  // Decisão 518: com todas classificadas (ERP), dois grupos no MESMO painel; sem classificação (nível 1), a lista de antes.
  const agrupada = lista.length > 0 && lista.every((p) => p.natureza);
  const grupos = agrupada ? GRUPOS.map((g) => ({ ...g, itens: lista.filter((p) => p.natureza === g.natureza) })).filter((g) => g.itens.length) : [];
  const inicioDe = (i: number) => 1 + grupos.slice(0, i).reduce((n, g) => n + g.itens.length, 0);
  return (
    <div className="space-y-3">
      {lista.length > 0 && (
        <Painel titulo="O que precisa de você" subtitulo={agrupada ? 'O que falta registrar e o que falta fazer na casa' : 'Na ordem em que vale resolver'} semRespiro>
          {agrupada ? grupos.map((g, i) => (
            <div key={g.natureza} role="group" aria-labelledby={`pendencias-${g.natureza}`} className={i > 0 ? 'border-t border-linha' : ''}>
              <h3 id={`pendencias-${g.natureza}`} className="px-4 pt-3.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-suave sm:px-5">{g.rotulo}</h3>
              <ol start={inicioDe(i)} className="divide-y divide-linha">
                {g.itens.map((p, n) => <ItemDaPendencia key={p.chave} p={p} n={inicioDe(i) + n} />)}
              </ol>
            </div>
          )) : (
            <ol className="divide-y divide-linha">
              {lista.map((p, n) => <ItemDaPendencia key={p.chave} p={p} n={n + 1} />)}
            </ol>
          )}
        </Painel>
      )}
      {xml && (contagem === null || contagem === 0) && (
        <div role="group" aria-label="Conferência de XML" className="min-w-0 space-y-1 break-words text-[12px] leading-relaxed text-suave">
          <p className="font-medium">{escopoXml}</p>
          <p>{contagem === 0 ? 'Nenhum XML atribuído a esta loja aguardando conferência nesta consulta.' : 'Contagem de XML aguardando conferência indisponível nesta consulta.'}</p>
          {contagem === null && xml.aviso && <p>{xml.aviso}</p>}
          <p>{filaMaisAmpla}</p>
          <Link href={xml.detalhe.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 items-center'}>{xml.detalhe.rotulo}</Link>
        </div>
      )}
    </div>
  );
}

/** Único acionador persistente; o horário representa consulta, não mudança dos dados. */
export function AtualizacaoDoResumo({ consultadoEm }: { consultadoEm?: string | null }) {
  const consultado = consultadoEm ? new Date(consultadoEm) : null;
  return (
        <div className="space-y-2 border-t border-linha pt-3">
          <AtualizarResumo />
          {consultado && Number.isFinite(consultado.getTime()) && (
            <p className="text-[12px] text-suave">Resumo consultado em {QUANDO.format(consultado)}. Atualizar consulta todos os indicadores e as pendências deste resumo.</p>
          )}
        </div>
  );
}
