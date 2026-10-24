'use client';

/**
 * Foto da ficha no formulário: escolher (câmera no celular), ver antes de
 * salvar, trocar ou tirar. A foto é redesenhada AQUI em JPEG de até 1600 px
 * (conforto de rede e de disco; a orientação do celular já vem aplicada) e
 * enviada na hora pela rota própria (`/fichas/fotos`), que confere sessão e
 * permissão antes de ler, o tipo pelos bytes e regrava sem metadados. O
 * formulário leva só o nome que o servidor devolveu (`fotoNova`).
 */

import { useEffect, useRef, useState } from 'react';
import { LIMITE_DA_FOTO } from '@/lib/erp/foto';
import { AJUDA, Erro, MARCAR, ROTULO } from '../../ui/campos';
import { PontoDeAjuda, useTemPonto } from '../../ui/ponto-de-ajuda';
import { classeDeBotao } from '../../ui/estilos';

const LADO_MAXIMO = 1600;

/**
 * Redesenha no navegador (sempre: aplica a orientação do celular e já deixa o
 * EXIF para trás); se não der (navegador antigo, formato que ele não abre),
 * devolve o original — o servidor limpa do mesmo jeito.
 */
async function reduzir(arquivo: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return arquivo;
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

/** Manda a foto para a rota de envio; devolve o nome sorteado ou a frase do erro. */
async function enviar(url: string, foto: File): Promise<{ arquivo: string } | { erro: string }> {
  try {
    const r = await fetch(url, { method: 'POST', body: foto, headers: { 'Content-Type': foto.type || 'application/octet-stream' } });
    const corpo = (await r.json().catch(() => ({}))) as { arquivo?: string; erro?: string };
    if (r.ok && corpo.arquivo) return { arquivo: corpo.arquivo };
    return { erro: corpo.erro ?? 'Não deu para enviar a foto. Tente de novo.' };
  } catch {
    return { erro: 'Sem conexão para enviar a foto. Tente de novo.' };
  }
}

export function CampoFoto({
  atual,
  nome,
  erro,
  idBase,
  envio,
  aoMudar,
  aoOcupar,
}: {
  /** URL da foto gravada (edição), ou null. */
  atual: string | null;
  nome: string;
  erro?: string;
  idBase: string;
  /** Rota que recebe a foto (`<base>/fotos`). */
  envio: string;
  aoMudar: () => void;
  /** Enquanto envia, o formulário não salva. */
  aoOcupar: (ocupado: boolean) => void;
}) {
  const temPontoDaFoto = useTemPonto('foto');
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [enviada, setEnviada] = useState('');
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
    aoOcupar(true);
    const final = await reduzir(original);
    const r = final.size > LIMITE_DA_FOTO ? { erro: 'Foto acima de 8 MB: escolha outra.' } : await enviar(envio, final);
    setPreparando(false);
    aoOcupar(false);
    if ('erro' in r) {
      setAviso(r.erro);
      e.target.value = '';
      return;
    }
    setEnviada(r.arquivo);
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
          {enviada && !remover && <input type="hidden" name="fotoNova" value={enviada} />}
          <input
            ref={entrada}
            id={`${idBase}-foto`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={escolheu}
            className="peer sr-only"
            aria-describedby={`${idBase}-foto-ajuda${erro ? ` ${idBase}-foto-erro` : ''}`}
          />
          <label htmlFor={`${idBase}-foto`} className={classeDeBotao(
              'secundario',
              'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acento',
            )}>
            {preparando ? 'Enviando a foto…' : mostrada ? 'Trocar foto' : 'Escolher foto'}
          </label>
          {temPontoDaFoto ? (
            <div className="mt-1.5 flex items-center gap-1">
              <p id={`${idBase}-foto-ajuda`} className={AJUDA.replace('mt-1.5', '')}>
                JPG, PNG ou WebP.
              </p>
              <PontoDeAjuda ponto="foto" className="-my-3 sm:-my-1.5" />
            </div>
          ) : (
            <p id={`${idBase}-foto-ajuda`} className={AJUDA}>
              Do prato pronto ou da montagem: quem opera bate o olho e sabe o que é. JPG, PNG ou WebP. A foto é reduzida e guardada sem a localização do celular.
            </p>
          )}
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
                  setEnviada('');
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
