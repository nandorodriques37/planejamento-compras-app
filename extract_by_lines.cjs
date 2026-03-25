const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/pages/EstoquePlanning.tsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

const cdSummaryInterface = lines.slice(56, 82).join('\n');
const tooltipCode = lines.slice(87, 106).join('\n');
const cdCardCode = lines.slice(144, 332).join('\n');
const skuPanelCode = lines.slice(337, 511).join('\n');
const cdGroupsTableCode = lines.slice(525, 632).join('\n');

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
lines.splice(525, 632 - 525);
lines.splice(337, 511 - 337);
lines.splice(144, 332 - 144);
lines.splice(87, 106 - 87);
lines.splice(56, 82 - 56);

const insertIndex = lines.findIndex(l => l.includes("import type { ProjecaoSKU"));
if (insertIndex !== -1) {
    lines.splice(insertIndex + 1, 0, "import { CDCard, type CDSummary } from '../components/warehouse/CDCard';\\nimport { SKUDetailPanel } from '../components/warehouse/SKUDetailPanel';");
}

fs.writeFileSync(filePath, lines.join('\n'));
console.log('Line-based extraction completed!');
