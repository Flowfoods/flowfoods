export interface Servico {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  beneficios: string[];
}

export interface EtapaProcesso {
  numero: string;
  titulo: string;
  descricao: string;
}

export interface Diferencial {
  icone: string;
  titulo: string;
  descricao: string;
}

export interface ContactInfo {
  whatsapp: string;
  whatsappUrl: string;
  whatsappDisplay: string;
  /**
   * Opcional de propósito. Enquanto `contato@consultoriaflowfoods.com.br` não existir,
   * o site não mostra e-mail nenhum — o pessoal não volta como contato comercial.
   */
  email?: string;
  instagram: string;
  instagramUrl: string;
  linkedin: string;
  linkedinUrl: string;
}

/** Origem do clique — decide o texto com que o WhatsApp abre. */
export type OrigemContato = 'hero' | 'diagnostico' | 'consultoria' | 'parceria' | 'flutuante';
