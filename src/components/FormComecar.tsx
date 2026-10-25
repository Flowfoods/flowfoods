'use client';

// avoid-ai-design-ignore-file: SD4, SD5, K3, SD4d — site institucional, fora do shell do ERP: etiqueta em caixa alta e cantos retos são o estilo editorial FlowFoods (CLAUDE.md).

import { useFormState, useFormStatus } from 'react-dom';
import { CONTACT_INFO, whatsappUrl } from '@/lib/constants';
import { CAMPO_ARMADILHA, CONSENTIMENTO } from '@/lib/erp/pedido-textos';
import { enviarPedido, type EstadoDoComecar } from '@/app/comecar/actions';

const CAMPO =
  'block min-h-12 w-full border border-ink/30 bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink-5 hover:border-ink/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-[invalid=true]:border-primary-dark';
const ROTULO = 'mb-1.5 block text-[13px] font-semibold text-ink';

function Erro({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="mt-1.5 text-[13px] font-medium text-primary-dark">
      {texto}
    </p>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-[52px] w-full items-center justify-center bg-ink px-8 text-[13px] font-semibold uppercase tracking-[0.12em] text-surface transition-colors hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? 'Enviando…' : 'Enviar'}
    </button>
  );
}

const SAIDA_PELO_WHATSAPP = (
  <a
    href={whatsappUrl('diagnostico')}
    target="_blank"
    rel="noopener noreferrer"
    className="font-semibold text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink"
  >
    WhatsApp {CONTACT_INFO.whatsappDisplay}
  </a>
);

/**
 * "Quero começar": o pedido de quem quer entrar. Funciona sem JavaScript (o
 * formulário envia sozinho e a página volta com a resposta); com JavaScript,
 * não recarrega. A resposta de sucesso é a mesma exista ou não o contato.
 */
export default function FormComecar() {
  const [estado, enviar] = useFormState<EstadoDoComecar, FormData>(enviarPedido, null);
  const erros = estado?.tipo === 'erros' ? (estado.erros ?? {}) : {};
  const v = estado?.valores ?? {};

  if (estado?.tipo === 'recebido') {
    return (
      <div id="comecar" className="scroll-mt-24 self-start bg-surface p-6 text-ink md:p-8">
        <h3 className="font-display text-2xl font-bold leading-tight">Pedido recebido</h3>
        <p role="status" className="mt-3 text-base leading-relaxed text-ink-3">
          {estado.mensagem}
        </p>
        <p className="mt-5 text-sm text-ink-3">Prefere adiantar a conversa? {SAIDA_PELO_WHATSAPP}</p>
      </div>
    );
  }

  return (
    <div id="comecar" className="scroll-mt-24 self-start bg-surface p-6 text-ink md:p-8">
      <h3 className="font-display text-2xl font-bold leading-tight">Deixe os dados do seu grupo</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-3">
        O Rodolfo responde pelo WhatsApp em até 2 dias úteis e combina os próximos passos.
      </p>

      {(estado?.tipo === 'bloqueado' || estado?.tipo === 'indisponivel') && (
        <p role="alert" className="mt-4 border-l-2 border-primary-dark bg-white px-4 py-3 text-sm text-ink">
          {estado.mensagem} {SAIDA_PELO_WHATSAPP}
        </p>
      )}

      <form action={enviar} className="mt-6 space-y-4" aria-describedby={estado?.tipo === 'erros' ? 'comecar-resumo' : undefined}>
        {estado?.tipo === 'erros' && (
          <p id="comecar-resumo" role="alert" className="border-l-2 border-primary-dark bg-white px-4 py-3 text-sm font-medium text-ink">
            {estado.mensagem}
          </p>
        )}

        <div>
          <label htmlFor="c-grupo" className={ROTULO}>
            Nome do grupo ou do restaurante
          </label>
          <input
            id="c-grupo"
            name="nomeGrupo"
            required
            minLength={2}
            maxLength={80}
            autoComplete="organization"
            defaultValue={v.nomeGrupo}
            aria-invalid={!!erros.nomeGrupo}
            aria-describedby="c-grupo-erro"
            className={CAMPO}
          />
          <Erro id="c-grupo-erro" texto={erros.nomeGrupo} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-nome" className={ROTULO}>
              Seu nome
            </label>
            <input
              id="c-nome"
              name="responsavel"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              defaultValue={v.responsavel}
              aria-invalid={!!erros.responsavel}
              aria-describedby="c-nome-erro"
              className={CAMPO}
            />
            <Erro id="c-nome-erro" texto={erros.responsavel} />
          </div>
          <div>
            <label htmlFor="c-whats" className={ROTULO}>
              WhatsApp
            </label>
            <input
              id="c-whats"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              required
              maxLength={40}
              autoComplete="tel"
              placeholder="(21) 99999-9999"
              defaultValue={v.whatsapp}
              aria-invalid={!!erros.whatsapp}
              aria-describedby="c-whats-erro"
              className={CAMPO}
            />
            <Erro id="c-whats-erro" texto={erros.whatsapp} />
          </div>
        </div>

        <div>
          <label htmlFor="c-email" className={ROTULO}>
            E-mail
          </label>
          <input
            id="c-email"
            name="email"
            type="email"
            inputMode="email"
            required
            maxLength={160}
            autoComplete="email"
            placeholder="maria@restaurante.com.br"
            defaultValue={v.email}
            aria-invalid={!!erros.email}
            aria-describedby="c-email-erro"
            className={CAMPO}
          />
          <Erro id="c-email-erro" texto={erros.email} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="c-lojas" className={ROTULO}>
              Quantas lojas
            </label>
            <input
              id="c-lojas"
              name="lojas"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={200}
              defaultValue={v.lojas}
              aria-invalid={!!erros.lojas}
              aria-describedby="c-lojas-erro"
              className={CAMPO}
            />
            <Erro id="c-lojas-erro" texto={erros.lojas} />
          </div>
          <div>
            <label htmlFor="c-marcas" className={ROTULO}>
              Quantas marcas
            </label>
            <input
              id="c-marcas"
              name="marcas"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={50}
              defaultValue={v.marcas}
              aria-invalid={!!erros.marcas}
              aria-describedby="c-marcas-erro"
              className={CAMPO}
            />
            <Erro id="c-marcas-erro" texto={erros.marcas} />
          </div>
        </div>

        <div>
          <label htmlFor="c-cidade" className={ROTULO}>
            Cidade e estado
          </label>
          <input
            id="c-cidade"
            name="cidade"
            required
            minLength={2}
            maxLength={80}
            autoComplete="address-level2"
            placeholder="Rio de Janeiro/RJ"
            defaultValue={v.cidade}
            aria-invalid={!!erros.cidade}
            aria-describedby="c-cidade-erro"
            className={CAMPO}
          />
          <Erro id="c-cidade-erro" texto={erros.cidade} />
        </div>

        {/* Armadilha: fora da tela, fora da ordem do teclado, escondida de leitor de tela. Quem preenche é robô. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="c-site">Site da empresa</label>
          <input id="c-site" name={CAMPO_ARMADILHA} type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink [@media(pointer:coarse)]:min-h-11">
            <input
              type="checkbox"
              name="consentimento"
              value="sim"
              required
              aria-invalid={!!erros.consentimento}
              aria-describedby="c-consent-erro"
              className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
            />
            <span>{CONSENTIMENTO.texto}</span>
          </label>
          <details className="mt-2 pl-8 text-[13px] leading-relaxed text-ink-3">
            <summary className="inline cursor-pointer font-semibold text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
              (ver como usamos)
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Pedimos: nome do grupo, o seu nome, WhatsApp, e-mail, número de lojas e de marcas, e a cidade.</li>
              <li>Usamos só para o Rodolfo falar com você sobre a consultoria e o sistema da FlowFoods.</li>
              <li>Pedido que não seguir adiante fica guardado por até 180 dias.</li>
              <li>
                Para apagar os seus dados, peça pelo WhatsApp {CONTACT_INFO.whatsappDisplay}.
              </li>
            </ul>
          </details>
          <Erro id="c-consent-erro" texto={erros.consentimento} />
        </div>

        <Enviar />
      </form>
    </div>
  );
}
