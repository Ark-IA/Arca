'use client';

/**
 * Elegir la empresa de un contacto, o crearla al vuelo.
 *
 * Lo segundo importa más de lo que parece: si para asignarle una empresa a un
 * contacto hubiera que salir a la pantalla de Empresas, crearla, volver y
 * buscarla, la mitad de los contactos se quedarían sin empresa. Escribir un
 * nombre que no existe y pulsar "Crear" es lo que hace que el dato se cargue.
 */

import { useMemo, useState } from 'react';
import { Building2, Check, Loader2, Plus, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useCompanies } from '@/hooks/use-companies';
import { cn } from '@/lib/utils';

export function SelectorDeEmpresa({
  valor,
  onCambiar,
}: {
  /** id de la empresa elegida, o `null`. */
  valor: string | null;
  onCambiar: (id: string | null, nombre: string | null) => void;
}) {
  const { empresas, cargando, crear } = useCompanies();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);

  const elegida = useMemo(
    () => empresas.find((e) => e.id === valor) ?? null,
    [empresas, valor],
  );

  const coincidencias = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (q === '') return empresas.slice(0, 6);
    return empresas.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 6);
  }, [empresas, texto]);

  // Solo se ofrece crear si el nombre escrito no existe ya. Ofrecerlo siempre
  // llevaría a duplicados con el mismo nombre.
  const puedeCrear =
    texto.trim() !== '' &&
    !empresas.some((e) => e.name.toLowerCase() === texto.trim().toLowerCase());

  const crearYElegir = async () => {
    setCreando(true);
    const nueva = await crear({ name: texto.trim() });
    setCreando(false);
    if (nueva) {
      onCambiar(nueva.id, nueva.name);
      setTexto('');
      setAbierto(false);
    }
  };

  if (elegida) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {elegida.name}
        </span>
        <button
          type="button"
          onClick={() => onCambiar(null, null)}
          aria-label="Quitar la empresa"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        // El cierre se retrasa: sin eso, el clic en una opción de la lista se
        // pierde porque el blur la desmonta antes de que llegue el evento.
        onBlur={() => setTimeout(() => setAbierto(false), 160)}
        placeholder={cargando ? 'Cargando empresas…' : 'Buscar o crear una empresa…'}
        disabled={cargando}
        className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
      />

      {abierto && (coincidencias.length > 0 || puedeCrear) && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
          {coincidencias.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onCambiar(e.id, e.name);
                  setTexto('');
                  setAbierto(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  'text-foreground hover:bg-muted',
                )}
              >
                <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {e.contact_count ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {e.contact_count}
                  </span>
                ) : null}
              </button>
            </li>
          ))}

          {puedeCrear && (
            <li>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={crearYElegir}
                disabled={creando}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-primary transition-colors hover:bg-primary/10"
              >
                {creando ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                ) : (
                  <Plus className="size-3.5 shrink-0" />
                )}
                Crear “{texto.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
