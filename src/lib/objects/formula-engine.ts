

/** El modismo del repo para sacar texto de algo que se atrapó en un catch. */
function mensaje(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
/**
 * Motor de Fórmulas y Campos Calculados
 * Inspirado en Salesforce Formula Fields y Airtable
 * 
 * Soporta:
 * - Operaciones matemáticas básicas
 * - Funciones de texto
 * - Funciones de fecha
 * - Funciones lógicas
 * - Referencias a campos
 * - Funciones de agregación
 */

export type FormulaResult = {
  value: unknown;
  type: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'BOOLEAN';
  error?: string;
};

export interface FormulaField {
  id: string;
  name: string;
  label: string;
  formula: string;
  returnType: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'BOOLEAN';
  referencedFields: string[];
}

// Constantes y funciones disponibles
const CONSTANTS = {
  PI: Math.PI,
  E: Math.E,
  TRUE: true,
  FALSE: false,
};

const FUNCTIONS = {
  // Matemáticas
  ABS: (x: number) => Math.abs(x),
  ROUND: (x: number, decimals: number = 0) => x.toFixed(decimals),
  CEILING: (x: number) => Math.ceil(x),
  FLOOR: (x: number) => Math.floor(x),
  SQRT: (x: number) => Math.sqrt(x),
  POWER: (base: number, exp: number) => Math.pow(base, exp),
  MIN: (...args: number[]) => Math.min(...args),
  MAX: (...args: number[]) => Math.max(...args),
  SUM: (...args: number[]) => args.reduce((a, b) => a + b, 0),
  AVG: (...args: number[]) => args.reduce((a, b) => a + b, 0) / args.length,
  MOD: (a: number, b: number) => a % b,
  RAND: () => Math.random(),
  
  // Texto
  LEN: (text: string) => text?.length || 0,
  UPPER: (text: string) => text?.toUpperCase() || '',
  LOWER: (text: string) => text?.toLowerCase() || '',
  TRIM: (text: string) => text?.trim() || '',
  LEFT: (text: string, n: number) => text?.slice(0, n) || '',
  RIGHT: (text: string, n: number) => text?.slice(-n) || '',
  MID: (text: string, start: number, length: number) => text?.slice(start, start + length) || '',
  FIND: (search: string, text: string) => text?.indexOf(search) || -1,
  SUBSTITUTE: (text: string, find: string, replace: string) => text?.replaceAll(find, replace) || '',
  CONCATENATE: (...args: string[]) => args.join(''),
  TEXT: (value: unknown, format: string) => String(value),
  REPEAT: (text: string, count: number) => text?.repeat(count) || '',
  
  // Fecha
  TODAY: () => new Date(),
  NOW: () => new Date(),
  YEAR: (date: Date) => new Date(date).getFullYear(),
  MONTH: (date: Date) => new Date(date).getMonth() + 1,
  DAY: (date: Date) => new Date(date).getDate(),
  HOUR: (date: Date) => new Date(date).getHours(),
  MINUTE: (date: Date) => new Date(date).getMinutes(),
  WEEKDAY: (date: Date) => new Date(date).getDay(),
  DATE: (year: number, month: number, day: number) => new Date(year, month - 1, day),
  DATEADD: (date: Date, amount: number, unit: string) => {
    const d = new Date(date);
    switch (unit.toLowerCase()) {
      case 'day': d.setDate(d.getDate() + amount); break;
      case 'month': d.setMonth(d.getMonth() + amount); break;
      case 'year': d.setFullYear(d.getFullYear() + amount); break;
      case 'hour': d.setHours(d.getHours() + amount); break;
      case 'minute': d.setMinutes(d.getMinutes() + amount); break;
    }
    return d;
  },
  DATEDIFF: (date1: Date, date2: Date, unit: string = 'day') => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = d2.getTime() - d1.getTime();
    switch (unit.toLowerCase()) {
      case 'day': return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      case 'month': return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
      case 'year': return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
      case 'hour': return Math.floor(diffMs / (1000 * 60 * 60));
      case 'minute': return Math.floor(diffMs / (1000 * 60));
      default: return diffMs;
    }
  },
  ISLEAPYEAR: (date: Date) => {
    const year = new Date(date).getFullYear();
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  },
  
  // Lógicas
  IF: (condition: boolean, trueValue: unknown, falseValue: unknown) => condition ? trueValue : falseValue,
  AND: (...args: boolean[]) => args.every(Boolean),
  OR: (...args: boolean[]) => args.some(Boolean),
  NOT: (value: boolean) => !value,
  XOR: (a: boolean, b: boolean) => (a && !b) || (!a && b),
  ISNULL: (value: unknown) => value === null || value === undefined,
  ISNOTNULL: (value: unknown) => value !== null && value !== undefined,
  ISBLANK: (value: unknown) => value === null || value === undefined || value === '',
  ISNUMBER: (value: unknown) => typeof value === 'number' && !isNaN(value),
  ISTEXT: (value: unknown) => typeof value === 'string',
  ISDATE: (value: unknown) => value instanceof Date,
  EQUALS: (a: unknown, b: unknown) => a === b,
  NOTEQUALS: (a: unknown, b: unknown) => a !== b,
  GREATER: (a: number, b: number) => a > b,
  LESS: (a: number, b: number) => a < b,
  GREATEREQUALS: (a: number, b: number) => a >= b,
  LESSEQUALS: (a: number, b: number) => a <= b,
  BETWEEN: (value: number, min: number, max: number) => value >= min && value <= max,
  CONTAINS: (text: string, search: string) => text?.includes(search) || false,
  BEGINSWITH: (text: string, prefix: string) => text?.startsWith(prefix) || false,
  ENDSWITH: (text: string, suffix: string) => text?.endsWith(suffix) || false,
  
  // Conversión
  TONUMBER: (value: unknown) => Number(value) || 0,
  TOTEXT: (value: unknown) => String(value),
  TODATE: (value: string | number) => new Date(value),
  TOCURRENCY: (value: number, currency: string = 'USD') => ({ value, currency }),
  
  // Agregación (para ROLLUP)
  COUNT: (...args: unknown[]) => args.filter(v => v !== null && v !== undefined).length,
  COUNTA: (...args: unknown[]) => args.filter(Boolean).length,
  COUNTBLANK: (...args: unknown[]) => args.filter(v => v === null || v === undefined || v === '').length,
  
  // Utilidades
  CASE: (expression: unknown, ...pairs: unknown[]) => {
    for (let i = 0; i < pairs.length; i += 2) {
      if (pairs[i] === expression) return pairs[i + 1];
    }
    return pairs[pairs.length - 1]; // Default value
  },
  SWITCH: (expression: unknown, ...cases: unknown[]) => {
    for (let i = 0; i < cases.length; i += 3) {
      const condition = cases[i];
      if (typeof condition === 'function' ? condition(expression) : condition === expression) {
        return cases[i + 1];
      }
    }
    return cases[cases.length - 1];
  },
  COALESCE: (...args: unknown[]) => args.find(v => v !== null && v !== undefined) || null,
  BLANK: () => null,
};

export class FormulaEngine {
  private fieldValues: Record<string, unknown>;
  private referencedFields: string[];

  constructor(fieldValues: Record<string, unknown>) {
    this.fieldValues = fieldValues;
    this.referencedFields = [];
  }

  /**
   * Evaluar una fórmula
   */
  evaluate(formula: string, returnType: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'BOOLEAN' = 'NUMBER'): FormulaResult {
    try {
      this.referencedFields = [];
      const value = this.parseFormula(formula);
      
      return {
        value,
        type: returnType,
      };
    } catch (error) {
      return {
        value: null,
        type: returnType,
        error: mensaje(error),
      };
    }
  }

  /**
   * Obtener campos referenciados en la fórmula
   */
  getReferencedFields(): string[] {
    return this.referencedFields;
  }

  /**
   * Validar una fórmula
   */
  validate(formula: string): { valid: boolean; error?: string } {
    try {
      this.parseFormula(formula);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: mensaje(error) };
    }
  }

  // Parser interno
  private parseFormula(formula: string): unknown {
    // Reemplazar referencias a campos {{field_name}}
    const withFields = formula.replace(/\{\{(\w+)\}\}/g, (match, fieldName) => {
      this.referencedFields.push(fieldName);
      const value = this.fieldValues[fieldName];
      if (value === undefined || value === null) {
        return 'BLANK()';
      }
      return typeof value === 'string' ? `"${value}"` : String(value);
    });

    // Reemplazar constantes
    let expression = withFields;
    Object.entries(CONSTANTS).forEach(([key, value]) => {
      expression = expression.replace(new RegExp(`\\b${key}\\b`, 'g'), String(value));
    });

    // Reemplazar funciones
    Object.keys(FUNCTIONS).forEach(funcName => {
      const regex = new RegExp(`${funcName}\\s*\\(`, 'g');
      expression = expression.replace(regex, `FUNCTIONS.${funcName}(`);
    });

    // Añadir contexto de funciones
    expression = `with (FUNCTIONS) { ${expression} }`;

    // Evaluar de forma segura
    try {
      const result = this.safeEvaluate(expression);
      return result;
    } catch (error) {
      throw new Error(`Error evaluando fórmula: ${mensaje(error)}`);
    }
  }

  /**
   * Evaluación segura usando Function en lugar de eval
   */
  private safeEvaluate(expression: string): unknown {
    // Crear función con contexto limitado
    const func = new Function('FUNCTIONS', 'CONSTANTS', `
      'use strict';
      try {
        return (${expression});
      } catch (e) {
        throw new Error('Error en expresión: ' + e.message);
      }
    `);

    const result = func(FUNCTIONS, CONSTANTS);
    return result;
  }

  /**
   * Calcular fórmula con formato
   */
  evaluateWithFormat(formula: string, returnType: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'BOOLEAN', format?: string): string {
    const result = this.evaluate(formula, returnType);
    
    if (result.error) {
      return `ERROR: ${result.error}`;
    }

    // El resultado de una fórmula es un valor arbitrario: lo produce
    // una expresión que el usuario escribió. `returnType` dice cómo
    // QUIERE verlo, no lo que la fórmula devolvió de verdad — una
    // marcada como CURRENCY puede acabar dando un texto porque una
    // rama del IF devuelve "sin dato".
    //
    // Antes eso llegaba directo a `Intl.NumberFormat().format()`, que
    // no acepta un texto y revienta la celda entera. Ahora, cuando el
    // valor no encaja con el formato pedido, se muestra tal cual: que
    // una celda diga "sin dato" es infinitamente mejor que una tabla
    // que no carga.
    const comoNumero = typeof result.value === 'number' && Number.isFinite(result.value)
      ? result.value
      : null;

    switch (returnType) {
      case 'CURRENCY': {
        if (comoNumero === null) return String(result.value ?? '');
        // `format` es aquí el código ISO de moneda, no una etiqueta de
        // idioma; con un código inválido `Intl` lanza RangeError, así
        // que se cae al formato por omisión en vez de romper.
        try {
          if (format) {
            return new Intl.NumberFormat(undefined, { style: 'currency', currency: format }).format(comoNumero);
          }
        } catch {
          // Código de moneda inválido — sigue al formato por omisión.
        }
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(comoNumero);
      }

      case 'DATE': {
        // Una fecha puede venir como Date, como texto ISO o como marca
        // de tiempo. Cualquier otra cosa no es una fecha.
        const v = result.value;
        const fecha =
          v instanceof Date ? v
          : typeof v === 'string' || typeof v === 'number' ? new Date(v)
          : null;
        if (!fecha || Number.isNaN(fecha.getTime())) return String(v ?? '');
        return fecha.toLocaleDateString(format);
      }

      case 'NUMBER':
        if (comoNumero === null) return String(result.value ?? '');
        return format
          ? new Intl.NumberFormat(format).format(comoNumero)
          : String(comoNumero);

      case 'BOOLEAN':
        return result.value ? 'Sí' : 'No';

      default:
        return String(result.value ?? '');
    }
  }
}

/**
 * Helper para crear campos de fórmula
 */
export function createFormulaField(config: {
  name: string;
  label: string;
  formula: string;
  returnType: 'TEXT' | 'NUMBER' | 'CURRENCY' | 'DATE' | 'BOOLEAN';
  description?: string;
}): FormulaField {
  const engine = new FormulaEngine({});
  const referencedFields = engine.getReferencedFields();

  return {
    id: `formula_${config.name}`,
    name: config.name,
    label: config.label,
    formula: config.formula,
    returnType: config.returnType,
    referencedFields,
  };
}

// Ejemplos de fórmulas predefinidas
export const PREDEFINED_FORMULAS = {
  // Ventas
  TOTAL_AMOUNT: '{quantity} * {unit_price}',
  DISCOUNT_AMOUNT: '{total_amount} * ({discount_percent} / 100)',
  FINAL_AMOUNT: '{total_amount} - {discount_amount}',
  TAX_AMOUNT: '{final_amount} * {tax_rate}',
  GRAND_TOTAL: '{final_amount} + {tax_amount}',
  
  // Fechas
  DAYS_UNTIL_DEADLINE: 'DATEDIFF(TODAY(), {deadline}, "day")',
  DAYS_OVERDUE: 'IF({status} != "completed", DATEDIFF({deadline}, TODAY(), "day"), 0)',
  ESTIMATED_COMPLETION: 'DATEADD(TODAY(), {estimated_days}, "day")',
  AGE_DAYS: 'DATEDIFF({created_date}, TODAY(), "day")',
  
  // Texto
  FULL_NAME: 'CONCATENATE({first_name}, " ", {last_name})',
  EMAIL_DOMAIN: 'RIGHT({email}, LEN({email}) - FIND("@", {email}))',
  PHONE_FORMATTED: 'CONCATENATE("+", {country_code}, " ", {phone})',
  
  // Lógicas
  IS_URGENT: 'AND({priority} = "high", {status} != "completed")',
  IS_OVERDUE: 'AND({deadline} < TODAY(), {status} != "completed")',
  NEEDS_ATTENTION: 'OR({priority} = "urgent", IS_OVERDUE)',
  
  // Progreso
  PROGRESS_PERCENT: 'IF({total_tasks} = 0, 0, ROUND(({completed_tasks} / {total_tasks}) * 100, 0))',
  COMPLETION_STATUS: 'IF({progress_percent} = 100, "Completado", IF({progress_percent} > 50, "En Progreso", "Iniciado"))',
  
  // Condicionales
  PRIORITY_COLOR: 'CASE({priority}, "urgent", "#dc2626", "high", "#ef4444", "medium", "#eab308", "low", "#22c55e", "#6b7280")',
  STATUS_ICON: 'CASE({status}, "completed", "✅", "in_progress", "🔄", "pending", "⏳", "❌")',
  
  // Finanzas
  PROFIT_MARGIN: 'IF({revenue} = 0, 0, ROUND(({revenue} - {cost}) / {revenue} * 100, 2))',
  ROI: 'ROUND(({gain} - {cost}) / {cost} * 100, 2)',
  BREAK_EVEN: '{fixed_costs} / ({unit_price} - {variable_cost_per_unit})',
};

/**
 * Clase para gestionar campos calculados en tiempo real
 */
export class CalculatedFieldsManager {
  private formulas: Map<string, FormulaField>;

  constructor() {
    this.formulas = new Map();
  }

  /**
   * Registrar un campo calculado
   */
  register(field: FormulaField): void {
    this.formulas.set(field.id, field);
  }

  /**
   * Calcular todos los campos para un registro
   */
  calculateAll(fieldValues: Record<string, unknown>): Record<string, unknown> {
    const results: Record<string, unknown> = {};

    for (const [fieldId, field] of this.formulas) {
      const engine = new FormulaEngine(fieldValues);
      const result = engine.evaluate(field.formula, field.returnType);
      
      if (!result.error) {
        results[fieldId] = result.value;
      }
    }

    return results;
  }

  /**
   * Calcular un campo específico
   */
  calculate(fieldId: string, fieldValues: Record<string, unknown>): FormulaResult {
    const field = this.formulas.get(fieldId);
    
    if (!field) {
      return { value: null, type: 'TEXT', error: 'Campo no encontrado' };
    }

    const engine = new FormulaEngine(fieldValues);
    return engine.evaluate(field.formula, field.returnType);
  }

  /**
   * Obtener campos que dependen de un campo específico
   */
  getDependentFields(fieldName: string): string[] {
    const dependents: string[] = [];
    
    for (const [fieldId, field] of this.formulas) {
      if (field.referencedFields.includes(fieldName)) {
        dependents.push(fieldId);
      }
    }
    
    return dependents;
  }

  /**
   * Eliminar un campo calculado
   */
  unregister(fieldId: string): void {
    this.formulas.delete(fieldId);
  }

  /**
   * Listar todos los campos calculados
   */
  list(): FormulaField[] {
    return Array.from(this.formulas.values());
  }
}

// Exportar funciones para usar en fórmulas desde el SDK
export const Formula = {
  // Crear fórmula personalizada
  CUSTOM: (formula: string) => formula,
  
  // Fórmulas predefinidas
  ...PREDEFINED_FORMULAS,
};
