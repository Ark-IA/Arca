'use client';

/**
 * Crear un usuario a mano.
 *
 * Convive con las invitaciones, no las reemplaza. Invitar sigue siendo mejor
 * cuando hay un correo real detrás: la persona elige su propia contraseña y
 * nadie más la conoce. Esto es para el otro caso — dar de alta a los asesores
 * del turno y entregarles el acceso hecho, sin esperar a que abran un correo.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, RefreshCw, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { COLOR_DE_COLA, useColas } from '@/hooks/use-colas';

const ROLES = [
  {
    valor: 'agent',
    titulo: 'Asesor',
    detalle: 'Atiende conversaciones y gestiona contactos. Es el rol habitual.',
  },
  {
    valor: 'admin',
    titulo: 'Administrador',
    detalle: 'Todo lo del asesor, más configuración, canales y equipo.',
  },
  {
    valor: 'viewer',
    titulo: 'Solo lectura',
    detalle: 'Ve la información pero no puede escribirle a nadie ni cambiar nada.',
  },
] as const;

const LARGO_MINIMO = 10;

/**
 * Una contraseña que no haya que inventar.
 *
 * Sin caracteres ambiguos: ni O ni 0, ni l ni 1. La van a dictar en voz alta
 * o copiar de una pantalla, y «¿era ele o uno?» convierte un alta de treinta
 * segundos en una llamada de soporte.
 */
function generarContrasena(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

export function CrearUsuarioDialog({
  open,
  onOpenChange,
  onCreado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreado: () => void;
}) {
  const { colas } = useColas();
  const activas = colas.filter((c) => c.is_active);

  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [rol, setRol] = useState<string>('agent');
  const [extension, setExtension] = useState('');
  const [enColas, setEnColas] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function limpiar() {
    setEmail('');
    setNombre('');
    setPassword('');
    setVerPassword(false);
    setRol('agent');
    setExtension('');
    setEnColas([]);
  }

  async function crear() {
    setGuardando(true);
    try {
      const r = await fetch('/api/account/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          full_name: nombre.trim(),
          role: rol,
          sip_extension: extension.trim() || undefined,
          colas: enColas,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error ?? 'No se pudo crear el usuario');

      // El aviso repite el correo pero NO la contraseña: este mensaje puede
      // quedar en pantalla mientras alguien más pasa por detrás.
      toast.success(`Usuario ${email.trim()} creado. Ya puede iniciar sesión.`);
      limpiar();
      onOpenChange(false);
      onCreado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el usuario');
    } finally {
      setGuardando(false);
    }
  }

  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const listo = correoValido && password.length >= LARGO_MINIMO && !guardando;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Al cerrar se borra todo, y la contraseña con ello. Dejarla escrita
        // en un diálogo que se vuelve a abrir es dejarla a la vista de quien
        // se siente después en esa máquina.
        if (!v) limpiar();
        onOpenChange(v);
      }}
    >
      <DialogContent className="border-border bg-popover max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground flex items-center gap-2">
            <UserPlus className="size-4" />
            Crear usuario
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Le creas el acceso tú y se lo entregas. Si prefieres que elija su
            propia contraseña, usá una invitación en vez de esto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Correo
            </label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asesor@empresa.com"
              className="bg-muted"
              autoComplete="off"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Con esto inicia sesión.
            </p>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Nombre completo
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ana Gómez"
              className="bg-muted"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Contraseña
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={verPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-muted pr-9 font-mono"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
                  aria-label={verPassword ? 'Ocultar' : 'Mostrar'}
                >
                  {verPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPassword(generarContrasena());
                  setVerPassword(true);
                }}
              >
                <RefreshCw className="size-4" />
                Generar
              </Button>
            </div>
            <p
              className={cn(
                'mt-1 text-xs',
                password.length > 0 && password.length < LARGO_MINIMO
                  ? 'text-amber-400'
                  : 'text-muted-foreground',
              )}
            >
              {password.length > 0 && password.length < LARGO_MINIMO
                ? `Le faltan ${LARGO_MINIMO - password.length} caracteres.`
                : `Mínimo ${LARGO_MINIMO} caracteres. Anotala antes de crear: no se vuelve a mostrar.`}
            </p>
          </div>

          <div>
            <label className="text-foreground mb-1.5 block text-xs font-medium">
              Rol
            </label>
            <div className="flex flex-col gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  aria-pressed={rol === r.valor}
                  onClick={() => setRol(r.valor)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    rol === r.valor
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:border-primary/40',
                  )}
                >
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      rol === r.valor ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {r.titulo}
                  </span>
                  <span className="text-muted-foreground block text-xs leading-relaxed">
                    {r.detalle}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-foreground mb-1 block text-xs font-medium">
              Extensión de teléfono <span className="text-muted-foreground">(opcional)</span>
            </label>
            <Input
              value={extension}
              onChange={(e) => setExtension(e.target.value.replace(/\D/g, ''))}
              placeholder="1002"
              className="bg-muted font-mono"
              inputMode="numeric"
            />
          </div>

          {activas.length > 0 && (
            <div>
              <label className="text-foreground mb-1.5 block text-xs font-medium">
                Colas que va a atender{' '}
                <span className="text-muted-foreground">(opcional)</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activas.map((c) => {
                  const dentro = enColas.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={dentro}
                      onClick={() =>
                        setEnColas((prev) =>
                          dentro ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                        )
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                        dentro
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          COLOR_DE_COLA[c.color] ?? COLOR_DE_COLA.slate,
                        )}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                Solo va a ver las conversaciones de las colas que atienda, más
                las que todavía no tienen equipo asignado.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={guardando}
          >
            Cancelar
          </Button>
          <Button onClick={() => void crear()} disabled={!listo}>
            {guardando && <Loader2 className="size-4 animate-spin" />}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
