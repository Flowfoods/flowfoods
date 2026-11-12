import { lerComTeto } from '@/lib/erp/corpo-limitado';
import type { ContextoDoParceiro } from '@/lib/erp/contexto-base';
import { moduloLiberado } from '@/lib/erp/liberacao';
import { pode } from '@/lib/erp/permissoes';
import { diaDoPainelValido } from '../ifood/painel-campos';
import { LIMITE_ARQUIVO_FONTES_FINANCIAL, LIMITE_MANIFESTO_FONTES_FINANCIAL } from '../ifood/financial-v3-pacote-fontes';
import { registrarFontesFinancial } from './fontes-financial';
import { formularioFinancialPedeHtml } from './fontes-financial-navegacao';

// Margem apenas para as duas partes e os cabeçalhos do multipart.
const LIMITE_DO_ENVIO = LIMITE_ARQUIVO_FONTES_FINANCIAL + LIMITE_MANIFESTO_FONTES_FINANCIAL + 64 * 1024;
const resposta = (status: number, dados: object) => Response.json(dados, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });

function campoUnico(url: URLSearchParams, chave: string): string | null {
  const valores = url.getAll(chave);
  const valor = valores[0];
  return valores.length === 1 && valor && valor.length <= 128 && valor.trim() === valor ? valor : null;
}

async function processarPacoteFinancial(req: Request, ctx: ContextoDoParceiro | null, origemDoErp: string) {
  if (!ctx) return resposta(401, { mensagem: 'Entre na central FlowFoods para registrar fontes.' });
  if (ctx.alcance.nivel !== 'FLOWFOODS' || !ctx.podeEscrever || ctx.bloqueio || ctx.parceiro.status !== 'ATIVO')
    return resposta(403, { mensagem: 'O recebimento exige acesso de escrita na central deste parceiro ativo.' });
  if (req.headers.get('origin') !== origemDoErp) return resposta(403, { mensagem: 'Envie os arquivos pela central FlowFoods.' });

  const query = new URL(req.url).searchParams;
  const lojaId = campoUnico(query, 'loja'), conexaoId = campoUnico(query, 'conexao'), competencia = campoUnico(query, 'competencia');
  if (!lojaId || !conexaoId || !competencia || !diaDoPainelValido(`${competencia}-01`))
    return resposta(400, { mensagem: 'Selecione uma loja, uma conexão e uma competência válidas.' });
  if (!pode(ctx.alcance, 'integracao.ver', { lojaId }) || !pode(ctx.alcance, 'faturamento.ver', { lojaId }) || !await moduloLiberado(ctx.cliente, 'integracao'))
    return resposta(403, { mensagem: 'Recebimento indisponível no acesso desta loja.' });

  const tipo = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(tipo)) return resposta(415, { mensagem: 'Selecione os dois arquivos no formulário.' });
  const tamanho = req.headers.get('content-length');
  if (tamanho !== null && (!/^\d+$/.test(tamanho) || Number(tamanho) > LIMITE_DO_ENVIO))
    return resposta(413, { mensagem: 'O envio excede o limite de 2 MiB por arquivo.' });
  const bytes = await lerComTeto(req, LIMITE_DO_ENVIO);
  if (!bytes) return resposta(413, { mensagem: 'O envio excede o limite de 2 MiB por arquivo.' });

  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { 'Content-Type': tipo } }).formData();
  } catch {
    return resposta(400, { mensagem: 'O envio está incompleto. Selecione novamente os arquivos.' });
  }
  const arquivo = form.get('arquivo'), manifesto = form.get('manifesto');
  if (Array.from(form.keys()).length !== 2 || !arquivo || typeof arquivo === 'string' || !manifesto || typeof manifesto === 'string'
    || arquivo.size === 0 || manifesto.size === 0)
    return resposta(400, { mensagem: 'Envie um CSV.gz e um manifesto JSON, ambos preenchidos.' });
  if (arquivo.size > LIMITE_ARQUIVO_FONTES_FINANCIAL || manifesto.size > LIMITE_MANIFESTO_FONTES_FINANCIAL)
    return resposta(413, { mensagem: 'Cada arquivo pode ter até 2 MiB.' });

  const [gzip, json] = await Promise.all([arquivo.arrayBuffer(), manifesto.arrayBuffer()]);
  const resultado = await registrarFontesFinancial(ctx, { lojaId, conexaoId, competencia,
    arquivoGzip: new Uint8Array(gzip), manifestoJson: new Uint8Array(json) });
  if (!resultado.ok) {
    const status = resultado.motivo === 'pacote-invalido' ? 422 : resultado.motivo === 'sem-permissao' ? 403 : 409;
    return resposta(status, { mensagem: resultado.mensagem });
  }
  return resposta(resultado.reenvio ? 200 : 201, { reciboId: resultado.reciboId, reenvio: resultado.reenvio });
}

/** O post nativo, inclusive antes da hidratação, volta à tela por GET. O fetch do formulário pede JSON. */
export async function receberPacoteFinancial(req: Request, ctx: ContextoDoParceiro | null, origemDoErp: string) {
  const resultado = await processarPacoteFinancial(req, ctx, origemDoErp);
  if (!formularioFinancialPedeHtml(req.headers) || req.headers.get('origin') !== origemDoErp) return resultado;
  const cabecalhos = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!ctx) return new Response(null, { status: 303, headers: { ...cabecalhos, Location: '/rodolfo/login' } });

  const query = new URL(req.url).searchParams;
  const destino = new URL(`/rodolfo/integracoes/${encodeURIComponent(ctx.parceiro.slug)}/financial`, origemDoErp);
  const loja = campoUnico(query, 'loja');
  const mes = campoUnico(query, 'competencia');
  const conexao = campoUnico(query, 'conexao');
  if (loja) destino.searchParams.set('loja', loja);
  if (mes && diaDoPainelValido(mes + '-01')) destino.searchParams.set('competencia', mes);
  if (conexao) destino.searchParams.set('conexao', conexao);
  if (resultado.ok) {
    const { reciboId } = await resultado.json();
    destino.searchParams.set('recibo', reciboId);
    destino.hash = 'recibo-' + encodeURIComponent(reciboId);
  } else {
    destino.searchParams.set('erroEnvio', String(resultado.status));
    destino.hash = 'aviso-envio';
  }
  return new Response(null, { status: 303, headers: { ...cabecalhos, Location: destino.pathname + destino.search + destino.hash } });
}
