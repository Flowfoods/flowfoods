/**
 * L.1 — O aviso no alto da LISTA depois de editar (caneta da linha), desativar, reativar ou excluir. O nome vem do BANCO (do
 * insumo, ou do histórico "Excluiu" quando ele não existe mais); a URL só ESCOLHE uma frase do mapa e um id. Nada de texto livre
 * da URL na tela. A região viva é preenchida depois da montagem e o aviso não some sozinho (`AvisoDeSalvo`).
 */

import Link from 'next/link';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { queryDosFiltros, type FiltrosDeInsumo } from '@/lib/erp/insumo-campos';
import { classeDeBotao } from '../../ui/estilos';
import { AvisoDeSalvo } from '../cadastro/anuncio';

const ID = /^[A-Za-z0-9_-]{8,40}$/;

export const FEITO_DA_LISTA = ['editado', 'igual', 'desativado', 'reativado', 'excluido'] as const;
type Feito = (typeof FEITO_DA_LISTA)[number];

const eFeito = (v: unknown): v is Feito => typeof v === 'string' && (FEITO_DA_LISTA as readonly string[]).includes(v);

async function nomeDoAviso(cliente: ClienteDoParceiro, feito: Feito, id: string): Promise<string | null> {
  if (feito === 'excluido') {
    const h = await cliente.historicoAlteracao.findFirst({
      where: { entidade: 'Insumo', entidadeId: id, acao: 'EXCLUIU' },
      orderBy: { ocorridoEm: 'desc' },
      select: { antes: true },
    });
    const antes = h?.antes;
    return antes && typeof antes === 'object' && !Array.isArray(antes) && typeof (antes as Record<string, unknown>).nome === 'string' ? ((antes as Record<string, unknown>).nome as string) : null;
  }
  return (await cliente.insumo.findUnique({ where: { id }, select: { nome: true } }))?.nome ?? null;
}

export async function AvisoDaListaDeInsumos({
  cliente,
  base,
  filtros,
  feito,
  referencia,
  podeEditar,
}: {
  cliente: ClienteDoParceiro;
  base: string;
  filtros: FiltrosDeInsumo;
  feito: string | string[] | undefined;
  referencia: string | string[] | undefined;
  podeEditar: boolean;
}) {
  const f = Array.isArray(feito) ? feito[0] : feito;
  const ref = Array.isArray(referencia) ? referencia[0] : referencia;
  if (!eFeito(f) || !ref || !ID.test(ref)) return null;
  const nome = await nomeDoAviso(cliente, f, ref);
  if (!nome) return null;
  const q = queryDosFiltros(filtros);
  const de = q ? `de=${encodeURIComponent(q)}` : '';
  const detalhe = `${base}/${ref}${de ? `?${de}` : ''}`;
  const frases: Record<Feito, { titulo: string; apoio?: string }> = {
    editado: { titulo: `Insumo atualizado com sucesso: ${nome}`, apoio: 'O antes e o depois estão em Últimas alterações, no detalhe do insumo.' },
    igual: { titulo: `Nada mudou em ${nome}`, apoio: 'Os valores já eram esses.' },
    desativado: {
      titulo: `Insumo desativado: ${nome}`,
      apoio: 'Ele saiu da lista padrão e da busca. Ficha, nota, estoque e histórico continuam como estão. Para vê-lo, escolha Desativados ou Todos em Situação.',
    },
    reativado: { titulo: `Insumo reativado: ${nome}` },
    excluido: { titulo: `Insumo excluído: ${nome}`, apoio: 'O cadastro foi apagado de vez. O histórico guarda quem excluiu e quando.' },
  };
  const { titulo, apoio } = frases[f];
  const comAcoes = f !== 'excluido';
  return (
    <AvisoDeSalvo titulo={titulo} apoio={apoio}>
      {comAcoes && podeEditar && (f === 'editado' || f === 'igual') && (
        <Link href={`${base}/${ref}/editar?${de ? `${de}&` : ''}origem=lista`} className={classeDeBotao('secundario')}>
          Continuar editando
        </Link>
      )}
      {comAcoes && (
        <Link href={detalhe} className={classeDeBotao('secundario')}>
          Ver o insumo
        </Link>
      )}
      {f === 'desativado' && (
        <Link href={`${base}?${queryDosFiltros({ ...filtros, situacao: 'desativados', pagina: 1 })}`} className={classeDeBotao('secundario')}>
          Ver os desativados
        </Link>
      )}
    </AvisoDeSalvo>
  );
}
