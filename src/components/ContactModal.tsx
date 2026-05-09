'use client';

import { useEffect, useState, useCallback } from 'react';
import { CONTACT_INFO } from '@/lib/constants';

export default function ContactModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setStatus('idle'), 300);
  }, []);

  useEffect(() => {
    window.addEventListener('flowfoods:open-modal', open);
    return () => window.removeEventListener('flowfoods:open-modal', open);
  }, [open]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');

    const msg = encodeURIComponent(
      `Olá Rodolfo! Vi o site da FlowFoods e gostaria de conversar sobre consultoria.\n\n` +
      `*Nome:* ${form.name}\n` +
      `*E-mail:* ${form.email}\n` +
      `*WhatsApp:* ${form.phone}\n\n` +
      `*Sobre meu restaurante:*\n${form.message}`
    );

    setTimeout(() => {
      setStatus('sent');
      window.open(`https://wa.me/5521996416060?text=${msg}`, '_blank');
    }, 700);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="absolute inset-0 bg-ink/75 backdrop-blur-sm" />

      <div className="relative bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between p-6 md:p-8 border-b border-surface-3">
          <div>
            <p className="text-primary text-[10px] font-semibold tracking-[0.4em] uppercase mb-1">Primeiro Passo</p>
            <h2 className="font-display text-2xl md:text-3xl text-ink uppercase leading-tight">
              Agendar<br />Consultoria
            </h2>
          </div>
          <button
            onClick={close}
            className="flex-shrink-0 w-10 h-10 border border-surface-3 hover:border-primary text-ink-4 hover:text-primary transition-colors flex items-center justify-center text-2xl leading-none mt-1"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 md:p-8">
          {status === 'sent' ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-5">
                <span className="text-primary text-2xl font-display font-bold">✓</span>
              </div>
              <h3 className="font-display text-2xl text-ink uppercase mb-3">Mensagem Enviada!</h3>
              <p className="text-ink-4 text-sm leading-relaxed mb-2">Rodolfo retorna em até 2h por WhatsApp.</p>
              <p className="text-ink-5 text-xs mb-8">Verifique também sua caixa de e-mail.</p>
              <button
                onClick={close}
                className="bg-primary hover:bg-primary-dark text-white font-semibold text-xs px-8 py-3 uppercase tracking-widest transition-all"
              >
                Fechar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-surface-3 focus:border-primary outline-none px-4 py-3 text-sm text-ink bg-surface placeholder:text-ink-5 transition-colors"
                  placeholder="Seu nome completo"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
                  E-mail *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-surface-3 focus:border-primary outline-none px-4 py-3 text-sm text-ink bg-surface placeholder:text-ink-5 transition-colors"
                  placeholder="seu@email.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-surface-3 focus:border-primary outline-none px-4 py-3 text-sm text-ink bg-surface placeholder:text-ink-5 transition-colors"
                  placeholder="(21) 9 0000-0000"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
                  Sobre seu negócio *
                </label>
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                  className="w-full border border-surface-3 focus:border-primary outline-none px-4 py-3 text-sm text-ink bg-surface placeholder:text-ink-5 transition-colors resize-none"
                  placeholder="Conte sobre seu restaurante e o principal desafio que quer resolver..."
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="flex-1 bg-primary hover:bg-primary-dark disabled:opacity-60 text-white font-semibold text-xs px-6 py-4 uppercase tracking-widest transition-all duration-200 active:scale-[0.98]"
                >
                  {status === 'sending' ? 'Enviando...' : 'Agendar Consulta'}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="border border-surface-3 hover:border-primary text-ink-4 hover:text-primary font-semibold text-xs px-6 py-4 uppercase tracking-widest transition-all duration-200"
                >
                  Cancelar
                </button>
              </div>

              <p className="text-[11px] text-ink-5 text-center pt-1">
                Prefere falar direto?{' '}
                <a
                  href={CONTACT_INFO.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-semibold"
                >
                  WhatsApp {CONTACT_INFO.whatsappDisplay}
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
