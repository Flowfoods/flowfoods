// Scanner avoid-ai-design, SD4d (P2) aceito: "Padrão · 5 kg" e "Nota 123 · série 1" são as frases do snapshot e do histórico, no padrão "A · B" da 1.1–1.4. (O ignore do scanner não aceita id com minúscula.)
// avoid-ai-design-ignore-file: CP3 — a seta está em comentário de código (exemplo de antes → depois), não em botão nem link.
/**
 * Compras (1.5) — a parte PURA (sem banco, sem Next): leitura da nota e do
 * fornecedor, rateio do frete, total conferido, custo de cada item, desempate
 * do último preço, retrato para o histórico e filtros da lista. Serve ao
 * servidor (`compras.ts`) e à prévia da tela; o que vale é o que o servidor lê
 * do texto.
 *
 * - Item = insumo + embalagem (a padrão, outra cadastrada ou "a granel": por
 *   kg/L/un) + quantas embalagens + o VALOR TOTAL DO ITEM como está na nota.
 *   O preço por unidade é total ÷ quantidade (nunca um unitário já arredondado:
 *   Notion Core, "o erro que apaga a diferença de preço").
 * - Frete da nota inteira, rateado pelo valor dos itens (maior resto): a soma
 *   das partes bate ao centavo com o frete.
 * - Total conferido: Σ itens + frete = total digitado.
 */

import { z } from 'zod';
import { limparTexto, marcado, nomeObrigatorio, primeiroErroPorCampo, type Erros, type Leitura } from './insumo-campos';
import { custoDaEmbalagem, dividirArredondado, formatarDinheiro, formatarQuantidade, lerDinheiro, lerQuantidade, UNIDADES, type CustoExato, type Unidade } from './unidades';

export const LIMITES_DA_NOTA = { itens: 80, numero: 20, serie: 10, motivo: 200 } as const;
/** F.1a: os tetos do cadastro do fornecedor (o banco repete em CHECK). */
export const LIMITES_DO_FORNECEDOR = { nome: 80, razaoSocial: 120, endereco: 200, municipio: 60, email: 120, contatoComercial: 80, prazoMaximoDias: 180 } as const;

/** O mesmo teto do INTEGER do banco que `unidades.ts` usa. */
const TETO = 2_000_000_000;

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

// ------------------------------------------------------------ fornecedor

/** Só os dígitos do CPF/CNPJ; vazio = sem documento. */
export function digitos(t: string): string {
  return t.replace(/\D/g, '');
}

function dvValido(d: string, pesos: number[]): boolean {
  const corpo = d.slice(0, pesos.length);
  const soma = pesos.reduce((s, p, i) => s + p * Number(corpo[i]), 0);
  const r = soma % 11;
  const dv = r < 2 ? 0 : 11 - r;
  return dv === Number(d[pesos.length]);
}

/** CPF (11) ou CNPJ (14) com os dígitos verificadores certos; sequência repetida não vale. */
export function documentoValido(d: string): boolean {
  if (!/^(\d{11}|\d{14})$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) return dvValido(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) && dvValido(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dvValido(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) && dvValido(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
}

/** "12345678000195" → "12.345.678/0001-95"; CPF → "123.456.789-09". */
export function formatarDocumento(d: string | null): string | null {
  if (!d) return null;
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

/** CNPJ (14 dígitos) com os dígitos verificadores certos: o da loja e o do estabelecimento; CPF não vale aqui. */
export function cnpjValido(d: string): boolean {
  return d.length === 14 && documentoValido(d);
}

/** Os oito primeiros dígitos do CNPJ: a empresa. Filial e matriz têm a mesma raiz e CNPJs diferentes. CPF não tem raiz. */
export function raizDoCnpj(d: string | null): string | null {
  return d && d.length === 14 ? d.slice(0, 8) : null;
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

/** Os DDDs que existem no Brasil: "(00) 99999-9999" e "(10) ..." não são telefone de ninguém. */
const DDDS = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '),
);

/**
 * WhatsApp com DDD: só os dígitos, sem o 55 do país ("+55 (21) 99641-6060" → "21996416060"). Celular tem 11 dígitos e o número
 * começa por 9; fixo tem 10 (há quem use o WhatsApp Business no fixo). Sem DDD, DDD que não existe ou tamanho errado = null.
 */
export function normalizarWhatsapp(t: string): string | null {
  let d = digitos(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!DDDS.has(d.slice(0, 2))) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  if (d.length === 10 && d[2] === '0') return null;
  return d;
}

/** "21996416060" → "(21) 99641-6060"; fixo → "(21) 2222-3333". */
export function formatarWhatsapp(d: string | null): string | null {
  if (!d) return null;
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return d;
}

/** "20000000" → "20000-000". */
export function formatarCep(d: string | null): string | null {
  return d && d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : d;
}

/**
 * Inscrição estadual: só números (2 a 14; cada UF tem o seu tamanho e o seu cálculo, que a F.1a NÃO confere: é formato, não
 * dígito verificador) ou ISENTO. Pontos, traços e barras saem; "isento"/"isenta" viram ISENTO. Inválida = null.
 */
export function normalizarInscricao(t: string): string | null {
  const s = t.trim().toUpperCase();
  if (/^ISENT[OA]$/.test(s)) return 'ISENTO';
  if (!/^[0-9./\-\s]+$/.test(s)) return null;
  const d = digitos(s);
  return d.length >= 2 && d.length <= 14 ? d : null;
}

/** E-mail sem espaço, com uma arroba e um ponto depois dela; o resto quem confere é quem manda a mensagem. */
export function emailValido(e: string): boolean {
  return e.length <= LIMITES_DO_FORNECEDOR.email && /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(e);
}

export interface DadosFornecedor {
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
  inscricaoEstadual: string | null;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  email: string | null;
  whatsapp: string | null;
  contatoComercial: string | null;
  prazoPagamentoDias: number | null;
  semNotaFiscal: boolean;
}

/** O que o cadastro precisa ter para ser "completo" (a regra de obrigatoriedade, uma só para o formulário, o banco e a tela). */
export function faltaNoCadastro(f: Pick<DadosFornecedor, 'razaoSocial' | 'documento' | 'email' | 'whatsapp' | 'semNotaFiscal'>): string[] {
  const falta: string[] = [];
  if (!f.semNotaFiscal) {
    if (!f.razaoSocial) falta.push('razão social');
    if (!f.documento) falta.push('CNPJ ou CPF');
    if (!f.email) falta.push('e-mail');
  }
  if (!f.whatsapp) falta.push('WhatsApp');
  return falta;
}

/** O documento gravado não passa nos dígitos verificadores (cadastro antigo, gravado quando o CNPJ era só digitado): a tela pede para conferir. */
export function documentoAConferir(documento: string | null): boolean {
  return !!documento && !documentoValido(documento);
}

const ROTULOS_DO_FORNECEDOR: Record<string, string> = {
  nome: 'Nome fantasia',
  razaoSocial: 'Razão social',
  documento: 'CNPJ ou CPF',
  inscricaoEstadual: 'Inscrição estadual',
  endereco: 'Endereço',
  municipio: 'Município',
  uf: 'UF',
  cep: 'CEP',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  contatoComercial: 'Contato comercial',
  prazoPagamentoDias: 'Prazo de pagamento',
};
export const rotuloDoCampoDoFornecedor = (c: string) => ROTULOS_DO_FORNECEDOR[c] ?? c;

const formFornecedor = z.object({ nome: nomeObrigatorio(LIMITES_DO_FORNECEDOR.nome) });

/** Texto livre do cadastro: NFC, sem invisíveis, espaços colapsados; vazio = null; acima do teto = erro. */
function textoCurto(valor: unknown, max: number, campo: string, erros: Erros): string | null {
  const t = limparTexto(texto(valor)).trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.length > max) {
    erros[campo] = `${rotuloDoCampoDoFornecedor(campo)} longo demais (máx. ${max}).`;
    return null;
  }
  return t;
}

/**
 * O formulário do fornecedor (F.1a) → dados prontos. Obrigatórios: nome fantasia, razão social, CNPJ/CPF (com dígitos
 * verificadores), e-mail e WhatsApp com DDD. Exceção, uma só: "Compras sem nota fiscal" (feira, atacarejo) pede apenas nome e
 * WhatsApp; o resto vale se vier, mas nunca casa com documento fiscal. Cada falta volta no campo dela; o cadastro "a completar"
 * NÃO sai daqui: só o sistema o cria.
 */
export function lerFormFornecedor(entrada: Record<string, unknown>): Leitura<DadosFornecedor> {
  const r = formFornecedor.safeParse({ nome: entrada.nome });
  const erros: Erros = r.success ? {} : primeiroErroPorCampo(r.error.issues);
  const semNotaFiscal = marcado(entrada.semNotaFiscal);

  const razaoSocial = textoCurto(entrada.razaoSocial, LIMITES_DO_FORNECEDOR.razaoSocial, 'razaoSocial', erros);
  if (!razaoSocial && !erros.razaoSocial && !semNotaFiscal) erros.razaoSocial = 'Diga a razão social, como está escrita na nota.';

  const docTxt = texto(entrada.documento).trim();
  const documento = docTxt ? digitos(docTxt) : null;
  if (docTxt && (!documento || !documentoValido(documento))) erros.documento = 'CNPJ ou CPF inválido. Confira os números.';
  else if (!docTxt && !semNotaFiscal) {
    erros.documento = 'Informe o CNPJ ou CPF: é por ele que o sistema reconhece o fornecedor nas notas fiscais. Sem nota (feira, atacarejo)? Marque “Compras sem nota fiscal”.';
  }

  const ieTxt = texto(entrada.inscricaoEstadual).trim();
  let inscricaoEstadual: string | null = null;
  if (ieTxt) {
    inscricaoEstadual = normalizarInscricao(ieTxt);
    if (!inscricaoEstadual) erros.inscricaoEstadual = 'Inscrição estadual inválida: só números (2 a 14) ou ISENTO.';
  }

  const endereco = textoCurto(entrada.endereco, LIMITES_DO_FORNECEDOR.endereco, 'endereco', erros);
  const municipio = textoCurto(entrada.municipio, LIMITES_DO_FORNECEDOR.municipio, 'municipio', erros);

  const ufTxt = texto(entrada.uf).trim().toUpperCase();
  let uf: string | null = null;
  if (ufTxt) {
    if ((UFS as readonly string[]).includes(ufTxt)) uf = ufTxt;
    else erros.uf = 'UF inválida. Use a sigla, como RJ ou SP.';
  }

  const cepTxt = texto(entrada.cep).trim();
  let cep: string | null = null;
  if (cepTxt) {
    const d = digitos(cepTxt);
    if (/^\d{8}$/.test(d) && !/[^0-9.\-\s]/.test(cepTxt)) cep = d;
    else erros.cep = 'CEP inválido: são 8 números. Ex.: 21020-000.';
  }

  const emailTxt = limparTexto(texto(entrada.email)).trim().toLowerCase();
  let email: string | null = null;
  if (emailTxt) {
    if (emailValido(emailTxt)) email = emailTxt;
    else erros.email = 'E-mail inválido. Ex.: vendas@fornecedor.com.br.';
  } else if (!semNotaFiscal) erros.email = 'Informe o e-mail do fornecedor.';

  const zapTxt = texto(entrada.whatsapp).trim();
  let whatsapp: string | null = null;
  if (zapTxt) {
    whatsapp = normalizarWhatsapp(zapTxt);
    if (!whatsapp) erros.whatsapp = 'WhatsApp inválido: use o DDD e o número. Ex.: (21) 99641-6060.';
  } else erros.whatsapp = 'Informe o WhatsApp com DDD. Ex.: (21) 99641-6060.';

  const contatoComercial = textoCurto(entrada.contatoComercial, LIMITES_DO_FORNECEDOR.contatoComercial, 'contatoComercial', erros);

  const prazoTxt = texto(entrada.prazoPagamentoDias).trim();
  let prazoPagamentoDias: number | null = null;
  if (prazoTxt) {
    if (/^\d{1,3}$/.test(prazoTxt) && Number(prazoTxt) <= LIMITES_DO_FORNECEDOR.prazoMaximoDias) prazoPagamentoDias = Number(prazoTxt);
    else erros.prazoPagamentoDias = `Prazo em dias inteiros, de 0 a ${LIMITES_DO_FORNECEDOR.prazoMaximoDias}.`;
  }

  if (!r.success || Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    dados: { nome: r.data.nome, razaoSocial, documento, inscricaoEstadual, endereco, municipio, uf, cep, email, whatsapp, contatoComercial, prazoPagamentoDias, semNotaFiscal },
  };
}

export type SituacaoDoCadastro = 'COMPLETO' | 'A_COMPLETAR';

/** O retrato do cadastro para o histórico (antes e depois), com os números como a pessoa os lê. */
export function retratoDoFornecedor(f: DadosFornecedor & { situacaoCadastro?: SituacaoDoCadastro }): Record<string, string | null> {
  return {
    nome: f.nome,
    razaoSocial: f.razaoSocial,
    documento: formatarDocumento(f.documento),
    inscricaoEstadual: f.inscricaoEstadual,
    endereco: f.endereco,
    municipio: f.municipio,
    uf: f.uf,
    cep: formatarCep(f.cep),
    email: f.email,
    whatsapp: formatarWhatsapp(f.whatsapp),
    contatoComercial: f.contatoComercial,
    prazoPagamento: f.prazoPagamentoDias === null ? null : `${f.prazoPagamentoDias} ${f.prazoPagamentoDias === 1 ? 'dia' : 'dias'}`,
    semNotaFiscal: f.semNotaFiscal ? 'sim' : 'não',
    cadastro: f.situacaoCadastro === undefined ? null : f.situacaoCadastro === 'COMPLETO' ? 'completo' : 'a completar',
  };
}

// ------------------------------------------------------------ número e data

/**
 * Número/série como a chave da nota: sem espaços, letras em maiúscula, e só
 * dígitos perde os zeros à esquerda ("000123" = "123", como o fornecedor
 * imprime de um jeito e a pessoa digita de outro). Inválido = null.
 */
export function normalizarCodigo(t: string, max: number): string | null {
  const s = t.trim().replace(/\s+/g, '').toUpperCase();
  if (!s) return '';
  if (s.length > max || !/^[0-9A-Z./-]+$/.test(s)) return null;
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/** "2026-10-14" ou "14/10/2026" → "2026-10-14" (data válida), ou null. */
export function lerData(t: string): string | null {
  const s = t.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!iso && !br) return null;
  const [a, me, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(br![3]), Number(br![2]), Number(br![1])];
  const dt = new Date(Date.UTC(a, me - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Erro de formato da data, para o campo mostrar ao sair dele (herança da 1.5):
 * vazio vale (quem exige é o servidor); incompleta ou impossível, a frase.
 */
export function erroDoFormatoDaData(texto: string): string | null {
  const t = texto.trim();
  if (!t || lerData(t)) return null;
  return /^\d{2}\/\d{2}\/\d{4}$/.test(t) ? `${t} não existe no calendário.` : 'Data incompleta: use dd/mm/aaaa (ex.: 14/10/2026).';
}

/** Máscara do campo de data enquanto digita: "14102026" vira "14/10/2026" (só dígitos, até 8). */
export function mascararData(t: string): string {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}

/** Hoje no Rio ("2026-10-16"): a data da nota não pode passar disso. */
export function hojeNoRio(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** "2026-10-14" ou Date (coluna @db.Date, meia-noite UTC) → "14/10/2026". */
export function formatarData(d: string | Date, curta = false): string {
  const iso = typeof d === 'string' ? d : d.toISOString().slice(0, 10);
  const [a, m, dia] = iso.split('-');
  return curta ? `${dia}/${m}` : `${dia}/${m}/${a}`;
}

/** Número curto da nota, igual em toda lista (desktop e celular): "4521-1", "4521", "s/n". */
export function numeroDaNota(n: { numero: string | null; serie: string }): string {
  return `${n.numero ?? 's/n'}${n.serie ? `-${n.serie}` : ''}`;
}

/** "Nota 123 · série 1" / "Nota 123". */
export function rotuloDaNota(n: { numero: string | null; serie: string }): string {
  return `Nota ${n.numero ?? 's/n'}${n.serie ? ` · série ${n.serie}` : ''}`;
}

// ------------------------------------------------------------ rateio e custo

/**
 * Frete rateado pelo valor de cada item (maior resto: sobra de centavo vai
 * para quem perdeu mais no arredondamento; empate, a linha de cima). A soma
 * das partes é EXATAMENTE o frete. Itens sem valor (soma 0): partes iguais.
 */
export function ratearFrete(valores: readonly number[], frete: number): number[] {
  if (valores.length === 0) return [];
  const soma = valores.reduce((s, v) => s + v, 0);
  const pesos = soma > 0 ? valores : valores.map(() => 1);
  const total = soma > 0 ? soma : valores.length;
  const partes = pesos.map((p) => {
    const bruto = BigInt(frete) * BigInt(p);
    return { inteiro: Number(bruto / BigInt(total)), resto: Number(bruto % BigInt(total)) };
  });
  let sobra = frete - partes.reduce((s, p) => s + p.inteiro, 0);
  const ordem = partes.map((p, i) => ({ i, resto: p.resto })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  const out = partes.map((p) => p.inteiro);
  for (const { i } of ordem) {
    if (sobra <= 0) break;
    out[i] += 1;
    sobra -= 1;
  }
  return out;
}

/** Quantas embalagens × conteúdo de cada, em milésimos da unidade base, arredondado ao milésimo (metade para cima). */
export function quantidadeDoItem(embalagensMilesimos: number, conteudoMilesimos: number): number {
  return dividirArredondado(embalagensMilesimos * conteudoMilesimos, 1000);
}

/**
 * Custo de referência que a compra dá ao insumo: (valor + frete rateado) ÷
 * quantidade, exato. Vários itens do mesmo insumo na mesma nota (caixa e
 * avulso): a soma de tudo ÷ a soma das quantidades.
 */
export function custoDaCompra(itens: readonly { valorCentavos: number; freteRateadoCentavos: number; quantidadeMilesimos: number }[]): CustoExato | null {
  const valor = itens.reduce((s, i) => s + i.valorCentavos, 0);
  const frete = itens.reduce((s, i) => s + i.freteRateadoCentavos, 0);
  const qtd = itens.reduce((s, i) => s + i.quantidadeMilesimos, 0);
  return custoDaEmbalagem(valor, frete, qtd);
}

/** Uma compra lançada, para decidir qual é a última. */
export interface CompraNaOrdem {
  notaId: string;
  /** Data da nota ("2026-10-14"). */
  entradaEm: string;
  /** Quando foi lançada (ms). */
  lancadaEm: number;
}

/**
 * A última compra de um insumo: a de data da NOTA mais recente (não a de
 * digitação); mesma data, a lançada por último; depois o id (só para ser
 * determinístico). Positivo = `a` vem depois de `b`.
 */
export function compararCompras(a: CompraNaOrdem, b: CompraNaOrdem): number {
  if (a.entradaEm !== b.entradaEm) return a.entradaEm > b.entradaEm ? 1 : -1;
  if (a.lancadaEm !== b.lancadaEm) return a.lancadaEm - b.lancadaEm;
  return a.notaId === b.notaId ? 0 : a.notaId > b.notaId ? 1 : -1;
}

/**
 * A regra inteira do último preço, sobre uma lista de itens de nota de UM
 * insumo: só notas lançadas (cancelada não conta: cancelar a última volta ao
 * preço da anterior), a última pela ordem acima, e o custo dos itens dela.
 * O banco faz a mesma conta numa consulta (`compras-custo.ts`).
 */
export function ultimaCompraDaLista<T extends CompraNaOrdem & { status: string; valorCentavos: number; freteRateadoCentavos: number; quantidadeMilesimos: number }>(
  itens: readonly T[],
): { compra: CompraNaOrdem; custo: CustoExato | null } | null {
  const validos = itens.filter((i) => i.status === 'LANCADA');
  if (validos.length === 0) return null;
  const ultima = validos.reduce((a, b) => (compararCompras(b, a) > 0 ? b : a));
  return { compra: { notaId: ultima.notaId, entradaEm: ultima.entradaEm, lancadaEm: ultima.lancadaEm }, custo: custoDaCompra(validos.filter((i) => i.notaId === ultima.notaId)) };
}

// ------------------------------------------------------------ nota

/** O que o formulário oferece de cada insumo comprado. */
export interface InsumoDaCompra {
  id: string;
  nome: string;
  unidade: Unidade;
  ativo: boolean;
  /** Pré-preparo da casa: não se compra. */
  produzidoPor: string | null;
  /** Conteúdo da embalagem padrão. */
  conteudoMilesimos: number;
  embalagens: { id: string; nome: string; conteudoMilesimos: number; ativo: boolean }[];
}

export const EMBALAGEM_PADRAO = 'padrao';
export const A_GRANEL = 'granel';
export const PREFIXO_DA_EMBALAGEM = 'v:';

/** O que a linha do formulário manda (texto). */
export interface ItemDigitadoDaNota {
  insumoId: string;
  /** 'padrao' | 'granel' | 'v:<id da embalagem>'. */
  embalagem: string;
  quantidade: string;
  valor: string;
}

export interface EntradaDaNota {
  lojaId?: unknown;
  fornecedorId?: unknown;
  numero?: unknown;
  serie?: unknown;
  data?: unknown;
  frete?: unknown;
  total?: unknown;
  itens: ItemDigitadoDaNota[];
}

export interface ItemLido {
  insumoId: string;
  varianteId: string | null;
  insumoNome: string;
  unidade: Unidade;
  /** Snapshot: "Padrão · 5 kg", "Caixa 10 kg · 10 kg", "A granel (kg)". */
  embalagem: string;
  embalagensMilesimos: number;
  conteudoMilesimos: number;
  quantidadeMilesimos: number;
  valorCentavos: number;
  freteRateadoCentavos: number;
}

export interface DadosDaNota {
  lojaId: string;
  fornecedorId: string;
  numero: string;
  serie: string;
  /** "2026-10-14". */
  entradaEm: string;
  freteCentavos: number;
  totalCentavos: number;
  itens: ItemLido[];
}

export const chaveDoItemDaNota = (i: number) => `item-${i}`;

/** A embalagem escolhida: conteúdo, id da variante e o texto do snapshot. Null = não existe neste insumo. */
export function embalagemDoItem(
  ins: InsumoDaCompra,
  escolha: string,
): { varianteId: string | null; conteudoMilesimos: number; texto: string; ativa: boolean } | null {
  const u = UNIDADES[ins.unidade];
  if (escolha === EMBALAGEM_PADRAO || escolha === '') {
    return { varianteId: null, conteudoMilesimos: ins.conteudoMilesimos, texto: `Padrão · ${formatarQuantidade(ins.conteudoMilesimos, ins.unidade)}`, ativa: true };
  }
  if (escolha === A_GRANEL) return { varianteId: null, conteudoMilesimos: 1000, texto: `A granel (${u.sigla})`, ativa: true };
  if (escolha.startsWith(PREFIXO_DA_EMBALAGEM)) {
    const v = ins.embalagens.find((e) => e.id === escolha.slice(PREFIXO_DA_EMBALAGEM.length));
    if (!v) return null;
    return { varianteId: v.id, conteudoMilesimos: v.conteudoMilesimos, texto: `${v.nome} · ${formatarQuantidade(v.conteudoMilesimos, ins.unidade)}`, ativa: v.ativo };
  }
  return null;
}

/**
 * Formulário → dados prontos para gravar. `cadastro`: insumos que a entrada
 * cita, lidos pelo portão (de outro parceiro não estão no mapa). Lojas e
 * fornecedores: os que quem chama já conferiu (alcance, situação). Insumo ou
 * embalagem desativados só ficam se já estavam nesta nota (`jaNaNota`).
 */
export function lerFormNota(
  entrada: EntradaDaNota,
  cadastro: ReadonlyMap<string, InsumoDaCompra>,
  opcoes: {
    hoje: string;
    lojas: ReadonlyMap<string, { nome: string; ativa: boolean }>;
    fornecedores: ReadonlyMap<string, { nome: string; ativo: boolean }>;
    jaNaNota?: { insumoIds: ReadonlySet<string>; variantes: ReadonlySet<string>; lojaId?: string; fornecedorId?: string };
  },
): Leitura<DadosDaNota> {
  const erros: Erros = {};
  const ja = opcoes.jaNaNota;

  const lojaId = texto(entrada.lojaId);
  const loja = opcoes.lojas.get(lojaId);
  if (!lojaId) erros.lojaId = 'Escolha a loja que recebeu a mercadoria.';
  else if (!loja) erros.lojaId = 'Loja fora do seu acesso para lançar nota.';
  else if (!loja.ativa && ja?.lojaId !== lojaId) erros.lojaId = `A loja “${loja.nome}” está desativada.`;

  const fornecedorId = texto(entrada.fornecedorId);
  const forn = opcoes.fornecedores.get(fornecedorId);
  if (!fornecedorId) erros.fornecedorId = 'Escolha o fornecedor (ou cadastre antes).';
  else if (!forn) erros.fornecedorId = 'Fornecedor não encontrado neste cadastro.';
  else if (!forn.ativo && ja?.fornecedorId !== fornecedorId) erros.fornecedorId = `“${forn.nome}” está desativado: reative em Fornecedores.`;

  const numero = normalizarCodigo(texto(entrada.numero), LIMITES_DA_NOTA.numero);
  if (numero === null) erros.numero = `Número com até ${LIMITES_DA_NOTA.numero} letras ou números (sem espaço).`;
  else if (!numero) erros.numero = 'Digite o número da nota (está no alto dela). Sem nota? Use o número do recibo ou do pedido.';
  const serie = normalizarCodigo(texto(entrada.serie), LIMITES_DA_NOTA.serie);
  if (serie === null) erros.serie = `Série com até ${LIMITES_DA_NOTA.serie} letras ou números.`;

  const dataTxt = texto(entrada.data);
  const entradaEm = dataTxt.trim() ? lerData(dataTxt) : null;
  if (!dataTxt.trim()) erros.data = 'Diga a data da nota.';
  else if (!entradaEm) erros.data = 'Data inválida. Ex.: 14/10/2026.';
  else if (entradaEm > opcoes.hoje) erros.data = 'A data da nota não pode ser depois de hoje.';
  else if (entradaEm < `${Number(opcoes.hoje.slice(0, 4)) - 3}${opcoes.hoje.slice(4)}`) erros.data = 'Nota de mais de 3 anos atrás? Confira a data.';

  const freteTxt = texto(entrada.frete).trim();
  const freteCentavos = freteTxt ? lerDinheiro(freteTxt) : 0;
  if (freteCentavos === null) erros.frete = 'Frete inválido. Ex.: 12,50 (ou deixe vazio).';

  const totalTxt = texto(entrada.total).trim();
  const totalCentavos = totalTxt ? lerDinheiro(totalTxt) : null;
  if (!totalTxt) erros.total = 'Digite o total da nota (está no rodapé dela): o sistema confere com a soma.';
  else if (totalCentavos === null) erros.total = 'Total inválido. Ex.: 1.234,56.';

  // Itens.
  const lidos: Omit<ItemLido, 'freteRateadoCentavos'>[] = [];
  if (entrada.itens.length === 0) erros.itens = 'Inclua pelo menos um item da nota.';
  if (entrada.itens.length > LIMITES_DA_NOTA.itens) erros.itens = `Até ${LIMITES_DA_NOTA.itens} itens por nota.`;
  const vistos = new Map<string, number>();
  entrada.itens.slice(0, LIMITES_DA_NOTA.itens).forEach((item, i) => {
    const chave = chaveDoItemDaNota(i);
    if (!item.insumoId) return void (erros[chave] = 'Escolha o insumo.');
    const ins = cadastro.get(item.insumoId);
    if (!ins) return void (erros[chave] = 'Insumo não encontrado neste cadastro.');
    if (ins.produzidoPor) return void (erros[chave] = `“${ins.nome}” é feito na casa (ficha “${ins.produzidoPor}”): não entra em nota de compra.`);
    if (!ins.ativo && !ja?.insumoIds.has(ins.id)) return void (erros[chave] = `“${ins.nome}” está desativado: reative em Insumos para comprar.`);
    const emb = embalagemDoItem(ins, item.embalagem);
    if (!emb) return void (erros[chave] = `Embalagem não encontrada em “${ins.nome}”.`);
    if (!emb.ativa && !(emb.varianteId && ja?.variantes.has(emb.varianteId))) {
      return void (erros[chave] = `A embalagem “${emb.texto}” de “${ins.nome}” está desativada.`);
    }
    const rep = `${ins.id}|${item.embalagem || EMBALAGEM_PADRAO}`;
    if (vistos.has(rep)) return void (erros[chave] = `“${ins.nome}” nessa embalagem já está na nota (item ${vistos.get(rep)! + 1}): some numa linha só.`);
    vistos.set(rep, i);
    const qTxt = item.quantidade.trim();
    const embalagens = qTxt ? lerQuantidade(qTxt) : null;
    if (!qTxt) return void (erros[chave] = `Quantas ${item.embalagem === A_GRANEL ? UNIDADES[ins.unidade].sigla : 'embalagens'} de “${ins.nome}”?`);
    if (embalagens === null) return void (erros[chave] = 'Quantidade inválida. Ex.: 3 ou 2,5.');
    if (embalagens === 0) return void (erros[chave] = 'A quantidade precisa ser maior que zero.');
    const quantidade = quantidadeDoItem(embalagens, emb.conteudoMilesimos);
    if (quantidade === 0 || quantidade > TETO) return void (erros[chave] = 'Quantidade fora da faixa. Confira o número.');
    const vTxt = item.valor.trim();
    const valor = vTxt ? lerDinheiro(vTxt) : null;
    if (!vTxt) return void (erros[chave] = `Digite o valor total de “${ins.nome}” como está na nota.`);
    if (valor === null) return void (erros[chave] = 'Valor inválido. Ex.: 269,70.');
    if (valor === 0) return void (erros[chave] = 'Item sem valor (bonificação) ainda não entra: lance o item com o valor pago.');
    lidos.push({
      insumoId: ins.id,
      varianteId: emb.varianteId,
      insumoNome: ins.nome,
      unidade: ins.unidade,
      embalagem: emb.texto,
      embalagensMilesimos: embalagens,
      conteudoMilesimos: emb.conteudoMilesimos,
      quantidadeMilesimos: quantidade,
      valorCentavos: valor,
    });
  });

  const somaItens = lidos.reduce((s, i) => s + i.valorCentavos, 0);
  if (somaItens + (freteCentavos ?? 0) > TETO) erros.total = 'A nota passa do limite do sistema (R$ 20 milhões). Divida em duas.';
  else if (Object.keys(erros).length === 0 && totalCentavos !== null && freteCentavos !== null && somaItens + freteCentavos !== totalCentavos) {
    erros.total = `A soma dá ${formatarDinheiro(somaItens + freteCentavos)} (itens ${formatarDinheiro(somaItens)} + frete ${formatarDinheiro(freteCentavos)}), mas a nota diz ${formatarDinheiro(totalCentavos)}. Confira os valores.`;
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };
  const fretes = ratearFrete(
    lidos.map((i) => i.valorCentavos),
    freteCentavos!,
  );
  return {
    ok: true,
    dados: {
      lojaId,
      fornecedorId,
      numero: numero!,
      serie: serie!,
      entradaEm: entradaEm!,
      freteCentavos: freteCentavos!,
      totalCentavos: totalCentavos!,
      itens: lidos.map((i, n) => ({ ...i, freteRateadoCentavos: fretes[n] })),
    },
  };
}

/** "3 embalagens" lidas em milésimos → "3", "2,5". */
export function formatarEmbalagens(milesimos: number): string {
  return (milesimos / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

/** Uma linha da nota em texto (histórico): "Cheddar, Padrão · 5 kg: 3 = 15 kg por R$ 269,70". */
export function itemEmTexto(i: Pick<ItemLido, 'insumoNome' | 'embalagem' | 'embalagensMilesimos' | 'quantidadeMilesimos' | 'unidade' | 'valorCentavos'>): string {
  return `${i.insumoNome}, ${i.embalagem}: ${formatarEmbalagens(i.embalagensMilesimos)} = ${formatarQuantidade(i.quantidadeMilesimos, i.unidade)} por ${formatarDinheiro(i.valorCentavos)}`;
}

/** Separador dos itens no texto do histórico (não aparece em nome de insumo). */
export const SEPARADOR_DE_ITENS = ' ¦ ';

/** O que vai para o histórico de uma nota (texto legível; a linha diz de quem é pelo `nome`). */
export function retratoDaNota(
  d: DadosDaNota,
  nomes: { loja: string; fornecedor: string },
): Record<string, string | number> {
  return {
    nome: rotuloDaNota(d),
    fornecedor: nomes.fornecedor,
    loja: nomes.loja,
    data: formatarData(d.entradaEm),
    freteNotaCentavos: d.freteCentavos,
    totalCentavos: d.totalCentavos,
    itensDaNota: d.itens.map(itemEmTexto).join(SEPARADOR_DE_ITENS),
  };
}

// ------------------------------------------------------------ lista

export type SituacaoDaNota = 'lancadas' | 'canceladas' | 'todas';

export interface FiltrosDeNota {
  lojaId: string;
  fornecedorId: string;
  /** "2026-10-01" .. "2026-10-31" (vazio = sem limite). */
  de: string;
  ate: string;
  situacao: SituacaoDaNota;
  pagina: number;
}

export const NOTAS_POR_PAGINA = 50;
export const FILTROS_DE_NOTA_PADRAO: FiltrosDeNota = { lojaId: '', fornecedorId: '', de: '', ate: '', situacao: 'lancadas', pagina: 1 };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const idOuNada = (v: string) => (/^[a-z0-9]{1,64}$/i.test(v) ? v : '');

export function lerFiltrosDeNota(sp: Record<string, string | string[] | undefined>): FiltrosDeNota {
  const situacao = um(sp.situacao);
  return {
    lojaId: idOuNada(um(sp.loja)),
    fornecedorId: idOuNada(um(sp.fornecedor)),
    de: lerData(um(sp.de)) ?? '',
    ate: lerData(um(sp.ate)) ?? '',
    situacao: situacao === 'canceladas' || situacao === 'todas' ? situacao : 'lancadas',
    pagina: Math.max(1, Math.trunc(Number(um(sp.pagina))) || 1),
  };
}

export function queryDosFiltrosDeNota(f: FiltrosDeNota, pagina = f.pagina): string {
  const q = new URLSearchParams();
  if (f.lojaId) q.set('loja', f.lojaId);
  if (f.fornecedorId) q.set('fornecedor', f.fornecedorId);
  if (f.de) q.set('de', f.de);
  if (f.ate) q.set('ate', f.ate);
  if (f.situacao !== 'lancadas') q.set('situacao', f.situacao);
  if (pagina > 1) q.set('pagina', String(pagina));
  return q.toString();
}

export function temFiltroDeNota(f: FiltrosDeNota): boolean {
  return !!(f.lojaId || f.fornecedorId || f.de || f.ate || f.situacao !== 'lancadas');
}
