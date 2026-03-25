import React, { useState, useRef } from 'react';
import { Pencil, Undo2 } from 'lucide-react';
import { formatNumber } from '../../lib/calculationEngine';

export function EditableCell({ 
  value, 
  isEdited, 
  onEdit,
  onUndo
}: { 
  value: number; 
  isEdited: boolean; 
  onEdit: (val: number) => void;
  onUndo?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTempValue(String(value));
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleConfirm = () => {
    setEditing(false);
    const numVal = parseInt(tempValue) || 0;
    if (numVal !== value) {
      onEdit(numVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') setEditing(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isEdited && onUndo) {
      e.preventDefault();
      e.stopPropagation();
      onUndo();
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleConfirm}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full px-1 py-0.5 text-xs font-mono text-right bg-primary/10 border border-primary rounded outline-none tabular-nums"
        style={{ minWidth: 50 }}
      />
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      className={`
        group relative px-2 py-1 text-right text-[11px] font-mono tabular-nums cursor-pointer
        hover:bg-primary/5 transition-colors rounded mx-0.5
        ${isEdited ? 'bg-amber-50/60 text-amber-700 font-bold border border-amber-200 border-dashed ring-1 ring-amber-400/20' : 'text-primary font-semibold border border-transparent hover:border-primary/20 hover:border-dashed'}
      `}
      title={isEdited ? "Duplo clique para editar · Botão direito para desfazer" : "Duplo clique para editar"}
    >
      {formatNumber(value)}
      {isEdited ? (
        <Undo2 className="w-2.5 h-2.5 absolute right-0.5 top-0.5 text-amber-500/60 opacity-0 group-hover:opacity-100 transition-opacity" />
      ) : (
        <Pencil className="w-2.5 h-2.5 absolute right-0.5 top-0.5 text-primary/40 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}
