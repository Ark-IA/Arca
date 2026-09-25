'use client';

import { useState, useMemo } from 'react';
import { MoreHorizontal, ChevronDown, ChevronUp, Search, Plus } from 'lucide-react';
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

/**
 * Ordena dos valores sacados del JSONB de un registro.
 *
 * Los vacíos van siempre al final, en las dos direcciones: un nulo no
 * es "menor", es "no hay dato", y esconderlo arriba al invertir el
 * orden hace parecer que la columna se llenó sola.
 */
function compararValores(
  a: unknown,
  b: unknown,
  direccion: 'ASC' | 'DESC'
): number {
  const vacio = (v: unknown) => v === null || v === undefined || v === '';
  if (vacio(a) && vacio(b)) return 0;
  if (vacio(a)) return 1;
  if (vacio(b)) return -1;

  const signo = direccion === 'ASC' ? 1 : -1;

  // Números como números. `'9' < '10'` es falso como texto y verdadero
  // como número, y en una columna de importes lo segundo es lo que el
  // usuario quiere decir.
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * signo;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (Number(a) - Number(b)) * signo;
  }

  // Todo lo demás como texto, con la intercalación del idioma: en
  // español "ñ" va entre "n" y "o", no al final del alfabeto.
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * signo;
}

interface DynamicTableViewProps {
  fields: FieldDefinition[];
  records: ObjectRecord[];
  /**
   * Se acepta y se ignora: por ahora la única vista que existe es la tabla.
   * Kanban, galería y línea de tiempo mostraban «Próximamente» y dejaban el
   * objeto sin forma de ver sus registros; se quitaron hasta construirlas.
   */
  view?: ViewType;
  onRecordClick?: (recordId: string) => void;
  onDeleteRecords?: (recordIds: string[]) => void;
  onNewRecord?: () => void;
  onSearch?: (query: string) => void;
  loading?: boolean;
}

export function DynamicTableView({
  fields,
  records,
  onRecordClick,
  onDeleteRecords,
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

    // Ordenar.
    //
    // Los valores viven en un JSONB, así que en la misma columna puede
    // haber números, textos, booleanos o nulos. Comparar con `<` a
    // ciegas convertía a texto sin avisar: 9 quedaba después de 10, y
    // un nulo caía en cualquier parte. Se comparan números como números
    // y todo lo demás como texto, con los vacíos siempre al final —
    // que es donde la gente espera encontrarlos, ordene como ordene.
    if (sortField) {
      result.sort((a, b) => compararValores(a.fields[sortField], b.fields[sortField], sortDirection));
    }

    return result;
  }, [records, searchQuery, sortField, sortDirection, primaryField]);

  // Renderizar valor según tipo de campo.
  //
  // `value` sale de un JSONB, así que su tipo es una promesa del
  // esquema, no una garantía: un campo declarado CURRENCY puede tener
  // un texto si se cargó antes de cambiarle el tipo, o si entró por la
  // API. Cada rama comprueba lo que necesita y, si no encaja, muestra
  // el valor crudo. Antes se lo pasaba directo a `Intl.NumberFormat`
  // o a `new Date`, y un solo registro raro tumbaba la tabla entera.
  const renderFieldValue = (field: FieldDefinition, value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    const texto = String(value);

    switch (field.type) {
      case 'CURRENCY': {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) return texto;
        return new Intl.NumberFormat('es-ES', {
          style: 'currency',
          currency: 'USD',
        }).format(n);
      }

      case 'BOOLEAN':
        return value ? (
          <Badge variant="default" className="text-xs">Sí</Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">No</Badge>
        );

      case 'SELECT': {
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
          texto
        );
      }

      case 'MULTI_SELECT':
        // Un MULTI_SELECT debería traer una lista; si trae otra cosa,
        // se muestra tal cual en vez de reventar en `.map`.
        if (!Array.isArray(value)) return texto;
        return (
          <div className="flex flex-wrap gap-1">
            {value.map((valId) => {
              const option = field.options?.find(o => o.id === valId);
              return option ? (
                <Badge
                  key={String(valId)}
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
      case 'DATE_TIME': {
        const fecha =
          value instanceof Date ? value
          : typeof value === 'string' || typeof value === 'number' ? new Date(value)
          : null;
        if (!fecha || Number.isNaN(fecha.getTime())) return texto;
        return fecha.toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          ...(field.type === 'DATE_TIME' && { hour: '2-digit', minute: '2-digit' }),
        });
      }

      case 'EMAIL':
        return (
          <a href={`mailto:${texto}`} className="text-primary hover:underline">
            {texto}
          </a>
        );

      case 'URL':
        return (
          <a href={texto} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {texto}
          </a>
        );

      case 'RATING': {
        const estrellas = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(estrellas)) return texto;
        return (
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < estrellas ? 'text-yellow-500' : 'text-gray-300'}>
                ★
              </span>
            ))}
          </div>
        );
      }

      case 'IMAGE':
        return texto ? (
          // eslint-disable-next-line @next/next/no-img-element -- la URL la aporta el usuario en un campo libre, no es un asset del proyecto
          <img src={texto} alt="Preview" className="h-10 w-10 object-cover rounded" />
        ) : null;

      case 'FILE':
        return (
          <a href={texto} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            📎 Archivo
          </a>
        );

      default:
        return texto;
    }
  };

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
                        {onRecordClick && (
                          <DropdownMenuItem onClick={() => onRecordClick(record.id)}>
                            Editar
                          </DropdownMenuItem>
                        )}
                        {onDeleteRecords && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => onDeleteRecords([record.id])}
                          >
                            Eliminar
                          </DropdownMenuItem>
                        )}
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
      {selectedRecords.size > 0 && onDeleteRecords && (
        <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
          <span className="text-sm text-muted-foreground">
            {selectedRecords.size} registro(s) seleccionado(s)
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedRecords(new Set())}>
              Quitar selección
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => {
                // Se suelta la selección al pedir el borrado: después de
                // borrar, esas filas ya no existen y el contador mentiría.
                onDeleteRecords([...selectedRecords]);
                setSelectedRecords(new Set());
              }}
            >
              Eliminar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
