/**
 * Resumo existente: indicadores e pendências das fontes autorizadas. Estados
 * independentes não convertem erro/ausência em zero nem criam autorização.
 */
import Link from 'next/link';
import type { PainelDoDia, PendenciaDoDia } from '@/lib/erp/painel-do-dia';
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

/** A mesma lista acionável também compõe a Home de uma loja. */
export function PendenciasDoResumo({ pendencias }: { pendencias: readonly PendenciaDoDia[] }) {
  if (!pendencias.length) return null;
  return (
        <Painel titulo="O que precisa de você" subtitulo="Na ordem em que vale resolver" semRespiro>
          <ol className="divide-y divide-linha">
            {pendencias.map((p, n) => (
              <li key={p.chave} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-linha-forte text-[12px] font-semibold text-texto">
                  {n + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-texto">{p.titulo}</p>
                  {p.escopo && <p className="text-[12px] font-medium text-suave">{p.escopo}</p>}
                  <p className="text-[13px] leading-relaxed text-suave">{p.texto}</p>
                </div>
                <Link href={p.href} className={LINK_DE_TEXTO + ' inline-flex min-h-11 shrink-0 basis-full items-center pl-9 text-[13px] sm:min-h-9 sm:basis-auto sm:pl-0 sm:pt-0.5'}>
                  {p.acao}
                </Link>
              </li>
            ))}
          </ol>
        </Painel>
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
