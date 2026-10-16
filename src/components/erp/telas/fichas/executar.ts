/**
 * O miolo das actions de ficha técnica, comum ao nível 1 e à pessoa do
 * parceiro: ler o envio do formulário (itens repetidos, nome da foto enviada) e o arquivo da
 * planilha. Quem chama já resolveu o contexto e conferiu `fichas.editar` e o
 * bloqueio. As regras estão em `src/lib/erp/{fichas,ficha-importar}.ts`.
 */

import { revalidatePath } from 'next/cache';
import type { EntradaDaFicha, ItemDigitado } from '@/lib/erp/ficha-campos';
import type { MudancaDeFoto } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { decodificarPlanilha, LIMITE_DA_PLANILHA } from '@/lib/erp/ficha-planilha';
import { NOME_DA_FOTO } from '@/lib/erp/foto';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { EstadoImportacao } from './estado';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');

/** No seletor do item, o valor do pré-preparo é "ficha:<id>"; o do insumo, só o id. */
export const PREFIXO_DO_PREPARO = 'ficha:';

/** FormData → entrada da ficha (itens na ordem da tela) + o que fazer com a foto. */
export async function lerEnvioDaFicha(
  form: FormData,
): Promise<{ entrada: EntradaDaFicha & { versao?: string }; foto: MudancaDeFoto } | { erroDaFoto: string }> {
  const escolhas = form.getAll('item_insumo').map(textoDe);
  const quantidades = form.getAll('item_quantidade').map(textoDe);
  const unidades = form.getAll('item_unidade').map(textoDe);
  const fatores = form.getAll('item_fator').map(textoDe);
  const itens = escolhas
    .map((escolha, i): ItemDigitado => ({
      // O seletor manda o id do insumo ou "ficha:<id>" do pré-preparo (1.3).
      ...(escolha.startsWith(PREFIXO_DO_PREPARO) ? { subfichaId: escolha.slice(PREFIXO_DO_PREPARO.length) } : { insumoId: escolha }),
      quantidade: quantidades[i] ?? '',
      unidade: unidades[i] ?? '',
      fator: fatores[i] ?? '',
    }))
    // Linha nova deixada em branco não é item (nem erro).
    .filter((i) => i.insumoId || i.subfichaId || i.quantidade.trim());
  const entrada = {
    nome: textoDe(form.get('nome')),
    tipo: textoDe(form.get('tipo')),
    descricao: textoDe(form.get('descricao')),
    modoPreparo: textoDe(form.get('modoPreparo')),
    rendimento: textoDe(form.get('rendimento')),
    rendimentoUnidade: textoDe(form.get('rendimentoUnidade')),
    versao: textoDe(form.get('versao')),
    itens,
  };
  // A foto não vem no formulário (1.3): a tela já a enviou pela rota própria e manda só o nome sorteado.
  const enviada = textoDe(form.get('fotoNova'));
  let foto: MudancaDeFoto = { tipo: 'manter' };
  if (enviada) {
    if (!NOME_DA_FOTO.test(enviada)) return { erroDaFoto: 'Escolha a foto de novo.' };
    foto = { tipo: 'enviada', arquivo: enviada };
  } else if (form.get('removerFoto') === 'sim') foto = { tipo: 'remover' };
  return { entrada, foto };
}

const vez = (a: EstadoImportacao) => (a?.vez ?? 0) + 1;

/** Prévia: arquivo (ou o texto já lido) → o que vai acontecer. Nada é gravado. */
export async function executarPrevia(cliente: ClienteDoParceiro, anterior: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const arquivo = form.get('planilha');
  if (!(arquivo instanceof File) || arquivo.size === 0) return { vez: vez(anterior), erro: 'Escolha o arquivo da planilha (CSV).' };
  if (arquivo.size > LIMITE_DA_PLANILHA) return { vez: vez(anterior), erro: 'Planilha acima de 256 KB: divida em arquivos menores.' };
  const texto = decodificarPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
  const previa = await previaDaImportacao(cliente, texto);
  return { vez: vez(anterior), previa, texto, arquivo: arquivo.name.slice(0, 120) };
}

/** Confirmar: o MESMO texto da prévia, refeito e gravado numa transação. */
export async function executarImportacao(
  cliente: ClienteDoParceiro,
  anterior: EstadoImportacao,
  form: FormData,
  autorNome: string,
  base: string,
): Promise<EstadoImportacao> {
  const texto = textoDe(form.get('texto'));
  if (!texto || texto.length > LIMITE_DA_PLANILHA) return { vez: vez(anterior), erro: 'Envie a planilha de novo para ver a prévia.' };
  const r = await importarFichas(cliente, texto, autorNome);
  if (!r.ok) return { ...anterior, vez: vez(anterior), erro: r.erro };
  revalidatePath(base, 'layout');
  const { ok: _ok, ...resultado } = r;
  return { vez: vez(anterior), resultado };
}
