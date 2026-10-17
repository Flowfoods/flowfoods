'use client';

/**
 * Os botões da despesa (2.2a): pagar, desfazer o pagamento, "não repete mais" e
 * remover (com motivo). Pagar e as outras mudanças que não mexem na competência
 * valem também em período fechado: não mudam o DRE. Cada formulário leva a versão
 * que a tela leu (duas abas não se atropelam).
 */

import { useFormState } from 'react-dom';
import { BotaoEnviar } from '../../ui/botoes';
import { CAMPO, Erro } from '../../ui/campos';
import { CampoData } from '../../ui/campo-data';
import type { AcaoDeCadastro, EstadoCadastro } from './estado';

function ErroDaAcao({ estado, aqui }: { estado: EstadoCadastro; aqui: string }) {
  if (!estado?.erros.geral) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-erro/40 px-4 py-3 text-sm">
      <p className="text-erro">{estado.erros.geral}</p>
      {estado.conflito && (
        <a href={aqui} className="text-[13px] font-medium underline underline-offset-4">
          Recarregar
        </a>
      )}
    </div>
  );
}

export function FormPagar({ acao, versao, hoje, aqui, bloqueio }: { acao: AcaoDeCadastro; versao: string; hoje: string; aqui: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      <ErroDaAcao estado={estado} aqui={aqui} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <label htmlFor="pagar-data" className="mb-1.5 block text-[13px] font-medium text-texto">
            Pago em
          </label>
          <CampoData id="pagar-data" name="data" defaultValue={hoje.split('-').reverse().join('/')} disabled={!!bloqueio} />
        </div>
        <BotaoEnviar pendente="Anotando…" disabled={!!bloqueio}>
          Marcar como paga
        </BotaoEnviar>
      </div>
    </form>
  );
}

/** Um botão só (desfazer o pagamento, não repete mais). */
export function FormSimples({ acao, versao, aqui, bloqueio, rotulo, pendente, variante = 'secundario' }: { acao: AcaoDeCadastro; versao: string; aqui: string; bloqueio: string | null; rotulo: string; pendente: string; variante?: 'secundario' | 'perigo' | 'fantasma' }) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  return (
    <form action={enviar} className="space-y-2">
      <input type="hidden" name="versao" value={versao} />
      <ErroDaAcao estado={estado} aqui={aqui} />
      <BotaoEnviar variante={variante} pendente={pendente} disabled={!!bloqueio}>
        {rotulo}
      </BotaoEnviar>
    </form>
  );
}

export function FormRemoverDespesa({ acao, versao, aqui, bloqueio }: { acao: AcaoDeCadastro; versao: string; aqui: string; bloqueio: string | null }) {
  const [estado, enviar] = useFormState<EstadoCadastro, FormData>(acao, null);
  return (
    <details className="group rounded-[10px] border border-linha px-4 py-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-texto">
        Remover esta despesa
        <span className="text-[12px] font-normal text-suave group-open:hidden">abrir</span>
      </summary>
      <form action={enviar} className="mt-3 space-y-3">
        <input type="hidden" name="versao" value={versao} />
        <ErroDaAcao estado={estado} aqui={aqui} />
        <div>
          <label htmlFor="remover-motivo" className="mb-1.5 block text-[13px] font-medium text-texto">
            Por que está removendo? (de 3 a 200 letras)
          </label>
          <input id="remover-motivo" name="motivo" required minLength={3} maxLength={200} autoComplete="off" className={CAMPO} disabled={!!bloqueio} />
          <Erro id="remover-motivo-erro" texto={undefined} />
        </div>
        <p className="text-[12px] text-suave">O que estava lançado e o motivo ficam no Histórico. Despesa de período fechado não sai.</p>
        <BotaoEnviar variante="perigo" pendente="Removendo…" disabled={!!bloqueio}>
          Remover despesa
        </BotaoEnviar>
      </form>
    </details>
  );
}
