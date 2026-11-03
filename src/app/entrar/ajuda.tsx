import { AJUDA_DE_ACESSO_ERP } from '@/lib/constants';
import { HORA_MS, VALIDADE_DO_LINK_MS } from '@/lib/erp/acesso';

/**
 * "Esqueci minha senha" no /entrar (decisão 515): a troca é assistida e o
 * texto diz isso. Quem gera o link novo é a FlowFoods ou quem administra a
 * equipe do parceiro no ERP (`gerarNovoLink`); a pessoa define a senha por ele
 * e volta a /entrar?senha=criada. Não há envio automático por e-mail, e o
 * texto não promete. O pedido sai pelo mesmo WhatsApp de `AjudaDeAcesso`.
 */
export function EsqueciASenha({ className = '' }: { className?: string }) {
  const horas = VALIDADE_DO_LINK_MS / HORA_MS;
  return (
    <div className={className}>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-suave">Esqueci minha senha</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-suave">
        A troca de senha é assistida: a FlowFoods ou quem administra a equipe da sua empresa no ERP gera um link
        novo para você definir outra senha. Não há envio automático por e-mail. O link vale por {horas} horas e
        funciona uma vez só.
      </p>
      <AjudaDeAcesso className="mt-2" />
    </div>
  );
}

/**
 * Saída para quem não consegue entrar: WhatsApp da FlowFoods, em todas as
 * larguras. Cores por token: no /entrar (fora do shell) caem no tema escuro;
 * em Seu acesso (dentro do shell) seguem o tema escolhido.
 */
export function AjudaDeAcesso({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[13px] leading-relaxed text-suave ${className}`}>
      Esqueceu a senha ou não consegue entrar?{' '}
      <a
        href={AJUDA_DE_ACESSO_ERP.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-texto underline decoration-texto/30 underline-offset-4 transition hover:decoration-texto"
      >
        Fale com a FlowFoods
      </a>{' '}
      <span className="whitespace-nowrap tabular-nums text-suave">· WhatsApp {AJUDA_DE_ACESSO_ERP.display}</span>
    </p>
  );
}
