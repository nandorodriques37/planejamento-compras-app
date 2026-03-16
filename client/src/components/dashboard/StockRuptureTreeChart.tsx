import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import type { RuptureTreeData } from '../../hooks/useDashboardData';

interface StockRuptureTreeChartProps {
  data: RuptureTreeData;
  onClick?: (category: string, situacao: string) => void;
}

function CustomTreemapContent(props: any) {
  const { x, y, width, height, name, size, color, depth, root, onClickHandler } = props;

  if (depth < 2) return null;
  if (width < 4 || height < 4) return null;

  const handleClick = () => {
    if (onClickHandler && root) {
      onClickHandler(root.name, name);
    }
  };

  return (
    <g onClick={handleClick} style={{ cursor: onClickHandler ? 'pointer' : 'default' }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        rx={4}
        stroke="var(--background, #fff)"
        strokeWidth={2}
      />
      {width > 60 && height > 35 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 8}
            textAnchor="middle"
            fill="white"
            fontSize={12}
            fontWeight={600}
            style={{ pointerEvents: 'none' }}
          >
            {name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize={11}
            style={{ pointerEvents: 'none' }}
          >
            {size} SKUs
          </text>
        </>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const parentName = item.root?.name ?? '';

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{parentName}</p>
      <p className="text-muted-foreground">
        {item.name}: <span className="font-mono font-semibold text-foreground">{item.size}</span> SKUs
      </p>
    </div>
  );
}

export default function StockRuptureTreeChart({ data, onClick }: StockRuptureTreeChartProps) {
  const totalItems = data.children.reduce(
    (sum, cat) => sum + cat.children.reduce((s, c) => s + c.size, 0),
    0,
  );

  if (totalItems === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Nenhum item em ruptura ou risco identificado.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={260}>
        <Treemap
          data={data.children}
          dataKey="size"
          nameKey="name"
          stroke="none"
          content={<CustomTreemapContent onClickHandler={onClick} />}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap px-1">
        {data.children.map(cat =>
          cat.children.map((leaf, i) => (
            <div key={`${cat.name}-${i}`} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: leaf.color }}
              />
              <span className="text-muted-foreground">
                {cat.name} – {leaf.name}:
              </span>
              <span className="font-mono font-semibold text-foreground">{leaf.size}</span>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
