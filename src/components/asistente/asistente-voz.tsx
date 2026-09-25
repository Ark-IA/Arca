'use client';

/**
 * El asistente del CRM: se le habla (o se le escribe) y consulta o actúa.
 *
 * Mantener pulsado el micrófono graba; al soltar se envía. La conversación
 * vive en el navegador (el servidor no guarda estado): cerrar el panel no la
 * borra, recargar la página sí.
 *
 * La respuesta se escucha con la voz clonada si el servicio de voz está, y
 * si no con la voz del navegador (`speechSynthesis`), que no suena igual
 * pero funciona en cualquier instalación.
 *
 * Las acciones delicadas (mover o cerrar un negocio) llegan como tarjetas
 * para confirmar: el asistente no las ejecuta solo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useModulos } from '@/hooks/use-modulos';
import { cn } from '@/lib/utils';
import type { Mensaje } from '@/lib/asistente/modelo';

interface Pendiente {
  id: string;
  nombre: string;
  args: Record<string, unknown>;
  descripcion: string;
}

interface Burbuja {
  quien: 'yo' | 'asistente';
  texto: string;
  pendientes?: Pendiente[];
}

const CLAVE_VOZ = 'arca:asistente:voz';

function leerPreferencia(): boolean {
  try {
    return localStorage.getItem(CLAVE_VOZ) !== '0';
  } catch {
    return true;
  }
}

function hablarConElNavegador(texto: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-CO';
    const voz = synth.getVoices().find((v) => v.lang.startsWith('es'));
    if (voz) u.voice = voz;
    synth.speak(u);
  } catch {
    // Sin voz del navegador: queda el texto.
  }
}

export function AsistenteVoz() {
  const { activo } = useModulos();
  const [abierto, setAbierto] = useState(false);
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [historial, setHistorial] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [grabando, setGrabando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [conVoz, setConVoz] = useState(true);
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const fin = useRef<HTMLDivElement>(null);
  const reproductor = useRef<HTMLAudioElement | null>(null);

  useEffect(() => setConVoz(leerPreferencia()), []);
  useEffect(
    () => fin.current?.scrollIntoView({ behavior: 'smooth' }),
    [burbujas, pensando]
  );

  const decir = useCallback(
    (textoRespuesta: string, audioBase64?: string) => {
      if (!conVoz) return;
      if (audioBase64) {
        reproductor.current?.pause();
        const a = new Audio(`data:audio/ogg;base64,${audioBase64}`);
        reproductor.current = a;
        a.play().catch(() => hablarConElNavegador(textoRespuesta));
      } else {
        hablarConElNavegador(textoRespuesta);
      }
    },
    [conVoz]
  );

  const enviar = useCallback(
    async (entrada: { orden?: string; audio?: Blob }) => {
      setPensando(true);
      try {
        let r: Response;
        if (entrada.audio) {
          const f = new FormData();
          f.append('audio', entrada.audio, 'orden.webm');
          f.append('historial', JSON.stringify(historial));
          f.append('voz', conVoz ? '1' : '0');
          r = await fetch('/api/asistente', { method: 'POST', body: f });
        } else {
          setBurbujas((b) => [...b, { quien: 'yo', texto: entrada.orden! }]);
          r = await fetch('/api/asistente', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              orden: entrada.orden,
              historial,
              voz: conVoz,
            }),
          });
        }
        const d = (await r.json().catch(() => ({}))) as {
          error?: string;
          transcripcion?: string;
          texto?: string;
          historial?: Mensaje[];
          pendientes?: Pendiente[];
          audio?: string;
        };
        if (!r.ok) {
          toast.error(d.error ?? 'El asistente no respondió.');
          return;
        }
        setBurbujas((b) => [
          ...b,
          ...(d.transcripcion
            ? [{ quien: 'yo' as const, texto: d.transcripcion }]
            : []),
          {
            quien: 'asistente',
            texto: d.texto ?? '',
            pendientes: d.pendientes,
          },
        ]);
        setHistorial(d.historial ?? []);
        decir(d.texto ?? '', d.audio);
      } catch {
        toast.error('No se pudo hablar con el asistente.');
      } finally {
        setPensando(false);
      }
    },
    [historial, conVoz, decir]
  );

  const empezar = async () => {
    if (grabando || pensando) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      trozos.current = [];
      rec.ondataavailable = (e) => e.data.size && trozos.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const audio = new Blob(trozos.current, {
          type: rec.mimeType || 'audio/webm',
        });
        // Un toque sin hablar no es una orden.
        if (audio.size > 3000) void enviar({ audio });
      };
      rec.start();
      grabador.current = rec;
      setGrabando(true);
      window.speechSynthesis?.cancel();
      reproductor.current?.pause();
    } catch {
      toast.error('No hay permiso para usar el micrófono.');
    }
  };

  const soltar = () => {
    if (!grabando) return;
    grabador.current?.stop();
    setGrabando(false);
  };

  const confirmar = async (p: Pendiente, indice: number, si: boolean) => {
    setBurbujas((b) =>
      b.map((x, i) =>
        i === indice
          ? { ...x, pendientes: x.pendientes?.filter((y) => y.id !== p.id) }
          : x
      )
    );
    if (!si) {
      setBurbujas((b) => [
        ...b,
        { quien: 'asistente', texto: 'Cancelado, no hice nada.' },
      ]);
      return;
    }
    const r = await fetch('/api/asistente/confirmar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: p.nombre, args: p.args }),
    });
    const d = (await r.json().catch(() => ({}))) as {
      texto?: string;
      error?: string;
    };
    const respuesta = d.texto ?? d.error ?? (r.ok ? 'Listo.' : 'No se pudo.');
    setBurbujas((b) => [...b, { quien: 'asistente', texto: respuesta }]);
    // El modelo se entera en la próxima orden de que la acción se hizo.
    setHistorial((h) => [
      ...h,
      {
        rol: 'usuario',
        texto: `(Confirmé: ${p.descripcion}. Resultado: ${respuesta})`,
      },
    ]);
    decir(respuesta);
  };

  const alternarVoz = () => {
    setConVoz((v) => {
      try {
        localStorage.setItem(CLAVE_VOZ, v ? '0' : '1');
      } catch {}
      if (v) window.speechSynthesis?.cancel();
      return !v;
    });
  };

  if (!activo('asistente') || !activo('agentes_ia')) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAbierto(true)}
        className="gap-1.5"
        title="Asistente: pídele cosas al CRM hablando"
      >
        <Sparkles className="size-4" />
        <span className="hidden sm:inline">Asistente</span>
      </Button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Asistente
            </SheetTitle>
            <SheetDescription>
              Mantén pulsado el micrófono y di, por ejemplo: «¿qué tareas tengo
              hoy?» o «crea una tarea para llamar a Ana mañana a las 10».
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {burbujas.length === 0 && !pensando && (
              <p className="text-muted-foreground mt-8 text-center text-sm">
                Nada por aquí todavía.
              </p>
            )}
            {burbujas.map((b, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  b.quien === 'yo' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] space-y-2 rounded-2xl px-3 py-2 text-sm',
                    b.quien === 'yo'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{b.texto}</p>
                  {b.pendientes?.map((p) => (
                    <div
                      key={p.id}
                      className="bg-background text-foreground rounded-lg border p-2"
                    >
                      <p className="text-xs font-medium">{p.descripcion}</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void confirmar(p, i, true)}
                        >
                          <Check className="size-3.5" />
                          Confirmar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void confirmar(p, i, false)}
                        >
                          <X className="size-3.5" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {pensando && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Pensando…
              </div>
            )}
            <div ref={fin} />
          </div>

          <div className="space-y-3 border-t p-4">
            <div className="flex justify-center">
              <button
                type="button"
                aria-label="Mantén pulsado para hablar"
                disabled={pensando}
                onPointerDown={(e) => {
                  e.preventDefault();
                  void empezar();
                }}
                onPointerUp={soltar}
                onPointerLeave={soltar}
                className={cn(
                  'flex size-16 items-center justify-center rounded-full transition-all disabled:opacity-50',
                  grabando
                    ? 'scale-110 bg-red-500 text-white shadow-lg shadow-red-500/40'
                    : 'bg-primary text-primary-foreground hover:scale-105'
                )}
              >
                <Mic className="size-7" />
              </button>
            </div>
            <p className="text-muted-foreground text-center text-xs">
              {grabando
                ? 'Escuchando… suelta para enviar'
                : 'Mantén pulsado para hablar'}
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = texto.trim();
                if (!t || pensando) return;
                setTexto('');
                void enviar({ orden: t });
              }}
            >
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="O escríbelo aquí…"
              />
              <Button
                type="submit"
                size="icon"
                disabled={pensando || !texto.trim()}
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={alternarVoz}
                aria-label={
                  conVoz ? 'Silenciar respuestas' : 'Escuchar respuestas'
                }
                title={
                  conVoz
                    ? 'Respuestas en voz alta'
                    : 'Respuestas solo por escrito'
                }
              >
                {conVoz ? (
                  <Volume2 className="size-4" />
                ) : (
                  <VolumeX className="size-4" />
                )}
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
