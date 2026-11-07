import { describe, expect, it, vi } from 'vitest';
import type { AcaoFichaUnificada, EstadoFichaUnificada } from '@/lib/erp/ficha-unificada-campos';
type Ciclo = { estados: unknown[]; indice: number; refs: unknown[]; ref: number; efeito: boolean; limpar?: () => void; estado: EstadoFichaUnificada; acao?: AcaoFichaUnificada };
const atual = vi.hoisted(() => ({ ciclo: null as Ciclo | null }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (inicial: unknown) => { const c=atual.ciclo!, n=c.indice++; if(!(n in c.estados)) c.estados[n]=inicial; return [c.estados[n], (valor: unknown) => { c.estados[n]=valor; }]; },
  useRef: (v: unknown) => { const c=atual.ciclo!, n=c.ref++; return c.refs[n] ?? (c.refs[n]={current:v}); },
  useEffect: (fn: () => (() => void)) => { const c=atual.ciclo!; if(!c.efeito) { c.efeito=true; c.limpar=fn(); } },
  useActionState: (acao: AcaoFichaUnificada) => { const c=atual.ciclo!; c.acao=acao; return [c.estado, async (f: FormData) => { c.estado=await c.acao!(c.estado,f); }]; }
}));

import { useEnvioFicha } from '@/components/erp/telas/fichas/use-envio-ficha';
const adiado = () => { let resolver!: (r: EstadoFichaUnificada) => void; let recusar!: (e: Error) => void; const promessa=new Promise<EstadoFichaUnificada>((r,e)=>{resolver=r;recusar=e;}); return {promessa,resolver,recusar}; };
const ack = (repetido=false): Extract<EstadoFichaUnificada,{ok:true}> => repetido ? {ok:true,vez:1,id:'f',mensagem:'Envio já confirmado',destino:'/erp',repetido:true} : {ok:true,vez:1,id:'f',mensagem:'Salva',destino:'/erp/fichas/f/editar',repetido:false,versao:'v2',versaoMateriais:'m2'};
function montar(acao: AcaoFichaUnificada) {
 const c:Ciclo={estados:[],indice:0,refs:[],ref:0,efeito:false,estado:null}; const antes=vi.fn(),confirmar=vi.fn();
 function Renderizar(){c.indice=0;c.ref=0;atual.ciclo=c;try{return useEnvioFicha(acao,antes,confirmar);}finally{atual.ciclo=null;}}
 return {c,antes,confirmar,renderizar:Renderizar,desmontar:()=>c.limpar?.()};
}
describe('3C · ACK próprio, rede perdida e navegação',()=>{
 it.each([false,true])('só limpa/navega após confirmação do envio atual (replay=%s)',async repetido=>{
  const espera=adiado(),acao=vi.fn<AcaoFichaUnificada>().mockReturnValue(espera.promessa),h=montar(acao),f=new FormData();f.set('chaveEnvio','mesma-chave');
  const envio=h.renderizar().enviar(f);expect(h.antes).toHaveBeenCalledOnce();expect(h.confirmar).not.toHaveBeenCalled();expect(h.renderizar().pendente).toBe(true);
  const r=ack(repetido);espera.resolver(r);await envio;expect(h.confirmar).toHaveBeenCalledExactlyOnceWith(r);expect(h.renderizar().pendente).toBe(false);expect(acao.mock.calls[0][1].get('chaveEnvio')).toBe('mesma-chave');
 });
 it('erro de rede mantém rascunho e identidade; retry usa a mesma chave, sem falso sucesso',async()=>{
  const acao=vi.fn<AcaoFichaUnificada>().mockRejectedValueOnce(new Error('resposta perdida')).mockResolvedValueOnce(ack(true)),h=montar(acao),f=new FormData();f.set('chaveEnvio','duravel');
  await h.renderizar().enviar(f);expect(h.c.estado).toMatchObject({ok:false,indeterminado:true});expect(h.confirmar).not.toHaveBeenCalled();
  await h.renderizar().enviar(f);expect(acao.mock.calls.map(x=>x[1].get('chaveEnvio'))).toEqual(['duravel','duravel']);expect(h.confirmar).toHaveBeenCalledOnce();
 });
 it('conflito da edição não limpa nada nem substitui versões ou campos',async()=>{
  const r:EstadoFichaUnificada={ok:false,vez:1,conflito:true,erros:{geral:'Confira a ficha salva.'}},acao=vi.fn<AcaoFichaUnificada>().mockResolvedValue(r),h=montar(acao),f=new FormData();f.set('versao','v1');f.set('versaoMateriais','m1');f.set('nome','Rascunho');
  await h.renderizar().enviar(f);expect(h.c.estado).toEqual(r);expect(h.confirmar).not.toHaveBeenCalled();expect(Object.fromEntries(f)).toEqual({versao:'v1',versaoMateriais:'m1',nome:'Rascunho'});
 });
 it('ACK atrasado da tela abandonada não limpa o rascunho reaberto nem navega',async()=>{
  const espera=adiado(),h=montar(vi.fn<AcaoFichaUnificada>().mockReturnValue(espera.promessa));const envio=h.renderizar().enviar(new FormData());h.desmontar();const nova=montar(vi.fn<AcaoFichaUnificada>());nova.renderizar();espera.resolver(ack());await envio;expect(h.confirmar).not.toHaveBeenCalled();expect(nova.confirmar).not.toHaveBeenCalled();expect(h.c.estado).toBeNull();
 });
 it('tentativa posterior invalida resposta antiga mesmo se ela foi bem-sucedida',async()=>{
  const a=adiado(),b=adiado(),h=montar(vi.fn<AcaoFichaUnificada>().mockReturnValueOnce(a.promessa).mockReturnValueOnce(b.promessa));const primeiro=h.renderizar().enviar(new FormData());const segundo=h.renderizar().enviar(new FormData());a.resolver(ack());await primeiro;expect(h.confirmar).not.toHaveBeenCalled();b.resolver({ok:false,vez:2,erros:{geral:'Conferir'}});await segundo;expect(h.confirmar).not.toHaveBeenCalled();expect(h.c.estado).toMatchObject({ok:false,vez:2});
 });
});
