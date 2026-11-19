/**
 * @fileoverview Schema validation plugin for CrossBus.
 * Provides automatic JSON Schema validation for handler payloads.
 * @module plugins/schema-validation
 */
export type ValidationResult = {
    /**
     * - Whether validation passed
     */
    valid: boolean;
    /**
     * - Validation errors
     */
    errors?: Array<{
        path: string;
        message: string;
    }>;
};
export type JSONSchema = {
    /**
     * - Schema identifier
     */
    $id?: string;
    /**
     * - Data type
     */
    type?: string;
    /**
     * - Object properties
     */
    properties?: Record<string, JSONSchema>;
    /**
     * - Required properties
     */
    required?: string[];
    /**
     * - Array item schema
     */
    items?: JSONSchema;
    /**
     * - Minimum number value
     */
    minimum?: number;
    /**
     * - Maximum number value
     */
    maximum?: number;
    /**
     * - Minimum string length
     */
    minLength?: number;
    /**
     * - Maximum string length
     */
    maxLength?: number;
    /**
     * - Minimum array length
     */
    minItems?: number;
    /**
     * - Maximum array length
     */
    maxItems?: number;
    /**
     * - Regex pattern for strings
     */
    pattern?: string;
    /**
     * - Allowed values
     */
    enum?: any[];
};
/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {Array<{path: string, message: string}>} [errors] - Validation errors
 */
/**
 * @typedef {Object} JSONSchema
 * @property {string} [$id] - Schema identifier
 * @property {string} [type] - Data type
 * @property {Object<string, JSONSchema>} [properties] - Object properties
 * @property {string[]} [required] - Required properties
 * @property {JSONSchema} [items] - Array item schema
 * @property {number} [minimum] - Minimum number value
 * @property {number} [maximum] - Maximum number value
 * @property {number} [minLength] - Minimum string length
 * @property {number} [maxLength] - Maximum string length
 * @property {number} [minItems] - Minimum array length
 * @property {number} [maxItems] - Maximum array length
 * @property {string} [pattern] - Regex pattern for strings
 * @property {*[]} [enum] - Allowed values
 */
/**
 * Simple JSON Schema validator.
 * Supports a subset of JSON Schema for common validation needs.
 *
 * @param {JSONSchema} schema - JSON Schema to validate against
 * @returns {Validator} Validator function
 */
export declare function createValidator(schema: JSONSchema): Validator;
export type Validator = (data: any, path?: string) => ValidationResult;
/**
 * Wraps a handler with JSON Schema validation.
 * Validates the payload before calling the handler.
 *
 * @param {JSONSchema} schema - JSON Schema to validate against
 * @param {Function} handler - Handler function to wrap
 * @returns {Function} Wrapped handler
 *
 * @example
 * import { withSchemaValidation } from 'crossbus/plugins/schema-validation';
 *
 * const userSchema = {
 *   type: 'object',
 *   required: ['name', 'email'],
 *   properties: {
 *     name: { type: 'string', minLength: 1 },
 *     email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
 *     age: { type: 'integer', minimum: 0, maximum: 150 }
 *   }
 * };
 *
 * bus.handle('createUser', withSchemaValidation(userSchema, async (payload) => {
 *   // payload is already validated!
 *   return await createUser(payload);
 * }));
 */
export declare function withSchemaValidation(schema: JSONSchema, handler: Function): Function;
/**
 * Creates a validation hook that validates all inbound messages.
 *
 * @param {Object<string, JSONSchema>} schemas - Map of handler name to schema
 * @returns {Function} Hook function for use with addInboundHook()
 *
 * @example
 * import { createValidationHook } from 'crossbus/plugins/schema-validation';
 *
 * const schemas = {
 *   createUser: userSchema,
 *   updateUser: userSchema,
 *   deleteUser: { type: 'object', required: ['id'] }
 * };
 *
 * bus.addInboundHook(createValidationHook(schemas));
 */
export declare function createValidationHook(schemas: Record<string, JSONSchema>): Function;
