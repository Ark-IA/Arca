import { describe, it, expect } from 'vitest'

import { colasDe, esMia } from './use-colas'
import type { ColaConMiembros } from './use-colas'

const YO = 'usuario-yo'
const OTRO = 'usuario-otro'

const COLAS: ColaConMiembros[] = [
  {
    id: 'ventas',
    name: 'Ventas',
    description: null,
    color: 'emerald',
    is_active: true,
    miembros: [{ user_id: YO, full_name: 'Yo' }],
  },
  {
    id: 'soporte',
    name: 'Soporte',
    description: null,
    color: 'blue',
    is_active: true,
    miembros: [{ user_id: OTRO, full_name: 'Otro' }],
  },
]

describe('colasDe', () => {
  it('devuelve solo las colas donde está la persona', () => {
    expect([...colasDe(COLAS, YO)]).toEqual(['ventas'])
    expect([...colasDe(COLAS, OTRO)]).toEqual(['soporte'])
  })

  it('sin usuario, ninguna', () => {
    expect(colasDe(COLAS, null).size).toBe(0)
    expect(colasDe(COLAS, undefined).size).toBe(0)
  })
})

describe('esMia — qué ve cada asesor', () => {
  const mias = colasDe(COLAS, YO)

  it('ve lo que espera en su cola', () => {
    expect(esMia({ cola_id: 'ventas' }, YO, mias)).toBe(true)
  })

  it('NO ve lo que espera en una cola ajena', () => {
    expect(esMia({ cola_id: 'soporte' }, YO, mias)).toBe(false)
  })

  it('ve lo que está a su nombre, aunque sea de otra cola', () => {
    // Si se lo asignaron a mano, es suyo. La cola ya no manda.
    expect(esMia({ cola_id: 'soporte', assigned_agent_id: YO }, YO, mias)).toBe(true)
  })

  it('NO ve lo que está a nombre de otra persona', () => {
    expect(esMia({ cola_id: 'ventas', assigned_agent_id: OTRO }, YO, mias)).toBe(false)
  })

  // Sin asignación y sin cola, nadie. Es la regla que fija la migración 061
  // en las políticas de la base, y esta función tiene que decir lo mismo: si
  // contara de más, el filtro sumaría conversaciones que el servidor nunca
  // devuelve y los totales de la bandeja no cuadrarían con lo que se ve.
  it('lo que no está asignado ni encolado no es de nadie', () => {
    expect(esMia({ cola_id: null }, YO, mias)).toBe(false)
    expect(esMia({}, YO, mias)).toBe(false)
    expect(esMia({ cola_id: null }, OTRO, colasDe(COLAS, OTRO))).toBe(false)
  })

  it('sin cola pero asignada a otro, tampoco', () => {
    expect(esMia({ cola_id: null, assigned_agent_id: OTRO }, YO, mias)).toBe(false)
  })

  it('quien no está en ninguna cola y no tiene nada asignado, no ve nada', () => {
    const sinColas = new Set<string>()
    expect(esMia({ cola_id: null }, 'nuevo', sinColas)).toBe(false)
    expect(esMia({ cola_id: 'ventas' }, 'nuevo', sinColas)).toBe(false)
    // Salvo lo que se le asigne a él, que es la forma de darle trabajo.
    expect(esMia({ assigned_agent_id: 'nuevo' }, 'nuevo', sinColas)).toBe(true)
  })
})
