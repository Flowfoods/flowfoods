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

export function AvisoDaClassificacao({ resumo, href }: { resumo: ResumoDoQueFalta; /** Onde se classifica (só para quem edita insumos). */ href?: string }) {
  if (resumo.total === 0) return null;
  const partes = [
    resumo.semCategoria > 0 ? `${resumo.semCategoria} sem categoria` : null,
    resumo.emOutros > 0 ? `${resumo.emOutros} em Outros / a classificar` : null,
  ].filter(Boolean);
  return (
    <Aviso tom="alerta" titulo={`${plural(resumo.total, 'insumo ativo ainda sem categoria definitiva', 'insumos ativos ainda sem categoria definitiva')}.`}>
      {partes.join(' · ')}
      {resumo.valorCentavos !== null && ` · ${formatarDinheiro(resumo.valorCentavos)} em estoque nas lojas que você acessa`}
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
 * I.1b: "N insumos com a conservação a confirmar". Até a I.1a o servidor assumia Seco quando ninguém escolhia; o que ficou em Seco
 * numa categoria que costuma ser fria (Proteína, Laticínios, Hortifruti) pode estar certo ou ser esse padrão antigo. Nada foi
 * alterado: o aviso só leva à lista desses insumos, para uma pessoa conferir.
 */
export function AvisoConservacaoAConfirmar({ quantos, base, jaFiltrado }: { quantos: number; base: string; jaFiltrado: boolean }) {
  if (quantos === 0) return null;
  return (
    <Aviso tom="alerta" titulo={`${plural(quantos, 'insumo ativo com a conservação a confirmar', 'insumos ativos com a conservação a confirmar')}.`}>
      Estão em Seco e ninguém confirmou, em categorias que costumam ficar no frio. Nada foi alterado.{' '}
      {!jaFiltrado && (
        <Link href={`${base}?conservacao=confirmar`} className={LINK_DE_TEXTO}>
          Ver quais são
        </Link>
      )}
    </Aviso>
  );
}
