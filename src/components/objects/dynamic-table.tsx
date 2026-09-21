'use client';

import { useState, useMemo } from 'react';
import { MoreHorizontal, ChevronDown, ChevronUp, Search, Filter, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FieldDefinition, ObjectRecord, ViewType } from '@/types/objects';

interface DynamicTableViewProps {
  fields: FieldDefinition[];
  records: ObjectRecord[];
  view?: ViewType;
  onRecordClick?: (recordId: string) => void;
  onNewRecord?: () => void;
  onSearch?: (query: string) => void;
  loading?: boolean;
}

export function DynamicTableView({
  fields,
  records,
  view = 'TABLE',
  onRecordClick,
  onNewRecord,
  onSearch,
  loading = false,
}: DynamicTableViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  // Campos visibles en la lista
  const visibleFields = useMemo(
    () => fields.filter(f => f.visibleInList),
    [fields]
  );

  // Campo primario (primera columna)
  const primaryField = visibleFields[0];

  // Manejar búsqueda
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  // Manejar ordenamiento
  const handleSort = (fieldId: string) => {
    if (sortField === fieldId) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortField(fieldId);
      setSortDirection('ASC');
    }
  };

  // Registros ordenados y filtrados
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Filtrar por búsqueda
    if (searchQuery && primaryField) {
      result = result.filter(record => {
        const value = record.fields[primaryField.name];
        return value?.toString().toLowerCase().includes(searchQuery.toLowerCase());
      });
    }

    // Ordenar
    if (sortField) {
      result.sort((a, b) => {
        const aVal = a.fields[sortField];
        const bVal = b.fields[sortField];
        
        if (aVal < bVal) return sortDirection === 'ASC' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'ASC' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [records, searchQuery, sortField, sortDirection, primaryField]);

  // Renderizar valor según tipo de campo
  const renderFieldValue = (field: FieldDefinition, value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    switch (field.type) {
      case 'CURRENCY':
        return new Intl.NumberFormat('es-ES', {
          style: 'currency',
          currency: 'USD',
        }).format(value);

      case 'BOOLEAN':
        return value ? (
          <Badge variant="default" className="text-xs">Sí</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">No</Badge>
        );

      case 'SELECT':
        const option = field.options?.find(o => o.id === value);
        return option ? (
          <Badge 
            variant="outline" 
            className="text-xs"
            style={{ 
              backgroundColor: `${option.color}20`,
              borderColor: option.color,
              color: option.color,
            }}
          >
            {option.label}
          </Badge>
        ) : (
          value
        );

      case 'MULTI_SELECT':
        return (
          <div className="flex flex-wrap gap-1">
            {(value as string[]).map((valId) => {
              const option = field.options?.find(o => o.id === valId);
              return option ? (
                <Badge
                  key={valId}
                  variant="outline"
                  className="text-xs"
                  style={{
                    backgroundColor: `${option.color}20`,
                    borderColor: option.color,
                    color: option.color,
                  }}
                >
                  {option.label}
                </Badge>
              ) : null;
            })}
          </div>
        );

      case 'DATE':
      case 'DATE_TIME':
        return new Date(value).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          ...(field.type === 'DATE_TIME' && { hour: '2-digit', minute: '2-digit' }),
        });

      case 'EMAIL':
        return (
          <a href={`mailto:${value}`} className="text-primary hover:underline">
            {value}
          </a>
        );

      case 'URL':
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {value}
          </a>
        );

      case 'RATING':
        return (
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < value ? 'text-yellow-500' : 'text-gray-300'}>
                ★
              </span>
            ))}
          </div>
        );

      case 'IMAGE':
        return value ? (
          <img src={value} alt="Preview" className="h-10 w-10 object-cover rounded" />
        ) : null;

      case 'FILE':
        return (
          <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            📎 Archivo
          </a>
        );

      default:
        return value;
    }
  };

  // Renderizar según tipo de vista
  if (view === 'KANBAN') {
    return (
      <div className="text-center py-12">
        <p>Vista Kanban - Próximamente</p>
      </div>
    );
  }

  if (view === 'GALLERY') {
    return (
      <div className="text-center py-12">
        <p>Vista Galería - Próximamente</p>
      </div>
    );
  }

  if (view === 'TIMELINE') {
    return (
      <div className="text-center py-12">
        <p>Vista Timeline - Próximamente</p>
      </div>
    );
  }

  // Vista TABLA por defecto
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por ${primaryField?.label || 'nombre'}...`}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button size="sm" onClick={onNewRecord}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-12 p-3 border-b">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
                    } else {
                      setSelectedRecords(new Set());
                    }
                  }}
                  checked={selectedRecords.size === filteredRecords.length && filteredRecords.length > 0}
                  className="rounded border-gray-300"
                />
              </th>
              {visibleFields.map((field) => (
                <th
                  key={field.id}
                  className="p-3 text-left font-medium text-sm cursor-pointer hover:bg-muted"
                  onClick={() => handleSort(field.name)}
                  style={{ width: field.columnSize }}
                >
                  <div className="flex items-center gap-1">
                    {field.label}
                    {sortField === field.name && (
                      sortDirection === 'ASC' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    )}
                  </div>
                </th>
              ))}
              <th className="w-12 p-3 border-b" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleFields.length + 2} className="p-8 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={visibleFields.length + 2} className="p-8 text-center text-muted-foreground">
                  No hay registros
                </td>
              </tr>
            ) : (
              filteredRecords.map((record) => (
                <tr
                  key={record.id}
                  className={`border-b hover:bg-muted/50 cursor-pointer ${
                    selectedRecords.has(record.id) ? 'bg-muted' : ''
                  }`}
                  onClick={() => onRecordClick?.(record.id)}
                >
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedRecords.has(record.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedRecords);
                        if (e.target.checked) {
                          newSelected.add(record.id);
                        } else {
                          newSelected.delete(record.id);
                        }
                        setSelectedRecords(newSelected);
                      }}
                      className="rounded border-gray-300"
                    />
                  </td>
                  {visibleFields.map((field) => (
                    <td key={field.id} className="p-3 text-sm">
                      {renderFieldValue(field, record.fields[field.name])}
                    </td>
                  ))}
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      {/* `render` y no `asChild`: los componentes son de
                          Base UI, que compone así. */}
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon" />}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Ver</DropdownMenuItem>
                        <DropdownMenuItem>Editar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer con selección */}
      {selectedRecords.size > 0 && (
        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
          <span className="text-sm text-muted-foreground">
            {selectedRecords.size} registro(s) seleccionado(s)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Editar</Button>
            <Button variant="outline" size="sm" className="text-destructive">Eliminar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
