// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

export { makeExecutableSchema } from "./graphql-tools/lib/schema/mod.ts";
export { graphql } from "https://cdn.skypack.dev/graphql@15.5.1?dts";
export { error as logError, warning as logWarning } from "https://deno.land/std@0.101.0/log/mod.ts";

export type { RouterMiddleware, RouterContext } from "https://deno.land/x/oak@v7.7.0/mod.ts";
export type { IExecutableSchemaDefinition as ExecutableSchemaDefinition } from "./graphql-tools/lib/schema/mod.ts";

// @ts-ignore
export type { GraphQLFieldResolver, GraphQLTypeResolver, GraphQLSchema, ExecutionResult } from "https://cdn.skypack.dev/graphql@15.5.1?dts";
