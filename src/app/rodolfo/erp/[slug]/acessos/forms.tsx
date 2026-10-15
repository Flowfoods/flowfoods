'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { CAMPO, Enviar, Erro, ROTULO, Resultado } from '../../campos';
import { acaoCriarAcesso, acaoMudarStatusAcesso, acaoNovoLink, type EstadoAcesso } from './actions';

/** O link aparece uma vez só: caixa para copiar e a validade dita em uma frase. */
export function LinkGerado({ link, validade }: { link: string; validade?: string }) {
  const [copiado, setCopiado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Sem permissão de área de transferência: deixa selecionado para copiar à mão.
      campo.current?.select();
    }
    setCopiado(true);
  }

  return (
    <div className="space-y-2 rounded-[9px] border border-white/[0.12] bg-black/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-surface/50">Link de primeiro acesso</div>
      <div className="flex gap-2">
        <input
          ref={campo}
          readOnly
          value={link}
          aria-label="Link de primeiro acesso"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-[7px] border border-white/[0.1] bg-black/50 px-3 py-2 font-mono text-[12px] text-surface/80 outline-none"
        />
        <button
          type="button"
          onClick={copiar}
          className="whitespace-nowrap rounded-[7px] bg-primary px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-primary-dark"
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-[12px] text-surface/50">
        Funciona uma vez só{validade ? `, até ${validade}` : ''}. Mande para a pessoa pelo WhatsApp: ela abre, cria a senha
        e entra em /entrar.
      </p>
    </div>
  );
}

export function FormNovoAcesso({ slug }: { slug: string }) {
  const [estado, enviar] = useFormState<EstadoAcesso, FormData>(acaoCriarAcesso.bind(null, slug), null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);

  return (
    <div className="space-y-4">
      <form ref={form} action={enviar} noValidate className="space-y-4">
        <div>
          <label htmlFor="acesso-nome" className={ROTULO}>
            Nome da pessoa
          </label>
          <input
            id="acesso-nome"
            name="nome"
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Ex.: Maria Souza"
            className={CAMPO}
            aria-invalid={!!estado?.erros?.nome}
            aria-describedby="acesso-nome-erro"
          />
          <Erro id="acesso-nome-erro" texto={estado?.erros?.nome} />
        </div>
        <div>
          <label htmlFor="acesso-email" className={ROTULO}>
            E-mail
          </label>
          <input
            id="acesso-email"
            name="email"
            type="email"
            required
            maxLength={160}
            autoComplete="off"
            inputMode="email"
            placeholder="maria@restaurante.com.br"
            className={CAMPO}
            aria-invalid={!!estado?.erros?.email}
            aria-describedby="acesso-email-erro"
          />
          <Erro id="acesso-email-erro" texto={estado?.erros?.email} />
        </div>
        <Enviar pendente="Criando…" className="w-full">
          Criar acesso
        </Enviar>
        <Resultado estado={estado} />
      </form>
      {estado?.ok && estado.link && <LinkGerado link={estado.link} validade={estado.validade} />}
    </div>
  );
}

const BOTAO_PEQUENO =
  'whitespace-nowrap rounded-[7px] border border-white/[0.14] px-3 py-1.5 text-[12px] font-medium text-surface/80 transition hover:border-surface/40 hover:text-surface disabled:cursor-wait disabled:opacity-60';

export function AcoesDoAcesso({
  slug,
  acessoId,
  status,
}: {
  slug: string;
  acessoId: string;
  status: 'ATIVO' | 'DESATIVADO';
}) {
  const [link, pedirLink] = useFormState<EstadoAcesso, FormData>(acaoNovoLink.bind(null, slug, acessoId), null);
  const novo = status === 'ATIVO' ? 'DESATIVADO' : 'ATIVO';
  const [situacao, mudar] = useFormState<EstadoAcesso, FormData>(
    acaoMudarStatusAcesso.bind(null, slug, acessoId, novo),
    null,
  );
  const erro = (link && !link.ok && link.erros?.geral) || (situacao && !situacao.ok && situacao.erros?.geral) || null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'ATIVO' && (
          <form action={pedirLink}>
            <button type="submit" className={BOTAO_PEQUENO}>
              Gerar novo link
            </button>
          </form>
        )}
        <form action={mudar}>
          <button type="submit" className={BOTAO_PEQUENO}>
            {status === 'ATIVO' ? 'Desativar' : 'Reativar'}
          </button>
        </form>
      </div>
      {erro && <p className="text-[12px] text-bright">{erro}</p>}
      {link?.ok && link.link && status === 'ATIVO' && <LinkGerado link={link.link} validade={link.validade} />}
    </div>
  );
}
