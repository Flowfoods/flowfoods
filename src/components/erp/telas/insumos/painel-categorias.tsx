'use client';

/**
 * F4 — o painel lateral de categorias da lista de insumos. Abre sob demanda pelo botão ao lado dos filtros, fica por
 * cima da lista sem trocar de página e fecha com o X, com Esc ou clicando fora. Fechar não mexe em filtro, página nem
 * posição (o painel é só uma camada). Volta de uma ação de categoria (`?painel=categorias`) já abre com o resultado.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tags, X } from 'lucide-react';
import { classeDeBotao } from '../../ui/estilos';

export function PainelDeCategorias({ children, abertoDeInicio = false }: { children: ReactNode; abertoDeInicio?: boolean }) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();

  useEffect(() => {
    if (!aberto) return;
    painel.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function fechar() {
    setAberto(false);
    // Tira só o que abriu o painel (e a frase do feito); filtros e página ficam.
    if (busca.has('painel')) {
      const u = new URLSearchParams(busca.toString());
      ['painel', 'feito', 'cat'].forEach((k) => u.delete(k));
      router.replace(`${caminho}${u.toString() ? `?${u}` : ''}`, { scroll: false });
    }
    requestAnimationFrame(() => botao.current?.focus());
  }

  return (
    <>
      <button ref={botao} type="button" className={classeDeBotao('secundario', 'shrink-0')} aria-haspopup="dialog" aria-expanded={aberto} onClick={() => setAberto(true)}>
        <Tags size={16} aria-hidden />
        Categorias
      </button>
      {aberto && (
        <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
          <div className="absolute inset-0 bg-texto/20" aria-hidden onClick={fechar} />
          <div
            ref={painel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="painel-categorias-titulo"
            tabIndex={-1}
            className="relative flex h-full w-full max-w-md flex-col border-l border-linha bg-fundo shadow-xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
              <h2 id="painel-categorias-titulo" className="font-display text-[20px] font-bold">
                Categorias
              </h2>
              <button type="button" onClick={fechar} className="ff-transicao inline-grid h-11 w-11 place-items-center rounded-full text-suave hover:text-texto" aria-label="Fechar o painel de categorias">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
