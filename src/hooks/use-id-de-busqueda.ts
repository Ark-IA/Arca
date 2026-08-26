'use client';

/**
 * Lee el `?id=` con el que llega un resultado de la búsqueda global.
 *
 * Se lee de `window.location` dentro de un efecto y no con `useSearchParams`
 * a propósito: ese hook obliga a envolver la página en un `<Suspense>` porque
 * Next no puede prerrenderizarla sin conocer la URL. Estas páginas son
 * estáticas y el dato solo hace falta en el navegador, así que leerlo acá
 * evita partir tres pantallas en dos componentes por un parámetro.
 *
 * El parámetro se BORRA de la barra de direcciones después de leerlo. Si se
 * quedara, recargar la página volvería a abrir la misma ficha, y compartir el
 * enlace mandaría a alguien a un registro que no estaba buscando.
 */

import { useEffect, useState } from 'react';

export function useIdDeBusqueda(): string | null {
  return useParametroUnaVez('id');
}

/**
 * Lo mismo para `?nuevo=<teléfono>`, con el que el aviso de llamada entrante
 * manda a crear el contacto de un número desconocido.
 */
export function useTelefonoNuevo(): string | null {
  return useParametroUnaVez('nuevo');
}

function useParametroUnaVez(nombre: string): string | null {
  const [valor, setValor] = useState<string | null>(null);

  useEffect(() => {
    const leido = new URLSearchParams(window.location.search).get(nombre);
    if (!leido) return;
    setValor(leido);

    // `replaceState` y no `router.replace`: no hace falta volver a renderizar
    // ni tocar el historial, solo limpiar lo que se ve en la barra.
    const url = new URL(window.location.href);
    url.searchParams.delete(nombre);
    window.history.replaceState({}, '', url.toString());
  }, [nombre]);

  return valor;
}
