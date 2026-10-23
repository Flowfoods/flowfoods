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
  ArrowLeftRight,
  Columns2,
  Contact,
  CookingPot,
  FileBarChart,
  Gauge,
  History,
  Inbox,
  Bike,
  ListChecks,
  Tags,
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
  Truck,
  Users,
  Wheat,
  Briefcase,
  Handshake,
  FileText,
  FileUp,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import type { ChaveIcone } from '@/lib/erp/modulos';

export const ICONES: Record<ChaveIcone, LucideIcon> = {
  inicio: LayoutGrid,
  insumo: Wheat,
  novo: Plus,
  importar: FileUp,
  fichas: ClipboardList,
  compras: ShoppingCart,
  fornecedor: Truck,
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
  canais: Bike,
  categorias: Tags,
  classificar: ListChecks,
  relatorio: FileBarChart,
  comparar: Columns2,
  periodos: ArrowLeftRight,
};

export function Icone({ nome, ...props }: { nome: ChaveIcone } & LucideProps) {
  const Desenho = ICONES[nome] ?? Building2;
  return <Desenho aria-hidden strokeWidth={1.75} {...props} />;
}
