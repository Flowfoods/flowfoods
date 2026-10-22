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
