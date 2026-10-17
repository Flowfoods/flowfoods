/**
 * A tela de UM período (2.2b, decisões 152 a 154): as condições para fechar, o fechamento em si, a
 * fotografia que ficou, reabrir (só o nível 1) e as versões. A MESMA tela no nível 1 e na pessoa do
 * parceiro; só quem fecha (`metas.editar` e `dre.ver`, com a rede inteira) chega aqui. Quem reabre é
 * decidido pela regra, não pela tela: aqui o formulário só aparece quando a action de reabrir existe.
 */

import Link from 'next/link';
import { formatarData } from '@/lib/erp/compra-campos';
import type { SituacaoDoFechamento } from '@/lib/erp/dre-fechamento';
import { rotuloDaRessalva } from '@/lib/erp/dre-fechamento-campos';
import type { FotografiaLida } from '@/lib/erp/dre-fotografia';
import { textoDoPercentual } from '@/lib/erp/dre-campos';
import { CODIGO, codigoDoSubtotal } from '@/lib/erp/dre-plano';
import { COR } from '@/lib/erp/modulos';
import { formatarPontosBase, formatarDinheiro } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Contagem, Painel, Selo } from '../../ui/superficies';
import type { AcaoLocal } from './estado';
import { FormFechar } from './form-fechar';
import { FormReabrir } from './form-reabrir';

const QUANDO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date) => QUANDO.format(d).replace(',', ' às');

const valorDe = (f: FotografiaLida, chave: string) => f.linhas.find((l) => l.lojaId === null && l.chave === chave)?.valorCentavos ?? null;
const dinheiro = (v: number | null) => (v === null ? 'não apurado' : formatarDinheiro(v));

function Numeros({ f }: { f: FotografiaLida }) {
  const receita = valorDe(f, codigoDoSubtotal('RECEITA'));
  const resultado = valorDe(f, CODIGO.resultado);
  const linhaResultado = f.linhas.find((l) => l.lojaId === null && l.chave === CODIGO.resultado);
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-[12px] text-suave">Receita bruta</dt>
        <dd className="font-semibold tabular-nums">{receita === null || receita === 0 ? '—' : formatarDinheiro(receita)}</dd>
      </div>
      <div>
        <dt className="text-[12px] text-suave">Resultado do período</dt>
        <dd className="font-semibold tabular-nums">
          {dinheiro(resultado)}
          {linhaResultado?.percentualBp != null && <span className="ml-2 text-[12px] font-normal text-suave">{textoDoPercentual(linhaResultado.percentualBp)} da receita</span>}
        </dd>
        {linhaResultado && linhaResultado.semContar.length > 0 && <dd className="text-[12px] text-suave">sem contar {linhaResultado.semContar.join(' e ')}</dd>}
      </div>
      <div>
        <dt className="text-[12px] text-suave">Taxa do iFood congelada</dt>
        <dd className="font-semibold tabular-nums">{f.taxa ? formatarPontosBase(f.taxa.comissaoBp + f.taxa.pagamentoBp) : 'sem taxa configurada'}</dd>
        {f.taxa && (
          <dd className="text-[12px] text-suave">
            {formatarPontosBase(f.taxa.comissaoBp)} de comissão + {formatarPontosBase(f.taxa.pagamentoBp)} de pagamento
          </dd>
        )}
      </div>
    </dl>
  );
}

function Ressalvas({ f }: { f: FotografiaLida }) {
  if (f.ressalvas.length === 0) return <p className="text-sm text-texto">Fechado sem ressalvas.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        <Selo tom="alerta">Fechado com ressalvas</Selo>
      </p>
      <ul className="divide-y divide-linha rounded-[10px] border border-linha">
        {f.ressalvas.map((r) => (
          <li key={r.id} className="px-3 py-2.5 text-sm">
            <span className="block font-medium">{r.titulo}</span>
            <span className="block text-[12px] leading-snug text-suave">
              {rotuloDaRessalva[r.tipo]}. {r.detalhe}
            </span>
          </li>
        ))}
      </ul>
      {f.justificativa && (
        <p className="text-[13px]">
          <span className="font-semibold">Justificativa:</span> {f.justificativa}
        </p>
      )}
    </div>
  );
}

function Versao({ f, vigente }: { f: FotografiaLida; vigente: boolean }) {
  const rede = f.linhas.filter((l) => l.lojaId === null);
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold">Versão {f.versao}</span>
        {vigente ? <Selo tom="ok">Vigente</Selo> : <Selo>Substituída</Selo>}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-suave">
        Fechada em {quando(f.criadoEm)} por {f.fechadoPorNome}. Receita bruta {dinheiro(valorDe(f, codigoDoSubtotal('RECEITA')))} · resultado {dinheiro(valorDe(f, CODIGO.resultado))}
        {f.ressalvas.length > 0 ? ` · ${f.ressalvas.length === 1 ? '1 ressalva' : `${f.ressalvas.length} ressalvas`}` : ''}.
      </p>
      {f.substituidaEm && (
        <p className="mt-1 text-[12px] leading-snug text-suave">
          Reaberta em {quando(f.substituidaEm)} por {f.reabertaPorNome}: {f.motivoReabertura}
        </p>
      )}
      {!vigente && (
        <details className="mt-2 rounded-[10px] border border-linha">
          <summary className="flex min-h-10 cursor-pointer items-center px-3 text-[13px] font-medium">Ver o DRE desta versão (rede)</summary>
          <div className="overflow-x-auto border-t border-linha">
            <table className="w-full text-sm">
              <caption className="sr-only">DRE da versão {f.versao} do fechamento, rede completa</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-9 px-3 font-semibold">
                    Linha
                  </th>
                  <th scope="col" className="h-9 px-3 text-right font-semibold">
                    Realizado
                  </th>
                  <th scope="col" className="h-9 px-3 text-right font-semibold">
                    % da receita
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rede.map((l) => (
                  <tr key={l.chave} className={`border-t border-linha ${l.nivel === 0 ? 'font-semibold' : ''}`}>
                    <th scope="row" className={`py-1.5 text-left ${l.nivel === 1 ? 'pl-7 pr-2 font-normal' : 'px-3'}`}>
                      {l.nome}
                    </th>
                    <td className="px-3 text-right">{l.valorCentavos === null ? <span className="font-normal text-suave">—</span> : l.valorCentavos === 0 && l.tipo !== 'resultado' ? <span className="font-normal text-suave">—</span> : formatarDinheiro(l.valorCentavos)}</td>
                    <td className="px-3 text-right font-normal">{l.percentualBp === null || l.valorCentavos === 0 ? <span className="text-suave">—</span> : textoDoPercentual(l.percentualBp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </li>
  );
}

export function TelaDoFechamento({
  s,
  raiz,
  contexto,
  feito,
  acoes,
  bloqueio,
}: {
  s: SituacaoDoFechamento;
  raiz: string;
  contexto: string;
  feito: string | null;
  acoes: { fechar: AcaoLocal; reabrir?: AcaoLocal };
  bloqueio: string | null;
}) {
  const { periodo, condicoes, fotografia, versoes, registro } = s;
  const fechado = registro?.status === 'FECHADO';
  const verDre = `${raiz}/dre?periodo=${periodo.inicio}&rede=1`;
  return (
    <div className="space-y-6">
      <PageHeader icone="estoque" cor={COR.dre} titulo={fechado ? `${periodo.nome} · fechado` : `Fechar ${periodo.nome}`} subtitulo={`${contexto} · ${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {fechado ? <Selo tom="ok">Período fechado</Selo> : s.hoje <= periodo.fim ? <Selo tom="alerta">Em curso</Selo> : <Selo>Encerrado, ainda aberto</Selo>}
          <Link href={verDre} className={LINK_DE_TEXTO}>
            Ver o DRE deste período
          </Link>
          <Link href={`${raiz}/dre/periodos`} className={LINK_DE_TEXTO}>
            Todos os períodos
          </Link>
        </div>
      </PageHeader>

      {bloqueio && (
        <Aviso tom="alerta" titulo="Somente leitura.">
          {bloqueio}
        </Aviso>
      )}
      {feito && <Aviso tom="ok" titulo={feito} />}

      {!fechado && condicoes && (
        <Painel
          titulo="Condições para fechar"
          subtitulo="O período fecha quando o resultado dele já não depende de ninguém lançar mais nada. Há o que trava, e há o que dá para fechar com uma justificativa."
        >
          <div className="space-y-5">
            {condicoes.duras.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[13px] font-semibold">Resolva antes de fechar</h3>
                <ul className="divide-y divide-linha rounded-[10px] border border-linha">
                  {condicoes.duras.map((d) => (
                    <li key={d.codigo} className="px-3 py-3 text-sm">
                      <span className="block font-medium">{d.titulo[0].toUpperCase() + d.titulo.slice(1)}.</span>
                      <span className="block text-[13px] leading-snug text-suave">{d.detalhe}</span>
                      {d.resolverEm && (
                        <Link href={`${raiz}${d.resolverEm.caminho}`} className={`${LINK_DE_TEXTO} mt-1 inline-block text-[13px]`}>
                          {d.resolverEm.rotulo}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-suave">Estas condições não aceitam justificativa: somem quando o problema é resolvido.</p>
              </div>
            )}
            {condicoes.duras.length === 0 && (
              <div className="space-y-3">
                {condicoes.ressalvas.length === 0 && <p className="text-sm text-texto">Nenhuma condição pendente: o período pode ser fechado.</p>}
                <FormFechar acao={acoes.fechar} ressalvas={condicoes.ressalvas} impressao={condicoes.impressao} raiz={raiz} bloqueio={bloqueio} />
              </div>
            )}
          </div>
        </Painel>
      )}

      {fechado && fotografia && (
        <Painel titulo={`Fechado em ${quando(fotografia.criadoEm)} por ${fotografia.fechadoPorNome} · versão ${fotografia.versao}`} subtitulo="A fotografia que o DRE deste período lê. Nada do que se faz depois a muda.">
          <div className="space-y-5">
            <Numeros f={fotografia} />
            <Ressalvas f={fotografia} />
          </div>
        </Painel>
      )}

      {fechado && (
        <Painel titulo="Reabrir o período" subtitulo="O período fechado é o ponto de controle do consultor.">
          {acoes.reabrir && fotografia ? (
            <FormReabrir acao={acoes.reabrir} fotografia={fotografia.id} bloqueio={bloqueio} />
          ) : (
            <p className="text-sm text-suave">Só a FlowFoods reabre um período fechado. Precisa corrigir algo? Fale com o seu consultor: o motivo fica no Histórico e o fechamento anterior fica guardado.</p>
          )}
        </Painel>
      )}

      {versoes.length > 0 && (
        <Painel titulo="Versões" subtitulo="Cada vez que o período fecha sai uma versão; a anterior nunca se perde." acessorio={<Contagem>{versoes.length}</Contagem>} semRespiro>
          <ul className="divide-y divide-linha">
            {versoes.map((v) => (
              <Versao key={v.id} f={v} vigente={v.substituidaEm === null} />
            ))}
          </ul>
        </Painel>
      )}
    </div>
  );
}
