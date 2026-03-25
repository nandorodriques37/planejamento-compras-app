import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxFilterProps {
  value: string;
  onValueChange: (value: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export function ComboboxFilter({
  value,
  onValueChange,
  options,
  placeholder = "Selecione...",
  emptyText = "Nenhum resultado.",
  className
}: ComboboxFilterProps) {
  const [open, setOpen] = React.useState(false)

  const selectedOption = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-[11px] font-medium text-slate-700 dark:text-foreground bg-slate-50/50 dark:bg-background border-slate-200 dark:border-input px-2.5 py-4 h-8 hover:bg-slate-100/50",
            className
          )}
        >
          <span className="truncate flex-1 text-left">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="min-w-[200px] w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">{emptyText}</CommandEmpty>
            <CommandGroup className="max-h-[250px] overflow-y-auto">
              <CommandItem
                value="Todos"
                onSelect={() => {
                  onValueChange("");
                  setOpen(false);
                }}
                className="text-[11px] font-semibold"
              >
                <Check
                  className={cn(
                    "mr-2 h-3 w-3",
                    value === "" ? "opacity-100" : "opacity-0"
                  )}
                />
                Todas as Opções
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className="text-[11px]"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3 w-3",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
