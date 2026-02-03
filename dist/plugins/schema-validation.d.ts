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
export function createValidator(schema: JSONSchema): Validator;
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
export function withSchemaValidation(schema: JSONSchema, handler: Function): Function;
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
export function createValidationHook(schemas: {
    [x: string]: JSONSchema;
}): Function;
export type ValidationResult = {
    /**
     * - Whether validation passed
     */
    valid: boolean;
    /**
     * - Validation errors
     */
    errors?: {
        path: string;
        message: string;
    }[] | undefined;
};
export type JSONSchema = {
    /**
     * - Schema identifier
     */
    $id?: string | undefined;
    /**
     * - Data type
     */
    type?: string | undefined;
    /**
     * - Object properties
     */
    properties?: {
        [x: string]: JSONSchema;
    } | undefined;
    /**
     * - Required properties
     */
    required?: string[] | undefined;
    /**
     * - Array item schema
     */
    items?: JSONSchema | undefined;
    /**
     * - Minimum number value
     */
    minimum?: number | undefined;
    /**
     * - Maximum number value
     */
    maximum?: number | undefined;
    /**
     * - Minimum string length
     */
    minLength?: number | undefined;
    /**
     * - Maximum string length
     */
    maxLength?: number | undefined;
    /**
     * - Minimum array length
     */
    minItems?: number | undefined;
    /**
     * - Maximum array length
     */
    maxItems?: number | undefined;
    /**
     * - Regex pattern for strings
     */
    pattern?: string | undefined;
    /**
     * - Allowed values
     */
    enum?: any[] | undefined;
};
export type Validator = (data: any, path?: string | undefined) => ValidationResult;
