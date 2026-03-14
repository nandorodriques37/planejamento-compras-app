/**
 * Seletor de categorias nível 3 com busca.
 * Usa Popover + Command (shadcn) para lista pesquisável.
 */

import { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

interface CategoryPickerProps {
  categoriasDisponiveis: string[];
  onSelect: (categoria: string) => void;
}

export default function CategoryPicker({ categoriasDisponiveis, onSelect }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);

  if (categoriasDisponiveis.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Plus className="w-3 h-3" />
          Adicionar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {categoriasDisponiveis.map(cat => (
                <CommandItem
                  key={cat}
                  value={cat}
                  onSelect={() => {
                    onSelect(cat);
                    setOpen(false);
                  }}
                >
                  <Check className="w-3 h-3 opacity-0" />
                  {cat}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
