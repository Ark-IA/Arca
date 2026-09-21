import { describe, it, expect } from 'vitest'

import { promptEfectivo } from './conexion'

describe('promptEfectivo — con que personalidad contesta', () => {
  it('el de la conexion gana al de la cuenta', () => {
    expect(promptEfectivo('Sos el agente de ventas.', 'Sos el agente general.')).toBe(
      'Sos el agente de ventas.',
    )
  })

  it('sin prompt propio, usa el de la cuenta', () => {
    expect(promptEfectivo(null, 'Sos el agente general.')).toBe('Sos el agente general.')
    expect(promptEfectivo(undefined, 'Sos el agente general.')).toBe(
      'Sos el agente general.',
    )
  })

  // Es lo que queda cuando alguien borra el texto de un campo sin darle a
  // limpiar. Tratarlo como «personalidad propia» dejaria al agente sin
  // ninguna instruccion — peor que no haberlo tocado.
  it('un prompt de solo espacios NO cuenta como propio', () => {
    expect(promptEfectivo('   ', 'Sos el agente general.')).toBe('Sos el agente general.')
    expect(promptEfectivo('\n\t ', 'Sos el agente general.')).toBe(
      'Sos el agente general.',
    )
  })

  it('sin ninguno de los dos, null', () => {
    expect(promptEfectivo(null, null)).toBeNull()
    expect(promptEfectivo('  ', undefined)).toBeNull()
  })

  it('recorta los espacios del propio', () => {
    expect(promptEfectivo('  Sos ventas.  ', 'general')).toBe('Sos ventas.')
  })
})
