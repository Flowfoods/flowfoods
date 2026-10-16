/**
 * Foto da ficha em miniatura (lista) ou grande (detalhe). A imagem vem da rota
 * `<base>/<id>/foto`, que passa pelo portão do parceiro e confere "ver
 * fichas"; `?v=` é a versão da foto (trocou, a URL muda). Sem foto: um quadro
 * neutro com a palavra, do mesmo tamanho — a lista não pula.
 */

export function urlDaFoto(base: string, id: string, foto: string) {
  return `${base}/${id}/foto?v=${foto}`;
}

export function Miniatura({ base, id, foto }: { base: string; id: string; foto: string | null }) {
  if (!foto) {
    return (
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[7px] border border-linha bg-forte text-[10px] leading-none text-suave">
        sem foto
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
