import type { OpenAPIV3 } from 'openapi-types';
import { type ValidationContext } from '../core/ValidationContext.js';

export interface ValidationArgs<T = unknown> {
  value: T;
  schema: OpenAPIV3.SchemaObject;
  ctx: ValidationContext;
  keys?: string[];

  /**
   * Injected orchestrator function (Dependency Injection).
   * Passed explicitly to break cyclic module imports between structural validators
   * (arrays/objects) and the root shape validator, ensuring CJS/ESM safety.
   */
  validateShape: (args: ValidationArgs) => void;
  customFormats?: Record<string, (val: string) => boolean> | undefined;
}
