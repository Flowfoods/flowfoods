'use client';

/**
 * Ações de uma linha da equipe: editar o acesso (abre o formulário logo
 * abaixo), gerar link de senha, desativar/reativar e, só no nível 1, liberar
 * as tentativas de entrada. Cada botão só aparece se a action existir para
 * quem está vendo — e o servidor confere de novo.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { AcaoDeEquipe, EstadoEquipe } from './estado';
import { Confirmacao } from './escolhas';
import { LinkGerado } from './link-gerado';

const BOTAO =
  'ff-transicao inline-flex min-h-11 items-center whitespace-nowrap rounded-[7px] border border-linha-forte px-3 text-[13px] font-medium text-texto hover:border-texto/40 hover:bg-texto/5 disabled:cursor-wait disabled:opacity-60 aria-[expanded=true]:border-texto/60 aria-[expanded=true]:bg-texto/5 sm:min-h-9';

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
  nome,
  status,
  formulario,
  gerarLink,
  mudarStatus,
  liberar,
  avisoDeLink,
}: {
  nome: string;
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
  const [confirmando, setConfirmando] = useState(false);
  const [link, pedirLink] = useFormState<EstadoEquipe, FormData>(gerarLink ?? sem, null);
  const [situacao, mudar] = useFormState<EstadoEquipe, FormData>(mudarStatus ?? sem, null);
  const [liberado, pedirLiberar] = useFormState<EstadoEquipe, FormData>(liberar ?? sem, null);
  const erro = [link, situacao, liberado].map((e) => (e && !e.ok ? e.erros?.geral : null)).find(Boolean) ?? null;
  const certo = liberado?.ok ? liberado.mensagem : null;
  // Respondeu (deu certo ou não): a caixa de confirmação fecha.
  useEffect(() => setConfirmando(false), [situacao]);

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
        {mudarStatus && status === 'DESATIVADO' && (
          <form action={mudar}>
            <Botao>Reativar</Botao>
          </form>
        )}
        {mudarStatus && status === 'ATIVO' && (
          <button type="button" className={BOTAO} aria-expanded={confirmando} onClick={() => setConfirmando(true)}>
            Desativar
          </button>
        )}
        {liberar && (
          <form action={pedirLiberar}>
            <Botao>Liberar tentativas</Botao>
          </form>
        )}
      </div>
      {mudarStatus && status === 'ATIVO' && confirmando && (
        <form action={mudar}>
          <Confirmacao
            titulo={`Desativar ${nome}?`}
            detalhe="A pessoa sai na hora e não entra mais neste parceiro até ser reativada."
            confirmar="Desativar"
            tipoConfirmar="submit"
            onCancelar={() => setConfirmando(false)}
          />
        </form>
      )}
      {!gerarLink && avisoDeLink && status === 'ATIVO' && <p className="text-[12px] text-suave">{avisoDeLink}</p>}
      {erro && <p className="text-[12px] text-erro">{erro}</p>}
      {certo && <p className="text-[12px] text-ok">{certo}</p>}
      {link?.ok && link.link && status === 'ATIVO' && <LinkGerado link={link.link} validade={link.validade} />}
      {aberto && formulario && status === 'ATIVO' && (
        <div className="rounded-[11px] border border-linha bg-campo p-4">{formulario}</div>
      )}
    </div>
  );
}
