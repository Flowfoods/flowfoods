import { getServerSession } from 'next-auth';
import { lerComTeto } from '@/lib/erp/corpo-limitado';
import { origemDoSite } from '@/lib/erp/sessao';
import { appDeReferenciaFinancial } from '@/lib/integracoes/core/apps';
import {
  apurarReferenciaFinancial, ErroApuracaoReferencia, LIMITE_ARQUIVO_REFERENCIA, LIMITE_TOTAL_REFERENCIA, MAX_PAGINAS_REFERENCIA,
} from '@/lib/integracoes/ifood/financial-v3-apuracao-referencia';
import { authOptions } from '@/lib/rodolfo/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const tetoMultipart = LIMITE_TOTAL_REFERENCIA + 64 * 1024;
const resposta = (status: number, dados: object) => Response.json(dados, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
const erro = (status: number, mensagem: string) => resposta(status, { mensagem });
const ehArquivo = (v: FormDataEntryValue | null): v is File => !!v && typeof v !== 'string' && v.size > 0;
const bytes = async (f: File) => new Uint8Array(await f.arrayBuffer());

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const sessao = await getServerSession(authOptions);
  if (!(sessao?.user as { id?: string } | undefined)?.id) return erro(401, 'Entre na central FlowFoods para conferir esta apuração.');
  if (req.headers.get('origin') !== await origemDoSite()) return erro(403, 'Envie os arquivos pela central FlowFoods.');
  const app = await appDeReferenciaFinancial((await props.params).id);
  if (!app) return erro(403, 'Selecione um aplicativo iFood TEST com o módulo Financial cadastrado.');
  const tipo = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(tipo)) return erro(415, 'Selecione os arquivos no formulário de apuração.');
  const tamanho = req.headers.get('content-length');
  if (tamanho !== null && (!/^\d+$/.test(tamanho) || Number(tamanho) > tetoMultipart)) return erro(413, 'O envio excede 6 MiB.');
  const corpo = await lerComTeto(req, tetoMultipart);
  if (!corpo) return erro(413, 'O envio excede 6 MiB.');
  let form: FormData;
  try { form = await new Response(corpo, { headers: { 'Content-Type': tipo } }).formData(); }
  catch { return erro(400, 'O envio está incompleto. Selecione novamente as fontes.'); }

  const unicos = ['competencia', 'inicio', 'fim', 'conciliacao', 'liquidacao'];
  if (unicos.some(k => form.getAll(k).length !== 1) || [...form.keys()].some(k => !unicos.includes(k) && k !== 'eventos'))
    return erro(400, 'Informe cada campo e cada fonte uma única vez, com um arquivo por página de eventos.');
  const competencia = form.get('competencia'), inicio = form.get('inicio'), fim = form.get('fim');
  const conciliacao = form.get('conciliacao'), liquidacao = form.get('liquidacao'), eventos = form.getAll('eventos');
  if (typeof competencia !== 'string' || typeof inicio !== 'string' || typeof fim !== 'string'
      || !ehArquivo(conciliacao) || !ehArquivo(liquidacao) || !eventos.length || eventos.length > MAX_PAGINAS_REFERENCIA || !eventos.every(ehArquivo))
    return erro(400, 'Selecione o período, um CSV.gz, a resposta de liquidações e até 20 páginas de eventos.');
  const fontes = [conciliacao, liquidacao, ...eventos];
  if (fontes.some(f => f.size > LIMITE_ARQUIVO_REFERENCIA) || fontes.reduce((s, f) => s + f.size, 0) > LIMITE_TOTAL_REFERENCIA)
    return erro(413, 'Use até 2 MiB por arquivo e 6 MiB no total.');
  try {
    const apuracao = await apurarReferenciaFinancial({ competencia, inicio, fim }, {
      conciliacao: await bytes(conciliacao), eventos: await Promise.all(eventos.map(bytes)), liquidacao: await bytes(liquidacao),
    });
    return resposta(200, { app: { clientId: app.clientId, ambiente: 'TEST' }, origem: 'ARQUIVOS_APRESENTADOS', apuracao });
  } catch (e) {
    if (e instanceof ErroApuracaoReferencia) return erro(422, e.message);
    return erro(500, 'A conferência não pôde ser concluída. Reenvie as fontes para tentar novamente.');
  }
}
