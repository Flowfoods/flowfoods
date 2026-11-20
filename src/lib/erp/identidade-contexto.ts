import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/rodolfo/auth';
import type { SessaoErp } from './contexto-base';

/** Sem redirecionamento: sessão do administrador, separada do cookie das pessoas do ERP. */
export async function sessaoNivel1DaIdentidade(): Promise<SessaoErp | null> {
  const sessao = await getServerSession(authOptions);
  const user = sessao?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  return user?.id ? { userId: user.id, autorNome: user.name || user.email || 'FlowFoods' } : null;
}
