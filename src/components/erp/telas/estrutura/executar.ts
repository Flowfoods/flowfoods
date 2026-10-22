/**
 * O miolo da ação do CNPJ da loja (F.1a), comum ao nível 1 e à pessoa do parceiro: quem chama já resolveu o contexto e conferiu
 * `lojas.gerir` e o bloqueio. Aqui só se lê o formulário e se traduz o resultado em frase.
 */

import { revalidatePath } from 'next/cache';
import { formatarDocumento } from '@/lib/erp/compra-campos';
import { salvarCnpjDaLoja } from '@/lib/erp/estrutura';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { EstadoForm } from '../../ui/campos';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

export async function executarCnpjDaLoja(
  cliente: ClienteDoParceiro,
  autorNome: string,
  lojaId: string,
  anterior: EstadoForm,
  form: FormData,
  revalidar: string,
): Promise<EstadoForm> {
  const vez = (anterior?.vez ?? 0) + 1;
  const digitado = textoDe(form.get('cnpj'));
  const r = await salvarCnpjDaLoja(cliente, lojaId, digitado, textoDe(form.get('lido')), autorNome);
  if (!r.ok) return { ok: false, erros: r.erros, vez };
  revalidatePath(revalidar, 'layout');
  if (!r.mudou) return { ok: true, mensagem: 'Nada mudou: o CNPJ já era esse.', vez };
  const salvo = formatarDocumento(digitado.replace(/\D/g, '') || null);
  const base = salvo ? `CNPJ da loja salvo com sucesso: ${salvo}.` : 'CNPJ da loja removido.';
  return { ok: true, mensagem: r.igualAoDeOutra ? `${base} A loja ${r.igualAoDeOutra} usa o mesmo CNPJ; está certo quando as duas operam na mesma empresa.` : base, vez };
}
