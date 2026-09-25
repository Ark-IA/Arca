'use client';

/**
 * Respuesta por voz: cuándo contesta el agente con una nota de voz, y con
 * qué voz. La voz se clona de una muestra de 10 a 20 segundos que sube quien
 * administra (ver servicios/tts y src/lib/ai/voz.ts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic, Play, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Modo = 'nunca' | 'si_audio' | 'siempre';

interface Estado {
  modo: Modo;
  muestraSubidaEn: string | null;
  hayConfiguracion: boolean;
  servicio: { ok: boolean; modelo?: string; detalle?: string };
}

const OPCIONES: { valor: Modo; titulo: string; detalle: string }[] = [
  {
    valor: 'nunca',
    titulo: 'Nunca',
    detalle: 'El agente responde siempre por escrito.',
  },
  {
    valor: 'si_audio',
    titulo: 'Cuando el cliente manda audio',
    detalle: 'Si te hablan, respondes hablando. Si te escriben, por escrito.',
  },
  {
    valor: 'siempre',
    titulo: 'Siempre',
    detalle: 'Todas las respuestas del agente van como nota de voz.',
  },
];

export function RespuestaPorVoz() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [probando, setProbando] = useState(false);
  const [frase, setFrase] = useState(
    'Hola, gracias por escribirnos. ¿En qué te puedo ayudar hoy?'
  );
  const [audioPrueba, setAudioPrueba] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/ai/voz', { cache: 'no-store' });
    if (r.ok) setEstado((await r.json()) as Estado);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(
    () => () => {
      if (audioPrueba) URL.revokeObjectURL(audioPrueba);
    },
    [audioPrueba]
  );

  const cambiarModo = async (modo: Modo) => {
    setGuardando(true);
    const r = await fetch('/api/ai/voz', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modo }),
    });
    setGuardando(false);
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      toast.error(d.error ?? 'No se pudo guardar.');
      return;
    }
    setEstado((e) => (e ? { ...e, modo } : e));
    toast.success('Guardado.');
  };

  const subir = async (f: File) => {
    setSubiendo(true);
    const r = await fetch('/api/ai/voz', { method: 'POST', body: f });
    setSubiendo(false);
    const d = (await r.json().catch(() => ({}))) as {
      error?: string;
      segundos?: number;
    };
    if (!r.ok) {
      toast.error(d.error ?? 'No se pudo subir la muestra.');
      return;
    }
    toast.success(
      `Voz guardada (${d.segundos ?? '?'} s de muestra). Pruébala abajo.`
    );
    await cargar();
  };

  const probar = async () => {
    setProbando(true);
    const r = await fetch('/api/ai/voz?probar=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texto: frase }),
    });
    setProbando(false);
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      toast.error(d.error ?? 'No se pudo generar el audio.');
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    setAudioPrueba(url);
  };

  if (!estado) return null;

  const deshabilitado = !estado.hayConfiguracion || guardando;

  return (
    <Card className="mt-6">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Mic className="size-4" />
              Responder con voz
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              El agente escribe la respuesta y la envía como nota de voz de
              WhatsApp, con la voz que subas. En Messenger e Instagram sigue
              respondiendo por escrito.
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs',
              estado.servicio.ok
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}
            title={estado.servicio.detalle}
          >
            {estado.servicio.ok
              ? 'Servicio de voz activo'
              : 'Servicio de voz no disponible'}
          </span>
        </div>

        {!estado.hayConfiguracion && (
          <p className="text-muted-foreground text-sm">
            Primero guarda la configuración del agente (proveedor y clave)
            arriba.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              disabled={deshabilitado}
              onClick={() => void cambiarModo(o.valor)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors disabled:opacity-50',
                estado.modo === o.valor
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              )}
            >
              <p className="text-sm font-medium">{o.titulo}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {o.detalle}
              </p>
            </button>
          ))}
        </div>

        {!estado.servicio.ok && estado.modo !== 'nunca' && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Mientras el servicio de voz no esté disponible, el agente responde
            por escrito.
          </p>
        )}

        <div className="space-y-2">
          <Label>Voz</Label>
          <p className="text-muted-foreground text-xs">
            Sube una grabación de 10 a 20 segundos de la voz que quieres usar:
            una persona hablando normal, sin música ni ruido de fondo. Sirve una
            nota de voz de WhatsApp.
            {estado.muestraSubidaEn &&
              ` Muestra actual: subida el ${new Date(estado.muestraSubidaEn).toLocaleDateString('es')}.`}
          </p>
          <input
            ref={archivo}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subir(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            disabled={!estado.servicio.ok || subiendo}
            onClick={() => archivo.current?.click()}
          >
            {subiendo ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {estado.muestraSubidaEn
              ? 'Reemplazar muestra'
              : 'Subir muestra de voz'}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="voz-frase">Probar</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="voz-frase"
              value={frase}
              maxLength={300}
              onChange={(e) => setFrase(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!estado.servicio.ok || probando || !frase.trim()}
              onClick={probar}
            >
              {probando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {probando ? 'Generando…' : 'Escuchar'}
            </Button>
          </div>
          {probando && (
            <p className="text-muted-foreground text-xs">
              La voz se genera en el servidor: puede tardar unos segundos.
            </p>
          )}
          {audioPrueba && (
            <audio src={audioPrueba} controls autoPlay className="w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
