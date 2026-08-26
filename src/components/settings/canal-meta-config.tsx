"use client";

/**
 * Conectar una cuenta de Facebook Messenger o de Instagram.
 *
 * Un solo componente sirve a los dos canales porque piden exactamente lo
 * mismo -- identificador de la cuenta y token -- y solo cambian los nombres
 * y las instrucciones. Duplicarlo garantizaria que una correccion se
 * aplique a uno y se olvide en el otro.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, PlugZap, Trash2, XCircle } from "lucide-react";

type Canal = "facebook" | "instagram";

interface Conexion {
  id: string;
  channel: Canal;
  external_id: string;
  name: string | null;
  status: string;
  last_error: string | null;
  connected_at: string | null;
}

const TEXTOS: Record<Canal, {
  titulo: string;
  descripcion: string;
  etiquetaId: string;
  ayudaId: string;
  ejemploId: string;
  pasos: string[];
}> = {
  facebook: {
    titulo: "Facebook Messenger",
    descripcion:
      "Conectá tu página de Facebook para recibir y responder mensajes de Messenger en la bandeja.",
    etiquetaId: "ID de la página",
    ayudaId:
      "Está en tu página → Configuración → Información de la página, al final. Son solo números.",
    ejemploId: "102938475610293",
    pasos: [
      "Entrá a developers.facebook.com/apps y abrí tu app (o creá una de tipo Empresa).",
      "En el menú de la izquierda, agregá el producto «Messenger».",
      "Bajá a «Tokens de acceso», pulsá «Agregar o quitar páginas» y elegí tu página.",
      "Al lado de la página aparece «Generar token». Copialo: empieza por EAA y es largo. Ese es el token de acceso que va abajo.",
      "En «Webhooks», pulsá «Editar suscripción» y pegá la URL y el token de verificación de la tarjeta de arriba.",
      "Suscribí la página a los campos messages y messaging_postbacks.",
      "Volvé acá, pegá el ID de la página y el token, y guardá.",
    ],
  },
  instagram: {
    titulo: "Instagram",
    descripcion:
      "Conectá tu cuenta profesional de Instagram para recibir y responder mensajes directos en la bandeja.",
    etiquetaId: "ID de la cuenta profesional",
    ayudaId:
      "Es el ID de tu cuenta de Instagram vinculada a la página de Facebook, no tu nombre de usuario.",
    ejemploId: "17841400000000000",
    pasos: [
      "Tu cuenta de Instagram tiene que ser Profesional y estar vinculada a una página de Facebook.",
      "En la app de Instagram, activá «Permitir acceso a mensajes» en Configuración → Privacidad → Mensajes.",
      "En developers.facebook.com, agregá el producto «Instagram» a tu app.",
      "En «Tokens de acceso», generá uno para la página vinculada. Empieza por EAA.",
      "En «Webhooks», pegá la URL y el token de verificación de la tarjeta de arriba, y suscribí el campo messages.",
      "Volvé acá, pegá el ID de la cuenta profesional y el token, y guardá.",
    ],
  },
};

/**
 * Un valor de solo lectura con su botón de copiar.
 *
 * El texto va en un `<code>` seleccionable además del botón: en algunos
 * navegadores el portapapeles está bloqueado si la página no es segura, y sin
 * poder seleccionar a mano la persona se queda sin forma de obtener el dato.
 */
function CampoCopiable({
  etiqueta,
  valor,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  ayuda: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{etiqueta}</Label>
      <div className="flex items-center gap-2">
        <code
          onClick={(e) => {
            // Un clic selecciona todo: es lo que espera quien va a copiar.
            const r = document.createRange();
            r.selectNodeContents(e.currentTarget);
            const s = window.getSelection();
            s?.removeAllRanges();
            s?.addRange(r);
          }}
          className="flex-1 cursor-text truncate rounded-md border border-border bg-muted px-3 py-2 text-xs transition-colors hover:border-primary/40"
        >
          {valor || "—"}
        </code>
        <Button
          variant="outline"
          size="sm"
          disabled={!valor}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor);
              toast.success(`${etiqueta} copiado.`);
            } catch {
              toast.error("El navegador bloqueó el portapapeles. Seleccionalo y copialo a mano.");
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ayuda}</p>
    </div>
  );
}

export function CanalMetaConfig({ canal }: { canal: Canal }) {
  const txt = TEXTOS[canal];
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [externalId, setExternalId] = useState("");
  const [nombre, setNombre] = useState("");
  const [token, setToken] = useState("");

  /**
   * Los dos datos que Meta pide en su formulario de webhooks.
   *
   * Llegan del servidor: el token de verificación vive en una variable de
   * entorno y el navegador no puede leerlo solo. Antes esta pantalla mostraba
   * la URL y callaba el token, que es justo lo que dejaba el registro a medias.
   */
  const [webhook, setWebhook] = useState<{
    webhookUrl: string;
    verifyToken: string;
    appSecretConfigurado: boolean;
  } | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("channel_connections")
      .select("id, channel, external_id, name, status, last_error, connected_at")
      .eq("channel", canal)
      .maybeSingle();
    setConexion(data ?? null);
    if (data) {
      setExternalId(data.external_id);
      setNombre(data.name ?? "");
    }
    setCargando(false);
  }, [canal]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/meta/conexiones", { cache: "no-store" });
        if (r.ok) setWebhook(await r.json());
      } catch {
        // Si falla, la tarjeta del webhook muestra un aviso en vez de campos
        // vacíos que parecerían un dato en blanco.
      }
    })();
  }, []);

  const guardar = async () => {
    if (!externalId.trim() || !token.trim()) {
      toast.error("Hacen falta el identificador y el token.");
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch("/api/meta/conexiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: canal,
          external_id: externalId.trim(),
          name: nombre.trim() || null,
          access_token: token.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast.success(`${txt.titulo} conectado.`);
      // El token no se vuelve a mostrar: queda cifrado y solo el servidor
      // lo lee. Se limpia el campo para no dejarlo en pantalla.
      setToken("");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const desconectar = async () => {
    if (!conexion) return;
    setGuardando(true);
    try {
      const r = await fetch(`/api/meta/conexiones?id=${conexion.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("No se pudo desconectar");
      toast.success("Cuenta desconectada.");
      setConexion(null);
      setExternalId("");
      setNombre("");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo desconectar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    );
  }

  const conectado = conexion?.status === "connected";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{txt.titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{txt.descripcion}</p>
      </div>

      {/* Estado */}
      <div
        className={`flex items-start gap-3 rounded-lg border p-4 ${
          conectado ? "border-primary/25 bg-primary/5" : "border-border bg-card"
        }`}
      >
        {conectado ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {conectado ? "Conectado" : "Sin conectar"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {conectado
              ? `${conexion?.name ?? "Cuenta"} · ${conexion?.external_id}`
              : "Completá los datos de abajo para empezar a recibir mensajes."}
          </p>
          {conexion?.last_error && (
            <p className="mt-1 text-xs text-red-400">{conexion.last_error}</p>
          )}
        </div>
        {conectado && (
          <Button variant="ghost" size="sm" onClick={desconectar} disabled={guardando}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Desconectar
          </Button>
        )}
      </div>

      {/* Credenciales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credenciales</CardTitle>
          <CardDescription>
            El token se guarda cifrado (AES-256-GCM) y no se vuelve a mostrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="externalId">{txt.etiquetaId}</Label>
            <Input
              id="externalId"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder={txt.ejemploId}
            />
            <p className="text-xs text-muted-foreground">{txt.ayudaId}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre visible <span className="text-muted-foreground">(opcional)</span></Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Cómo querés verla en el CRM"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="token">Token de acceso</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={conectado ? "Guardado — escribí uno nuevo para reemplazarlo" : "EAAG…"}
            />
          </div>

          <Button onClick={guardar} disabled={guardando}>
            {guardando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <PlugZap className="mr-2 h-4 w-4" />
                {conectado ? "Actualizar" : "Conectar"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
          <CardDescription>
            Meta pide DOS datos en el mismo formulario. Copiá los dos de acá.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!webhook ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : (
            <>
              <CampoCopiable
                etiqueta="URL de devolución de llamada"
                valor={webhook.webhookUrl}
                ayuda="Es la misma para Facebook e Instagram: el propio aviso de Meta dice de qué canal viene."
              />

              {/* El que faltaba. Sin él, Meta rechaza el registro con un error
                  que no explica nada, y quien lo configura acaba probando
                  valores al azar. */}
              <CampoCopiable
                etiqueta="Token de verificación"
                valor={webhook.verifyToken}
                ayuda="Meta lo devuelve para comprobar que el webhook es tuyo. Tiene que coincidir exactamente."
              />

              {!webhook.appSecretConfigurado && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  Falta el secreto de la app en el servidor. Sin él no se puede
                  comprobar la firma de los avisos y cualquiera podría enviar
                  mensajes falsos al CRM.
                </p>
              )}

              <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  Campos a suscribir
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {canal === "facebook"
                    ? "messages y messaging_postbacks"
                    : "messages"}
                  {" — sin suscribirlos, el webhook queda registrado pero no llega ningún mensaje."}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pasos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo obtener estos datos</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm text-muted-foreground">
            {txt.pasos.map((p, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/5 text-[11px] font-medium text-primary">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
