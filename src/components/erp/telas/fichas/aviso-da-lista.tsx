/**
 * F4 — o aviso no alto da lista de fichas depois de desativar (lixeira da linha). O nome vem do BANCO; a URL só ESCOLHE uma
 * frase do mapa e um id. Nada de texto livre da URL na tela.
 */

import Link from 'next/link';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import { queryDosFiltrosDeFicha, type FiltrosDeFicha } from '@/lib/erp/ficha-campos';
import { classeDeBotao } from '../../ui/estilos';
import { AvisoDeSalvo } from '../cadastro/anuncio';

const ID = /^[A-Za-z0-9_-]{8,40}$/;
const FEITOS = ['desativada', 'reativada'] as const;
type Feito = (typeof FEITOS)[number];
const eFeito = (v: unknown): v is Feito => typeof v === 'string' && (FEITOS as readonly string[]).includes(v);

export async function AvisoDaListaDeFichas({
  cliente,
  base,
  filtros,
  feito,
  referencia,
}: {
  cliente: ClienteDoParceiro;
  base: string;
  filtros: FiltrosDeFicha;
  feito: string | string[] | undefined;
  referencia: string | string[] | undefined;
}) {
  const f = Array.isArray(feito) ? feito[0] : feito;
  const ref = Array.isArray(referencia) ? referencia[0] : referencia;
  if (!eFeito(f) || !ref || !ID.test(ref)) return null;
  const nome = (await cliente.fichaTecnica.findUnique({ where: { id: ref }, select: { nome: true } }))?.nome;
  if (!nome) return null;
  const q = queryDosFiltrosDeFicha(filtros);
  return (
    <AvisoDeSalvo
      titulo={f === 'desativada' ? `Ficha desativada: ${nome}` : `Ficha reativada: ${nome}`}
      apoio={f === 'desativada' ? 'Ela saiu da lista padrão e da escolha nas outras fichas. Receita, preços, produções e histórico continuam como estão.' : undefined}
    >
      <Link href={`${base}/${ref}${q ? `?de=${encodeURIComponent(q)}` : ''}`} className={classeDeBotao('secundario')}>
        Ver a ficha
      </Link>
      {f === 'desativada' && (
        <Link href={`${base}?${queryDosFiltrosDeFicha({ ...filtros, situacao: 'desativadas', pagina: 1 })}`} className={classeDeBotao('secundario')}>
          Ver as desativadas
        </Link>
      )}
    </AvisoDeSalvo>
  );
}
