/**
 * @fileoverview Schema validation plugin for CrossBus.
 * Provides automatic JSON Schema validation for handler payloads.
 * @module plugins/schema-validation
 */

import { CrossBusError, ErrorCode } from '../common/errors.js';

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
export function createValidator(schema) {
    return function validate(data, path = '') {
        const errors = [];

        // Type validation
        if (schema.type) {
            const actualType = getType(data);
            // 'integer' is a special case of 'number'
            const expectedType = schema.type === 'integer' ? 'number' : schema.type;
            if (expectedType !== actualType) {
                errors.push({
                    path: path || 'root',
                    message: `Expected ${schema.type}, got ${actualType}`
                });
                return { valid: false, errors };
            }
        }

        // Null check
        if (data === null || data === undefined) {
            if (schema.type && schema.type !== 'null') {
                errors.push({
                    path: path || 'root',
                    message: `Expected ${schema.type}, got null`
                });
            }
            return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
        }

        // Object validation
        if (schema.type === 'object' && typeof data === 'object') {
            // Required properties
            if (schema.required) {
                for (const prop of schema.required) {
                    if (!(prop in data)) {
                        errors.push({
                            path: `${path}.${prop}`,
                            message: `Missing required property: ${prop}`
                        });
                    }
                }
            }

            // Property validation
            if (schema.properties) {
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    if (key in data) {
                        const propPath = path ? `${path}.${key}` : key;
                        const propResult = createValidator(propSchema)(data[key], propPath);
                        if (!propResult.valid) {
                            errors.push(...(propResult.errors || []));
                        }
                    }
                }
            }
        }

        // Array validation
        if (schema.type === 'array' && Array.isArray(data)) {
            if (schema.items) {
                data.forEach((item, index) => {
                    const itemPath = `${path}[${index}]`;
                    const itemResult = createValidator(/** @type {JSONSchema} */(schema.items))(item, itemPath);
                    if (!itemResult.valid) {
                        errors.push(...(itemResult.errors || []));
                    }
                });
            }

            if (schema.minItems !== undefined && data.length < schema.minItems) {
                errors.push({
                    path: path || 'root',
                    message: `Array must have at least ${schema.minItems} items`
                });
            }

            if (schema.maxItems !== undefined && data.length > schema.maxItems) {
                errors.push({
                    path: path || 'root',
                    message: `Array must have at most ${schema.maxItems} items`
                });
            }
        }

        // String validation
        if (schema.type === 'string' && typeof data === 'string') {
            if (schema.minLength !== undefined && data.length < schema.minLength) {
                errors.push({
                    path: path || 'root',
                    message: `String must be at least ${schema.minLength} characters`
                });
            }

            if (schema.maxLength !== undefined && data.length > schema.maxLength) {
                errors.push({
                    path: path || 'root',
                    message: `String must be at most ${schema.maxLength} characters`
                });
            }

            if (schema.pattern) {
                const regex = new RegExp(schema.pattern);
                if (!regex.test(data)) {
                    errors.push({
                        path: path || 'root',
                        message: `String does not match pattern: ${schema.pattern}`
                    });
                }
            }
        }

        // Number validation
        if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
            if (schema.minimum !== undefined && data < schema.minimum) {
                errors.push({
                    path: path || 'root',
                    message: `Value must be at least ${schema.minimum}`
                });
            }

            if (schema.maximum !== undefined && data > schema.maximum) {
                errors.push({
                    path: path || 'root',
                    message: `Value must be at most ${schema.maximum}`
                });
            }

            if (schema.type === 'integer' && !Number.isInteger(data)) {
                errors.push({
                    path: path || 'root',
                    message: 'Value must be an integer'
                });
            }
        }

        // Enum validation
        if (schema.enum && !schema.enum.includes(data)) {
            errors.push({
                path: path || 'root',
                message: `Value must be one of: ${schema.enum.join(', ')}`
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined
        };
    };
}

/**
 * @callback Validator
 * @param {any} data - Data to validate.
 * @param {string} [path] - Current path for error reporting.
 * @returns {ValidationResult}
 */
/**
 * Gets the JSON Schema type of a value.
 * 
 * @param {unknown} value
 * @returns {string}
 */
function getType(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

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
export function withSchemaValidation(schema, handler) {
    const validate = createValidator(schema);

    return async function validatedHandler(payload, context) {
        const result = validate(payload);

        if (!result.valid) {
            throw CrossBusError.from(ErrorCode.INVALID_PAYLOAD, {
                schema: schema.$id || 'inline',
                errors: result.errors
            });
        }

        return handler(payload, context);
    };
}

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
export function createValidationHook(schemas) {
    const validators = new Map();

    for (const [name, schema] of Object.entries(schemas)) {
        validators.set(name, createValidator(schema));
    }

    return function validationHook(payload, context) {
        const validator = validators.get(context.handlerName);

        if (validator) {
            const result = validator(payload);
            if (!result.valid) {
                throw CrossBusError.from(ErrorCode.INVALID_PAYLOAD, {
                    handler: context.handlerName,
                    errors: result.errors
                });
            }
        }

        return payload;
    };
}
