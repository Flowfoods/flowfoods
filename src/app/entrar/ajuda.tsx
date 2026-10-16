import { AJUDA_DE_ACESSO_ERP } from '@/lib/constants';

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
