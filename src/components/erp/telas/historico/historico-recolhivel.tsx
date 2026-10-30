'use client';

/**
 * A trilha fica disponível sem ocupar a tela da tarefa atual. O estado vale
 * só nesta consulta: mudar o objeto/contexto, navegar e voltar ou restaurar
 * a página pelo cache do navegador começa recolhido. Atualizar os dados ou
 * filtros da mesma consulta não fecha o que a pessoa está lendo.
 *
 * Children continuam vindo do servidor, já filtrados pelas permissões. Não
 * há uma segunda consulta nem armazenamento da preferência no navegador.
 */
import { usePathname } from 'next/navigation';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useContextoDaConsulta } from '../../shell/contexto-da-consulta';

const useAntesDaPintura = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function HistoricoRecolhivel({
  chave,
  titulo = 'Histórico',
  subtitulo,
  acessorio,
  quantidade,
  children,
  className = '',
  semRespiro = false,
  embutido = false,
}: {
  /** Parceiro/loja/objeto da consulta; nunca a quantidade de linhas ou o filtro. */
  chave: string;
  titulo?: string;
  subtitulo?: string;
  /** Links ficam fora do acionador, sem link/botão aninhado no summary. */
  acessorio?: ReactNode;
  /** Quantidade carregada, não necessariamente o total de registros existentes. */
  quantidade?: number;
  children?: ReactNode;
  className?: string;
  semRespiro?: boolean;
  embutido?: boolean;
}) {
  const caminho = usePathname();
  const consulta = useContextoDaConsulta();
  const detalhes = useRef<HTMLDetailsElement>(null);
  const [aberto, definirAberto] = useState(false);
  const id = useId();

  useAntesDaPintura(() => {
    const recolher = () => {
      // A propriedade DOM também muda antes de a página entrar no bfcache.
      if (detalhes.current) detalhes.current.open = false;
      definirAberto(false);
    };
    const aoRestaurar = (evento: PageTransitionEvent) => {
      if (evento.persisted) recolher();
    };
    recolher();
    window.addEventListener('pagehide', recolher);
    window.addEventListener('pageshow', aoRestaurar);
    return () => {
      window.removeEventListener('pagehide', recolher);
      window.removeEventListener('pageshow', aoRestaurar);
    };
  }, [caminho, chave, consulta.chave]);

  return (
    <section className={`min-w-0 ${embutido ? 'border-t border-linha' : 'rounded-[14px] border border-linha bg-painel'} ${className}`}>
      <details ref={detalhes} open={aberto} onToggle={(evento) => definirAberto(evento.currentTarget.open)}>
        <summary
          aria-expanded={aberto}
          aria-controls={id}
          className="ff-transicao flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[13px] px-4 py-2.5 text-texto hover:bg-texto/[0.03] sm:px-5 [&::-webkit-details-marker]:hidden"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold">{titulo}</span>
            {subtitulo && <span className="mt-0.5 block text-[12px] leading-snug text-suave">{subtitulo}</span>}
            {quantidade !== undefined && <span className="block text-[12px] tabular-nums text-suave">{quantidade} {quantidade === 1 ? 'registro exibido' : 'registros exibidos'}</span>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium">
            {aberto ? 'Ocultar histórico' : 'Ver histórico'}
            <ChevronDown size={16} aria-hidden className={`ff-transicao ${aberto ? 'rotate-180' : ''}`} />
          </span>
        </summary>
        <div id={id} className={`border-t border-linha ${semRespiro ? '' : 'p-4 sm:p-5'}`}>{children}</div>
      </details>
      {acessorio && <div className="border-t border-linha px-4 py-2.5 sm:px-5">{acessorio}</div>}
    </section>
  );
}
