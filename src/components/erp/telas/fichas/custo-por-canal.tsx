'use client';

// Scanner avoid-ai-design, SD4d (P2) aceito: "1 un · R$ 0,89" e "a cada R$ 10,00: R$ 2,62" são a linha de apoio da tabela densa (Kairu Corporativo), no padrão "A · B" das telas da 1.1–1.9. (O ignore do scanner não aceita id com minúscula.)
/**
 * "Preço e margem por canal" no detalhe da ficha de PRATO (1.9 → 1.10), o
 * MESMO no nível 1 e na pessoa do parceiro. Tabela densa com os canais nas
 * colunas (Loja · Delivery · iFood): primeiro o que entra no custo (insumos,
 * embalagens, a taxa do iFood — em R$ quando há preço — e o custo do canal);
 * depois a margem-alvo, o preço sugerido com a conta, o preço de venda (campo,
 * só para quem muda preços), a margem bruta e a líquida em R$ e %, e o farol
 * com a palavra. No celular, um bloco por canal.
 *
 * Ao vivo: cada tecla no preço refaz a conta com a MESMA função do servidor
 * (`precoDoCanal`). É prévia: o formulário manda só o texto do preço, e o
 * servidor recalcula tudo ao salvar. Incompleto nunca vira número.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { CANAIS, contaDaTaxa, ORDEM_DOS_CANAIS, porQueIncompleto, taxaACadaDezReais, type CamadasDoCanal, type CanalVenda } from '@/lib/erp/canal-campos';
import {
  contaDoSugerido,
  divisorDoSugerido,
  entradaDaTela,
  FAROL,
  formatarPorcentagem,
  formatarReaisComSinal,
  LIMITES_DO_PRECO,
  lerPrecos,
  precoDoCanal,
  type EntradaEmTexto,
  type PrecoDoCanal,
} from '@/lib/erp/preco-campos';
import { ACIMA_DO_LIMITE, dinheiroParaCampo, formatarDinheiro, formatarFracao, formatarPontosBase, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO } from '../../ui/campos';
import { Dica } from '../../ui/dica';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, useAvisoDeSaida } from '../cadastro/erros';

/** O que o servidor manda (BigInt em texto). */
export interface PrecosParaTela {
  entradas: EntradaEmTexto[];
  margensAlvo: Record<CanalVenda, number | null>;
  precosProprios: Record<CanalVenda, number | null>;
  impressaoDosPrecos: string;
  impressaoDosCustos: string;
}

interface Props {
  dados: PrecosParaTela;
  className?: string;
  /** Editar as embalagens por canal (quem edita fichas e vê a precificação). */
  linkDasEmbalagens?: string;
  /** "Precificação" (canais de venda; quem vê a precificação). */
  linkDosCanais?: string;
  /** Quem muda preços (a dona): "Configurar"/"definir" levam aos canais. */
  podeConfigurar: boolean;
  /** Só com `precos.editar`, ficha ativa e parceiro livre: o preço vira campo. */
  acao?: AcaoDeCadastro;
  aqui: string;
}

type Embalagem = CamadasDoCanal['embalagens'][number];
type Linha = { insumoId: string; nome: string; unidade: Unidade; porCanal: Partial<Record<CanalVenda, Embalagem>> };

/** As embalagens dos canais numa lista só (a mesma caixa no delivery e no iFood é uma linha). */
function linhasDasEmbalagens(canais: readonly CamadasDoCanal[]): Linha[] {
  const mapa = new Map<string, Linha>();
  for (const c of canais) {
    for (const e of c.embalagens) {
      const l = mapa.get(e.insumoId) ?? { insumoId: e.insumoId, nome: e.nome, unidade: e.unidade, porCanal: {} };
      l.porCanal[c.canal] = e;
      mapa.set(e.insumoId, l);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const TRACO = <span className="text-suave">—</span>;
const reais = (centavos: number) => formatarDinheiro(centavos);

function ValorDaEmbalagem({ e }: { e: Embalagem | undefined }) {
  if (!e) return TRACO;
  return (
    <>
      {e.valor ? <span className="text-texto">{formatarFracao(e.valor)}</span> : <Selo tom="alerta">Sem preço</Selo>}
      <span className="block text-[12px] text-suave">{formatarQuantidade(e.quantidadeMilesimos, e.unidade)}</span>
    </>
  );
}

function Taxa({ p, linkDosCanais }: { p: PrecoDoCanal; linkDosCanais?: string }) {
  const c = p.camadas;
  if (c.taxa.tipo === 'nenhuma') return TRACO;
  if (c.taxa.tipo === 'naoConfigurada') {
    return (
      <>
        <Selo tom="alerta">Não configurada</Selo>
        {linkDosCanais && (
          <Link href={linkDosCanais} className={`mt-1 block text-[12px] ${LINK_DE_TEXTO}`}>
            Configurar
          </Link>
        )}
      </>
    );
  }
  if (c.taxa.valor && p.preco) {
    return (
      <>
        <span className="text-texto">{formatarFracao(c.taxa.valor)}</span>
        <span className="block text-[12px] text-suave">
          {formatarPontosBase(c.taxa.totalBp)} de {reais(p.preco.centavos)}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="text-texto">{formatarPontosBase(c.taxa.totalBp)} do preço</span>
      <span className="block text-[12px] text-suave">a cada R$ 10,00: {taxaACadaDezReais(c.taxa.totalBp)}</span>
    </>
  );
}

function CustoDoCanal({ c }: { c: CamadasDoCanal }) {
  return (
    <>
      <span className={`font-semibold ${c.incompleto ? 'text-atencao' : 'text-texto'}`}>{formatarFracao(c.total ?? c.semTaxa)}</span>
      {c.taxa.tipo === 'sobrePreco' && !c.total && (
        <span className="block text-[12px] font-normal text-suave">+ {formatarPontosBase(c.taxa.totalBp)} do preço</span>
      )}
      {c.incompleto && (
        <span className="mt-1 block">
          <Selo tom="alerta">Incompleto</Selo>
        </span>
      )}
    </>
  );
}

function MargemAlvo({ p, linkDosCanais }: { p: PrecoDoCanal; linkDosCanais?: string }) {
  if (p.margemAlvoBp !== null) return <span className="text-texto">{formatarPontosBase(p.margemAlvoBp)}</span>;
  return (
    <>
      <span className="text-suave">sem alvo</span>
      {linkDosCanais && (
        <Link href={linkDosCanais} className={`mt-0.5 block text-[12px] ${LINK_DE_TEXTO}`}>
          Definir
        </Link>
      )}
    </>
  );
}

function Sugerido({ p, usar }: { p: PrecoDoCanal; usar?: (centavos: number) => void }) {
  const s = p.sugerido;
  if (s.tipo === 'incompleto') return <Selo tom="alerta">Incompleto</Selo>;
  if (s.tipo === 'semAlvo') return TRACO;
  if (s.tipo === 'inviavel') return <span className="text-[13px] text-atencao">não fecha: taxa + alvo = {formatarPontosBase(s.somaBp)}</span>;
  if (s.tipo === 'acimaDoLimite') return <span className="text-atencao">{ACIMA_DO_LIMITE}</span>;
  return (
    <>
      <span className="font-semibold text-texto">{reais(s.centavos)}</span>
      <span className="block text-[12px] text-suave" title={contaDoSugerido(p.semTaxa, p.taxaBp, p.margemAlvoBp!, s)}>
        {formatarFracao(p.semTaxa)} ÷ {divisorDoSugerido(p.taxaBp, p.margemAlvoBp!)}
      </span>
      {usar && s.cardapio !== s.centavos && s.cardapio <= LIMITES_DO_PRECO.centavos && (
        <button type="button" onClick={() => usar(s.cardapio)} className={`mt-0.5 min-h-8 text-[12px] ${LINK_DE_TEXTO}`}>
          usar {reais(s.cardapio)}
        </button>
      )}
    </>
  );
}

/** Margem em R$ (forte) e % embaixo; o farol com a palavra (só na líquida). */
function Margem({ p, qual }: { p: PrecoDoCanal; qual: 'bruta' | 'liquida' }) {
  if (!p.margens) return p.porQue && p.preco ? <Selo tom="alerta">Incompleta</Selo> : TRACO;
  const valor = qual === 'bruta' ? p.margens.bruta : p.margens.liquida;
  const bp = qual === 'bruta' ? p.margens.brutaBp : p.margens.liquidaBp;
  const farol = qual === 'liquida' ? p.margens.farol : null;
  return (
    <>
      <span className={`${qual === 'liquida' ? 'text-[15px] font-semibold' : ''} ${valor.num < 0n ? 'text-erro' : 'text-texto'}`}>{formatarReaisComSinal(valor)}</span>
      <span className="block text-[12px] text-suave">{formatarPorcentagem(bp)} do preço</span>
      {farol && (
        <span className="mt-1 block">
          <Selo tom={FAROL[farol].tom} cheio={farol === 'prejuizo'}>
            {FAROL[farol].rotulo}
          </Selo>
        </span>
      )}
    </>
  );
}

const origemDoPreco = (p: PrecoDoCanal) => (!p.preco ? 'sem preço' : p.preco.origem === 'proprio' ? 'seu preço' : 'o sugerido');

export function PrecoEMargemPorCanal(props: Props) {
  if (props.acao) return <ComFormulario {...props} acao={props.acao} />;
  return <Conteudo {...props} estado={null} />;
}

function ComFormulario(props: Props & { acao: AcaoDeCadastro }) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(props.acao, null);
  const saida = useAvisoDeSaida();
  return (
    <form action={enviar} onChange={saida.aoMudar} onSubmit={saida.aoEnviar} noValidate className={props.className}>
      <input type="hidden" name="impressao" value={props.dados.impressaoDosPrecos} />
      <input type="hidden" name="custos" value={props.dados.impressaoDosCustos} />
      <Conteudo {...props} className="" estado={estado} editavel />
    </form>
  );
}

function Conteudo({
  dados,
  className = '',
  linkDasEmbalagens,
  linkDosCanais,
  podeConfigurar,
  aqui,
  estado,
  editavel = false,
}: Props & { estado: EstadoCadastro; editavel?: boolean }) {
  const [textos, setTextos] = useState<Record<CanalVenda, string>>(
    () => Object.fromEntries(ORDEM_DOS_CANAIS.map((c) => [c, dados.precosProprios[c] === null ? '' : dinheiroParaCampo(dados.precosProprios[c]!)])) as Record<CanalVenda, string>,
  );
  const entradas = useMemo(() => dados.entradas.map(entradaDaTela), [dados.entradas]);
  const erros = estado?.erros ?? {};
  // A conta de cada canal com o que está digitado agora (texto ruim = prévia sem ele, e o aviso no campo).
  const contas = entradas.map((e) => {
    const t = textos[e.canal].trim();
    // A MESMA leitura do servidor (e a mesma frase de erro).
    const lido = lerPrecos({ [e.canal]: t });
    const p = precoDoCanal(e, { margemAlvoBp: dados.margensAlvo[e.canal], precoProprioCentavos: lido.ok ? lido.dados[e.canal] : null });
    return { p, erro: lido.ok ? undefined : lido.erros[`preco-${e.canal}`], digitado: !!t };
  });
  const precos = contas.map((x) => x.p);
  const camadas = precos.map((p) => p.camadas);
  const linhas = linhasDasEmbalagens(camadas);
  const ifood = precos.find((p) => p.canal === 'IFOOD')!;
  const motivos = precos.map((p) => ({ p, por: porQueIncompleto(p.camadas) })).filter((x) => x.por);
  const semEmbalagem = precos.filter((p) => p.canal !== 'LOJA' && p.camadas.embalagens.length === 0).map((p) => CANAIS[p.canal].rotulo);
  const configurar = podeConfigurar ? linkDosCanais : undefined;
  const mudar = (canal: CanalVenda, v: string) => setTextos((t) => ({ ...t, [canal]: v }));
  const usar = (canal: CanalVenda) => (centavos: number) => mudar(canal, dinheiroParaCampo(centavos));

  const campoDoPreco = (canal: CanalVenda, i: number, sufixo: string, largura: string) => {
    const x = contas[i];
    const id = `preco-${canal}${sufixo}`;
    const erro = erros[`preco-${canal}`] ?? x.erro;
    const sugerido = x.p.sugerido.tipo === 'ok' ? x.p.sugerido.centavos : null;
    return (
      <>
        <label htmlFor={id} className="sr-only">
          Preço de venda no canal {CANAIS[canal].rotulo}
        </label>
        <div className={`${largura} ml-auto`}>
          <input
            id={id}
            name={`preco_${canal}`}
            inputMode="decimal"
            autoComplete="off"
            value={textos[canal]}
            placeholder={sugerido !== null ? dinheiroParaCampo(sugerido) : '0,00'}
            onChange={(e) => mudar(canal, e.target.value)}
            className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums sm:text-sm`}
            aria-invalid={!!erro}
            aria-describedby={`${id}-ajuda${erro ? ` ${id}-erro` : ''}`}
          />
        </div>
        <span id={`${id}-ajuda`} className="mt-1 block text-[12px] text-suave">
          {x.digitado ? 'seu preço' : sugerido !== null ? 'vazio = o sugerido' : 'sem preço'}
        </span>
        {erro && (
          <span id={`${id}-erro`} className="mt-0.5 block whitespace-normal text-[12px] text-erro">
            {erro}
          </span>
        )}
      </>
    );
  };

  const precoLido = (p: PrecoDoCanal) =>
    p.preco ? (
      <>
        <span className="text-[15px] font-semibold text-texto">{reais(p.preco.centavos)}</span>
        <span className="block text-[12px] text-suave">{origemDoPreco(p)}</span>
      </>
    ) : (
      <span className="text-suave">sem preço</span>
    );

  const th = 'h-10 px-3 text-right font-semibold';
  const td = 'whitespace-nowrap px-3 py-2.5 text-right align-top';
  const rotulo = 'py-2.5 pl-5 pr-3 text-left align-top font-medium text-texto';
  return (
    <Painel
      className={className}
      titulo="Preço e margem por canal"
      subtitulo="Uma porção: o que entra no custo de cada canal, o preço e o que sobra"
      semRespiro
      acessorio={
        linkDasEmbalagens ? (
          <Link href={linkDasEmbalagens} className={`shrink-0 text-[13px] ${LINK_DE_TEXTO}`}>
            Editar embalagens
          </Link>
        ) : undefined
      }
    >
      {estado?.erros.geral && (
        <div className="border-b border-linha px-4 py-3 sm:px-5">
          <ErroGeral estado={estado} recarregar={aqui} />
        </div>
      )}

      {/* Desktop e tablet: canais nas colunas (Kairu Corporativo). */}
      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">Custo, preço e margem de uma porção em cada canal de venda.</caption>
        <thead>
          <tr className="bg-forte text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 text-left font-semibold">
              O que entra
            </th>
            {precos.map((p) => (
              <th key={p.canal} scope="col" className={`${th} last:pr-5`}>
                {CANAIS[p.canal].curto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Insumos da receita
            </th>
            {camadas.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                {formatarFracao(c.daFicha)}
                {c.insumosSemPreco.length > 0 && <span className="block text-[12px] text-atencao">+ sem preço</span>}
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Embalagens
              {linhas.length === 0 && (
                <span className="block text-[12px] font-normal text-suave">Nenhuma ainda{linkDasEmbalagens ? ': em Editar embalagens' : ''}.</span>
              )}
            </th>
            {camadas.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                {c.canal === 'LOJA' ? TRACO : c.embalagens.length ? formatarFracao(c.embalagensTotal) : <span className="text-[13px] text-atencao">sem embalagem</span>}
              </td>
            ))}
          </tr>
          {linhas.map((l) => (
            <tr key={l.insumoId} className="text-[13px]">
              <th scope="row" className="py-1.5 pl-9 pr-3 text-left align-top font-normal text-suave">
                {l.nome}
              </th>
              {camadas.map((c) => (
                <td key={c.canal} className="whitespace-nowrap px-3 py-1.5 text-right align-top text-suave last:pr-5">
                  {c.canal === 'LOJA' ? '' : <ValorDaEmbalagem e={l.porCanal[c.canal]} />}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Taxa do iFood
              {ifood.camadas.taxa.tipo === 'sobrePreco' && (
                <span className="block text-[12px] font-normal text-suave">{contaDaTaxa(ifood.camadas.taxa.taxa)}</span>
              )}
            </th>
            {precos.map((p) => (
              <td key={p.canal} className={`${td} last:pr-5`}>
                <Taxa p={p} linkDosCanais={configurar} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha-forte">
            <th scope="row" className="h-11 py-2.5 pl-5 pr-3 text-left align-top font-semibold">
              Custo do canal
            </th>
            {camadas.map((c) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                <CustoDoCanal c={c} />
              </td>
            ))}
          </tr>
        </tbody>
        <tbody className="tabular-nums">
          <tr className="border-t border-linha-forte bg-forte/50">
            <th scope="row" className={rotulo}>
              Margem-alvo
              <span className="block text-[12px] font-normal text-suave">o que deve sobrar, em % do preço</span>
            </th>
            {precos.map((p) => (
              <td key={p.canal} className={`${td} last:pr-5`}>
                <MargemAlvo p={p} linkDosCanais={configurar} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Preço sugerido
              <span className="block text-[12px] font-normal text-suave">custo ÷ (1 − taxa − alvo), para cima</span>
            </th>
            {precos.map((p) => (
              <td key={p.canal} className={`${td} last:pr-5`}>
                <Sugerido p={p} usar={editavel ? usar(p.canal) : undefined} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Preço de venda
            </th>
            {precos.map((p, i) => (
              <td key={p.canal} className={`${td} last:pr-5`}>
                {editavel ? campoDoPreco(p.canal, i, '', 'w-28') : precoLido(p)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Margem bruta
              <span className="block text-[12px] font-normal text-suave">preço − insumos − embalagens</span>
            </th>
            {precos.map((p) => (
              <td key={p.canal} className={`${td} last:pr-5`}>
                <Margem p={p} qual="bruta" />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Margem líquida
              <span className="block text-[12px] font-normal text-suave">bruta − taxa do canal</span>
            </th>
            {precos.map((p) => (
              <td key={p.canal} className={`${td} last:pr-5`} aria-live="polite">
                <Margem p={p} qual="liquida" />
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Celular: um bloco por canal, as mesmas linhas. */}
      <ol className="divide-y divide-linha sm:hidden">
        {precos.map((p, i) => {
          const c = p.camadas;
          return (
            <li key={p.canal} className="px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-texto">{CANAIS[p.canal].rotulo}</h3>
                {p.margens?.farol && (
                  <Selo tom={FAROL[p.margens.farol].tom} cheio={p.margens.farol === 'prejuizo'}>
                    {FAROL[p.margens.farol].rotulo}
                  </Selo>
                )}
              </div>
              <dl className="mt-2 space-y-1.5 text-[13px] tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Insumos da receita</dt>
                  <dd>{formatarFracao(c.daFicha)}</dd>
                </div>
                {p.canal !== 'LOJA' && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-suave">
                      Embalagens
                      {c.embalagens.length ? ` (${c.embalagens.map((e) => `${e.nome} ${formatarQuantidade(e.quantidadeMilesimos, e.unidade)}`).join(', ')})` : ''}
                    </dt>
                    <dd className="shrink-0">{c.embalagens.length ? formatarFracao(c.embalagensTotal) : <span className="text-atencao">sem embalagem</span>}</dd>
                  </div>
                )}
                {c.taxa.tipo !== 'nenhuma' && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-suave">Taxa do iFood</dt>
                    <dd className="text-right">
                      <Taxa p={p} linkDosCanais={configurar} />
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-linha pt-1.5">
                  <dt className="font-medium text-texto">Custo do canal</dt>
                  <dd className="text-right">
                    <CustoDoCanal c={c} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Margem-alvo</dt>
                  <dd className="text-right">
                    <MargemAlvo p={p} linkDosCanais={configurar} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Preço sugerido</dt>
                  <dd className="text-right">
                    <Sugerido p={p} usar={editavel ? usar(p.canal) : undefined} />
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="pt-2.5 font-medium text-texto">Preço de venda</dt>
                  <dd className="text-right">{editavel ? campoDoPreco(p.canal, i, '-m', 'w-32') : precoLido(p)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Margem bruta</dt>
                  <dd className="text-right">
                    <Margem p={p} qual="bruta" />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-texto">Margem líquida</dt>
                  <dd className="text-right">
                    {p.margens ? (
                      <>
                        <span className={`text-[15px] font-semibold ${p.margens.liquida.num < 0n ? 'text-erro' : 'text-texto'}`}>{formatarReaisComSinal(p.margens.liquida)}</span>
                        <span className="block text-[12px] text-suave">{formatarPorcentagem(p.margens.liquidaBp)} do preço</span>
                      </>
                    ) : (
                      <Margem p={p} qual="liquida" />
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t border-linha px-4 py-3 text-[12px] text-suave sm:px-5">
        {motivos.map(({ p, por }) => (
          <p key={p.canal} className="text-atencao">
            {CANAIS[p.canal].rotulo}: custo incompleto — {por}. Sugerido e margens esperam o custo.
          </p>
        ))}
        {semEmbalagem.length > 0 && (
          <p className="text-atencao">
            {semEmbalagem.join(' e ')} sem embalagem cadastrada: se vai caixa ou sacola, o custo está baixo.
            {linkDasEmbalagens && (
              <>
                {' '}
                <Link href={linkDasEmbalagens} className={LINK_DE_TEXTO}>
                  Cadastrar
                </Link>
              </>
            )}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <Dica rotulo="Como a conta é feita">
            <p>Embalagem entra inteira, pelo custo de referência (o último preço pago). A taxa do iFood é comissão + pagamento online, sobre o preço.</p>
            <p>Margem bruta = preço − insumos − embalagens. Margem líquida = bruta − taxa do canal: o que sobra para pagar a casa e o lucro. Despesa fixa fica no DRE.</p>
            <p>Preço sugerido = custo ÷ (1 − taxa − margem-alvo), arredondado para cima no centavo: é o menor preço que atinge o alvo. Campo vazio vale o sugerido e acompanha o custo.</p>
          </Dica>
          {editavel && (
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <BotaoEnviar variante="secundario" className="sm:min-w-40">
                Salvar preços
              </BotaoEnviar>
              <span className="text-right">O servidor refaz a conta ao salvar.</span>
            </div>
          )}
        </div>
        {linkDosCanais && (
          <p>
            <Link href={linkDosCanais} className={LINK_DE_TEXTO}>
              Margens-alvo e taxa em Precificação
            </Link>
          </p>
        )}
      </div>
    </Painel>
  );
}
