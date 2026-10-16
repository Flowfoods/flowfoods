// Scanner avoid-ai-design, SD4d (P2) aceito: "Ingrediente · Seco" e "3 kg · R$ 115,00" seguem o subtítulo do contrato ("Rede Completa · N insumos") como linha de apoio da tabela densa. (O ignore do scanner não aceita id com minúscula.)
/**
 * Detalhe do insumo (1.1), o MESMO para o nível 1 e para a pessoa do parceiro:
 * custo de referência com a conta por extenso, as embalagens de compra (a
 * padrão e as outras) com qual sai mais barata, situação e as últimas
 * alterações. Quem não edita só lê: nenhum botão aparece. Parceiro bloqueado:
 * os botões aparecem desabilitados, com o motivo.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { InsumoDetalhado } from '@/lib/erp/insumos';
import { compararEmbalagens, CONSERVACOES, TIPOS } from '@/lib/erp/insumo-campos';
import { COR } from '@/lib/erp/modulos';
import { UNIDADES, contaDoCusto, formatarCusto, formatarDinheiro, formatarQuantidade, valorDoCusto } from '@/lib/erp/unidades';
import { PageHeader } from '../../ui/cabecalho';
import { classeDeBotao, LINK_DE_TEXTO, type Variante } from '../../ui/estilos';
import { Aviso, Painel, Selo, Vazio } from '../../ui/superficies';
import { ListaHistorico } from '../historico/lista-historico';
import { fraseDoFeito, type AcaoDeInsumo } from './estado';
import { FormSituacao } from './form-situacao';
import { TrilhaDaPagina } from '../../shell/trilha';

/** Link com cara de botão; bloqueado, vira botão desabilitado com o motivo. */
export function BotaoOuMotivo({
  href,
  bloqueio,
  variante = 'secundario',
  className = '',
  children,
}: {
  href: string;
  bloqueio: string | null;
  variante?: Variante;
  className?: string;
  children: ReactNode;
}) {
  if (bloqueio) {
    return (
      <button type="button" disabled title={bloqueio} className={classeDeBotao(variante, className)}>
        {children}
        <span className="sr-only"> (indisponível: {bloqueio})</span>
      </button>
    );
  }
  return (
    <Link href={href} className={classeDeBotao(variante, className)}>
      {children}
    </Link>
  );
}

export function TelaDetalheInsumo({
  insumo: i,
  base,
  voltar,
  feito,
  contexto,
  podeEditar,
  bloqueio,
  acaoSituacao,
}: {
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
  acaoSituacao: AcaoDeInsumo;
}) {
  const u = UNIDADES[i.unidade];
  const aqui = `${base}/${i.id}`;
  const ativas = i.variantes.filter((v) => v.ativo);
  const comparacao = i.ativo
    ? compararEmbalagens(
        [{ nome: 'Padrão', custo: i.custo }, ...ativas.map((v) => ({ nome: v.nome, custo: v.custo }))],
        i.unidade,
      )
    : null;
  // `feito` vem da URL: só chave própria do mapa (nada de __proto__/constructor).
  const mensagem = fraseDoFeito(feito);

  const embalagens = [
    {
      id: null,
      nome: 'Padrão',
      padrao: true,
      conteudoMilesimos: i.conteudoMilesimos,
      precoEmbalagemCentavos: i.precoEmbalagemCentavos,
      taxaEntregaCentavos: i.taxaEntregaCentavos,
      custo: i.custo,
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
        subtitulo={[contexto, TIPOS[i.tipo], CONSERVACOES[i.conservacao], `medido em ${u.nome.toLowerCase()}`]
          .filter(Boolean)
          .join(' · ')}
        acao={
          podeEditar && i.ativo ? (
            <BotaoOuMotivo href={`${aqui}/editar`} bloqueio={bloqueio} variante="primario">
              Editar insumo
            </BotaoOuMotivo>
          ) : undefined
        }
      />

      {mensagem && <Aviso tom="ok" titulo={mensagem} />}
      {/* Recém-desativado: a frase do "feito" já diz isso; não repetir. */}
      {!i.ativo && feito !== 'desativado' && (
        <Aviso tom="alerta" titulo="Insumo desativado.">
          Fica fora da lista padrão e da busca, com o histórico guardado.
          {podeEditar ? ' Para editar, reative primeiro.' : ''}
        </Aviso>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Painel titulo="Custo de referência">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <div className={`font-display text-[32px] font-bold leading-none ${i.custo === null ? 'text-atencao' : ''}`}>
                {formatarCusto(i.custo, i.unidade)}
              </div>
              <p className="text-sm tabular-nums text-suave">{contaDoCusto(i)}</p>
            </div>
            <p className="mt-3 border-t border-linha pt-3 text-[12px] text-suave">
              Pelo preço da embalagem padrão. O custo pelas compras de verdade (última nota) chega em breve, em Compras.
            </p>
          </Painel>

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
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Situação e alterações">
          {podeEditar && (
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
              <ListaHistorico linhas={i.historico} compacta doInsumo={i.nome} />
            )}
          </Painel>
        </aside>
      </div>
    </div>
  );
}
