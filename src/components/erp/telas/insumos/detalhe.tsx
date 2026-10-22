// Scanner avoid-ai-design, SD4d (P2) aceito: "Ingrediente · Seco" e "3 kg · R$ 115,00" seguem o subtítulo do contrato ("Rede Completa · N insumos") como linha de apoio da tabela densa. (O ignore do scanner não aceita id com minúscula.)
/**
 * Detalhe do insumo (1.1), o MESMO para o nível 1 e para a pessoa do parceiro:
 * custo de referência com a conta por extenso, as embalagens de compra (a
 * padrão e as outras) com qual sai mais barata, situação e as últimas
 * alterações. Quem não edita só lê: nenhum botão aparece. Parceiro bloqueado:
 * os botões aparecem desabilitados, com o motivo.
 */

import Link from 'next/link';
import type { InsumoDetalhado } from '@/lib/erp/insumos';
import { compararEmbalagens, CONSERVACOES, TIPOS } from '@/lib/erp/insumo-campos';
import { temValidade } from '@/lib/erp/validade';
import { IconeDaConservacao, ValidadesDoItem } from '../cadastro/validade';
import { COR } from '@/lib/erp/modulos';
import { UNIDADES, contaDoCusto, formatarCusto, formatarDinheiro, formatarFracao, formatarQuantidade, valorDoCusto } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { ListaHistorico } from '../historico/lista-historico';
import type { AcaoDeCadastro } from '../cadastro/estado';
import { FormSituacao } from '../cadastro/form-situacao';
import { BotaoOuMotivo } from '../cadastro/partes';
import { fraseDoFeito, fraseDoSalvo } from './estado';
import { AvisoDeSalvo } from '../cadastro/anuncio';
import { COMO_CLASSIFICOU } from '@/lib/erp/categoria-campos';
import { TrilhaDaPagina } from '../../shell/trilha';
import { PrecosPagos } from './precos-pagos';
import { PainelEstoqueDoInsumo } from '../estoque/saldo-do-insumo';
import type { SaldoDoInsumoNaLoja } from '@/lib/erp/estoque';
import { formatarData } from '@/lib/erp/compra-campos';

export function TelaDetalheInsumo({
  insumo: i,
  base,
  voltar,
  feito,
  contexto,
  podeEditar,
  bloqueio,
  acaoSituacao,
  linkDaNota,
  estoque,
}: {
  /** 1.6: o saldo nas lojas em que a pessoa vê o estoque (vazio = painel não aparece). */
  estoque?: { saldos: SaldoDoInsumoNaLoja[]; base: string };
  /**
   * 1.5: link para a nota de compra, para quem vê compras naquela loja (null =
   * a pessoa vê o preço, que é custo da rede, mas não a nota).
   */
  linkDaNota?: (notaId: string, lojaId: string) => string | null;
  insumo: InsumoDetalhado;
  base: string;
  /** A lista como a pessoa deixou (filtros e página). */
  voltar: string;
  /** `?feito=` depois de gravar. */
  feito?: string;
  /** Antes do tipo no subtítulo (o N1 põe o nome do parceiro). */
  contexto?: string;
  podeEditar: boolean;
  bloqueio: string | null;
  acaoSituacao: AcaoDeCadastro;
}) {
  const u = UNIDADES[i.unidade];
  const aqui = `${base}/${i.id}`;
  const uc = i.ultimaCompra;
  const ud = uc?.detalhe ?? null;
  const notaDaUltima = ud && linkDaNota ? linkDaNota(ud.notaId, ud.lojaId) : null;
  // Pré-preparo (1.3): nome, unidade, situação e custo vêm da ficha técnica; aqui só se lê.
  const p = i.preparo;
  const fichas = base.replace(/insumos$/, 'fichas');
  const editaAqui = podeEditar && !p;
  const ativas = i.variantes.filter((v) => v.ativo);
  const comparacao = i.ativo
    ? compararEmbalagens(
        [{ nome: 'Padrão', custo: i.custoCadastrado }, ...ativas.map((v) => ({ nome: v.nome, custo: v.custo }))],
        i.unidade,
      )
    : null;
  // `feito` vem da URL: só chave própria do mapa (nada de __proto__/constructor).
  const mensagem = fraseDoFeito(feito);
  // I.1a: criado e editado dizem O QUE foi salvo, com o nome lido do banco (nunca da URL).
  const salvo = fraseDoSalvo(feito, i.nome);

  const embalagens = [
    {
      id: null,
      nome: 'Padrão',
      padrao: true,
      conteudoMilesimos: i.conteudoMilesimos,
      precoEmbalagemCentavos: i.precoEmbalagemCentavos,
      taxaEntregaCentavos: i.taxaEntregaCentavos,
      // Na comparação de embalagens vale o preço CADASTRADO (o da compra está no painel de custo).
      custo: i.custoCadastrado,
      ativo: true,
      codigoBarras: null as string | null,
    },
    ...i.variantes.map((v) => ({ ...v, padrao: false })),
  ];

  return (
    <div className="space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: i.nome }]} />
      <Link href={voltar} className={`${LINK_DE_TEXTO} inline-flex min-h-11 items-center sm:min-h-0`}>
        Voltar para a lista
      </Link>
      <PageHeader
        icone="insumo"
        cor={COR.insumo}
        titulo={i.nome}
        subtitulo={[contexto, TIPOS[i.tipo], i.categoria?.nome ?? 'sem categoria', p && !temValidade(i.validades) ? null : CONSERVACOES[i.conservacao], `medido em ${u.nome.toLowerCase()}`]
          .filter(Boolean)
          .join(' · ')}
        acao={
          editaAqui && i.ativo ? (
            <BotaoOuMotivo href={`${aqui}/editar`} bloqueio={bloqueio} variante="primario">
              Editar insumo
            </BotaoOuMotivo>
          ) : p && podeEditar ? (
            <Link href={`${fichas}/${p.fichaId}`} className={classeDeBotao('secundario')}>
              Abrir a ficha técnica
            </Link>
          ) : undefined
        }
      />

      {salvo && (
        <AvisoDeSalvo titulo={salvo.titulo} apoio={salvo.apoio}>
          {salvo.criou && podeEditar && !bloqueio && (
            <Link href={`${base}/novo`} className={classeDeBotao('secundario')}>
              Cadastrar outro insumo
            </Link>
          )}
          <Link href={voltar} className={classeDeBotao('fantasma')}>
            Ver todos os insumos
          </Link>
        </AvisoDeSalvo>
      )}
      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {/* Recém-desativado: a frase do "feito" já diz isso; não repetir. */}
      {!i.ativo && feito !== 'desativado' && (
        <Aviso tom="alerta" titulo="Insumo desativado.">
          Fica fora da lista padrão e da busca, com o histórico guardado.
          {p ? ' Ele acompanha a ficha técnica: reative a ficha.' : podeEditar ? ' Para editar, reative primeiro.' : ''}
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {p ? (
            <Painel titulo="Custo (vem da ficha técnica)">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className={`font-display text-[32px] font-bold leading-none tabular-nums ${p.incompleto ? 'text-atencao' : ''}`}>
                    {formatarFracao(p.porUnidade)}/{u.sigla}
                  </span>
                  {p.incompleto && <Selo tom="alerta">Custo incompleto</Selo>}
                </div>
                <p className="text-sm tabular-nums text-suave">{p.conta}</p>
              </div>
              <p className="mt-3 border-t border-linha pt-3 text-[12px] text-suave">
                Pré-preparo da casa: o custo é o da receita{' '}
                <Link href={`${fichas}/${p.fichaId}`} className={LINK_DE_TEXTO}>
                  {p.nome}
                </Link>{' '}
                dividido pelo que ela rende. Mudou a receita ou o preço de um insumo dela, este custo muda junto. Não tem embalagem de compra.
              </p>
            </Painel>
          ) : (
            <>
          <Painel titulo="Custo de referência" subtitulo={uc ? 'Último preço pago' : 'Preço cadastrado da embalagem padrão'}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className={`font-display text-[32px] font-bold leading-none ${i.custo === null ? 'text-atencao' : ''}`}>
                {formatarCusto(i.custo, i.unidade)}
              </div>
              <p className="text-sm tabular-nums text-suave">
                {ud
                  ? contaDoCusto({ precoEmbalagemCentavos: ud.valorCentavos, taxaEntregaCentavos: ud.freteCentavos, conteudoMilesimos: ud.quantidadeMilesimos, unidade: i.unidade })
                  : uc
                    ? `Pela compra de ${formatarData(uc.entradaEm)}`
                    : contaDoCusto(i)}
              </p>
            </div>
            <p className="mt-3 border-t border-linha pt-3 text-[12px] text-suave">
              {uc && ud ? (
                <>
                  Último preço: {formatarCusto(uc.custo, i.unidade)} em {formatarData(uc.entradaEm, true)} (
                  {notaDaUltima ? (
                    <Link href={notaDaUltima} className={LINK_DE_TEXTO}>
                      nota {ud.numero}
                    </Link>
                  ) : (
                    `nota ${ud.numero}`
                  )}
                  , {ud.fornecedor ?? 'sem fornecedor'}
                  {ud.lojaNome ? `, ${ud.lojaNome}` : ''}). É o que as fichas usam; o preço cadastrado ({formatarCusto(i.custoCadastrado, i.unidade)}) só vale sem nota.
                </>
              ) : uc ? (
                <>
                  Último preço pago na rede, em {formatarData(uc.entradaEm, true)}: é o que as fichas usam. A nota é de uma loja fora do seu acesso a compras.
                </>
              ) : (
                'Pelo preço cadastrado. Quando houver nota de compra lançada, vale o último preço pago.'
              )}
            </p>
          </Painel>

          <PrecosPagos insumo={i} linkDaNota={linkDaNota} />

          {estoque && <PainelEstoqueDoInsumo saldos={estoque.saldos} unidade={i.unidade} estoqueBase={estoque.base} />}

          <Painel
            titulo="Embalagens de compra"
            semRespiro
            acessorio={
              podeEditar && i.ativo ? (
                <BotaoOuMotivo href={`${aqui}/embalagens/nova`} bloqueio={bloqueio} className="sm:min-h-9">
                  Nova embalagem
                </BotaoOuMotivo>
              ) : undefined
            }
          >
            <ul className="divide-y divide-linha">
              {embalagens.map((e) => {
                const linha = (
                  <>
                    <span className="min-w-0">
                      <span className={`flex items-center gap-2 font-medium ${e.ativo ? 'text-texto' : 'text-suave'}`}>
                        <span className="truncate">{e.padrao ? 'Embalagem padrão' : e.nome}</span>
                        {!e.ativo && <Selo>Desativada</Selo>}
                      </span>
                      <span className="block text-[12px] tabular-nums text-suave">
                        {formatarQuantidade(e.conteudoMilesimos, i.unidade)}
                        {' · '}
                        {e.precoEmbalagemCentavos > 0 ? formatarDinheiro(e.precoEmbalagemCentavos) : 'sem preço'}
                        {e.taxaEntregaCentavos > 0 && ` + ${formatarDinheiro(e.taxaEntregaCentavos)} frete`}
                        {e.codigoBarras && ` · código ${e.codigoBarras}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm tabular-nums">
                      {e.custo === null ? (
                        <Selo tom="alerta">Sem preço</Selo>
                      ) : (
                        <>
                          <span className="font-semibold text-texto">{valorDoCusto(e.custo)}</span>
                          <span className="ml-0.5 text-[12px] text-suave">/{u.sigla}</span>
                        </>
                      )}
                    </span>
                  </>
                );
                const editavel = podeEditar && i.ativo && !e.padrao && !bloqueio;
                return (
                  <li key={e.id ?? 'padrao'}>
                    {editavel ? (
                      <Link
                        href={`${aqui}/embalagens/${e.id}`}
                        aria-label={`Editar a embalagem ${e.nome}`}
                        className="ff-transicao flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-texto/[0.03] sm:px-5"
                      >
                        {linha}
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 sm:px-5">{linha}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-linha px-4 py-3 text-[13px] text-suave sm:px-5">
              {comparacao ??
                (i.variantes.length === 0
                  ? 'Só a embalagem padrão. Cadastre outra (caixa, fardo, outra marca) para comparar o custo.'
                  : 'Compare quando houver duas embalagens ativas.')}
              {podeEditar && i.ativo && i.variantes.length > 0 && !bloqueio && ' Toque numa embalagem para editar.'}
            </p>
          </Painel>
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Validade, situação e alterações">
          <Painel titulo="Categoria" subtitulo="A natureza do insumo para o CMV">
            {i.categoria ? (
              <div className="space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-texto">{i.categoria.nome}</span>
                  {!i.categoria.ativa && <Selo>Categoria desativada</Selo>}
                  {i.categoria.chave === 'OUTROS' && <Selo tom="alerta">A classificar</Selo>}
                </p>
                {i.classificadoPor && <p className="text-[12px] text-suave">Classificação: {COMO_CLASSIFICOU[i.classificadoPor] ?? i.classificadoPor}.</p>}
                {i.classificacaoMotivo && <p className="text-[12px] text-suave">{i.classificacaoMotivo}</p>}
              </div>
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Selo tom="alerta">Sem categoria</Selo>
                <span className="text-suave">Ainda não foi classificado.</span>
              </p>
            )}
            <p className="mt-2 text-[12px] text-suave">
              Não é onde o insumo fica guardado nem a conservação: coxa de frango é Proteína, mesmo congelada.
              {editaAqui && i.ativo && !bloqueio && (
                <>
                  {' '}
                  <Link href={`${aqui}/editar#insumo-categoriaId`} className={LINK_DE_TEXTO}>
                    {i.categoria ? 'Mudar a categoria' : 'Escolher a categoria'}
                  </Link>
                  .
                </>
              )}
            </p>
          </Painel>
          <Painel
            titulo={p ? 'Onde fica e quanto dura' : 'Onde guarda e quanto dura'}
            subtitulo={p ? undefined : 'Validade depois de aberto ou manipulado'}
          >
            <ValidadesDoItem
              validades={i.validades}
              vazio={
                p ? (
                  <span className="text-atencao">A ficha técnica ainda não diz a validade.</span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    <IconeDaConservacao conservacao={i.conservacao} />
                    <span>
                      <span className="text-texto">{CONSERVACOES[i.conservacao]}</span> · validade depois de aberto não informada.
                    </span>
                  </span>
                )
              }
            />
            <p className="mt-2 text-[12px] text-suave">
              {p ? (
                <>
                  Vem da ficha técnica{' '}
                  <Link href={`${fichas}/${p.fichaId}`} className={LINK_DE_TEXTO}>
                    {p.nome}
                  </Link>
                  .
                </>
              ) : (
                'A validade do fabricante vem no lote de cada compra.'
              )}
            </p>
          </Painel>
          {editaAqui && (
            <Painel titulo="Situação">
              {bloqueio ? (
                <p className="text-sm text-suave">{bloqueio}</p>
              ) : (
                <FormSituacao acao={acaoSituacao} ativo={i.ativo} oQue="insumo" idBase="situacao-insumo" />
              )}
            </Painel>
          )}
          <Painel titulo="Últimas alterações" semRespiro>
            {i.historico.length === 0 ? (
              <Vazio>Nada registrado ainda.</Vazio>
            ) : (
              <ListaHistorico linhas={i.historico} compacta doCadastro={i.nome} />
            )}
          </Painel>
        </aside>
      </div>
    </div>
  );
}
