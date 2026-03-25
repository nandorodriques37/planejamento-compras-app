import { Project } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

// Fix __dirname in ES modules
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const project = new Project();
const sourceFile = project.addSourceFileAtPath(path.join(__dirname, 'src/pages/EstoquePlanning.tsx'));

const cdSummaryInterface = sourceFile.getInterfaceOrThrow('CDSummary');
const mainChartTooltip = sourceFile.getFunctionOrThrow('MainChartTooltip');
const cdCard = sourceFile.getFunctionOrThrow('CDCard');
const skuDetailPanel = sourceFile.getFunctionOrThrow('SKUDetailPanel');
const cdGroupsTable = sourceFile.getFunctionOrThrow('CDGroupsTable');

// Get code blocks
const parts = {
    cdSummary: cdSummaryInterface.getText(),
    tooltip: mainChartTooltip.getText(),
    cdCard: cdCard.getText(),
    skuDetail: skuDetailPanel.getText(),
    cdGroups: cdGroupsTable.getText(),
};

// Create content for CDCard.tsx
const cdCardFileContent = `import React, { useState } from 'react';
import { Warehouse, ArrowUpRight, ArrowDownRight, Minus, ChevronUp, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Area, Line } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { formatNumber } from '../../lib/calculationEngine';

export ${parts.cdSummary}

export ${parts.tooltip}

export ${parts.cdGroups}

export ${parts.cdCard}
`;

// Create content for SKUDetailPanel.tsx
const skuPanelFileContent = `import React, { useMemo } from 'react';
import { BarChart3, Activity, Package, TrendingDown, X } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine, Bar, Line } from 'recharts';
import type { ProjecaoSKU, SKUCadastro } from '../../lib/calculationEngine';
import { formatMes, formatNumber } from '../../lib/calculationEngine';
import { MainChartTooltip } from './CDCard';

export ${parts.skuDetail}
`;

const warehouseDir = path.join(__dirname, 'src/components/warehouse');
if (!fs.existsSync(warehouseDir)) {
    fs.mkdirSync(warehouseDir, { recursive: true });
}

fs.writeFileSync(path.join(warehouseDir, 'CDCard.tsx'), cdCardFileContent);
fs.writeFileSync(path.join(warehouseDir, 'SKUDetailPanel.tsx'), skuPanelFileContent);

// Remove extracted nodes from AST
cdSummaryInterface.remove();
mainChartTooltip.remove();
cdCard.remove();
skuDetailPanel.remove();
cdGroupsTable.remove();

// Add new imports
sourceFile.addImportDeclaration({
    moduleSpecifier: '../components/warehouse/CDCard',
    namedImports: [{ name: 'CDCard' }, { name: 'CDSummary', isTypeOnly: true }]
});

sourceFile.addImportDeclaration({
    moduleSpecifier: '../components/warehouse/SKUDetailPanel',
    namedImports: [{ name: 'SKUDetailPanel' }]
});

sourceFile.saveSync();
console.log('Extraction successfully completed with ts-morph!');
