/**
 * Chave → ícone (Lucide). Os dados do menu viajam do servidor para o cliente
 * como texto (componente não atravessa a fronteira do RSC); o desenho mora
 * aqui, num lugar só. Ícone é funcional (módulo, menu, ação), nunca enfeite.
 */

import {
  Boxes,
  Building2,
  Calculator,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Contact,
  CookingPot,
  Gauge,
  History,
  Inbox,
  KeyRound,
  LayoutGrid,
  MapPin,
  Plus,
  Repeat,
  Settings2,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Tag,
  Users,
  Wheat,
  Briefcase,
  Handshake,
  FileText,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { ChaveIcone } from '@/lib/erp/modulos';

export const ICONES: Record<ChaveIcone, LucideIcon> = {
  inicio: LayoutGrid,
  insumo: Wheat,
  novo: Plus,
  fichas: ClipboardList,
  compras: ShoppingCart,
  estoque: Boxes,
  producao: CookingPot,
  etiquetas: Tag,
  dre: Calculator,
  rede: Store,
  lojas: Store,
  equipe: Users,
  historico: History,
  acesso: KeyRound,
  cadastro: FileText,
  comercial: Briefcase,
  hoje: CalendarClock,
  leads: Contact,
  cadencia: Repeat,
  inbox: Inbox,
  visitas: MapPin,
  metricas: Gauge,
  clientes: ClipboardCheck,
  portal: ClipboardCheck,
  parceiros: Handshake,
  sistema: SlidersHorizontal,
  config: Settings2,
};

export function Icone({ nome, ...props }: { nome: ChaveIcone } & LucideProps) {
  const Desenho = ICONES[nome] ?? Building2;
  return <Desenho aria-hidden strokeWidth={1.75} {...props} />;
}
