'use client';

/**
 * Importar o XML da nota (F.1b): um arquivo só. "Lendo…" enquanto o servidor confere; erro com a frase no lugar, sem perder nada
 * (a pessoa só escolhe outro arquivo). O limite de tamanho é conferido aqui antes de enviar (o servidor confere de novo, antes de
 * ler o arquivo). Nada é lançado: receber grava o documento e leva para a conferência.
 */

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { LIMITES_DO_XML } from '@/lib/erp/nfe-limites';
import { AJUDA, Erro, ROTULO } from '../../ui/campos';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import { Painel } from '../../ui/superficies';
import type { AcaoDeDocumento, EstadoDocumento } from './documentos-estado';

function Ler({ desabilitado }: { desabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || desabilitado} aria-busy={pending} className={classeDeBotao('primario', 'sm:min-w-40')}>
      {pending ? 'Lendo…' : 'Ler a nota'}
    </button>
  );
}

const kb = (bytes: number) => Math.ceil(bytes / 1000).toLocaleString('pt-BR');

export function FormImportarXml({ acao, base, bloqueio }: { acao: AcaoDeDocumento; base: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoDocumento, FormData>(acao, null);
  const [nome, setNome] = useState<string | null>(null);
  const [grande, setGrande] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const erroDoServidor = estado?.erros.arquivo ?? estado?.erros.geral;
  const erro = grande ?? erroDoServidor;
  return (
    <form action={enviar} noValidate className="space-y-4">
      <fieldset disabled={!!bloqueio} className="min-w-0 space-y-4">
        <Painel titulo="O arquivo da nota">
          <label htmlFor="importar-arquivo" className={ROTULO}>
            XML da nota fiscal
          </label>
          <input
            ref={entrada}
            id="importar-arquivo"
            name="arquivo"
            type="file"
            accept=".xml,text/xml,application/xml"
            required
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setNome(f?.name ?? null);
              setGrande(f && f.size > LIMITES_DO_XML.bytes ? `O arquivo tem ${kb(f.size)} KB e o limite é 1 MB. Uma NF-e costuma ter poucas dezenas de KB: confira se é o XML da nota (e não um arquivo compactado ou outra coisa).` : null);
            }}
            aria-invalid={!!erro}
            aria-describedby={`importar-arquivo-ajuda${erro ? ' importar-arquivo-erro' : ''}`}
            className="block min-h-11 w-full rounded-[7px] border border-linha-forte bg-campo px-3 py-2 text-sm text-texto file:mr-3 file:min-h-9 file:rounded-[7px] file:border-0 file:bg-forte file:px-3 file:text-sm file:font-semibold file:text-texto"
          />
          <p id="importar-arquivo-ajuda" className={AJUDA}>
            É o arquivo .xml que o fornecedor manda com a nota (não o PDF). Até 1 MB. {nome ? `Escolhido: ${nome}.` : ''}
          </p>
          <div id="importar-arquivo-erro" role={erro ? 'alert' : undefined}>
            <Erro id="importar-arquivo-erro-texto" texto={erro} />
            {estado?.existenteId && (
              <Link href={`${base}/${estado.existenteId}`} className={`${LINK_DE_TEXTO} mt-1.5 inline-flex min-h-0 items-center [@media(pointer:coarse)]:min-h-11`}>
                Abrir a nota que já foi recebida
              </Link>
            )}
          </div>
        </Painel>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Link href={base} className={classeDeBotao('fantasma')}>
          Cancelar
        </Link>
        <Ler desabilitado={!!bloqueio || !!grande} />
      </div>
      {bloqueio && <p className="text-right text-[13px] text-suave">{bloqueio}</p>}
    </form>
  );
}
