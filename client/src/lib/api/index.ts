/**
 * API Client Entry Point
 * 
 * Este arquivo centraliza todas as requisições de API feitas pelo frontend.
 * Atualmente, exporta os endpoints simulados (mockDataLake) para desenvolvimento sem backend.
 * 
 * PARA A EQUIPE DE TI MIGRAR PARA O DATA LAKE REAL:
 * 1. Crie um arquivo `dataLakeClient.ts` com implementações reais usando `fetch` ou `axios`.
 * 2. Mude o export default abaixo para apontar para seu novo arquivo.
 * 3. O frontend passará a consumir os dados reais sem precisar alterar os componentes.
 */

export * from './types';
export * from './mockDataLake'; // <- Alterar isso no futuro para import/export do cliente real
