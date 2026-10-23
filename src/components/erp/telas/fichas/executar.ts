/**
 * O miolo das actions de ficha técnica, comum ao nível 1 e à pessoa do
 * parceiro: ler o envio do formulário (itens repetidos, nome da foto enviada) e o arquivo da
 * planilha. Quem chama já resolveu o contexto e conferiu `fichas.editar` e o
 * bloqueio. As regras estão em `src/lib/erp/{fichas,ficha-importar}.ts`.
 */

import { revalidatePath } from 'next/cache';
import type { EntradaDaFicha, ItemDigitado } from '@/lib/erp/ficha-campos';
import type { EmbalagemDigitada } from '@/lib/erp/canal-campos';
import type { MudancaDeFoto } from '@/lib/erp/fichas';
import { importarFichas, previaDaImportacao } from '@/lib/erp/ficha-importar';
import { decodificarPlanilha, LIMITE_DA_PLANILHA } from '@/lib/erp/ficha-planilha';
import { NOME_DA_FOTO } from '@/lib/erp/foto';
import { entradaDoFormulario } from '@/lib/erp/validade';
import type { ClienteDoParceiro } from '@/lib/erp/tenant';
import type { EstadoImportacao } from './estado';
import { PREFIXO_DO_PREPARO } from './prefixo';

const textoDe = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '');


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
    // 1.4: o bloco de validade vem sempre do formulário (marcador); sem ele, a ficha mantém a que tem.
    validade: form.get('validadeNoFormulario') === 'sim' ? entradaDoFormulario((k) => textoDe(form.get(k))) : undefined,
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

/**
 * 1.9: FormData das embalagens por canal → linhas (na ordem da tela) + a
 * impressão da lista que a tela leu. Linha nova deixada em branco não é
 * embalagem (nem erro).
 */
export function lerEnvioDasEmbalagens(form: FormData): { impressao: string; linhas: EmbalagemDigitada[] } {
  const canais = form.getAll('emb_canal').map(textoDe);
  const insumos = form.getAll('emb_insumo').map(textoDe);
  const quantidades = form.getAll('emb_quantidade').map(textoDe);
  const unidades = form.getAll('emb_unidade').map(textoDe);
  const linhas = canais
    .map((canal, i) => ({ canal, insumoId: insumos[i] ?? '', quantidade: quantidades[i] ?? '', unidade: unidades[i] ?? '' }))
    .filter((l) => l.insumoId || l.quantidade.trim());
  return { impressao: textoDe(form.get('impressao')), linhas };
}

/** 1.10: o formulário dos preços — só o TEXTO de cada canal (o resto o servidor calcula) e o que a tela leu. */
export function lerEnvioDosPrecos(form: FormData) {
  return {
    impressao: textoDe(form.get('impressao')),
    custos: textoDe(form.get('custos')),
    precos: { LOJA: textoDe(form.get('preco_LOJA')), DELIVERY_PROPRIO: textoDe(form.get('preco_DELIVERY_PROPRIO')), IFOOD: textoDe(form.get('preco_IFOOD')) },
    // N.3: a tela que pergunta "vende neste canal?" manda `ofertas=1`; caixa desmarcada não vai no formulário.
    ...(form.get('ofertas') === '1'
      ? { ofertas: { LOJA: form.get('oferta_LOJA') === 'sim', DELIVERY_PROPRIO: form.get('oferta_DELIVERY_PROPRIO') === 'sim', IFOOD: form.get('oferta_IFOOD') === 'sim' } }
      : {}),
  };
}

/** N.2: as metas de CMV dos canais e a versão lida. */
export function lerEnvioDasMetas(form: FormData) {
  return {
    versao: textoDe(form.get('versao')),
    metas: { LOJA: textoDe(form.get('metaCmv_LOJA')), DELIVERY_PROPRIO: textoDe(form.get('metaCmv_DELIVERY_PROPRIO')), IFOOD: textoDe(form.get('metaCmv_IFOOD')) },
  };
}

/** 1.10: as margens-alvo dos canais e a versão lida. */
export function lerEnvioDasMargens(form: FormData) {
  return {
    versao: textoDe(form.get('versao')),
    margens: { LOJA: textoDe(form.get('margem_LOJA')), DELIVERY_PROPRIO: textoDe(form.get('margem_DELIVERY_PROPRIO')), IFOOD: textoDe(form.get('margem_IFOOD')) },
  };
}
