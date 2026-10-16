/**
 * Foto da ficha em miniatura (lista) ou grande (detalhe). A imagem vem da rota
 * `<base>/<id>/foto`, que passa pelo portão do parceiro e confere "ver
 * fichas"; `?v=` é a versão da foto (trocou, a URL muda). Sem foto: um quadro
 * neutro do mesmo tamanho, com o desenho de "sem imagem" — a lista não pula.
 */

import { ImageOff } from 'lucide-react';

export function urlDaFoto(base: string, id: string, foto: string) {
  return `${base}/${id}/foto?v=${foto}`;
}

export function Miniatura({ base, id, foto }: { base: string; id: string; foto: string | null }) {
  if (!foto) {
    return (
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[7px] border border-linha bg-forte text-suave">
        <ImageOff size={16} aria-hidden />
        <span className="sr-only">Sem foto</span>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto privada servida pelo portão do parceiro; o otimizador do Next não a alcança.
    <img
      src={urlDaFoto(base, id, foto)}
      alt=""
      width={44}
      height={44}
      loading="lazy"
      decoding="async"
      className="h-11 w-11 shrink-0 rounded-[7px] border border-linha object-cover"
    />
  );
}
