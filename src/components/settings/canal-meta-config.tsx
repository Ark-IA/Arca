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
      "Entrá a developers.facebook.com y abrí tu app.",
      "Agregá el producto Messenger.",
      "En Configuración de Messenger, generá un token de acceso para tu página. Ese token no vence.",
      "Suscribí la página a los eventos messages y messaging_postbacks.",
      "Pegá abajo el ID de la página y el token, y guardá.",
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
      "Tu cuenta de Instagram debe ser Profesional y estar vinculada a una página de Facebook.",
      "En developers.facebook.com, agregá el producto Instagram a tu app.",
      "Activá el acceso a los mensajes en la configuración de Instagram de tu cuenta.",
      "Generá el token de acceso con los permisos de mensajería.",
      "Pegá abajo el ID de la cuenta y el token, y guardá.",
    ],
  },
};

export function CanalMetaConfig({ canal }: { canal: Canal }) {
  const txt = TEXTOS[canal];
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [externalId, setExternalId] = useState("");
  const [nombre, setNombre] = useState("");
  const [token, setToken] = useState("");

  const urlWebhook =
    typeof window !== "undefined" ? `${window.location.origin}/api/meta/webhook` : "";

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
            Pegá esta dirección en la configuración de webhooks de tu app en Meta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
              {urlWebhook}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(urlWebhook);
                toast.success("Dirección copiada.");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Es la misma para Facebook e Instagram: el propio aviso de Meta dice de qué canal viene.
          </p>
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
