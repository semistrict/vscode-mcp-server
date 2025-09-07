import { type ZodRawShape, z } from 'zod';

/**
 * Utility type that represents a value that can be either T or Promise<T>
 */
export type Awaitable<T> = T | Promise<T>;

/**
 * Pure data object representing a tool contract (name + input schema only)
 */
export interface ToolDef<TSchema extends ZodRawShape> {
    name: string;
    inputSchema: TSchema;
}

/**
 * Extract the argument type for a tool - matches MCP's z.objectOutputType
 */
export type ToolArgs<T extends ToolDef<ZodRawShape>> = z.objectOutputType<T['inputSchema'], z.ZodTypeAny>;

/**
 * Helper function to define a ToolDef with proper typing
 */
export function defineTool<TSchema extends ZodRawShape>(
    name: string,
    inputSchema: TSchema
): ToolDef<TSchema> {
    return { name, inputSchema };
}