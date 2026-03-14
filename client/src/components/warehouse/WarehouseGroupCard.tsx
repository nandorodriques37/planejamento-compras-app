/**
 * Card de um agrupamento de armazém.
 * Nome editável inline, campo de capacidade, categorias como badges.
 */

import { useState, useRef, useEffect } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import type { WarehouseGroup } from '@/lib/warehouseTypes';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import CategoryPicker from './CategoryPicker';

interface WarehouseGroupCardProps {
  grupo: WarehouseGroup;
  categoriasDisponiveis: string[];
  onRenomear: (novoNome: string) => void;
  onAtualizarCapacidade: (capacidadeM3: number) => void;
  onAdicionarCategoria: (categoria: string) => void;
  onRemoverCategoria: (categoria: string) => void;
  onExcluir: () => void;
}

export default function WarehouseGroupCard({
  grupo,
  categoriasDisponiveis,
  onRenomear,
  onAtualizarCapacidade,
  onAdicionarCategoria,
  onRemoverCategoria,
  onExcluir,
}: WarehouseGroupCardProps) {
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeTemp, setNomeTemp] = useState(grupo.nome);
  const inputNomeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editandoNome && inputNomeRef.current) {
      inputNomeRef.current.focus();
      inputNomeRef.current.select();
    }
  }, [editandoNome]);

  const salvarNome = () => {
    const nome = nomeTemp.trim();
    if (nome && nome !== grupo.nome) {
      onRenomear(nome);
    } else {
      setNomeTemp(grupo.nome);
    }
    setEditandoNome(false);
  };

  const handleKeyDownNome = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') salvarNome();
    if (e.key === 'Escape') {
      setNomeTemp(grupo.nome);
      setEditandoNome(false);
    }
  };

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          {/* Nome editável */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {editandoNome ? (
              <Input
                ref={inputNomeRef}
                value={nomeTemp}
                onChange={e => setNomeTemp(e.target.value)}
                onBlur={salvarNome}
                onKeyDown={handleKeyDownNome}
                className="h-8 text-sm font-semibold"
              />
            ) : (
              <button
                onClick={() => setEditandoNome(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors truncate"
                title="Clique para editar o nome"
              >
                <span className="truncate">{grupo.nome}</span>
                <Pencil className="w-3 h-3 flex-shrink-0 opacity-50" />
              </button>
            )}
          </div>

          {/* Capacidade */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Capacidade:</label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={grupo.capacidadeM3 || ''}
              onChange={e => {
                const val = parseFloat(e.target.value);
                onAtualizarCapacidade(isNaN(val) ? 0 : val);
              }}
              className="h-7 w-24 text-xs text-right"
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground">m³</span>
          </div>

          {/* Excluir */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir agrupamento</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o agrupamento "{grupo.nome}"?
                  As categorias vinculadas serão desvinculadas e ficarão disponíveis para outros agrupamentos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onExcluir} className="bg-destructive text-white hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Categorias */}
        <div className="flex flex-wrap items-center gap-1.5">
          {grupo.categoriasNivel3.length === 0 && (
            <span className="text-xs text-muted-foreground italic">Nenhuma categoria vinculada</span>
          )}
          {grupo.categoriasNivel3.map(cat => (
            <Badge key={cat} variant="secondary" className="gap-1 pr-1">
              {cat}
              <button
                onClick={() => onRemoverCategoria(cat)}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                title={`Remover ${cat}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
          <CategoryPicker
            categoriasDisponiveis={categoriasDisponiveis}
            onSelect={onAdicionarCategoria}
          />
        </div>
      </CardContent>
    </Card>
  );
}
