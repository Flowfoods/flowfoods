/**
 * Telas da precificação dentro da ficha técnica (1.9), comuns ao nível 1 e à
 * pessoa do parceiro: "Embalagens por canal" de uma ficha de prato e "Canais
 * de venda", a aba Precificação (como cada canal entra no custo + a taxa do iFood do parceiro). As
 * rotas só resolvem contexto e permissão e passam dados e actions prontos.
 */

import Link from 'next/link';
import type { CustoPorCanal, EmbalagemDoFormulario } from '@/lib/erp/canais';
import type { FichaDetalhada } from '@/lib/erp/fichas';
import type { LinhaDeHistorico } from '@/lib/erp/historico';
import { CANAIS, contaDaTaxa, ORDEM_DOS_CANAIS, taxaACadaDezReais, taxaSobrePreco, taxaTotalBp, type CanalVenda, type TaxaDoCanal } from '@/lib/erp/canal-campos';
import { formatarFracao, formatarPontosBase, pontosBaseParaCampo, quantidadeParaCampo, UNIDADES } from '@/lib/erp/unidades';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { TrilhaDaPagina } from '../../shell/trilha';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { Voltar } from '../cadastro/partes';
import { classeDeBotao } from '../../ui/estilos';
import { ListaHistorico } from '../historico/lista-historico';
import { fraseDoFeitoDaFicha } from './estado';
import { FormEmbalagens, type LinhaDaEmbalagem } from './form-embalagens';
import { FormTaxaDoIfood } from './form-taxa';
import { FormMargensAlvo } from './form-margens';

export function TelaEmbalagensDaFicha({
  ficha,
  canais,
  base,
  contexto,
  acao,
  opcoes,
  bloqueio,
  novoInsumo,
}: {
  ficha: FichaDetalhada;
  canais: CustoPorCanal;
  base: string;
  contexto: string;
  acao: AcaoDeCadastro;
  opcoes: EmbalagemDoFormulario[];
  bloqueio: string | null;
  novoInsumo?: string;
}) {
  const volta = `${base}/${ficha.id}`;
  const inicial: LinhaDaEmbalagem[] = canais.embalagens.map((e) => {
    const q = quantidadeParaCampo(e.quantidadeMilesimos, e.unidade);
    return { canal: e.canal, insumoId: e.insumoId, quantidade: q.texto, unidade: q.escala === 'menor' ? UNIDADES[e.unidade].menor : UNIDADES[e.unidade].sigla };
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: ficha.nome, href: volta }, { rotulo: 'Embalagens por canal' }]} />
      <Voltar href={volta}>Voltar para {ficha.nome}</Voltar>
      <PageHeader icone="canais" cor={COR.fichas} titulo="Embalagens por canal" subtitulo={`${contexto} · ${ficha.nome} · o que vai junto em cada porção`} />
      <FormEmbalagens
        acao={acao}
        aqui={`${base}/${ficha.id}/canais`}
        cancelar={volta}
        opcoes={opcoes}
        inicial={inicial}
        impressao={canais.impressao}
        porcao={{ num: ficha.custo.porRendimento.num.toString(), den: ficha.custo.porRendimento.den.toString() }}
        bloqueio={bloqueio}
        novoInsumo={novoInsumo}
      />
    </div>
  );
}

const O_QUE_ENTRA: Record<(typeof ORDEM_DOS_CANAIS)[number], string> = {
  LOJA: 'Insumos da receita',
  DELIVERY_PROPRIO: 'Insumos + embalagens do delivery (em cada ficha)',
  IFOOD: 'Insumos + embalagens do iFood (em cada ficha) + taxa',
};

export function TelaCanaisDeVenda({
  base,
  contexto,
  taxa,
  versao,
  historico,
  podeEditar,
  bloqueio,
  acao,
  feito,
  margens,
  versaoDasMargens,
  acaoMargens,
}: {
  /** Base das fichas. */
  base: string;
  contexto: string;
  taxa: TaxaDoCanal | null;
  versao: string;
  historico: LinhaDeHistorico[];
  /** Só quem muda preços (a dona) configura a taxa. */
  podeEditar: boolean;
  bloqueio: string | null;
  acao: AcaoDeCadastro;
  feito?: string;
  /** 1.10: margem-alvo (líquida) de cada canal e a versão lida. */
  margens: Record<CanalVenda, number | null>;
  versaoDasMargens: string;
  acaoMargens: AcaoDeCadastro;
}) {
  const mensagem = fraseDoFeitoDaFicha(feito);
  return (
    <div className="space-y-6">
      <PageHeader
        icone="canais"
        cor={COR.fichas}
        titulo="Precificação"
        subtitulo={`${contexto} · canais de venda: o que entra no custo do prato em cada um`}
        acao={
          // O preço e a margem de cada prato já estão na lista de fichas (só para quem vê preços): daqui é um clique.
          <Link href={`${base}?tipo=PRATO`} className={classeDeBotao('secundario')}>
            Margem de cada prato
          </Link>
        }
      />
      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Painel titulo="Como cada canal entra no custo" subtitulo="Vale para todas as fichas de prato; as embalagens e o preço se escolhem em cada ficha" semRespiro>
            <table className="w-full text-sm">
              <caption className="sr-only">Canais de venda: o que entra no custo e o que o canal cobra sobre o preço.</caption>
              <thead>
                <tr className="bg-forte text-left text-[12px] text-suave">
                  <th scope="col" className="h-10 pl-4 pr-3 font-semibold sm:pl-5">
                    Canal
                  </th>
                  <th scope="col" className="hidden h-10 px-3 font-semibold sm:table-cell">
                    O que entra no custo
                  </th>
                  <th scope="col" className="h-10 px-3 text-right font-semibold">
                    Sobre o preço
                  </th>
                  <th scope="col" className="h-10 pl-3 pr-4 text-right font-semibold sm:pr-5">
                    Margem-alvo
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORDEM_DOS_CANAIS.map((c) => (
                  <tr key={c} className="border-t border-linha align-top">
                    <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-medium text-texto sm:pl-5">
                      {CANAIS[c].rotulo}
                      <span className="block text-[12px] font-normal text-suave sm:hidden">{O_QUE_ENTRA[c]}</span>
                    </th>
                    <td className="hidden px-3 py-2.5 text-suave sm:table-cell">{O_QUE_ENTRA[c]}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                      {c !== 'IFOOD' ? (
                        <span className="text-suave">nada</span>
                      ) : taxa ? (
                        <span className="font-semibold text-texto">{formatarPontosBase(taxaTotalBp(taxa))}</span>
                      ) : (
                        <Selo tom="alerta">Não configurada</Selo>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right tabular-nums sm:pr-5">
                      {margens[c] === null ? <span className="text-suave">sem alvo</span> : <span className="font-semibold text-texto">{formatarPontosBase(margens[c]!)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Painel>

          <Painel titulo="Taxa do iFood" subtitulo="Está no seu contrato com o iFood: o plano (comissão) e o pagamento pelo app">
            {podeEditar ? (
              <FormTaxaDoIfood
                acao={acao}
                aqui={`${base}/canais`}
                versao={versao}
                inicial={{
                  comissao: taxa ? pontosBaseParaCampo(taxa.comissaoBp) : '',
                  pagamento: taxa && taxa.pagamentoBp ? pontosBaseParaCampo(taxa.pagamentoBp) : '',
                }}
                bloqueio={bloqueio}
                variante="secundario"
              />
            ) : taxa ? (
              <p className="text-[15px] tabular-nums text-texto">
                {contaDaTaxa(taxa)}. A cada R$ 10,00 de venda, {taxaACadaDezReais(taxaTotalBp(taxa))} ficam com o iFood.
              </p>
            ) : (
              <p className="text-[15px] text-texto">Ainda não configurada: o custo do iFood fica incompleto. Quem cuida dos preços configura aqui.</p>
            )}
            <p className="mt-4 border-t border-linha pt-3 text-[12px] text-suave">
              As duas porcentagens são sobre o preço do prato. Mensalidade do plano e taxa de entrega não entram aqui: são do mês e do pedido, não do prato.
              {taxa ? ` Se vender a R$ 30,00 no iFood, ${formatarFracao(taxaSobrePreco(3000, taxaTotalBp(taxa)))} ficam com ele.` : ''}
            </p>
          </Painel>

          <Painel titulo="Margem-alvo por canal" subtitulo="O que deve sobrar do preço depois do custo e da taxa: o preço sugerido de cada ficha persegue isso">
            {podeEditar ? (
              <FormMargensAlvo acao={acaoMargens} aqui={`${base}/canais`} versao={versaoDasMargens} inicial={margens} taxa={taxa} bloqueio={bloqueio} />
            ) : (
              <p className="text-[15px] tabular-nums text-texto">
                {ORDEM_DOS_CANAIS.map((c) => `${CANAIS[c].rotulo}: ${margens[c] === null ? 'sem alvo' : formatarPontosBase(margens[c]!)}`).join(' · ')}. Quem cuida dos preços muda aqui.
              </p>
            )}
          </Painel>
        </div>
        <aside className="min-w-0" aria-label="Alterações da taxa">
          <Painel titulo="Últimas alterações" semRespiro>
            {historico.length === 0 ? <Vazio>Nada registrado ainda.</Vazio> : <ListaHistorico linhas={historico} compacta doCadastro="Canais de venda" />}
          </Painel>
        </aside>
      </div>
    </div>
  );
}
