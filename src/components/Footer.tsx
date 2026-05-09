import { CONTACT_INFO } from '@/lib/constants';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-footer border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-5 md:px-8 lg:px-12">

        <div className="py-16 grid grid-cols-1 md:grid-cols-3 gap-12">

          {/* Brand */}
          <div>
            <p className="font-display text-3xl tracking-widest mb-3 text-white">
              FLOW<span className="text-primary">FOODS</span>
            </p>
            <p className="font-display italic text-white/30 text-sm leading-relaxed">
              &ldquo;Gastronomia que flui.<br />Negócio que cresce.&rdquo;
            </p>
          </div>

          {/* Nav */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/25 mb-5">Navegação</p>
            <nav className="flex flex-col gap-3">
              {[
                { label: 'Sobre',    href: '#sobre' },
                { label: 'Serviços', href: '#servicos' },
                { label: 'Cases',    href: '#cases' },
                { label: 'Processo', href: '#processo' },
                { label: 'Contato',  href: '#contato' },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-sm text-white/40 hover:text-white transition-colors duration-200"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/25 mb-5">Contato</p>
            <div className="flex flex-col gap-3">
              <a
                href={CONTACT_INFO.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/40 hover:text-white transition-colors duration-200"
              >
                WhatsApp: {CONTACT_INFO.whatsappDisplay}
              </a>
              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="text-sm text-white/40 hover:text-white transition-colors duration-200"
              >
                {CONTACT_INFO.email}
              </a>
              <a
                href={CONTACT_INFO.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/40 hover:text-white transition-colors duration-200"
              >
                @{CONTACT_INFO.instagram}
              </a>
              <a
                href={CONTACT_INFO.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/40 hover:text-white transition-colors duration-200"
              >
                LinkedIn — Rodolfo Cavalcante
              </a>
            </div>
          </div>
        </div>

        <div className="py-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-white/20 text-xs">
            © {year} FlowFoods Consultoria. Todos os direitos reservados.
          </p>
          <p className="text-white/20 text-xs">
            Consultoria Gastronômica — Rio de Janeiro, Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}
