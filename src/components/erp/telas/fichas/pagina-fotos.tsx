/** F4 — a página "Fotos da ficha", igual para o nível 1 e para a pessoa do parceiro. */

import type { FotosDaFicha } from '@/lib/erp/ficha-fotos';
import { COR } from '@/lib/erp/modulos';
import { PageHeader } from '../../ui/cabecalho';
import { TrilhaDaPagina } from '../../shell/trilha';
import { Voltar } from '../cadastro/partes';
import type { EstadoDasFotos } from './estado';
import { TelaFotosDaFicha } from './fotos';

export function PaginaFotosDaFicha({
  fotos,
  base,
  contexto,
  bloqueio,
  acao,
}: {
  fotos: FotosDaFicha;
  base: string;
  contexto?: string;
  bloqueio: string | null;
  acao: (anterior: EstadoDasFotos, form: FormData) => Promise<EstadoDasFotos>;
}) {
  const detalhe = `${base}/${fotos.id}`;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <TrilhaDaPagina itens={[{ rotulo: fotos.nome, href: detalhe }, { rotulo: 'Fotos' }]} />
      <Voltar href={detalhe}>Voltar para a ficha</Voltar>
      <PageHeader icone="fichas" cor={COR.fichas} titulo="Fotos da ficha" subtitulo={[contexto, fotos.nome].filter(Boolean).join(' · ')} />
      <TelaFotosDaFicha fotos={fotos} base={base} acao={acao} bloqueio={bloqueio} />
    </div>
  );
}
