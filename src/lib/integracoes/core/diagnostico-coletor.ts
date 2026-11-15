/** Únicos diagnósticos específicos que o coletor pode persistir. As frases são para a Central de nível 1. */
const ORIENTACOES = {
  'configuracao-referencia-invalida': 'Corrija a referência da credencial no cadastro do app.',
  'configuracao-credencial-ausente': 'Disponibilize a credencial do app ao coletor.',
  'configuracao-chave-ausente': 'Disponibilize ao coletor a chave que protege os tokens.',
  'configuracao-chave-invalida': 'Confira o formato da chave que protege os tokens.',
  'configuracao-base-invalida': 'Confira o endereço da API oficial usado pelo coletor.',
} as const;

export type DiagnosticoDoColetor = keyof typeof ORIENTACOES;

export function ehDiagnosticoDoColetor(valor: unknown): valor is DiagnosticoDoColetor {
  return typeof valor === 'string' && Object.hasOwn(ORIENTACOES, valor);
}

export function orientacaoDoColetor(codigo: DiagnosticoDoColetor): string {
  return ORIENTACOES[codigo];
}
