'use client';

/**
 * Tareas de un contacto, dentro de su ficha.
 *
 * Envoltorio delgado sobre `ListaTareas`: la lista no sabe cargar nada, y este
 * componente es el que le da el alcance correcto. Esa separación es lo que
 * impide que el panel de un contacto termine mostrando las tareas de toda la
 * cuenta por un descuido.
 */

import { ListaTareas } from '@/components/tasks/lista-tareas';
import { useTasks } from '@/hooks/use-tasks';

export function PanelTareasDeContacto({
  contactId,
  puedeEditar,
}: {
  contactId: string;
  puedeEditar: boolean;
}) {
  const { tareas, cargando, crear, actualizar, borrar, alternarHecha } = useTasks({
    tipo: 'contact',
    id: contactId,
  });

  return (
    <ListaTareas
      tareas={tareas}
      cargando={cargando}
      puedeEditar={puedeEditar}
      // El destino ya está fijado en el hook, así que no hace falta repetirlo:
      // la tarea creada acá nace colgada de este contacto.
      onCrear={(d) => crear(d)}
      onActualizar={actualizar}
      onBorrar={borrar}
      onAlternar={alternarHecha}
      vacio="Sin tareas para este contacto."
      compacto
    />
  );
}
