'use client';

/**
 * Foto da ficha no formulário: escolher (câmera no celular), ver antes de
 * salvar, trocar ou tirar. Foto grande (ou HEIC do iPhone) é reduzida AQUI
 * para até 1600 px em JPEG antes de enviar — conforto de rede e de disco. Quem
 * decide é o servidor: confere o tipo pelos bytes e o tamanho de novo.
 */

import { useEffect, useRef, useState } from 'react';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';
import { AJUDA, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { classeDeBotao } from '../../ui/estilos';

const LADO_MAXIMO = 1600;
const ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

/** Reduz no navegador; se não der (navegador antigo, formato que ele não abre), devolve o original. */
async function reduzir(arquivo: File): Promise<File> {
  const precisa = arquivo.size > 1_500_000 || !ACEITOS.includes(arquivo.type);
  if (!precisa || typeof createImageBitmap !== 'function') return arquivo;
  try {
    const img = await createImageBitmap(arquivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) return arquivo;
    return new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}

export function CampoFoto({
  atual,
  nome,
  erro,
  idBase,
  aoMudar,
}: {
  /** URL da foto gravada (edição), ou null. */
  atual: string | null;
  nome: string;
  erro?: string;
  idBase: string;
  aoMudar: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [remover, setRemover] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);

  useEffect(() => () => {
    if (previa) URL.revokeObjectURL(previa);
  }, [previa]);

  async function escolheu(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    setAviso(null);
    if (!original) return;
    setPreparando(true);
    const final = await reduzir(original);
    setPreparando(false);
    if (final !== original) {
      const dt = new DataTransfer();
      dt.items.add(final);
      e.target.files = dt.files;
    }
    if (final.size > LIMITE_DA_FOTO) setAviso('Foto acima de 8 MB: escolha outra.');
    setPrevia(URL.createObjectURL(final));
    setRemover(false);
    aoMudar();
  }

  const mostrada = remover ? null : (previa ?? atual);
  return (
    <div>
      <span className={ROTULO}>Foto</span>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid aspect-[4/3] w-40 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-linha bg-forte text-[12px] text-suave">
          {mostrada ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou foto privada servida pelo portão; o otimizador do Next não serve nenhuma das duas.
            <img src={mostrada} alt={`Foto de ${nome || 'a ficha'}`} className="h-full w-full object-cover" />
          ) : (
            <span>Sem foto</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={entrada}
            id={`${idBase}-foto`}
            type="file"
            name="foto"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={escolheu}
            className="peer sr-only"
            aria-describedby={`${idBase}-foto-ajuda${erro ? ` ${idBase}-foto-erro` : ''}`}
          />
          <label htmlFor={`${idBase}-foto`} className={classeDeBotao(
              'secundario',
              'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento',
            )}>
            {preparando ? 'Preparando a foto…' : mostrada ? 'Trocar foto' : 'Escolher foto'}
          </label>
          <p id={`${idBase}-foto-ajuda`} className={AJUDA}>
            Do prato pronto ou da montagem: quem opera bate o olho e sabe o que é. JPG, PNG ou WebP; a foto é reduzida antes de enviar.
          </p>
          {atual && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-texto sm:min-h-0">
              <input
                type="checkbox"
                name="removerFoto"
                value="sim"
                checked={remover}
                onChange={(e) => {
                  setRemover(e.target.checked);
                  if (e.target.checked && entrada.current) entrada.current.value = '';
                  setPrevia(null);
                  aoMudar();
                }}
                className={MARCAR}
              />
              Tirar a foto
            </label>
          )}
          {aviso && <p className="text-[13px] text-erro">{aviso}</p>}
          <Erro id={`${idBase}-foto-erro`} texto={erro} />
        </div>
      </div>
    </div>
  );
}
