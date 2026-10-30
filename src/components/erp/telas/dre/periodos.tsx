/**
 * Períodos (2.2a, decisão 144): a regra do período — a mesma do DRE e da contagem de
 * estoque —, os períodos recentes e o histórico das regras. Mudar a regra é de quem
 * define o plano e o período (a rede inteira) e nunca reescreve o passado.
 */

import { HistoricoRecolhivel } from '../historico/historico-recolhivel';
import Link from 'next/link';
import type { SituacaoDosPeriodos } from '@/lib/erp/periodos';
import { formatarData } from '@/lib/erp/compra-campos';
import { fraseDaRegra } from '@/lib/erp/periodo-campos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoLocal } from './estado';
import { FormRegra } from './form-regra';

export function TelaDosPeriodos({ s, raiz, contexto, podeMudar, podeVerDre, podeFechar, acao, bloqueio }: { s: SituacaoDosPeriodos; raiz: string; contexto: string; podeMudar: boolean; podeVerDre: boolean; podeFechar: boolean; acao: AcaoLocal; bloqueio: string | null }) {
  const efetiva = s.efetiva;
  const desde = s.regras.filter((r) => !r.pendente).slice(-1)[0];
  return (
    <div className="space-y-6">
      <PageHeader icone="estoque" cor={COR.dre} titulo="Períodos" subtitulo={`${contexto} · como o resultado e o estoque fecham, e o fechamento de cada período`} />
      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel titulo="Regra de agora" subtitulo="A mesma para o DRE e para a contagem de estoque: o CMV só fecha se as duas usam as mesmas datas.">
          <p className="font-display text-xl font-bold leading-snug">{fraseDaRegra(efetiva)}</p>
          <p className="mt-1 text-[13px] text-suave">
            {desde?.padrao ? 'Regra padrão do sistema, ainda sem mudança.' : `Vale desde ${formatarData(desde?.vigenteDesde ?? efetiva.vigenteDesde)}.`} Período de agora: <strong className="font-semibold text-texto">{s.periodoAtual.nome}</strong> ({formatarData(s.periodoAtual.inicio, true)} a {formatarData(s.periodoAtual.fim, true)}).
          </p>
          {s.pendente && (
            <p className="mt-4 rounded-[10px] border border-atencao/50 px-4 py-3 text-[13px]">
              <Selo tom="alerta">Agendada</Selo>{' '}
              <span className="ml-1">
                Passa a valer em <strong className="font-semibold">{formatarData(s.pendente.vigenteDesde)}</strong>: {fraseDaRegra(s.pendente)}.
              </span>
            </p>
          )}
        </Painel>

        {podeMudar ? (
          <Painel titulo="Mudar a regra" subtitulo="Nunca é retroativa: vale do dia seguinte ao fim do período de agora.">
            <FormRegra acao={acao} versao={s.versao} inicial={{ tipo: (s.pendente ?? efetiva).tipo, diaInicio: (s.pendente ?? efetiva).diaInicio }} valeDesde={formatarData(s.vigenteSeMudar)} periodoAtual={s.periodoAtual.nome} bloqueio={bloqueio} />
          </Painel>
        ) : (
          <Painel titulo="Mudar a regra">
            <p className="text-sm text-suave">Quem define o plano de contas e o período do DRE (com a rede inteira) muda a regra. Fale com quem cuida da conta.</p>
          </Painel>
        )}
      </div>

      <Painel titulo="Períodos recentes" subtitulo="O de agora e os anteriores, pela regra da época. Um período registrado pela contagem de estoque mantém as datas dele." semRespiro>
        <ul className="divide-y divide-linha">
          {s.recentes.map((p) => (
            <li key={p.inicio} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-texto">{p.nome}</span>
                <span className="block text-[12px] tabular-nums text-suave">
                  {formatarData(p.inicio)} a {formatarData(p.fim)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {p.atual ? <Selo tom="alerta">Em curso</Selo> : p.status === 'FECHADO' ? <Selo tom="ok">Fechado</Selo> : <Selo>Encerrado</Selo>}
                {p.registradoId && <span className="text-[12px] text-suave">registrado</span>}
                {podeVerDre && (
                  <Link href={`${raiz}/dre?periodo=${p.inicio}`} className={LINK_DE_TEXTO}>
                    Ver o DRE
                  </Link>
                )}
                {podeFechar && !p.atual && p.inicio < s.hoje && (
                  <Link href={`${raiz}/dre/periodos/${p.inicio}`} className={LINK_DE_TEXTO}>
                    {p.status === 'FECHADO' ? 'Ver o fechamento' : 'Fechar'}
                    <span className="sr-only"> {p.nome}</span>
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Painel>

      <HistoricoRecolhivel chave={`${raiz}/regras`} titulo="Regras anteriores" quantidade={s.regras.length} semRespiro>
        {s.regras.length === 0 ? (
          <Vazio titulo="Nenhuma regra." />
        ) : (
          <ul className="divide-y divide-linha">
            {[...s.regras].reverse().map((r) => (
              <li key={`${r.vigenteDesde}-${r.id ?? 'padrao'}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5">
                <span className="text-texto">{fraseDaRegra(r)}</span>
                <span className="text-[12px] tabular-nums text-suave">
                  {r.padrao ? 'padrão do sistema' : `${r.pendente ? 'a partir de' : 'desde'} ${formatarData(r.vigenteDesde)}${r.criadoPorNome ? ` · ${r.criadoPorNome}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </HistoricoRecolhivel>
      <HistoricoRecolhivel chave={raiz} titulo="Alterações nas regras do período" quantidade={s.historico.length} semRespiro>
        {s.historico.length > 0 ? <ListaHistorico linhas={s.historico} /> : <Vazio titulo="Nada registrado ainda." />}
      </HistoricoRecolhivel>
    </div>
  );
}
