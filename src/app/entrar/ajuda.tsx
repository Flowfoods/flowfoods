import { AJUDA_DE_ACESSO_ERP } from '@/lib/constants';

/** Saída para quem não consegue entrar: WhatsApp da FlowFoods, em todas as larguras. */
export function AjudaDeAcesso({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[13px] leading-relaxed text-surface/55 ${className}`}>
      Esqueceu a senha ou não consegue entrar?{' '}
      <a
        href={AJUDA_DE_ACESSO_ERP.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-surface underline decoration-surface/30 underline-offset-4 transition hover:decoration-surface"
      >
        Fale com a FlowFoods
      </a>{' '}
      <span className="whitespace-nowrap tabular-nums text-surface/45">· WhatsApp {AJUDA_DE_ACESSO_ERP.display}</span>
    </p>
  );
}
