'use client';

import { signOut } from 'next-auth/react';

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/rodolfo/login' })}
      className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-surface/70 transition hover:border-white/30 hover:text-surface"
    >
      Sair
    </button>
  );
}
