/**
 * Login e definição de senha do nível 1: fora do shell (sem sessão ainda),
 * sempre no tema escuro de antes — a área privada se distingue do site num
 * relance. Usa os tokens do ERP fixados em "escuro".
 */

import Link from 'next/link';
import '@/components/erp/tokens.css';
import { Marca } from '@/components/erp/ui/Marca';

export default function AcessoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ff-app bg-lateral font-sans" data-tema="escuro">
      <div aria-hidden className="h-[3px] bg-acento" />
      <div className="mx-auto max-w-5xl px-4">
        <header className="py-4">
          <Link href="/rodolfo" aria-label="Espaço do Rodolfo — início" className="rounded-[5px]">
            <Marca rotulo="Barney" />
          </Link>
        </header>
        <main className="py-6">{children}</main>
      </div>
    </div>
  );
}
