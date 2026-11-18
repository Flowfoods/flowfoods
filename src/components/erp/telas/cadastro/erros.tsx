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

/** A pergunta de sair vale agora? (Desligada só no instante de uma recarga em que o que foi digitado já está guardado.) */
export function deveAvisarAoSair(sujo: boolean): boolean {
  return sujo && !dispensaDoUnload;
}

/** Quanto tempo a pergunta fica desligada: o aviso de descarregar sai no começo da recarga; se ela for interrompida, volta. */
export const RELIGAR_O_AVISO_MS = 1500;
let religar: ReturnType<typeof setTimeout> | undefined;

/**
 * Recarrega a página sem a pergunta de sair: só quando o que está na tela acabou de ser guardado no rascunho da aba (a tela volta
 * preenchida). Se a recarga for interrompida (Esc numa rede lenta), a pergunta volta sozinha.
 */
export function recarregarSemPerguntar(): void {
  dispensaDoUnload = true;
  clearTimeout(religar);
  religar = setTimeout(() => { dispensaDoUnload = false; }, RELIGAR_O_AVISO_MS);
  window.location.reload();
}

/**
 * "Recarregar a página" depois de o ERP mudar de versão. Guarda o que está na tela AGORA (com o que foi editado depois do aviso,
 * e com o prazo do rascunho renovado) e só dispensa a pergunta se guardou; senão, recarregar passa pela pergunta de sempre.
 */
export function recarregarDepoisDeGuardar(
  guardar: (() => boolean) | undefined,
  recarregar: { semPerguntar: () => void; comPergunta: () => void } = { semPerguntar: recarregarSemPerguntar, comPergunta: () => window.location.reload() },
): 'sem-perguntar' | 'com-pergunta' {
  let guardou = false;
  try {
    guardou = guardar?.() === true;
  } catch {
    // Sem armazenamento: recarrega com a pergunta.
  }
  if (guardou) {
    recarregar.semPerguntar();
    return 'sem-perguntar';
  }
  recarregar.comPergunta();
  return 'com-pergunta';
}

/**
 * Erro geral, com "Recarregar" quando foi conflito de versão ou o ERP foi atualizado com a tela aberta. Neste último caso, o foco
 * vai para o botão (a única saída), que entra na vista: depois de salvar, o alerta ficava acima da tela.
 * `aoGuardarAntesDeRecarregar`: o formulário guarda o que está nele no toque (devolve se conseguiu).
 */
export function ErroGeral({ estado, recarregar, aoGuardarAntesDeRecarregar }: { estado: EstadoCadastro; recarregar: string; aoGuardarAntesDeRecarregar?: (form: FormData) => boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const vez = estado?.vez;
  const versaoNova = !!estado?.versaoNova;
  useEffect(() => {
    if (!versaoNova) return;
    // O alerta inteiro no meio da tela (o cabeçalho fixo não o cobre), e o foco no botão sem rolar de novo.
    caixa.current?.scrollIntoView({ block: 'center' });
    botao.current?.focus({ preventScroll: true });
  }, [vez, versaoNova]);
  if (!estado?.erros.geral) return null;
  return (
    <div ref={caixa} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
      <p className="text-erro">{estado.erros.geral}</p>
      {estado.versaoNova ? (
        // A ação desta tela não existe no servidor novo: precisa carregar a página de novo (o JavaScript novo), não navegar.
        <button
          ref={botao}
          type="button"
          className={classeDeBotao('secundario')}
          onClick={(e) => {
            const form = e.currentTarget.form;
            recarregarDepoisDeGuardar(form && aoGuardarAntesDeRecarregar ? () => aoGuardarAntesDeRecarregar(new FormData(form)) : undefined);
          }}
        >
          Recarregar a página
        </button>
      ) : (
        estado.conflito && (
          <a href={recarregar} className={classeDeBotao('secundario')}>
            Recarregar
          </a>
        )
      )}
    </div>
  );
}

/** A resposta explícita da action; enviar não é comprovação de que o servidor salvou. */
type ResultadoDoEnvio = { ok: boolean } | null | undefined;

/** Avisa antes de sair; uma resposta de erro rearma a proteção sem interferir no sucesso da action. */
export function useAvisoDeSaida(resultado?: ResultadoDoEnvio) {
  const sujo = useRef(false);
  const resultadoVisto = useRef<ResultadoDoEnvio>(undefined);
  useEffect(() => {
    if (resultadoVisto.current === resultado) return;
    resultadoVisto.current = resultado;
    // O mesmo erro antigo pode continuar renderizado durante o envio seguinte.
    // Só uma resposta nova comprova que o que foi enviado ainda precisa de atenção.
    if (resultado?.ok === false) sujo.current = true;
  }, [resultado]);
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!deveAvisarAoSair(sujo.current)) return;
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
