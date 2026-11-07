/** Fingerprint do pedido, sem catálogo, custo atual ou acesso ao arquivo já assumido. */
import { createHash } from 'node:crypto';
import type { MudancaDeFoto } from './fichas';
import type { EntradaFichaUnificada } from './ficha-unificada-campos';
import { lerQuantidade } from './unidades';

function canonico(valor: unknown, nivel = 0): unknown {
  if (nivel > 12) throw new Error('Pedido de ficha inválido.');
  // Etiquetar cada tipo evita confundir ausência com um objeto recebido {ausente:true}.
  if (valor === undefined) return ['ausente'];
  if (valor === null) return ['nulo'];
  if (typeof valor === 'boolean') return ['booleano', valor];
  if (typeof valor === 'string') return ['texto', valor.normalize('NFC').trim()];
  if (typeof valor === 'number' && Number.isFinite(valor)) return ['numero', valor];
  if (Array.isArray(valor)) return ['lista', valor.map(v => canonico(v, nivel + 1))];
  if (typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    return ['objeto', Object.keys(valor).sort().map(chave => [chave, canonico((valor as Record<string, unknown>)[chave], nivel + 1)])];
  }
  throw new Error('Pedido de ficha inválido.');
}

const numero = (v: unknown) => typeof v === 'string' && v.trim() !== '' && lerQuantidade(v) !== null ? { milesimos: lerQuantidade(v) } : v;

export function hashDoEnvioDaFicha(entrada: EntradaFichaUnificada, foto: MudancaDeFoto = { tipo: 'manter' }): string {
  const materiais = entrada.materiais === undefined ? undefined : {
    versao: entrada.materiais.versao,
    linhas: entrada.materiais.linhas.map(linha => ({ canal: linha.canal, insumoId: linha.insumoId, quantidade: numero(linha.quantidade), unidade: linha.unidade }))
      .sort((a, b) => a.canal.localeCompare(b.canal) || a.insumoId.localeCompare(b.insumoId) || JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  const identidadeDaFoto = foto.tipo === 'trocar'
    ? { tipo: foto.tipo, sha256: createHash('sha256').update(foto.bytes).digest('hex') }
    : foto;
  const conteudo = {
    formato: 1, nome: entrada.nome, tipo: entrada.tipo, descricao: entrada.descricao, modoPreparo: entrada.modoPreparo,
    passos: entrada.passos, rendimento: numero(entrada.rendimento), rendimentoUnidade: entrada.rendimentoUnidade,
    itens: entrada.itens.map(i => ({ insumoId: i.insumoId, subfichaId: i.subfichaId, quantidade: numero(i.quantidade), unidade: i.unidade, fator: numero(i.fator) })),
    validade: entrada.validade, consumoImediato: entrada.consumoImediato, classificacao: entrada.classificacao,
    materiais, foto: identidadeDaFoto,
  };
  return createHash('sha256').update(JSON.stringify(canonico(conteudo))).digest('hex');
}
