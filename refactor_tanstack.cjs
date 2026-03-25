const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/components/ProjectionTable.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// Hook injection
code = code.replace(
  "import { EditableCell } from './ui/EditableCell';",
  "import { EditableCell } from './ui/EditableCell';\nimport { useVirtualizer } from '@tanstack/react-virtual';"
);

// State cleanup & Virtualizer implementation
const oldVirtualizationState = `  // Virtualization state
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollbarHeight, setScrollbarHeight] = useState(0);

  // Measure horizontal scrollbar height to compensate fixed pane alignment
  useEffect(() => {
    if (scrollBodyRef.current) {
      const h = scrollBodyRef.current.offsetHeight - scrollBodyRef.current.clientHeight;
      setScrollbarHeight(h);
    }
  }, []);`;

const newVirtualizationState = `  // Virtualization state
  const [scrollbarHeight, setScrollbarHeight] = useState(0);

  useEffect(() => {
    if (scrollBodyRef.current) {
      const h = scrollBodyRef.current.offsetHeight - scrollBodyRef.current.clientHeight;
      setScrollbarHeight(h);
    }
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: sortedProjecoes.length,
    getScrollElement: () => scrollBodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });
`;

code = code.replace(oldVirtualizationState, newVirtualizationState);

// Synced scroll handlers cleanup
const oldScrollHandlers = `  // Synced scroll handlers
  const handleFixedScroll = useCallback(() => {
    if (fixedBodyRef.current && scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = fixedBodyRef.current.scrollTop;
      setScrollTop(fixedBodyRef.current.scrollTop);
    }
  }, []);

  const handleScrollableScroll = useCallback(() => {
    if (scrollBodyRef.current && fixedBodyRef.current) {
      fixedBodyRef.current.scrollTop = scrollBodyRef.current.scrollTop;
      setScrollTop(scrollBodyRef.current.scrollTop);
    }
    if (scrollBodyRef.current && totalsScrollRef.current) {
      totalsScrollRef.current.scrollLeft = scrollBodyRef.current.scrollLeft;
    }
  }, []);`;

const newScrollHandlers = `  // Synced scroll handlers
  const handleFixedScroll = useCallback(() => {
    if (fixedBodyRef.current && scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = fixedBodyRef.current.scrollTop;
    }
  }, []);

  const handleScrollableScroll = useCallback(() => {
    if (scrollBodyRef.current && fixedBodyRef.current) {
      fixedBodyRef.current.scrollTop = scrollBodyRef.current.scrollTop;
    }
    if (scrollBodyRef.current && totalsScrollRef.current) {
      totalsScrollRef.current.scrollLeft = scrollBodyRef.current.scrollLeft;
    }
  }, []);`;

code = code.replace(oldScrollHandlers, newScrollHandlers);

// Remove manual math 
const oldMath = `  // ============================================================
  // VIRTUALIZATION: calculate visible row range
  // ============================================================
  const totalRows = sortedProjecoes.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  
  const startIdx = useMemo(() => {
    return Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  }, [scrollTop]);
  
  const endIdx = useMemo(() => {
    return Math.min(totalRows, Math.ceil((scrollTop + TABLE_BODY_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  }, [scrollTop, totalRows]);
  
  const visibleRows = useMemo(() => {
    return sortedProjecoes.slice(startIdx, endIdx);
  }, [sortedProjecoes, startIdx, endIdx]);

  const topPadding = startIdx * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalRows - endIdx) * ROW_HEIGHT);`;

code = code.replace(oldMath, `  // ============================================================
  // VIRTUALIZAÇÃO: Gerenciada pelo TanStack Virtual
  // ============================================================
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const totalRows = sortedProjecoes.length;
`);

// Replace the rendered fixed rows
const oldFixedRender = `            <div style={{ height: totalHeight + scrollbarHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: topPadding, left: 0, right: 0 }}>
                {visibleRows.map((proj, idx) => renderFixedRow(proj, idx))}
              </div>
            </div>`;

const newFixedRender = `            <div style={{ height: totalHeight + scrollbarHeight, position: 'relative', width: '100%' }}>
              {virtualItems.map((virtualRow) => {
                const proj = sortedProjecoes[virtualRow.index];
                return (
                  <div key={virtualRow.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: virtualRow.size, transform: \`translateY(\${virtualRow.start}px)\` }}>
                    {renderFixedRow(proj, 0)}
                  </div>
                );
              })}
            </div>`;

code = code.replace(oldFixedRender, newFixedRender);

// Sub globalIdx definition in renderFixedRow
code = code.replace(
  "const globalIdx = startIdx + rowIdx;",
  "const globalIdx = projecoes.indexOf(proj);"
);
code = code.replace(
  "const globalIdx = startIdx + rowIdx;",
  "const globalIdx = projecoes.indexOf(proj);"
);
// Replace the rendered scrollable rows
const oldScrollRender = `            <div style={{ minWidth: totalScrollWidth, height: totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: topPadding, left: 0, right: 0 }}>
                {visibleRows.map((proj, idx) => renderScrollableRow(proj, idx))}
              </div>
            </div>`;

const newScrollRender = `            <div style={{ minWidth: totalScrollWidth, height: totalHeight, position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const proj = sortedProjecoes[virtualRow.index];
                return (
                  <div key={virtualRow.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: virtualRow.size, transform: \`translateY(\${virtualRow.start}px)\` }}>
                    {renderScrollableRow(proj, 0)}
                  </div>
                );
              })}
            </div>`;

code = code.replace(oldScrollRender, newScrollRender);


fs.writeFileSync(filePath, code);
console.log('TanStack Virtual implementation applied!');
