import { promisify } from 'node:util';
import { gunzip, type Gunzip } from 'node:zlib';

const descompactar = promisify(gunzip);
const maximoCompactado = 2 * 1024 * 1024;
const maximoDescompactado = 8 * 1024 * 1024;
const maximoRegistros = 100_001; // Cabeçalho e até 100 mil lançamentos.
const maximoColunas = 128;
const maximoCaracteresPorCampo = 65_536;

function csvInvalido(): never {
  throw new Error('CSV de conciliação inválido.');
}

function limiteExcedido(): never {
  throw new Error('Limite local do arquivo de conciliação excedido.');
}

/** Lê registros lógicos delimitados por ponto e vírgula, inclusive campos entre aspas. */
function percorrerCsv(texto: string, receber?: (campos: readonly string[]) => void) {
  if (!texto.length || texto.includes('\0')) csvInvalido();
  let indice = 0;
  let registros = 0;
  while (indice < texto.length) {
    if (++registros > maximoRegistros) limiteExcedido();
    const campos: string[] | undefined = receber ? [] : undefined;
    let numeroColunas = 0;
    for (;;) {
      if (++numeroColunas > maximoColunas) limiteExcedido();
      const entreAspas = texto[indice] === '"';
      if (entreAspas) indice++;
      const inicio = indice;
      while (indice < texto.length) {
        const atual = texto[indice];
        if (atual === '"') {
          if (!entreAspas) csvInvalido();
          if (texto[indice + 1] !== '"') break;
          indice += 2;
        } else {
          if (!entreAspas && (atual === ';' || atual === '\r' || atual === '\n')) break;
          indice++;
        }
        if (indice - inicio > maximoCaracteresPorCampo) limiteExcedido();
      }
      const fim = indice;
      if (entreAspas && texto[indice++] !== '"') csvInvalido();
      if (campos) {
        const campo = texto.slice(inicio, fim);
        campos.push(entreAspas ? campo.replaceAll('""', '"') : campo);
      }
      if (texto[indice] !== ';') break;
      indice++;
    }
    if (indice < texto.length) {
      if (texto[indice] === '\r') {
        indice++;
        if (texto[indice] === '\n') indice++;
      } else if (texto[indice] === '\n') indice++;
      else csvInvalido();
    }
    if (receber && campos) receber(campos);
  }
}

export async function lerRegistrosCsvGzip(bytes: Uint8Array, receber: (campos: readonly string[]) => void): Promise<void> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error('Gzip de conciliação inválido.');
  }
  if (bytes.length > maximoCompactado) limiteExcedido();
  const entrada = Buffer.from(bytes);
  let conteudo: Buffer;
  try {
    // Os tipos de Node descrevem apenas o retorno padrão, sem info.
    const resultado = await descompactar(entrada, { maxOutputLength: maximoDescompactado, info: true }) as unknown as {
      buffer: Buffer; engine: Pick<Gunzip, 'bytesWritten'>;
    };
    if (resultado.engine.bytesWritten !== entrada.length) throw new Error();
    conteudo = resultado.buffer;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') limiteExcedido();
    throw new Error('Gzip de conciliação inválido.');
  }
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(conteudo);
  } catch {
    throw new Error('Codificação UTF-8 inválida no arquivo de conciliação.');
  }
  // Valida o último registro antes de entregar o primeiro ao consumidor.
  percorrerCsv(texto);
  percorrerCsv(texto, receber);
}
