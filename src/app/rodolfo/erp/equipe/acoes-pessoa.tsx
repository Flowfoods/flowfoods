'use client';

/**
 * Ações de uma linha da equipe: editar o acesso (abre o formulário logo
 * abaixo), gerar link de senha, desativar/reativar e, só no nível 1, liberar
 * as tentativas de entrada. Cada botão só aparece se a action existir para
 * quem está vendo — e o servidor confere de novo.
 */

import { useState, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { AcaoDeEquipe, EstadoEquipe } from './estado';
import { LinkGerado } from './link-gerado';

const BOTAO =
  'whitespace-nowrap rounded-[7px] border border-white/[0.14] px-3 py-1.5 text-[12px] font-medium text-surface/80 transition hover:border-surface/40 hover:text-surface disabled:cursor-wait disabled:opacity-60 aria-[expanded=true]:border-surface/50 aria-[expanded=true]:text-surface';

function Botao({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={BOTAO}>
      {pending ? '…' : children}
    </button>
  );
}

const sem: AcaoDeEquipe = async (e) => e;

export function AcoesDaPessoa({
  status,
  formulario,
  gerarLink,
  mudarStatus,
  liberar,
  avisoDeLink,
}: {
  status: 'ATIVO' | 'DESATIVADO';
  /** Formulário de edição (já montado no servidor); sem ele, não há "Editar". */
  formulario?: ReactNode;
  gerarLink?: AcaoDeEquipe;
  mudarStatus?: AcaoDeEquipe;
  liberar?: AcaoDeEquipe;
  /** Por que não há "Gerar link" (ex.: a pessoa está em outro parceiro). */
  avisoDeLink?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [link, pedirLink] = useFormState<EstadoEquipe, FormData>(gerarLink ?? sem, null);
  const [situacao, mudar] = useFormState<EstadoEquipe, FormData>(mudarStatus ?? sem, null);
  const [liberado, pedirLiberar] = useFormState<EstadoEquipe, FormData>(liberar ?? sem, null);
  const erro = [link, situacao, liberado].map((e) => (e && !e.ok ? e.erros?.geral : null)).find(Boolean) ?? null;
  const certo = liberado?.ok ? liberado.mensagem : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {formulario && status === 'ATIVO' && (
          <button type="button" className={BOTAO} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
            {aberto ? 'Fechar' : 'Editar acesso'}
          </button>
        )}
        {gerarLink && status === 'ATIVO' && (
          <form action={pedirLink}>
            <Botao>Gerar link de senha</Botao>
          </form>
        )}
        {mudarStatus && (
          <form action={mudar}>
            <Botao>{status === 'ATIVO' ? 'Desativar' : 'Reativar'}</Botao>
          </form>
        )}
        {liberar && (
          <form action={pedirLiberar}>
            <Botao>Liberar tentativas</Botao>
          </form>
        )}
      </div>
      {!gerarLink && avisoDeLink && status === 'ATIVO' && <p className="text-[12px] text-surface/40">{avisoDeLink}</p>}
      {erro && <p className="text-[12px] text-bright">{erro}</p>}
      {certo && <p className="text-[12px] text-success">{certo}</p>}
      {link?.ok && link.link && status === 'ATIVO' && <LinkGerado link={link.link} validade={link.validade} />}
      {aberto && formulario && status === 'ATIVO' && (
        <div className="rounded-[11px] border border-white/[0.09] bg-black/30 p-4">{formulario}</div>
      )}
    </div>
  );
}
