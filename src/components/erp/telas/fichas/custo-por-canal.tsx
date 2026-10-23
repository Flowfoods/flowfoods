'use client';

// Scanner avoid-ai-design, SD4d (P2) aceito: "1 un · R$ 0,89" e "a cada R$ 10,00: R$ 2,62" são a linha de apoio da tabela densa (Kairu Corporativo), no padrão "A · B" das telas da 1.1–1.9. (O ignore do scanner não aceita id com minúscula.)
/**
 * "Preço e CMV por canal" no detalhe da ficha de PRATO (1.9 → 1.10 → N.2), o MESMO no nível 1 e na pessoa do parceiro.
 * Tabela densa com os canais nas colunas (Loja · Delivery · iFood): primeiro o CUSTO FÍSICO (insumos + embalagens do
 * canal: a base do CMV) e, separada, a taxa do iFood; depois a meta de CMV, o preço sugerido (custo físico ÷ meta), o
 * preço de venda (campo, só para quem muda preços), o CMV com o farol (dentro · acima · sem dados) e o resultado após
 * os custos informados (nunca "lucro líquido"). No celular, um bloco por canal.
 *
 * Ao vivo: cada tecla no preço refaz a conta com a MESMA função do servidor (`cmvDoCanal`). É prévia: o formulário
 * manda só o texto do preço, e o servidor recalcula tudo ao salvar. Faltar custo, meta ou preço nunca vira número nem
 * farol positivo: é "sem dados", com o motivo. A sugestão não é preço: vazio = preço não definido.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import { camadasDoCanal, CANAIS, contaDaTaxa, ORDEM_DOS_CANAIS, taxaACadaDezReais, taxaSobrePreco, type CamadasDoCanal, type CanalVenda } from '@/lib/erp/canal-campos';
import {
  cmvDoCanal,
  contaDoSugeridoPorCmv,
  parcelasEmTexto,
  porcentagemDoCmv,
  ROTULO_DO_RESULTADO,
  STATUS_DO_CMV,
  type CmvDoCanal,
} from '@/lib/erp/cmv-produto-campos';
import { entradaDaTela, LIMITES_DO_PRECO, lerPrecos, type EntradaEmTexto } from '@/lib/erp/preco-campos';
import { ACIMA_DO_LIMITE, dinheiroParaCampo, formatarDinheiro, formatarFracao, formatarPontosBase, formatarQuantidade, type Unidade } from '@/lib/erp/unidades';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO } from '../../ui/campos';
import { LinkDeAjuda } from '../../ui/link-de-ajuda';
import { LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel, Selo } from '../../ui/superficies';
import type { AcaoDeCadastro, EstadoCadastro } from '../cadastro/estado';
import { ErroGeral, useAvisoDeSaida } from '../cadastro/erros';

/** O que o servidor manda (BigInt em texto). */
export interface PrecosParaTela {
  entradas: EntradaEmTexto[];
  /** N.2: a meta de CMV de cada canal (null = sem meta). */
  metasDeCmv: Record<CanalVenda, number | null>;
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
      {e.valor ? <span className="text-texto">{formatarFracao(e.valor)}</span> : <Selo tom="alerta">Custo não informado</Selo>}
      <span className="block text-[12px] text-suave">{formatarQuantidade(e.quantidadeMilesimos, e.unidade)}</span>
    </>
  );
}

/** A taxa do canal: fora do CMV, em R$ quando há preço definido. */
function Taxa({ c, preco, linkDosCanais }: { c: CamadasDoCanal; preco: number | null; linkDosCanais?: string }) {
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
  if (preco !== null) {
    return (
      <>
        <span className="text-texto">{formatarFracao(taxaSobrePreco(preco, c.taxa.totalBp))}</span>
        <span className="block text-[12px] text-suave">
          {formatarPontosBase(c.taxa.totalBp)} de {reais(preco)}
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

/** Custo físico (insumos + embalagens): a base do CMV. Incompleto mostra a parte conhecida, identificada. */
function CustoFisico({ x }: { x: CmvDoCanal }) {
  return (
    <>
      <span className={`font-semibold ${x.fisico.completo ? 'text-texto' : 'text-atencao'}`}>{formatarFracao(x.fisico.valor)}</span>
      {!x.fisico.completo && (
        <span className="mt-1 block">
          <Selo tom="alerta">Incompleto</Selo>
        </span>
      )}
    </>
  );
}

function MetaDeCmv({ x, linkDosCanais }: { x: CmvDoCanal; linkDosCanais?: string }) {
  if (x.metaBp !== null) return <span className="text-texto">{formatarPontosBase(x.metaBp)}</span>;
  return (
    <>
      <span className="text-suave">sem meta</span>
      {linkDosCanais && (
        <Link href={linkDosCanais} className={`mt-0.5 block text-[12px] ${LINK_DE_TEXTO}`}>
          Definir
        </Link>
      )}
    </>
  );
}

function Sugerido({ x, usar }: { x: CmvDoCanal; usar?: (centavos: number) => void }) {
  const s = x.sugerido;
  if (s.tipo === 'incompleto') return <Selo tom="alerta">Custo incompleto</Selo>;
  if (s.tipo === 'semMeta') return TRACO;
  if (s.tipo === 'semCusto') return <span className="text-[13px] text-suave">sem custo</span>;
  if (s.tipo === 'acimaDoLimite') return <span className="text-atencao">{ACIMA_DO_LIMITE}</span>;
  return (
    <>
      <span className="font-semibold text-texto">{reais(s.centavos)}</span>
      <span className="block text-[12px] text-suave">{contaDoSugeridoPorCmv(x.fisico.valor, x.metaBp!, s).replace(/ = .*$/, '')}</span>
      {usar && x.precoCentavos !== s.centavos && (
        <button type="button" onClick={() => usar(s.centavos)} className={`mt-0.5 block min-h-8 w-full text-right text-[12px] ${LINK_DE_TEXTO}`}>
          usar {reais(s.centavos)}
        </button>
      )}
      {usar && s.cardapio !== s.centavos && s.cardapio <= LIMITES_DO_PRECO.centavos && x.precoCentavos !== s.cardapio && (
        <button type="button" onClick={() => usar(s.cardapio)} className={`block min-h-8 w-full text-right text-[12px] ${LINK_DE_TEXTO}`}>
          usar {reais(s.cardapio)}
        </button>
      )}
    </>
  );
}

/** O CMV ao preço definido, com o farol em palavra (nunca só a cor); sem dados diz o que falta. */
function Cmv({ x }: { x: CmvDoCanal }) {
  const st = STATUS_DO_CMV[x.status];
  return (
    <>
      {x.cmvBp ? <span className="text-[15px] font-semibold text-texto">{porcentagemDoCmv(x.cmvBp)}</span> : TRACO}
      <span className="mt-1 block">
        <Selo tom={st.tom}>{st.rotulo}</Selo>
      </span>
      {x.motivo && <span className="mt-1 block max-w-[12rem] whitespace-normal text-[12px] text-suave sm:ml-auto">{x.motivo}</span>}
    </>
  );
}

/** Resultado após os custos informados: R$ e %, e quais parcelas entraram. Pendente diz por quê. */
function Resultado({ x }: { x: CmvDoCanal }) {
  const r = x.resultado;
  if (r.tipo === 'pendente') return <span className="block max-w-[12rem] whitespace-normal text-[12px] text-suave sm:ml-auto">{r.motivo}</span>;
  const valor = r.negativo ? `−${formatarFracao({ num: -r.valor.num, den: r.valor.den })}` : formatarFracao(r.valor);
  return (
    <>
      <span className={`text-[15px] font-semibold ${r.negativo ? 'text-erro' : 'text-texto'}`}>{valor}</span>
      <span className="block text-[12px] text-suave">{porcentagemDoCmv(r.bp)} do preço</span>
      <span className="block max-w-[12rem] whitespace-normal text-[12px] text-suave sm:ml-auto">menos {parcelasEmTexto(x.canal, r.parcelas)}</span>
      {r.negativo && (
        <span className="mt-1 block">
          <Selo tom="erro" cheio>
            resultado negativo
          </Selo>
        </span>
      )}
    </>
  );
}

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
    const x = cmvDoCanal(e, { metaBp: dados.metasDeCmv[e.canal], precoCentavos: lido.ok ? lido.dados[e.canal] : null });
    return { x, c: camadasDoCanal(e), erro: lido.ok ? undefined : lido.erros[`preco-${e.canal}`], digitado: !!t };
  });
  const cmvs = contas.map((k) => k.x);
  const camadas = contas.map((k) => k.c);
  const linhas = linhasDasEmbalagens(camadas);
  const ifood = camadas.find((c) => c.canal === 'IFOOD')!;
  const semEmbalagem = camadas.filter((c) => c.canal !== 'LOJA' && c.embalagens.length === 0).map((c) => CANAIS[c.canal].rotulo);
  const configurar = podeConfigurar ? linkDosCanais : undefined;
  const mudar = (canal: CanalVenda, v: string) => setTextos((t) => ({ ...t, [canal]: v }));
  const usar = (canal: CanalVenda) => (centavos: number) => mudar(canal, dinheiroParaCampo(centavos));

  const campoDoPreco = (canal: CanalVenda, i: number, sufixo: string, largura: string) => {
    const k = contas[i];
    const id = `preco-${canal}${sufixo}`;
    const erro = erros[`preco-${canal}`] ?? k.erro;
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
            placeholder="0,00"
            onChange={(e) => mudar(canal, e.target.value)}
            className={`${CAMPO} min-h-11 text-right text-base font-semibold tabular-nums sm:text-sm`}
            aria-invalid={!!erro}
            aria-describedby={`${id}-ajuda${erro ? ` ${id}-erro` : ''}`}
          />
        </div>
        <span id={`${id}-ajuda`} className="mt-1 block text-[12px] text-suave">
          {k.digitado ? 'seu preço' : 'não definido'}
        </span>
        {erro && (
          <span id={`${id}-erro`} className="mt-0.5 block whitespace-normal text-[12px] text-erro">
            {erro}
          </span>
        )}
      </>
    );
  };

  const precoLido = (x: CmvDoCanal) =>
    x.precoCentavos !== null ? <span className="text-[15px] font-semibold text-texto">{reais(x.precoCentavos)}</span> : <span className="text-suave">não definido</span>;

  const th = 'h-10 px-3 text-right font-semibold';
  const td = 'whitespace-nowrap px-3 py-2.5 text-right align-top';
  const rotulo = 'py-2.5 pl-5 pr-3 text-left align-top font-medium text-texto';
  return (
    <Painel
      className={className}
      titulo="Preço e CMV por canal"
      subtitulo="Uma porção: o custo físico de cada canal, a meta de CMV, o preço e o que sobra depois dos custos informados"
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
        <caption className="sr-only">Custo físico, taxa, meta de CMV, preço, CMV e resultado de uma porção em cada canal de venda.</caption>
        <thead>
          <tr className="bg-forte text-[12px] text-suave">
            <th scope="col" className="h-10 pl-5 pr-3 text-left font-semibold">
              Uma porção
            </th>
            {cmvs.map((x) => (
              <th key={x.canal} scope="col" className={`${th} last:pr-5`}>
                {CANAIS[x.canal].curto}
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
                {c.insumosSemPreco.length > 0 && <span className="block text-[12px] text-atencao">+ custo não informado</span>}
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
          <tr className="border-t border-linha-forte">
            <th scope="row" className="h-11 py-2.5 pl-5 pr-3 text-left align-top font-semibold">
              Custo físico
              <span className="block text-[12px] font-normal text-suave">insumos + embalagens: a base do CMV</span>
            </th>
            {cmvs.map((x) => (
              <td key={x.canal} className={`${td} last:pr-5`}>
                <CustoFisico x={x} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Taxa do iFood
              <span className="block text-[12px] font-normal text-suave">
                {ifood.taxa.tipo === 'sobrePreco' ? `${contaDaTaxa(ifood.taxa.taxa)} · fora do CMV` : 'fora do CMV'}
              </span>
            </th>
            {camadas.map((c, i) => (
              <td key={c.canal} className={`${td} last:pr-5`}>
                <Taxa c={c} preco={cmvs[i].precoCentavos} linkDosCanais={configurar} />
              </td>
            ))}
          </tr>
        </tbody>
        <tbody className="tabular-nums">
          <tr className="border-t border-linha-forte bg-forte/50">
            <th scope="row" className={rotulo}>
              Meta de CMV
              <span className="block text-[12px] font-normal text-suave">custo físico, em % do preço</span>
            </th>
            {cmvs.map((x) => (
              <td key={x.canal} className={`${td} last:pr-5`}>
                <MetaDeCmv x={x} linkDosCanais={configurar} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Preço sugerido
              <span className="block text-[12px] font-normal text-suave">custo físico ÷ meta, para cima</span>
            </th>
            {cmvs.map((x) => (
              <td key={x.canal} className={`${td} last:pr-5`}>
                <Sugerido x={x} usar={editavel ? usar(x.canal) : undefined} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              Preço de venda
              <span className="block text-[12px] font-normal text-suave">o que você cobra</span>
            </th>
            {cmvs.map((x, i) => (
              <td key={x.canal} className={`${td} last:pr-5`}>
                {editavel ? campoDoPreco(x.canal, i, '', 'w-28') : precoLido(x)}
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              CMV
              <span className="block text-[12px] font-normal text-suave">custo físico ÷ preço de venda</span>
            </th>
            {cmvs.map((x) => (
              <td key={x.canal} className={`${td} last:pr-5`} aria-live="polite">
                <Cmv x={x} />
              </td>
            ))}
          </tr>
          <tr className="border-t border-linha">
            <th scope="row" className={rotulo}>
              {ROTULO_DO_RESULTADO}
              <span className="block text-[12px] font-normal text-suave">não é lucro líquido</span>
            </th>
            {cmvs.map((x) => (
              <td key={x.canal} className={`${td} last:pr-5`} aria-live="polite">
                <Resultado x={x} />
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Celular: um bloco por canal, as mesmas linhas. */}
      <ol className="divide-y divide-linha sm:hidden">
        {cmvs.map((x, i) => {
          const c = camadas[i];
          const st = STATUS_DO_CMV[x.status];
          return (
            <li key={x.canal} className="px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-texto">{CANAIS[x.canal].rotulo}</h3>
                <Selo tom={st.tom}>{st.rotulo}</Selo>
              </div>
              <dl className="mt-2 space-y-1.5 text-[13px] tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Insumos da receita</dt>
                  <dd>{formatarFracao(c.daFicha)}</dd>
                </div>
                {x.canal !== 'LOJA' && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-suave">
                      Embalagens
                      {c.embalagens.length ? ` (${c.embalagens.map((e) => `${e.nome} ${formatarQuantidade(e.quantidadeMilesimos, e.unidade)}`).join(', ')})` : ''}
                    </dt>
                    <dd className="shrink-0">{c.embalagens.length ? formatarFracao(c.embalagensTotal) : <span className="text-atencao">sem embalagem</span>}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-linha pt-1.5">
                  <dt className="font-medium text-texto">Custo físico</dt>
                  <dd className="text-right">
                    <CustoFisico x={x} />
                  </dd>
                </div>
                {c.taxa.tipo !== 'nenhuma' && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-suave">Taxa do iFood (fora do CMV)</dt>
                    <dd className="text-right">
                      <Taxa c={c} preco={x.precoCentavos} linkDosCanais={configurar} />
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Meta de CMV</dt>
                  <dd className="text-right">
                    <MetaDeCmv x={x} linkDosCanais={configurar} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">Preço sugerido</dt>
                  <dd className="text-right">
                    <Sugerido x={x} usar={editavel ? usar(x.canal) : undefined} />
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="pt-2.5 font-medium text-texto">Preço de venda</dt>
                  <dd className="text-right">{editavel ? campoDoPreco(x.canal, i, '-m', 'w-32') : precoLido(x)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-texto">CMV</dt>
                  <dd className="text-right">
                    <Cmv x={x} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-suave">{ROTULO_DO_RESULTADO}</dt>
                  <dd className="text-right">
                    <Resultado x={x} />
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t border-linha px-4 py-3 text-[12px] text-suave sm:px-5">
        {semEmbalagem.length > 0 && (
          <p className="text-atencao">
            {semEmbalagem.join(' e ')} sem embalagem cadastrada: se vai caixa ou sacola, o custo físico está baixo.
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
        <p>
          CMV aqui é o teórico do prato ao seu preço, não o CMV real do estoque nem o do DRE. A sugestão não vale como preço: sem preço definido, o canal fica
          sem dados. O resultado desconta só o que está listado; aluguel, equipe, impostos e outras despesas não entram.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <LinkDeAjuda secao="conta">Como a conta é feita</LinkDeAjuda>
          {editavel && (
            <div className="flex flex-col items-stretch gap-1 sm:items-end">
              <BotaoEnviar variante="secundario" className="sm:min-w-40">
                Salvar preços
              </BotaoEnviar>
              <span className="text-right">A conta é refeita na hora de salvar.</span>
            </div>
          )}
        </div>
        {linkDosCanais && (
          <p>
            <Link href={linkDosCanais} className={LINK_DE_TEXTO}>
              Metas de CMV e taxa em Precificação
            </Link>
          </p>
        )}
      </div>
    </Painel>
  );
}
