// Scanner avoid-ai-design, SD4d (P2) aceito: "Requisição × contagem · 10/10 a 16/10" é a linha de apoio do cabeçalho, no padrão "A · B" das telas da 1.1–1.7.
/**
 * Divergências da loja (1.8): requisição × contagem. Para cada insumo, entre
 * duas contagens aplicadas: o consumo apurado (o que havia + o que entrou − o
 * que sobrou) contra o que saiu por requisição (e as outras saídas lançadas).
 * O que sumiu sem requisição é a divergência — em quantidade e em R$, do
 * maior para o menor —, com os sumiços pequenos que se repetem dentro da
 * tolerância (o que o "fecha sozinha" deixa passar), por setor, os saldos
 * negativos e o que foi requisitado sem contagem para cruzar. Só leitura:
 * nada é gravado aqui. A mesma tela no nível 1 e na pessoa.
 */

import Link from 'next/link';
import type { DivergenciasDaLoja } from '@/lib/erp/requisicao';
import { PEQUENO_REPETIDO, quantidadeNegativa, rotuloDoSetor, type DivergenciaDoInsumo } from '@/lib/erp/requisicao-campos';
import { formatarData } from '@/lib/erp/compra-campos';
import { COR } from '@/lib/erp/modulos';
import { formatarDinheiro, formatarQuantidade } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { ROTULO } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';

const reais = (c: number) => (c < 0 ? `−${formatarDinheiro(-c)}` : formatarDinheiro(c));

function Sumico({ d }: { d: DivergenciaDoInsumo }) {
  if (d.sumicoMilesimos === 0) return <span className="text-suave">bateu</span>;
  const falta = d.sumicoMilesimos > 0;
  return (
    <span>
      <span className={`block text-[15px] font-bold ${falta ? 'text-erro' : 'text-texto'}`}>{falta ? `−${formatarQuantidade(d.sumicoMilesimos, d.unidade)}` : `+${formatarQuantidade(-d.sumicoMilesimos, d.unidade)}`}</span>
      <span className={`block text-[12px] ${d.sumicoCentavos === null ? 'text-atencao' : falta ? 'text-erro' : 'text-suave'}`}>
        {d.sumicoCentavos === null ? 'sem preço' : falta ? `${formatarDinheiro(d.sumicoCentavos)} sem requisição` : `${formatarDinheiro(-d.sumicoCentavos)} requisitado a mais`}
      </span>
    </span>
  );
}

function Pequenos({ d, tolerancia }: { d: DivergenciaDoInsumo; tolerancia: number }) {
  if (d.pequenos.vezes < PEQUENO_REPETIDO) return null;
  return (
    <Selo tom="alerta">
      pequeno e repetido · {d.pequenos.vezes}× dentro de {formatarDinheiro(tolerancia)}
    </Selo>
  );
}

export function TelaDivergencias({ d, base, contexto }: { d: DivergenciasDaLoja; base: string; contexto?: string }) {
  const daLoja = `${base}/${d.loja.id}`;
  const aqui = `${daLoja}/divergencias`;
  const titulo = `Divergências da ${d.loja.nome}`;
  if (!d.aberto) {
    return (
      <div className="space-y-6">
        <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: 'Divergências' }]} />
        <PageHeader icone="estoque" cor={COR.estoque} titulo={titulo} subtitulo={contexto} />
        <Aviso tom="alerta" titulo={`O estoque da ${d.loja.nome} ainda não foi aberto.`}>O cruzamento começa depois da abertura e da primeira contagem do dia a dia.</Aviso>
      </div>
    );
  }
  const r = d.resumo;
  const comSumico = d.linhas.filter((l) => l.sumicoMilesimos !== 0);
  const bateram = d.linhas.filter((l) => l.sumicoMilesimos === 0);
  const periodoAtual = d.janela.de === d.periodo.inicio && d.janela.ate === d.periodo.fim;
  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: d.loja.nome, href: daLoja }, { rotulo: 'Divergências' }]} />
      <Voltar href={daLoja}>Voltar para o estoque da {d.loja.nome}</Voltar>
      <PageHeader
        icone="estoque"
        cor={COR.estoque}
        titulo={titulo}
        subtitulo={[contexto, 'Requisição × contagem', `${formatarData(d.janela.de, true)} a ${formatarData(d.janela.ate, true)}`].filter(Boolean).join(' · ')}
      >
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="div-de" className={ROTULO}>
              De
            </label>
            <CampoData id="div-de" name="de" defaultValue={formatarData(d.janela.de)} className="w-[150px]" />
          </div>
          <div>
            <label htmlFor="div-ate" className={ROTULO}>
              Até
            </label>
            <CampoData id="div-ate" name="ate" defaultValue={formatarData(d.janela.ate)} className="w-[150px]" />
          </div>
          <button type="submit" className={classeDeBotao('secundario')}>
            Ver
          </button>
          {!periodoAtual && (
            <Link href={aqui} className={classeDeBotao('fantasma')}>
              Período de agora
            </Link>
          )}
        </form>
      </PageHeader>
      {d.aviso && <Aviso tom="alerta" titulo={d.aviso} />}

      <p className="max-w-3xl text-sm text-suave">
        Entre duas contagens de cada insumo: <span className="text-texto">o que havia + o que entrou − o que sobrou</span> é o que foi consumido. O que foi consumido sem requisição (nem perda lançada) sumiu. Não é culpa de ninguém até conferir: pode ser consumo sem pedido, entrega sem baixa, perda ou contagem errada. Nada é gravado aqui.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Sumiu sem requisição</div>
          <div className={`mt-2 font-display text-[30px] font-bold leading-none tabular-nums ${r.sumicoCentavos > 0 ? 'text-erro' : ''}`}>{formatarDinheiro(r.sumicoCentavos)}</div>
          <div className="mt-1.5 text-[12px] text-suave">
            {r.comSumico === 0 ? 'nenhum insumo' : r.comSumico === 1 ? 'em 1 insumo' : `em ${r.comSumico} insumos`}
            {r.semPreco ? ` · ${r.semPreco} sem preço fora da soma` : ''}
          </div>
        </div>
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Pequeno e repetido</div>
          <div className={`mt-2 font-display text-[30px] font-bold leading-none tabular-nums ${r.pequenosCentavos > 0 ? 'text-atencao' : ''}`}>{formatarDinheiro(r.pequenosCentavos)}</div>
          <div className="mt-1.5 text-[12px] text-suave">
            {r.pequenosRepetidos === 0 ? 'nada se repetindo' : `${r.pequenosRepetidos} ${r.pequenosRepetidos === 1 ? 'insumo' : 'insumos'}`} · cada vez dentro de {formatarDinheiro(d.toleranciaCentavos)}
          </div>
        </div>
        <div className="rounded-[14px] border border-linha bg-painel px-4 py-3.5 sm:px-5">
          <div className="text-[12px] font-medium text-suave">Requisitado a mais</div>
          <div className="mt-2 font-display text-[30px] font-bold leading-none tabular-nums">{formatarDinheiro(r.sobraCentavos)}</div>
          <div className="mt-1.5 text-[12px] text-suave">{r.comSobra === 0 ? 'nenhum insumo' : `${r.comSobra} ${r.comSobra === 1 ? 'insumo' : 'insumos'}`} · devolução sem registro?</div>
        </div>
      </div>

      <Painel titulo="Do maior sumiço para o menor" subtitulo="Valor pelo custo de referência de hoje" semRespiro>
        {comSumico.length === 0 ? (
          <Vazio titulo={d.linhas.length ? 'Tudo bateu.' : 'Nenhum trecho fechado por contagem nesta janela.'}>
            {d.linhas.length ? 'O consumo apurado pelas contagens é o que saiu por requisição.' : 'O cruzamento precisa de duas contagens do mesmo insumo. Planeje uma contagem no estoque da loja.'}
          </Vazio>
        ) : (
          <>
            <ul className="divide-y divide-linha md:hidden">
              {comSumico.map((l) => (
                <li key={l.insumoId} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-texto">{l.nome}</span>
                      <span className="mt-1 block">
                        <Pequenos d={l} tolerancia={d.toleranciaCentavos} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <Sumico d={l} />
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-[12px] tabular-nums">
                    <div>
                      <dt className="text-suave">Consumo</dt>
                      <dd className="font-semibold text-texto">{formatarQuantidade(l.consumoMilesimos, l.unidade)}</dd>
                    </div>
                    <div>
                      <dt className="text-suave">Requisitado</dt>
                      <dd className="font-semibold text-texto">{formatarQuantidade(l.requisitadoMilesimos, l.unidade)}</dd>
                    </div>
                    <div>
                      <dt className="text-suave">Contagens</dt>
                      <dd className="font-semibold text-texto">{l.trechos + 1}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <caption className="sr-only">Consumo apurado pela contagem contra o requisitado, por insumo, do maior sumiço em reais para o menor.</caption>
                <colgroup>
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[120px]" />
                  <col className="w-[110px]" />
                  <col className="w-[190px]" />
                </colgroup>
                <thead>
                  <tr className="bg-forte text-left text-[12px] text-suave">
                    <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                      Insumo
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Consumo apurado
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Requisitado
                    </th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">
                      Perda lançada
                    </th>
                    <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                      Sumiu sem requisição
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {comSumico.map((l) => (
                    <tr key={l.insumoId} className="border-t border-linha align-top">
                      <td className="py-2.5 pl-5 pr-3">
                        <span className="block truncate font-medium text-texto">{l.nome}</span>
                        <span className="block text-[12px] text-suave">
                          {l.trechos + 1} contagens
                          {l.requisitadoPorSetor.size ? ` · pediu ${Array.from(l.requisitadoPorSetor.keys()).map((s) => rotuloDoSetor(s || null)).join(', ')}` : ' · ninguém pediu'}
                        </span>
                        <span className="mt-1 block">
                          <Pequenos d={l} tolerancia={d.toleranciaCentavos} />
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{formatarQuantidade(l.consumoMilesimos, l.unidade)}</td>
                      <td className="px-3 py-2.5 text-right">{formatarQuantidade(l.requisitadoMilesimos, l.unidade)}</td>
                      <td className="px-3 py-2.5 text-right text-suave">{l.outrasSaidasMilesimos ? formatarQuantidade(l.outrasSaidasMilesimos, l.unidade) : '—'}</td>
                      <td className="px-3 py-2.5 pr-5 text-right">
                        <Sumico d={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {bateram.length > 0 && (
          <details className="border-t border-linha">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-semibold text-texto sm:px-5 [&::-webkit-details-marker]:hidden">
              <span>Bateram</span>
              <span className="text-[12px] font-normal tabular-nums text-suave">{bateram.length}</span>
            </summary>
            <p className="px-4 pb-3 text-[13px] text-suave sm:px-5">{bateram.map((l) => l.nome).join(' · ')}</p>
          </details>
        )}
      </Painel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Painel titulo="Por setor" subtitulo="O que cada setor pediu e o sumiço nos insumos que ele usa: onde olhar primeiro, não culpa" semRespiro>
          {d.setores.length === 0 ? (
            <Vazio>Nenhuma requisição nos trechos desta janela.</Vazio>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Requisitado e sumiço por setor.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-5 pr-3 font-semibold">
                    Setor
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Pediu
                  </th>
                  <th scope="col" className="h-10 px-3 pr-5 text-right font-semibold">
                    Sumiço nos seus insumos
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {d.setores.map((s) => (
                  <tr key={s.setor} className="h-11 border-t border-linha">
                    <td className="py-2.5 pl-5 pr-3 font-medium text-texto">
                      {rotuloDoSetor(s.setor || null)}
                      <span className="block text-[12px] font-normal text-suave">{s.quantosInsumos === 1 ? '1 insumo' : `${s.quantosInsumos} insumos`}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatarDinheiro(s.requisitadoCentavos)}</td>
                    <td className={`px-3 py-2.5 pr-5 text-right font-semibold ${s.sumicoNosSeusCentavos > 0 ? 'text-erro' : 'text-suave'}`}>
                      {s.sumicoNosSeusCentavos > 0 ? formatarDinheiro(s.sumicoNosSeusCentavos) : '—'}
                      {s.insumosComSumico > 0 && <span className="block text-[12px] font-normal text-suave">em {s.insumosComSumico === 1 ? '1 insumo' : `${s.insumosComSumico} insumos`}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Painel>
        <div className="space-y-5">
          <Painel titulo="Abaixo de zero agora" subtitulo="Saiu mais do que o livro tinha: conte de novo" semRespiro>
            {d.negativos.length === 0 ? (
              <Vazio>Nenhum insumo com saldo negativo.</Vazio>
            ) : (
              <ul className="divide-y divide-linha">
                {d.negativos.map((n) => (
                  <li key={n.insumoId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <span className="min-w-0 truncate font-medium text-texto">{n.nome}</span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="block font-semibold text-erro">{quantidadeNegativa(n.quantidadeMilesimos, n.unidade)}</span>
                      <span className="block text-[12px] text-suave">{n.valorCentavos === null ? 'sem preço' : reais(n.valorCentavos)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          {d.semContagem.length > 0 && (
            <Painel titulo="Requisitado sem contagem para cruzar" subtitulo="Saiu por requisição, mas falta a contagem que fecha o trecho" semRespiro>
              <ul className="divide-y divide-linha">
                {d.semContagem.map((s) => (
                  <li key={s.insumoId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <span className="min-w-0 truncate text-texto">{s.nome}</span>
                    <span className="shrink-0 tabular-nums text-suave">{formatarQuantidade(s.quantidade, s.unidade)}</span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-linha px-4 py-3 text-[12px] text-suave sm:px-5">
                <Link href={`${daLoja}/contagens/nova`} className={LINK_DE_TEXTO}>
                  Planejar uma contagem
                </Link>{' '}
                para cruzar.
              </p>
            </Painel>
          )}
        </div>
      </div>
    </div>
  );
}
