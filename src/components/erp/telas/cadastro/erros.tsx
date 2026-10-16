'use client';

/**
 * Peças de cliente comuns aos formulários de cadastro do ERP: resumo de erros
 * (quando há mais de um, cada item leva ao campo), erro geral (permissão,
 * bloqueio, conflito de versão, com o próximo passo) e o aviso de sair com o
 * formulário alterado.
 */

import { useEffect, useRef } from 'react';
import { classeDeBotao, LINK_DE_TEXTO } from '../../ui/estilos';
import type { EstadoCadastro } from './estado';

/** Resumo quando há mais de um erro. `rotulos` dá o nome de cada campo (o resto aparece pela chave). */
export function ResumoDeErros({
  erros,
  idBase,
  rotulos,
}: {
  erros: Partial<Record<string, string>>;
  idBase: string;
  rotulos: (campo: string) => string;
}) {
  const campos = Object.keys(erros).filter((c) => c !== 'geral' && erros[c]);
  if (campos.length < 2) return null;
  return (
    <div role="alert" className="rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
      <p className="font-semibold text-erro">Corrija {campos.length} campos antes de salvar:</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {campos.map((c) => (
          <li key={c}>
            <a href={`#${idBase}-${c}`} className={LINK_DE_TEXTO}>
              {rotulos(c)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Erro geral, com "Recarregar" quando foi conflito de versão. */
export function ErroGeral({ estado, recarregar }: { estado: EstadoCadastro; recarregar: string }) {
  if (!estado?.erros.geral) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
      <p className="text-erro">{estado.erros.geral}</p>
      {estado.conflito && (
        <a href={recarregar} className={classeDeBotao('secundario')}>
          Recarregar
        </a>
      )}
    </div>
  );
}

/** Avisa antes de sair (fechar, recarregar) com o formulário alterado e não salvo. */
export function useAvisoDeSaida() {
  const sujo = useRef(false);
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!sujo.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, []);
  return {
    aoMudar: () => {
      sujo.current = true;
    },
    aoEnviar: () => {
      sujo.current = false;
    },
  };
}
