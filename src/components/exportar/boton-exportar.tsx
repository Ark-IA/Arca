'use client';

/**
 * Botón "Exportar": corre la exportación, descarga el CSV y avisa cuántas
 * filas salieron. Si el tope de seguridad recortó el archivo, lo dice: un
 * export incompleto que no avisa es peor que ninguno.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { descargarCsv, hoyArchivo } from '@/lib/exportar/csv';
import type { Exportado } from '@/lib/exportar/entidades';

export function BotonExportar({
  exportar,
  archivo,
  disabled,
  className,
}: {
  exportar: () => Promise<Exportado>;
  /** Sin extensión ni fecha: se agregan solas. */
  archivo: string;
  disabled?: boolean;
  className?: string;
}) {
  const [trabajando, setTrabajando] = useState(false);

  const correr = async () => {
    setTrabajando(true);
    try {
      const r = await exportar();
      if (r.filas === 0) {
        toast.info('No hay nada que exportar.');
        return;
      }
      descargarCsv(`${archivo}-${hoyArchivo()}.csv`, r.csv);
      if (r.recortado) {
        toast.warning(
          `Se exportaron las primeras ${r.filas.toLocaleString('es')} filas: es el máximo por archivo.`
        );
      } else {
        toast.success(`${r.filas.toLocaleString('es')} filas exportadas.`);
      }
    } catch (e) {
      console.error('[exportar]', e);
      toast.error('No se pudo exportar.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={correr}
      disabled={disabled || trabajando}
      className={className}
    >
      {trabajando ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      Exportar
    </Button>
  );
}
