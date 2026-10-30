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

// Uma tela pode ter vários formulários independentes. A decisão vale para o
// clique inteiro, sem apagar o estado de nenhum deles antes de realmente sair.
const saidasConfirmadas = new WeakSet<MouseEvent>();
let dispensaDoUnload = false;

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

/** Avisa antes de sair, inclusive por Voltar/menu do roteador, com alterações ainda não salvas. */
export function useAvisoDeSaida() {
  const sujo = useRef(false);
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!sujo.current || dispensaDoUnload) return;
      e.preventDefault();
      e.returnValue = '';
    };
    // Uma navegação do Next não descarrega o documento: beforeunload sozinho
    // deixava Voltar, a trilha e o menu abandonarem o formulário sem aviso.
    const aoNavegar = (e: MouseEvent) => {
      if (!sujo.current || e.defaultPrevented || saidasConfirmadas.has(e) || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const destino = new URL(link.href, window.location.href);
      if (!['http:', 'https:'].includes(destino.protocol)) return;
      // Âncoras de ajuda/erros e o endereço atual mantêm o formulário aberto.
      if (destino.origin === window.location.origin && destino.pathname === window.location.pathname && destino.search === window.location.search) return;
      if (!window.confirm('Você tem alterações ainda não salvas. Deseja sair desta tela?')) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        saidasConfirmadas.add(e);
        // O descarregamento decorrente deste clique não repete a pergunta. Se
        // a navegação falhar, o próximo evento continua protegido.
        dispensaDoUnload = true;
        window.setTimeout(() => { dispensaDoUnload = false; }, 0);
      }
    };
    window.addEventListener('beforeunload', aviso);
    document.addEventListener('click', aoNavegar, true);
    return () => {
      window.removeEventListener('beforeunload', aviso);
      document.removeEventListener('click', aoNavegar, true);
    };
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
