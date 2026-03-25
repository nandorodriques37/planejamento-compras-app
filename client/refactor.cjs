const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/EstoquePlanning.tsx');
let content = fs.readFileSync(filePath, 'utf8');

function extractFunctionAndRemove(name) {
  const match = content.match(new RegExp(`function ${name}\\([\\s\\S]*?\\r?\\n}`));
  if (match) {
    const code = match[0];
    content = content.replace(code, '');
    return code;
  }
  return '';
}

function extractInterfaceAndRemove(name) {
  const match = content.match(new RegExp(`interface ${name} \\{[\\s\\S]*?\\r?\\n}`));
  if (match) {
    const code = match[0];
    content = content.replace(code, '');
    return code;
  }
  return '';
}

const mainChartTooltipCode = extractFunctionAndRemove('MainChartTooltip');
const cdCardCode = extractFunctionAndRemove('CDCard');
const skuDetailPanelCode = extractFunctionAndRemove('SKUDetailPanel');
const cdGroupsTableCode = extractFunctionAndRemove('CDGroupsTable');
const cdSummaryInterface = extractInterfaceAndRemove('CDSummary');

const cdCardFile = `import React, { useState } from 'react';
import { Warehouse, ArrowUpRight, ArrowDownRight, Minus, ChevronUp, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Area, Line } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { formatNumber } from '../../lib/calculationEngine';

export ${cdSummaryInterface}

export ${mainChartTooltipCode}

export ${cdGroupsTableCode}

export ${cdCardCode}
`;

const skuPanelFile = `import React, { useMemo } from 'react';
import { BarChart3, Activity, Package, TrendingDown, X } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Bar, Line } from 'recharts';
import type { ProjecaoSKU, SKUCadastro } from '../../lib/calculationEngine';
import { formatMes, formatNumber } from '../../lib/calculationEngine';
import { MainChartTooltip } from './CDCard';

export ${skuDetailPanelCode}
`;

// Creates the directory if it doesn't exist
const warehouseDir = path.join(__dirname, 'src/components/warehouse');
if (!fs.existsSync(warehouseDir)) {
  fs.mkdirSync(warehouseDir, { recursive: true });
}

fs.writeFileSync(path.join(warehouseDir, 'CDCard.tsx'), cdCardFile);
fs.writeFileSync(path.join(warehouseDir, 'SKUDetailPanel.tsx'), skuPanelFile);

// Rewrite EstoquePlanning.tsx inserting the imports
let lines = content.split('\\n');
const insertIndex = lines.findIndex(l => l.includes("import { formatMes, formatNumber"));

if (insertIndex !== -1) {
  lines.splice(insertIndex + 1, 0, "import { CDCard, type CDSummary } from '../components/warehouse/CDCard';");
  lines.splice(insertIndex + 2, 0, "import { SKUDetailPanel } from '../components/warehouse/SKUDetailPanel';");
}
fs.writeFileSync(filePath, lines.join('\\n'));

console.log('Refactoring completed!');
