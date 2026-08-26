'use client';

/**
 * Alta y edición de una empresa. Un solo formulario para los dos casos: los
 * campos son idénticos y duplicarlo garantizaría que un campo nuevo aparezca
 * al crear y falte al editar.
 */

import { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { BorradorEmpresa } from '@/hooks/use-companies';
import type { Company } from '@/types';

const VACIO: BorradorEmpresa = {
  name: '',
  domain: '',
  phone: '',
  industry: '',
  city: '',
  country: '',
  address: '',
  linkedin_url: '',
  notes: '',
  is_ideal_customer: false,
};

export function CompanyForm({
  abierto,
  empresa,
  onCerrar,
  onGuardar,
}: {
  abierto: boolean;
  /** `null` para crear una nueva. */
  empresa: Company | null;
  onCerrar: () => void;
  onGuardar: (datos: BorradorEmpresa) => Promise<boolean>;
}) {
  const [datos, setDatos] = useState<BorradorEmpresa>(VACIO);
  const [empleados, setEmpleados] = useState('');
  const [facturacion, setFacturacion] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Se recarga cada vez que se abre: si no, editar una empresa y después otra
  // mostraría los datos de la primera hasta el siguiente renderizado.
  useEffect(() => {
    if (!abierto) return;
    if (empresa) {
      setDatos({
        name: empresa.name,
        domain: empresa.domain ?? '',
        phone: empresa.phone ?? '',
        industry: empresa.industry ?? '',
        city: empresa.city ?? '',
        country: empresa.country ?? '',
        address: empresa.address ?? '',
        linkedin_url: empresa.linkedin_url ?? '',
        notes: empresa.notes ?? '',
        is_ideal_customer: empresa.is_ideal_customer,
      });
      setEmpleados(empresa.employees?.toString() ?? '');
      setFacturacion(empresa.annual_revenue?.toString() ?? '');
    } else {
      setDatos(VACIO);
      setEmpleados('');
      setFacturacion('');
    }
  }, [abierto, empresa]);

  const campo = (k: keyof BorradorEmpresa, v: string | boolean) =>
    setDatos((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!datos.name?.trim()) return;
    setGuardando(true);
    const ok = await onGuardar({
      ...datos,
      // Los números viven como texto mientras se escriben (un campo numérico
      // controlado por un número no deja borrar el último dígito) y se
      // convierten solo al guardar.
      employees: empleados.trim() === '' ? null : Number(empleados),
      annual_revenue: facturacion.trim() === '' ? null : Number(facturacion),
    });
    setGuardando(false);
    if (ok) onCerrar();
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="bg-popover border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {empresa ? 'Editar empresa' : 'Nueva empresa'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Solo el nombre es obligatorio. El resto se puede completar después.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-1 pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="emp-nombre">Nombre</Label>
            <Input
              id="emp-nombre"
              autoFocus
              value={datos.name ?? ''}
              onChange={(e) => campo('name', e.target.value)}
              placeholder="Acme S.A."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-dominio">Dominio</Label>
              <Input
                id="emp-dominio"
                value={datos.domain ?? ''}
                onChange={(e) => campo('domain', e.target.value)}
                placeholder="acme.com"
              />
              <p className="text-xs text-muted-foreground">
                Identifica mejor que el nombre: &quot;Acme&quot; hay muchas.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-tel">Teléfono</Label>
              <Input
                id="emp-tel"
                value={datos.phone ?? ''}
                onChange={(e) => campo('phone', e.target.value)}
                placeholder="+57 300 000 0000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-sector">Sector</Label>
              <Input
                id="emp-sector"
                value={datos.industry ?? ''}
                onChange={(e) => campo('industry', e.target.value)}
                placeholder="Servicios financieros"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-empleados">Empleados</Label>
              <Input
                id="emp-empleados"
                inputMode="numeric"
                value={empleados}
                onChange={(e) => setEmpleados(e.target.value.replace(/\D/g, ''))}
                placeholder="50"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-ciudad">Ciudad</Label>
              <Input
                id="emp-ciudad"
                value={datos.city ?? ''}
                onChange={(e) => campo('city', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-pais">País</Label>
              <Input
                id="emp-pais"
                value={datos.country ?? ''}
                onChange={(e) => campo('country', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emp-dir">Dirección</Label>
            <Input
              id="emp-dir"
              value={datos.address ?? ''}
              onChange={(e) => campo('address', e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-fact">Facturación anual</Label>
              <Input
                id="emp-fact"
                inputMode="decimal"
                value={facturacion}
                onChange={(e) =>
                  setFacturacion(e.target.value.replace(/[^0-9.]/g, ''))
                }
                placeholder="1200000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-li">LinkedIn</Label>
              <Input
                id="emp-li"
                value={datos.linkedin_url ?? ''}
                onChange={(e) => campo('linkedin_url', e.target.value)}
                placeholder="linkedin.com/company/acme"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emp-notas">Notas</Label>
            <Textarea
              id="emp-notas"
              rows={3}
              value={datos.notes ?? ''}
              onChange={(e) => campo('notes', e.target.value)}
              placeholder="Contexto que convenga tener a mano."
            />
          </div>

          {/* Cliente ideal: es el filtro con el que se decide a quién llamar
              primero, así que se marca acá y no en un menú escondido. */}
          <button
            type="button"
            onClick={() => campo('is_ideal_customer', !datos.is_ideal_customer)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
              datos.is_ideal_customer
                ? 'border-primary/30 bg-primary/5'
                : 'border-border hover:bg-muted',
            )}
          >
            <Star
              className={cn(
                'size-5 shrink-0',
                datos.is_ideal_customer
                  ? 'fill-primary text-primary'
                  : 'text-muted-foreground',
              )}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                Cliente ideal
              </span>
              <span className="block text-xs text-muted-foreground">
                Encabeza la lista y se puede filtrar por esto.
              </span>
            </span>
          </button>
        </div>

        <DialogFooter className="bg-popover border-border">
          <Button
            variant="outline"
            onClick={onCerrar}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !datos.name?.trim()}>
            {guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : empresa ? (
              'Guardar cambios'
            ) : (
              'Crear empresa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
