'use client';

import type { OrigemContato } from '@/types';

interface Props {
  className?: string;
  children: React.ReactNode;
  /** De onde veio o clique — o modal usa isto para escolher o texto do WhatsApp. */
  origem?: OrigemContato;
}

export default function ModalTriggerButton({ className, children, origem = 'hero' }: Props) {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('flowfoods:open-modal', { detail: { origem } }));
  };
  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
