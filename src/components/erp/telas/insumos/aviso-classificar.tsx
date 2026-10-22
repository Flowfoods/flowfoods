/**
 * I.1a: "N insumos ainda sem categoria definitiva", no alto da lista de Insumos e na tela de Classificar. A contagem e o valor
 * em estoque que ainda não estão em categoria nenhuma (ou estão em "Outros / a classificar") são o que impede o CMV por
 * categoria de ser confiável: ficam à vista até a fila zerar. O valor só aparece para quem vê o estoque de alguma loja.
 */

import Link from 'next/link';
import type { ResumoDoQueFalta } from '@/lib/erp/classificar';
import { formatarDinheiro } from '@/lib/erp/unidades';
import { Aviso } from '../../ui/superficies';
import { LINK_DE_TEXTO } from '../../ui/estilos';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Sem saldo é "sem saldo", nunca R$ 0,00 (igual à fila de classificar). */
export const textoDoEstoque = (valorCentavos: number) => (valorCentavos > 0 ? `${formatarDinheiro(valorCentavos)} em estoque nas lojas que você acessa` : 'sem saldo');

export function AvisoDaClassificacao({ resumo, href }: { resumo: ResumoDoQueFalta; /** Onde se classifica (só para quem edita insumos). */ href?: string }) {
  if (resumo.total === 0) return null;
  const partes = [
    resumo.semCategoria > 0 ? `${resumo.semCategoria} sem categoria` : null,
    resumo.emOutros > 0 ? `${resumo.emOutros} em Outros / a classificar` : null,
  ].filter(Boolean);
  return (
    <Aviso tom="alerta" titulo={`${plural(resumo.total, 'insumo ativo ainda sem categoria definitiva', 'insumos ativos ainda sem categoria definitiva')}.`}>
      {partes.join(' · ')}
      {resumo.valorCentavos !== null && ` · ${textoDoEstoque(resumo.valorCentavos)}`}
      {'. '}
      {href && (
        <Link href={href} className={LINK_DE_TEXTO}>
          Classificar agora
        </Link>
      )}
    </Aviso>
  );
}

/**
 * I.1b: os dois avisos do alto da lista de Insumos (sem categoria definitiva e conservação a confirmar) num só, para não empilhar
 * duas caixas laranja. Cada linha continua dizendo o seu assunto e levando ao seu caminho.
 */
export function AvisosDaLista({
  resumo,
  hrefClassificar,
  aConfirmar,
  base,
  jaFiltrado,
}: {
  resumo: ResumoDoQueFalta;
  hrefClassificar?: string;
  aConfirmar: number;
  base: string;
  jaFiltrado: boolean;
}) {
  if (resumo.total === 0 && aConfirmar === 0) return null;
  const partes = [
    resumo.semCategoria > 0 ? `${resumo.semCategoria} sem categoria` : null,
    resumo.emOutros > 0 ? `${resumo.emOutros} em Outros / a classificar` : null,
  ].filter(Boolean);
  const titulo =
    resumo.total > 0 && aConfirmar > 0
      ? 'O cadastro tem pendências.'
      : resumo.total > 0
        ? `${plural(resumo.total, 'insumo ativo ainda sem categoria definitiva', 'insumos ativos ainda sem categoria definitiva')}.`
        : `${plural(aConfirmar, 'insumo ativo com a conservação a confirmar', 'insumos ativos com a conservação a confirmar')}.`;
  return (
    <Aviso tom="alerta" titulo={titulo}>
      <span className="block space-y-1">
        {resumo.total > 0 && (
          <span className="block">
            {resumo.total > 0 && aConfirmar > 0 && `${plural(resumo.total, 'insumo ainda sem categoria definitiva', 'insumos ainda sem categoria definitiva')}: `}
            {partes.join(' · ')}
            {resumo.valorCentavos !== null && ` · ${textoDoEstoque(resumo.valorCentavos)}`}
            {'. '}
            {hrefClassificar && (
              <Link href={hrefClassificar} className={LINK_DE_TEXTO}>
                Classificar agora
              </Link>
            )}
          </span>
        )}
        {aConfirmar > 0 && (
          <span className="block">
            {resumo.total > 0 && `${plural(aConfirmar, 'insumo com a conservação a confirmar', 'insumos com a conservação a confirmar')}: `}
            Estão em Seco e ninguém confirmou, em categorias que costumam ficar no frio. Nada foi alterado.{' '}
            {!jaFiltrado && (
              <Link href={`${base}?conservacao=confirmar`} className={LINK_DE_TEXTO}>
                Ver quais são
              </Link>
            )}
          </span>
        )}
      </span>
    </Aviso>
  );
}
