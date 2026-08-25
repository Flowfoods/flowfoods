import { z } from "zod";

/**
 * O contrato de saída do pré-diagnóstico.
 *
 * A validação existe porque a aba do Rodolfo renderiza estes campos direto: um
 * JSON com `dores` faltando não pode virar tela quebrada em cima de um lead
 * real. Se não passar aqui, o app tenta uma vez e depois oferece o modo manual —
 * nunca mostra erro cru.
 */
export const preDiagnosticoSchema = z.object({
  resumo: z.string().min(1),
  momento: z.object({
    valor: z.string().min(1),
    porque: z.string().min(1),
  }),
  dores: z
    .array(
      z.object({
        dor: z.string().min(1),
        evidencia: z.string().min(1),
        modulo: z.string().min(1),
      }),
    )
    .min(3)
    .max(5),
  plano30dias: z.array(z.string().min(1)).min(3).max(5),
  propostaSugerida: z.object({
    nivel: z.string().min(1),
    modulos: z.array(z.string().min(1)).min(1),
    sequencia: z.array(z.string().min(1)).min(1),
    duracaoSemanas: z.number().int().nonnegative(),
    justificativa: z.string().min(1),
  }),
  // "exatamente 5" está na regra 9 do prompt; aqui é onde isso deixa de ser
  // pedido e vira contrato.
  perguntasParaCall: z.array(z.string().min(1)).length(5),
  riscos: z.array(z.string()).min(0).max(5),
  aberturaDaCall: z.string().min(1),
  observacoes: z.string(),
});

export type PreDiagnostico = z.infer<typeof preDiagnosticoSchema>;

/**
 * Nota de integração: NÃO existe uma segunda cópia deste contrato em JSON
 * Schema. O SDK TypeScript monta o `output_config.format` a partir do zod
 * (`zodOutputFormat(preDiagnosticoSchema)`), então este arquivo é a única
 * definição. Manter as duas versões à mão era garantir que uma ia sair da
 * outra em silêncio — e a que estivesse errada só apareceria em produção.
 */

/**
 * Lê o JSON que o modelo devolveu.
 *
 * Aceita a resposta vinda limpa e também embrulhada em cerca de markdown —
 * a regra 1 do prompt proíbe, mas modelo às vezes embrulha mesmo assim, e
 * derrubar um pré-diagnóstico bom por três crases seria desperdício.
 */
export function lerPreDiagnostico(
  cru: string,
): { ok: true; dados: PreDiagnostico } | { ok: false; erro: string } {
  const semCerca = cru
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(semCerca);
  } catch {
    return { ok: false, erro: "resposta não é JSON válido" };
  }

  const r = preDiagnosticoSchema.safeParse(json);
  if (!r.success) {
    const primeiro = r.error.issues[0];
    const onde = primeiro ? `${primeiro.path.join(".") || "(raiz)"}: ${primeiro.message}` : "?";
    return { ok: false, erro: `JSON fora do schema — ${onde}` };
  }
  return { ok: true, dados: r.data };
}
