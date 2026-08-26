'use client';

/**
 * A qué bandejas atiende el agente de IA.
 *
 * La misma preferencia que hay en Agentes IA, pero presentada por BANDEJA y
 * no por canal abstracto: se lista el número de WhatsApp y cada cuenta de Meta
 * conectada, con su nombre. Ver "Messenger" a secas obliga a recordar cuál
 * página es; ver "Messenger · Ark.Ia" no.
 *
 * Las bandejas sin conectar se muestran igual, apagadas y explicando por qué:
 * esconderlas dejaría a alguien buscando un interruptor que no existe todavía.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Info, Loader2, MessageCircle, PlugZap } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { SettingsPanelHead } from './settings-panel-head';

type Canal = 'whatsapp' | 'facebook' | 'instagram';

function IconoFacebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}

function IconoInstagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 6.03a3.81 3.81 0 1 0 0 7.62 3.81 3.81 0 0 0 0-7.62Zm0 6.29a2.48 2.48 0 1 1 0-4.96 2.48 2.48 0 0 1 0 4.96Zm4.85-6.44a.89.89 0 1 1-1.78 0 .89.89 0 0 1 1.78 0Z" />
    </svg>
  );
}

const META: Record<
  Canal,
  {
    etiqueta: string;
    icono: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement;
    color: string;
    dondeConectar: string;
  }
> = {
  whatsapp: {
    etiqueta: 'WhatsApp',
    icono: MessageCircle as never,
    color: 'text-[#25D366]',
    dondeConectar: 'whatsapp',
  },
  facebook: {
    etiqueta: 'Messenger',
    icono: IconoFacebook,
    color: 'text-[#1877F2]',
    dondeConectar: 'facebook',
  },
  instagram: {
    etiqueta: 'Instagram',
    icono: IconoInstagram,
    color: 'text-[#E1306C]',
    dondeConectar: 'instagram',
  },
};

interface Bandeja {
  canal: Canal;
  /** Nombre de la cuenta conectada, o null si el canal no está conectado. */
  cuenta: string | null;
}

export function AgenteIaBandejas() {
  const { accountId, accountRole } = useAuth();
  const puedeEditar = accountRole ? canEditSettings(accountRole) : false;

  const [bandejas, setBandejas] = useState<Bandeja[]>([]);
  const [canales, setCanales] = useState<Canal[]>([]);
  const [iaActiva, setIaActiva] = useState(false);
  const [autoRespuesta, setAutoRespuesta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<Canal | null>(null);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    const supabase = createClient();

    const [conf, conexiones, wa] = await Promise.all([
      fetch('/api/ai/config', { cache: 'no-store' }).then((r) => r.json()),
      supabase
        .from('channel_connections')
        .select('channel, name, external_id')
        .eq('account_id', accountId)
        .eq('status', 'connected'),
      supabase
        .from('whatsapp_config')
        .select('phone_number, status')
        .eq('account_id', accountId)
        .maybeSingle(),
    ]);

    setIaActiva(conf?.is_active === true);
    setAutoRespuesta(conf?.auto_reply_enabled === true);
    setCanales(
      Array.isArray(conf?.auto_reply_channels) && conf.auto_reply_channels.length
        ? (conf.auto_reply_channels as Canal[])
        : ['whatsapp'],
    );

    const porCanal = new Map<Canal, string>();
    for (const c of (conexiones.data ?? []) as {
      channel: string;
      name: string | null;
      external_id: string;
    }[]) {
      if (c.channel === 'facebook' || c.channel === 'instagram') {
        porCanal.set(c.channel, c.name || c.external_id);
      }
    }
    const numero = (wa.data as { phone_number?: string; status?: string } | null);
    if (numero?.status === 'connected' || numero?.phone_number) {
      porCanal.set('whatsapp', numero.phone_number ?? 'Número conectado');
    }

    setBandejas(
      (['whatsapp', 'facebook', 'instagram'] as Canal[]).map((canal) => ({
        canal,
        cuenta: porCanal.get(canal) ?? null,
      })),
    );
    setCargando(false);
  }, [accountId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternar = async (canal: Canal, activar: boolean) => {
    const siguiente = activar
      ? [...new Set([...canales, canal])]
      : canales.filter((c) => c !== canal);

    // Optimista: la casilla responde al instante y se revierte si el servidor
    // dice que no. Esperar la ida y vuelta hace que parezca que no reaccionó.
    setCanales(siguiente);
    setGuardando(canal);

    const r = await fetch('/api/ai/canales', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_reply_channels: siguiente }),
    }).catch(() => null);

    setGuardando(null);

    if (!r || !r.ok) {
      setCanales(canales);
      toast.error('No se pudo guardar el cambio.');
      return;
    }
    toast.success(
      activar
        ? `El agente ya atiende ${META[canal].etiqueta}.`
        : `El agente dejó de atender ${META[canal].etiqueta}.`,
    );
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const sinAgente = !iaActiva || !autoRespuesta;

  return (
    <section className="animate-in fade-in-50 space-y-5 duration-200">
      <SettingsPanelHead
        title="Agente de IA por bandeja"
        description="Elegí en qué bandejas contesta solo el agente. Las que no marques quedan para atención humana."
      />

      {/* Si el agente está apagado, los interruptores de abajo no hacen nada.
          Decirlo acá evita que alguien marque casillas y espere respuestas que
          nunca van a llegar. */}
      {sinAgente && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1 text-xs text-amber-300">
            <p className="font-medium">
              {!iaActiva
                ? 'El agente de IA está apagado.'
                : 'La respuesta automática está apagada.'}
            </p>
            <p className="mt-0.5 text-amber-300/80">
              Estas bandejas quedan guardadas, pero el agente no va a contestar
              en ninguna hasta que lo enciendas en{' '}
              <Link href="/agents" className="underline hover:text-amber-200">
                Agentes IA
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {bandejas.map(({ canal, cuenta }) => {
              const meta = META[canal];
              const Icono = meta.icono;
              const conectado = cuenta !== null;
              const marcado = canales.includes(canal);

              return (
                <li key={canal} className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted',
                      conectado ? meta.color : 'text-muted-foreground/50',
                    )}
                  >
                    <Icono className="size-[18px]" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {meta.etiqueta}
                    </p>
                    {conectado ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {cuenta}
                      </p>
                    ) : (
                      <Link
                        href={`/settings?tab=${meta.dondeConectar}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                      >
                        <PlugZap className="size-3" />
                        Sin conectar — conectala primero
                      </Link>
                    )}
                  </div>

                  {guardando === canal ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Switch
                      checked={marcado}
                      onCheckedChange={(v) => void alternar(canal, v)}
                      // Un canal sin conectar se puede marcar igual: la
                      // preferencia queda guardada y funciona en cuanto se
                      // conecte. Bloquearlo obligaría a volver acá después.
                      disabled={!puedeEditar}
                      aria-label={`El agente atiende ${meta.etiqueta}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Bot className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          El agente cede siempre ante una persona: en cuanto alguien pulsa
          «Tomar el control» en una conversación, deja de contestar ahí aunque
          la bandeja esté marcada. Vuelve con «Reanudar IA».
        </p>
      </div>
    </section>
  );
}
