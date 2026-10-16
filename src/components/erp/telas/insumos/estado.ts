/** Estado que as actions de cadastro de insumo (nível 1 e pessoa do parceiro) devolvem para `useFormState`. */

import type { ResultadoCadastro } from '@/lib/erp/insumos';

export type EstadoCadastro = (ResultadoCadastro & { vez: number }) | null;
