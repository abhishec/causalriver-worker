/**
 * Structured Output — Schema Validation & Typed Response Generation
 * ══════════════════════════════════════════════════════════════════════
 *
 * Claude-level capability: Ensures brain outputs conform to a specified
 * schema, validates structure, and transforms free-form brain context
 * into strongly-typed response objects.
 *
 * Brain Analog: Wernicke's Area — language comprehension and structured
 * production. Takes unstructured thoughts and packages them into
 * well-formed, parseable outputs.
 *
 * Features:
 * - Schema definition and validation (JSON Schema-like)
 * - Brain context → structured object transformation
 * - Response envelope with metadata (confidence, sources, timing)
 * - Multiple output formats (JSON, markdown, table, chart-spec)
 * - Validation error reporting with suggestions
 * - Default value injection for missing fields
 * - Nested object support
 *
 * @example
 * ```typescript
 * const output = createStructuredOutput();
 *
 * // Define a schema
 * const schema = output.defineSchema({
 *   name: 'DiagnosisReport',
 *   fields: {
 *     rootCause: { type: 'string', required: true },
 *     confidence: { type: 'number', min: 0, max: 1 },
 *     affectedDomains: { type: 'array', items: { type: 'string' } },
 *     recommendations: { type: 'array', items: { type: 'string' } },
 *   },
 * });
 *
 * // Validate and structure brain output
 * const result = output.structure(brainContext, schema);
 * console.log(result.valid);      // true
 * console.log(result.data);       // Typed object
 * console.log(result.envelope);   // Full response with metadata
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for structured output */
export interface StructuredOutputConfig {
  /** Whether to inject defaults for missing required fields (default: true) */
  injectDefaults?: boolean;
  /** Whether to strip unknown fields (default: false) */
  stripUnknown?: boolean;
  /** Maximum nesting depth (default: 10) */
  maxDepth?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Field type definition */
export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'enum';

/** A field definition in a schema */
export interface FieldDef {
  /** Field type */
  type: FieldType;
  /** Whether this field is required (default: false) */
  required?: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** Description of the field */
  description?: string;
  /** For 'number': minimum value */
  min?: number;
  /** For 'number': maximum value */
  max?: number;
  /** For 'string': minimum length */
  minLength?: number;
  /** For 'string': maximum length */
  maxLength?: number;
  /** For 'string': regex pattern */
  pattern?: string;
  /** For 'array': item definition */
  items?: FieldDef;
  /** For 'array': min items */
  minItems?: number;
  /** For 'array': max items */
  maxItems?: number;
  /** For 'object': nested fields */
  fields?: Record<string, FieldDef>;
  /** For 'enum': allowed values */
  values?: (string | number)[];
}

/** A schema definition */
export interface OutputSchema {
  /** Schema name */
  name: string;
  /** Schema description */
  description?: string;
  /** Field definitions */
  fields: Record<string, FieldDef>;
  /** Schema version */
  version?: string;
}

/** Validation error */
export interface ValidationError {
  /** Field path (e.g., 'rootCause', 'recommendations[0]') */
  path: string;
  /** Error message */
  message: string;
  /** Expected value/type */
  expected: string;
  /** Actual value/type */
  actual: string;
}

/** Result of structuring brain output */
export interface StructuredResult<T = Record<string, unknown>> {
  /** Whether the output is valid against the schema */
  valid: boolean;
  /** Structured data (may have defaults injected) */
  data: T;
  /** Validation errors (empty if valid) */
  errors: ValidationError[];
  /** Response envelope with metadata */
  envelope: ResponseEnvelope<T>;
}

/** Full response envelope with metadata */
export interface ResponseEnvelope<T = Record<string, unknown>> {
  /** Schema used */
  schema: string;
  /** Schema version */
  version: string;
  /** The structured data */
  data: T;
  /** Brain metadata */
  meta: {
    /** Intent that was detected */
    intent?: string;
    /** Overall confidence */
    confidence: number;
    /** Domains involved */
    domains: string[];
    /** Brain regions that contributed */
    regionsUsed: string[];
    /** Processing timestamp */
    timestamp: string;
    /** Uncertain areas */
    uncertainAreas: string[];
  };
  /** Is the output valid? */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
}

/** Output format specification */
export type OutputFormat = 'json' | 'markdown' | 'table' | 'summary';

/** Formatted output result */
export interface FormattedOutput {
  /** The formatted content */
  content: string;
  /** Format used */
  format: OutputFormat;
  /** Token estimate */
  tokenEstimate: number;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate a value against a field definition.
 */
function validateField(
  value: unknown,
  field: FieldDef,
  path: string,
  depth: number,
  maxDepth: number,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (depth > maxDepth) {
    errors.push({ path, message: 'Maximum nesting depth exceeded', expected: `depth <= ${maxDepth}`, actual: `depth ${depth}` });
    return errors;
  }

  // Null/undefined check
  if (value === undefined || value === null) {
    if (field.required) {
      errors.push({ path, message: 'Required field is missing', expected: field.type, actual: 'undefined' });
    }
    return errors;
  }

  // Type validation
  switch (field.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push({ path, message: 'Expected string', expected: 'string', actual: typeof value });
      } else {
        if (field.minLength && value.length < field.minLength) {
          errors.push({ path, message: `String too short (min: ${field.minLength})`, expected: `>= ${field.minLength}`, actual: `${value.length}` });
        }
        if (field.maxLength && value.length > field.maxLength) {
          errors.push({ path, message: `String too long (max: ${field.maxLength})`, expected: `<= ${field.maxLength}`, actual: `${value.length}` });
        }
        if (field.pattern && !new RegExp(field.pattern).test(value)) {
          errors.push({ path, message: `String doesn't match pattern`, expected: field.pattern, actual: value });
        }
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({ path, message: 'Expected number', expected: 'number', actual: typeof value });
      } else {
        if (field.min !== undefined && value < field.min) {
          errors.push({ path, message: `Number below minimum (${field.min})`, expected: `>= ${field.min}`, actual: `${value}` });
        }
        if (field.max !== undefined && value > field.max) {
          errors.push({ path, message: `Number above maximum (${field.max})`, expected: `<= ${field.max}`, actual: `${value}` });
        }
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push({ path, message: 'Expected boolean', expected: 'boolean', actual: typeof value });
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push({ path, message: 'Expected array', expected: 'array', actual: typeof value });
      } else {
        if (field.minItems && value.length < field.minItems) {
          errors.push({ path, message: `Array too short (min: ${field.minItems})`, expected: `>= ${field.minItems} items`, actual: `${value.length} items` });
        }
        if (field.maxItems && value.length > field.maxItems) {
          errors.push({ path, message: `Array too long (max: ${field.maxItems})`, expected: `<= ${field.maxItems} items`, actual: `${value.length} items` });
        }
        if (field.items) {
          for (let i = 0; i < value.length; i++) {
            errors.push(...validateField(value[i], field.items, `${path}[${i}]`, depth + 1, maxDepth));
          }
        }
      }
      break;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({ path, message: 'Expected object', expected: 'object', actual: typeof value });
      } else if (field.fields) {
        for (const [key, fieldDef] of Object.entries(field.fields)) {
          errors.push(...validateField(
            (value as Record<string, unknown>)[key],
            fieldDef,
            `${path}.${key}`,
            depth + 1,
            maxDepth,
          ));
        }
      }
      break;

    case 'date':
      if (!(value instanceof Date) && (typeof value !== 'string' || isNaN(Date.parse(value as string)))) {
        errors.push({ path, message: 'Expected date (ISO string or Date)', expected: 'date', actual: typeof value });
      }
      break;

    case 'enum':
      if (field.values && !field.values.includes(value as string | number)) {
        errors.push({ path, message: `Value not in allowed set`, expected: field.values.join(' | '), actual: String(value) });
      }
      break;
  }

  return errors;
}

/**
 * Inject default values for missing fields.
 */
function injectDefaults(data: Record<string, unknown>, fields: Record<string, FieldDef>): Record<string, unknown> {
  const result = { ...data };

  for (const [key, field] of Object.entries(fields)) {
    if (result[key] === undefined && field.default !== undefined) {
      result[key] = field.default;
    }

    // Recurse into nested objects
    if (field.type === 'object' && field.fields && result[key] && typeof result[key] === 'object') {
      result[key] = injectDefaults(result[key] as Record<string, unknown>, field.fields);
    }
  }

  return result;
}

// ============================================================================
// FORMATTERS
// ============================================================================

/**
 * Format structured data as a markdown table.
 */
function formatAsTable(data: Record<string, unknown>): string {
  const rows: string[] = ['| Field | Value |', '|-------|-------|'];
  for (const [key, value] of Object.entries(data)) {
    const displayValue = Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    rows.push(`| ${key} | ${displayValue} |`);
  }
  return rows.join('\n');
}

/**
 * Format structured data as markdown summary.
 */
function formatAsSummary(data: Record<string, unknown>, schema: OutputSchema): string {
  const parts: string[] = [`## ${schema.name}`];
  if (schema.description) parts.push(`*${schema.description}*`);
  parts.push('');

  for (const [key, field] of Object.entries(schema.fields)) {
    const value = data[key];
    if (value === undefined) continue;

    const label = field.description || key;
    if (Array.isArray(value)) {
      parts.push(`**${label}:**`);
      for (const item of value) {
        parts.push(`- ${item}`);
      }
    } else {
      parts.push(`**${label}:** ${value}`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a structured output manager for schema validation and response formatting.
 *
 * Ensures brain outputs conform to specified schemas and packages them
 * into well-formed, parseable response envelopes.
 */
export function createStructuredOutput(config: StructuredOutputConfig = {}) {
  const {
    injectDefaults: shouldInjectDefaults = true,
    stripUnknown = false,
    maxDepth = 10,
    verbose = false,
  } = config;

  const schemas: Map<string, OutputSchema> = new Map();

  return {
    /**
     * Define and register a schema.
     */
    defineSchema(schema: OutputSchema): OutputSchema {
      schemas.set(schema.name, schema);
      return schema;
    },

    /**
     * Get a registered schema by name.
     */
    getSchema(name: string): OutputSchema | undefined {
      return schemas.get(name);
    },

    /**
     * Validate data against a schema.
     */
    validate(data: Record<string, unknown>, schema: OutputSchema): { valid: boolean; errors: ValidationError[] } {
      const errors: ValidationError[] = [];

      for (const [key, field] of Object.entries(schema.fields)) {
        errors.push(...validateField(data[key], field, key, 0, maxDepth));
      }

      // Check for unknown fields
      if (stripUnknown) {
        for (const key of Object.keys(data)) {
          if (!schema.fields[key]) {
            errors.push({ path: key, message: 'Unknown field', expected: 'known field', actual: key });
          }
        }
      }

      return { valid: errors.length === 0, errors };
    },

    /**
     * Structure brain output according to a schema.
     * Injects defaults, validates, and wraps in an envelope.
     */
    structure<T = Record<string, unknown>>(
      data: Record<string, unknown>,
      schema: OutputSchema,
      meta?: Partial<ResponseEnvelope['meta']>,
    ): StructuredResult<T> {
      // Inject defaults
      let processed = { ...data };
      if (shouldInjectDefaults) {
        processed = injectDefaults(processed, schema.fields);
      }

      // Strip unknown fields
      if (stripUnknown) {
        const knownKeys = new Set(Object.keys(schema.fields));
        for (const key of Object.keys(processed)) {
          if (!knownKeys.has(key)) {
            delete processed[key];
          }
        }
      }

      // Validate
      const errors: ValidationError[] = [];
      for (const [key, field] of Object.entries(schema.fields)) {
        errors.push(...validateField(processed[key], field, key, 0, maxDepth));
      }

      const valid = errors.length === 0;

      const envelope: ResponseEnvelope<T> = {
        schema: schema.name,
        version: schema.version || '1.0',
        data: processed as T,
        meta: {
          intent: meta?.intent,
          confidence: meta?.confidence ?? (valid ? 0.8 : 0.4),
          domains: meta?.domains || [],
          regionsUsed: meta?.regionsUsed || [],
          timestamp: new Date().toISOString(),
          uncertainAreas: meta?.uncertainAreas || (errors.length > 0
            ? errors.map((e) => `${e.path}: ${e.message}`)
            : []),
        },
        valid,
        errors,
      };

      return {
        valid,
        data: processed as T,
        errors,
        envelope,
      };
    },

    /**
     * Format structured data in various output formats.
     */
    format(data: Record<string, unknown>, schema: OutputSchema, format: OutputFormat = 'json'): FormattedOutput {
      let content: string;

      switch (format) {
        case 'json':
          content = JSON.stringify(data, null, 2);
          break;
        case 'markdown':
          content = formatAsSummary(data, schema);
          break;
        case 'table':
          content = formatAsTable(data);
          break;
        case 'summary':
          content = formatAsSummary(data, schema);
          break;
        default:
          content = JSON.stringify(data, null, 2);
      }

      return {
        content,
        format,
        tokenEstimate: Math.ceil(content.length / 4),
      };
    },

    /**
     * Create a common schema from a TypeScript-like definition.
     */
    quickSchema(name: string, definition: Record<string, string>): OutputSchema {
      const fields: Record<string, FieldDef> = {};

      for (const [key, typeDef] of Object.entries(definition)) {
        const required = typeDef.endsWith('!');
        const cleanType = typeDef.replace('!', '').trim();

        let fieldDef: FieldDef;
        switch (cleanType) {
          case 'string':
            fieldDef = { type: 'string', required };
            break;
          case 'number':
            fieldDef = { type: 'number', required };
            break;
          case 'boolean':
            fieldDef = { type: 'boolean', required };
            break;
          case 'date':
            fieldDef = { type: 'date', required };
            break;
          case 'string[]':
            fieldDef = { type: 'array', items: { type: 'string' }, required };
            break;
          case 'number[]':
            fieldDef = { type: 'array', items: { type: 'number' }, required };
            break;
          default:
            if (cleanType.startsWith('enum:')) {
              const values = cleanType.slice(5).split('|').map((v) => v.trim());
              fieldDef = { type: 'enum', values, required };
            } else {
              fieldDef = { type: 'string', required };
            }
        }

        fields[key] = fieldDef;
      }

      const schema: OutputSchema = { name, fields };
      schemas.set(name, schema);
      return schema;
    },

    /**
     * Get all registered schemas.
     */
    listSchemas(): string[] {
      return Array.from(schemas.keys());
    },

    /**
     * Get configuration.
     */
    getConfig(): StructuredOutputConfig {
      return { injectDefaults: shouldInjectDefaults, stripUnknown, maxDepth, verbose };
    },
  };
}
