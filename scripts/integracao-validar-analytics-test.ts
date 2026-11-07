/** Sem banco, cofre ou rede. Apenas diagnóstico de um JSON preservado pelo leitor TEST. */
import { readFile, stat } from 'node:fs/promises';
import { conferirEvidenciaAnalyticsTest } from '../src/lib/integracoes/ifood/analytics-evidencia';
import { ErroContratoAnalytics } from '../src/lib/integracoes/ifood/analytics';

async function principal(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--arquivo' || !args[1]) {
    console.error('Use --arquivo <evidencia-test.json>. Este comando não chama o iFood.');
    return 2;
  }
  const info = await stat(args[1]);
  if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Arquivo fora do limite local.');
  const texto = await readFile(args[1], 'utf8');
  if (Buffer.byteLength(texto) > 10 * 1024 * 1024) throw new Error('Arquivo fora do limite local.');
  const resultado = conferirEvidenciaAnalyticsTest(JSON.parse(texto));
  console.log(JSON.stringify(resultado, null, 2));
  // 0 = formato, páginas e campos diários compatíveis (dinheiro não avaliado);
  // 1 = evidência válida, mas incompleta/incompatível; 2 = arquivo/contrato inválido.
  return resultado.cobertura !== 'incompleto' && resultado.consultaDiariaCompativel ? 0 : 1;
}
principal().then((codigo) => { process.exitCode = codigo; }).catch((erro: unknown) => {
  console.error(erro instanceof ErroContratoAnalytics ? `${erro.codigo}: ${erro.message}` : 'Não foi possível validar o arquivo TEST. Confira o caminho, o tamanho e o JSON.');
  process.exitCode = 2;
});
