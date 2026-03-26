/** Tipos para cadastro de capacidade dos armazéns */

/** Um agrupamento de categorias dentro de um CD */
export interface WarehouseGroup {
  id: string;
  nome: string;
  capacidadeM3: number;
  categoriasNivel3: string[];
}

/** Configuração de agrupamentos para um CD */
export interface CDWarehouseConfig {
  codigoDepositoPd: number;
  grupos: WarehouseGroup[];
}

/** Estrutura raiz persistida no Supabase */
export type WarehouseCapacityData = CDWarehouseConfig[];
