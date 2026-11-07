import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guardarRascunho, lerRascunho, descartarRascunho } from '@/components/erp/telas/cadastro/rascunho';
import type { ValoresDaFicha } from '@/components/erp/telas/fichas/form-ficha';
let dados: Map<string, string>;
const chave = 'parceiro-a:pessoa-a:/erp/fichas/f/editar';
const rascunho: ValoresDaFicha = { nome: 'Receita alterada', tipo: 'PRATO', descricao: 'Texto', modoPreparo: 'Anterior', passos: ['Cortar', '', 'Montar'], rendimento: 'inválido', rendimentoUnidade: 'porcao', itens: [{ escolha: 'i', quantidade: '0,x', unidade: 'g', fator: 'não' }], validades: null, consumoImediato: false, materiais: [{ chave: 7, canal: 'IFOOD', insumoId: '', quantidade: '2,x', unidade: 'un' }], versaoDaFicha: 'v1', versaoMateriais: 'm1', chaveEnvio: 'envio-duravel', foto: { tipo: 'nova', arquivo: 'token-pendente.jpg' }, retorno: { bloco: 'embalagens', canal: 'IFOOD', chave: 7 }, alterado: true };
beforeEach(() => {
 dados = new Map(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T01:00:00Z'));
 vi.stubGlobal('window', { sessionStorage: { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => dados.set(k, v), removeItem: (k: string) => dados.delete(k) } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('3C · armazenamento opt-in completo e isolado', () => {
 it('guarda textos inválidos, linhas/canal, foto por token e identidade; leitura preservada não consome', () => {
  expect(guardarRascunho(chave, rascunho, 'v1')).toBe(true);
  expect(lerRascunho(chave, 'v1', true)).toEqual({ valores: rascunho, versaoMudou: false, versaoDeOrigem: 'v1' });
  expect(lerRascunho(chave, 'v1', true).valores).toEqual(rascunho);
  expect([...dados.values()][0]).not.toMatch(/blob:|base64/);
 });
 it('conflito conserva conteúdo e versões originais; comportamento legado continua recusando', () => {
  guardarRascunho(chave, rascunho, 'v1');
  expect(lerRascunho<ValoresDaFicha>(chave, 'v2', true)).toEqual({ valores: rascunho, versaoMudou: true, versaoDeOrigem: 'v1' });
  expect(lerRascunho(chave, 'v2')).toEqual({ valores: null, versaoMudou: true });
  expect(lerRascunho<ValoresDaFicha>(chave, 'v2', true).valores?.versaoMateriais).toBe('m1');
 });
 it('chave impede troca de pessoa, parceiro e rota; expira aos vinte minutos sem promessa de outra aba', () => {
  guardarRascunho(chave, rascunho, 'v1');
  for(const outra of ['parceiro-b:pessoa-a:/erp/fichas/f/editar','parceiro-a:pessoa-b:/erp/fichas/f/editar','parceiro-a:pessoa-a:/erp/fichas/outra/editar']) expect(lerRascunho(outra, 'v1', true).valores).toBeNull();
  vi.advanceTimersByTime(20 * 60 * 1000 + 1); expect(lerRascunho(chave, 'v1', true).valores).toBeNull(); expect(dados.size).toBe(0);
 });
 it('só descarta explicitamente; erro de quota é comunicável ao formulário sem jogar fora o que já havia', () => {
  guardarRascunho(chave, rascunho, 'v1');
  vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(guardarRascunho(chave, { ...rascunho, nome: 'Mais novo' }, 'v1')).toBe(false); expect(lerRascunho<ValoresDaFicha>(chave, 'v1', true).valores?.nome).toBe('Receita alterada');
  descartarRascunho(chave); expect(lerRascunho(chave, 'v1', true).valores).toBeNull();
 });
});
