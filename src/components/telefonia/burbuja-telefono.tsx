'use client';

/**
 * Burbuja de telefono, abajo a la izquierda.
 *
 * Se muestra unicamente a quien tiene una extension asignada. Para el resto
 * no aparece nada: un boton de telefono que siempre falla es peor que no
 * tener boton.
 */

import { useEffect, useState } from 'react';
import {
  Delete,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  X,
} from 'lucide-react';

import { useTelefono } from '@/components/telefonia/contexto-telefono';
import { sonarTecla } from '@/lib/telefonia/tono-teclado';
import { cn } from '@/lib/utils';

/**
 * Las letras bajo cada numero no son decoracion: son la referencia con la que
 * mucha gente lee un numero en voz alta ("el dos, el de ABC").
 */
const TECLAS: { digito: string; letras?: string }[] = [
  { digito: '1' },
  { digito: '2', letras: 'ABC' },
  { digito: '3', letras: 'DEF' },
  { digito: '4', letras: 'GHI' },
  { digito: '5', letras: 'JKL' },
  { digito: '6', letras: 'MNO' },
  { digito: '7', letras: 'PQRS' },
  { digito: '8', letras: 'TUV' },
  { digito: '9', letras: 'WXYZ' },
  { digito: '*' },
  { digito: '0', letras: '+' },
  { digito: '#' },
];

function reloj(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function BurbujaTelefono() {
  const tel = useTelefono();
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState('');

  const estado = tel?.estado ?? 'cargando';
  const enLlamada =
    estado === 'llamando' || estado === 'entrante' || estado === 'en-llamada';

  // El panel se abre solo cuando hay llamada, entrante o saliente.
  //
  // La saliente importa desde que se puede marcar desde la ficha de un
  // contacto: quien pulsa "Llamar" ahí no tocó la burbuja, y sin esto la
  // llamada arrancaría con el panel cerrado -- sin cronómetro, sin silenciar
  // y sin forma de colgar que no sea abrirlo a mano.
  useEffect(() => {
    if (estado === 'entrante' || estado === 'llamando') setAbierto(true);
  }, [estado]);

  // Al terminar la llamada se limpia lo marcado: dejarlo invita a volver a
  // pulsar "llamar" y repetir la llamada que se acaba de colgar.
  useEffect(() => {
    if (estado === 'libre') setMarcado('');
  }, [estado]);

  /**
   * Marca el documento mientras el teléfono está montado.
   *
   * globals.css usa esa marca para reservar el hueco de abajo a la derecha en
   * `main`. Se pone desde aquí y no siempre para que quien no tiene extensión
   * no vea una franja vacía al final de cada página.
   */
  const hayTelefono = !!tel && estado !== 'cargando' && estado !== 'sin-extension';
  useEffect(() => {
    if (!hayTelefono) return;
    document.documentElement.dataset.telefono = '1';
    return () => {
      delete document.documentElement.dataset.telefono;
    };
  }, [hayTelefono]);

  // !tel va explicito aunque hayTelefono ya lo cubra: es lo que le dice a
  // TypeScript que de aca para abajo el telefono existe.
  if (!tel || !hayTelefono) return null;

  const pulsar = (digito: string) => {
    // El tono suena siempre, se esté marcando o dentro de una llamada. Es la
    // confirmación de que la tecla se registró: sin él, en una pantalla táctil
    // no hay forma de saber si el toque entró o se perdió, y la gente marca
    // dos veces el mismo dígito.
    sonarTecla(digito);

    if (tel.estado === 'en-llamada') {
      // Durante la llamada el teclado sirve para los menus de voz, no para
      // componer un numero nuevo.
      tel.enviarTono(digito);
      return;
    }
    setMarcado((previo) => (previo.length >= 20 ? previo : previo + digito));
  };

  const llamar = () => {
    if (marcado.trim() === '') return;
    tel.llamar(marcado);
  };

  return (
    // Abajo a la DERECHA. Los avisos de sonner viven arriba a la derecha, así
    // que no se cruzan.
    //
    // En reposo va en z-40, por debajo de los diálogos (z-50): un teléfono
    // dibujado encima de un modal taparía su botón de confirmar.
    //
    // Durante una llamada sube a z-[60] y se pone POR ENCIMA. Desde que se
    // puede marcar desde la ficha de un contacto, la llamada empieza con ese
    // modal abierto, y en z-40 el teléfono quedaba detrás del velo: se veía
    // "Llamando…" en ningún lado y no había forma de colgar.
    <div
      className={cn(
        'fixed bottom-4 right-4 flex flex-col items-end gap-3',
        enLlamada ? 'z-[60]' : 'z-40',
      )}
    >
      {abierto && (
        <div className="w-[270px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Cabecera */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                tel.estado === 'sin-conexion' ? 'bg-amber-400' : 'bg-primary',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {enLlamada ? tel.interlocutor : `Extensión ${tel.extension}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {tel.estado === 'sin-conexion'
                  ? (tel.motivo ?? 'Sin conexión')
                  : tel.estado === 'llamando'
                    ? 'Llamando…'
                    : tel.estado === 'entrante'
                      ? 'Llamada entrante'
                      : tel.estado === 'en-llamada'
                        ? reloj(tel.segundos)
                        : 'Listo para llamar'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el teléfono"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Numero marcado */}
          {tel.estado !== 'entrante' && (
            <div className="flex items-center gap-2 px-4 pt-4">
              <div className="min-h-8 flex-1 truncate text-right font-mono text-2xl tabular-nums text-foreground">
                {marcado || <span className="text-muted-foreground/40">···</span>}
              </div>
              {marcado !== '' && tel.estado !== 'en-llamada' && (
                <button
                  type="button"
                  onClick={() => setMarcado((p) => p.slice(0, -1))}
                  aria-label="Borrar el último dígito"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Delete className="size-4" />
                </button>
              )}
            </div>
          )}

          {/* Teclado */}
          {tel.estado !== 'entrante' && (
            <div className="grid grid-cols-3 gap-2 p-4">
              {TECLAS.map(({ digito, letras }) => (
                <button
                  key={digito}
                  type="button"
                  onClick={() => pulsar(digito)}
                  className={cn(
                    'flex h-12 flex-col items-center justify-center rounded-full',
                    'bg-muted text-foreground transition-colors',
                    'hover:bg-primary/15 active:bg-primary/25',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  )}
                >
                  <span className="text-lg font-medium leading-none">{digito}</span>
                  {letras && (
                    <span className="mt-0.5 text-[9px] leading-none tracking-widest text-muted-foreground">
                      {letras}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center justify-center gap-3 border-t border-border px-4 py-3">
            {tel.estado === 'entrante' ? (
              <>
                <button
                  type="button"
                  onClick={tel.contestar}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <PhoneCall className="size-4" />
                  Contestar
                </button>
                <button
                  type="button"
                  onClick={tel.colgar}
                  aria-label="Rechazar"
                  className="flex size-12 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700"
                >
                  <PhoneOff className="size-5" />
                </button>
              </>
            ) : enLlamada ? (
              <>
                <button
                  type="button"
                  onClick={tel.alternarSilencio}
                  aria-label={tel.silenciado ? 'Activar el micrófono' : 'Silenciar el micrófono'}
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full transition-colors',
                    tel.silenciado
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-muted text-foreground hover:bg-muted/70',
                  )}
                >
                  {tel.silenciado ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
                <button
                  type="button"
                  onClick={tel.colgar}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <PhoneOff className="size-4" />
                  Colgar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={llamar}
                disabled={marcado.trim() === '' || tel.estado === 'sin-conexion'}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Phone className="size-4" />
                Llamar
              </button>
            )}
          </div>
        </div>
      )}

      {/* El asa del teléfono.

          En reposo es una pastilla de 40px de alto, discreta y traslúcida: es
          la altura de un botón normal, no la de un círculo de 56 que se comía
          la esquina de la bandeja. Al pasar por encima y durante una llamada
          crece y toma color, que es cuando de verdad tiene que llamar la
          atención. */}
      <button
        type="button"
        onClick={() => setAbierto((p) => !p)}
        aria-label={abierto ? 'Ocultar el teléfono' : 'Abrir el teléfono'}
        className={cn(
          'group relative flex h-10 items-center gap-2 rounded-full px-3.5',
          'border backdrop-blur transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          enLlamada
            ? 'border-red-500/50 bg-red-600 text-white shadow-lg shadow-red-900/30 hover:bg-red-700'
            : abierto
              ? 'border-primary/40 bg-primary text-primary-foreground shadow-lg'
              : // En reposo: casi transparente sobre el fondo, con el color de
                // marca solo en el icono. Al pasar por encima se llena.
                'border-border bg-card/80 text-primary shadow-md hover:border-primary/40 hover:bg-primary hover:text-primary-foreground hover:shadow-lg hover:shadow-primary/20',
        )}
      >
        {estado === 'entrante' ? (
          <PhoneIncoming className="size-4 shrink-0" />
        ) : enLlamada ? (
          <PhoneCall className="size-4 shrink-0" />
        ) : (
          <Phone className="size-4 shrink-0" />
        )}

        {/* La etiqueta: en llamada, el cronómetro; en reposo, la extensión.
            En pantallas chicas desaparece y queda solo el icono, porque ahí el
            ancho es el recurso escaso. */}
        <span className="hidden text-xs font-medium tabular-nums sm:inline">
          {estado === 'entrante'
            ? 'Entrante'
            : estado === 'llamando'
              ? 'Llamando…'
              : estado === 'en-llamada'
                ? reloj(tel.segundos)
                : tel.extension}
        </span>

        {/* La llamada entrante pulsa. Es lo unico que se ve si el panel esta
            cerrado y la persona esta mirando otra pestaña del CRM. */}
        {estado === 'entrante' && (
          <span className="absolute inset-0 animate-ping rounded-full bg-red-500/50" />
        )}
        {estado === 'sin-conexion' && (
          <span
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-card bg-amber-400"
            aria-label="Sin conexión con la central"
          />
        )}
      </button>
    </div>
  );
}
