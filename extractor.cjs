const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/pages/EstoquePlanning.tsx');
let content = fs.readFileSync(filePath, 'utf8');

function extractBlock(source, startKeyword, endKeyword) {
    const startIdx = source.indexOf(startKeyword);
    if (startIdx === -1) return null;
    
    const openBraceIdx = source.indexOf('{', startIdx);
    let braces = 1;
    let currentIdx = openBraceIdx + 1;
    let inString = false;
    let strChar = '';
    
    while (braces > 0 && currentIdx < source.length) {
        const char = source[currentIdx];
        
        if (inString) {
            if (char === strChar && source[currentIdx - 1] !== '\\\\') {
                inString = false;
            }
        } else {
            if (char === "'" || char === '"' || char === '\`') {
                inString = true;
                strChar = char;
            } else if (char === '{') {
                braces++;
            } else if (char === '}') {
                braces--;
            }
        }
        currentIdx++;
    }
    
    const code = source.substring(startIdx, currentIdx);
    return code;
}

const cdSummaryInterface = extractBlock(content, 'interface CDSummary');
const tooltipCode = extractBlock(content, 'function MainChartTooltip(');
const cdCardCode = extractBlock(content, 'function CDCard(');
const skuPanelCode = extractBlock(content, 'function SKUDetailPanel(');
const cdGroupsTableCode = extractBlock(content, 'function CDGroupsTable(');

if (!cdSummaryInterface || !tooltipCode || !cdCardCode || !skuPanelCode || !cdGroupsTableCode) {
    console.error('Failed to extract some components');
    process.exit(1);
}

// Write to files
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

// Replace in EstoquePlanning
content = content.replace(cdSummaryInterface, '');
content = content.replace(tooltipCode, '');
content = content.replace(cdCardCode, '');
content = content.replace(skuPanelCode, '');
content = content.replace(cdGroupsTableCode, '');

// Insert imports
const insertIndex = content.indexOf("import type { ProjecaoSKU, SKUCadastro, MesData }");
if (insertIndex !== -1) {
    const before = content.substring(0, insertIndex);
    const after = content.substring(insertIndex);
    content = before + "import { CDCard, type CDSummary } from '../components/warehouse/CDCard';\\nimport { SKUDetailPanel } from '../components/warehouse/SKUDetailPanel';\\n" + after;
}

fs.writeFileSync(filePath, content);
console.log('Extraction completed!');
