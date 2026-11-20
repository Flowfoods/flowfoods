'use client';

import { useState } from 'react';
import { iniciais } from '@/lib/erp/modulos';

/** O pai usa a URL como key: uma imagem nova pode ser carregada após falha na anterior. */
export function ImagemDeIdentidade({ url, nome, pessoal = false }: { url?: string | null; nome: string; pessoal?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  return url && !falhou ? (
    // URLs privadas precisam dos cookies e não passam pelo otimizador público do Next.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`h-full w-full ${pessoal ? 'object-cover' : 'object-contain'}`} onError={() => setFalhou(true)} />
  ) : <span>{iniciais(nome)}</span>;
}
