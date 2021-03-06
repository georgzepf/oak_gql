// deno-lint-ignore-file no-explicit-any
import { GraphQLSchema } from "../../deps.ts";

import {
  GraphQLParseOptions,
  IDirectiveResolvers,
  IResolvers,
  IResolverValidationOptions,
  ITypeDefinitions,
  PruneSchemaOptions,
  SchemaDirectiveVisitorClass,
} from "../utils/mod.ts";

export interface ILogger {
  log: (error: Error) => void;
}

/**
 * Configuration object for creating an executable schema
 */
export interface IExecutableSchemaDefinition<TContext = any> {
  /**
   * The type definitions used to create the schema
   */
  typeDefs: ITypeDefinitions;
  /**
   * Object describing the field resolvers for the provided type definitions
   */
  resolvers?: IResolvers<any, TContext> | Array<IResolvers<any, TContext>>;
  /**
   * Logger instance used to print errors to the server console that are
   * usually swallowed by GraphQL.
   */
  logger?: ILogger;
  /**
   * Set to `false` to have resolvers throw an if they return undefined, which
   * can help make debugging easier
   */
  allowUndefinedInResolve?: boolean;
  /**
   * Additional options for validating the provided resolvers
   */
  resolverValidationOptions?: IResolverValidationOptions;
  /**
   * Map of directive resolvers
   */
  directiveResolvers?: IDirectiveResolvers<any, TContext>;
  /**
   * A map of schema directives used with the legacy class-based implementation
   * of schema directives
   */
  schemaDirectives?: Record<string, SchemaDirectiveVisitorClass>;
  /**
   * An array of schema transformation functions
   */
  schemaTransforms?: ExecutableSchemaTransformation[];
  /**
   * Additional options for parsing the type definitions if they are provided
   * as a string
   */
  parseOptions?: GraphQLParseOptions;
  /**
   * GraphQL object types that implement interfaces will inherit any missing
   * resolvers from their interface types defined in the `resolvers` object
   */
  inheritResolversFromInterfaces?: boolean;
  /**
   * Additional options for removing unused types from the schema
   */
  pruningOptions?: PruneSchemaOptions;
  /**
   * Do not create a schema again and use the one from `buildASTSchema`
   */
  updateResolversInPlace?: boolean;
  /**
   * Do not extract and apply extensions separately and leave it to `buildASTSchema`
   */
  noExtensionExtraction?: boolean;
}

export type ExecutableSchemaTransformation = (
  schema: typeof GraphQLSchema,
) => typeof GraphQLSchema;
