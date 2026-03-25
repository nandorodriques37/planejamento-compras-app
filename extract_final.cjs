const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/pages/EstoquePlanning.tsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

// Arrays are 0-indexed. Line N is index N-1.
// 56 to 81 -> index 55 to 81 (exclusive of end, so 81)
const cdSummaryInterface = lines.slice(55, 81).join('\n');
const tooltipCode = lines.slice(86, 105).join('\n');
const cdCardCode = lines.slice(143, 331).join('\n');
const skuPanelCode = lines.slice(336, 505).join('\n');
const cdGroupsTableCode = lines.slice(519, 626).join('\n');

const cdCardFile = `import React, { useState } from 'react';
import { Warehouse, ArrowUpRight, ArrowDownRight, Minus, ChevronUp, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Area, Line } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { formatNumber } from '../../lib/calculationEngine';

export ${cdSummaryInterface}

export ${tooltipCode}

export ${cdGroupsTableCode}

export ${cdCardCode}
`;

const skuPanelFile = `import React, { useMemo } from 'react';
import { BarChart3, Activity, Package, TrendingDown, X } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Bar, Line } from 'recharts';
import type { ProjecaoSKU, SKUCadastro } from '../../lib/calculationEngine';
import { formatMes, formatNumber } from '../../lib/calculationEngine';
import { MainChartTooltip } from './CDCard';

export ${skuPanelCode}
`;

const warehouseDir = path.join(__dirname, 'client/src/components/warehouse');
if (!fs.existsSync(warehouseDir)) {
    fs.mkdirSync(warehouseDir, { recursive: true });
}

fs.writeFileSync(path.join(warehouseDir, 'CDCard.tsx'), cdCardFile);
fs.writeFileSync(path.join(warehouseDir, 'SKUDetailPanel.tsx'), skuPanelFile);

// Remove extracted blocks from end to start to avoid index shifting
lines.splice(519, 626 - 519); // CDGroupsTable
lines.splice(336, 505 - 336); // SKUDetailPanel
lines.splice(143, 331 - 143); // CDCard
lines.splice(86, 105 - 86); // MainChartTooltip
lines.splice(55, 81 - 55); // CDSummary

const insertIndex = lines.findIndex(l => l.includes("import type { ProjecaoSKU, SKUCadastro, MesData }"));
if (insertIndex !== -1) {
    lines.splice(insertIndex + 1, 0, "import { CDCard, type CDSummary } from '../components/warehouse/CDCard';\nimport { SKUDetailPanel } from '../components/warehouse/SKUDetailPanel';");
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Line-based extraction completed!');
