import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// Simulando o seu banco de dados (carregando o JSON de exemplo)
const dataPath = path.join(__dirname, '../client/public/sample-data.json');
let allData: any[] = [];
if (fs.existsSync(dataPath)) {
  allData = JSON.parse(fs.readFileSync(dataPath, 'utf-8')).projections || [];
}

app.get('/api/projections', (req: Request, res: Response) => {
  // 1. Pegar parâmetros da URL (Query Params) com valores padrão
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const search = (req.query.search as string) || '';
  const statusFilter = (req.query.status as string) || 'ALL';
  const sortBy = (req.query.sortBy as string) || 'sku';
  const sortDir = (req.query.sortDir as string) || 'asc';

  let filteredData = [...allData];

  // 2. Aplicar Filtros (Server-Side)
  if (search) {
    const lowerSearch = search.toLowerCase();
    filteredData = filteredData.filter(
      (item) =>
        item.sku.toLowerCase().includes(lowerSearch) ||
        item.description.toLowerCase().includes(lowerSearch)
    );
  }

  if (statusFilter !== 'ALL') {
    filteredData = filteredData.filter((item) => item.status === statusFilter);
  }

  // 3. Aplicar Ordenação (Server-Side)
  filteredData.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];

    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // 4. Aplicar Paginação (Server-Side)
  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // 5. Retornar o Payload no formato correto
  res.json({
    data: paginatedData,
    meta: {
      totalItems,
      totalPages,
      currentPage: page,
      limit,
    },
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
