// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

import { RouterContext, GraphQLFieldResolver, GraphQLTypeResolver, GraphQLSchema, ExecutableSchemaDefinition } from "../deps.ts";

interface OakGQLArgsBase {
  rootValue?: unknown;
  contextValue?: (context?: RouterContext) => unknown;
  fieldResolver?: GraphQLFieldResolver<any, any>;
  typeResolver?: GraphQLTypeResolver<any, any>;
  debug?: boolean;
}

export type OakGQLArgs =
  ({ executableSchema: typeof GraphQLSchema; } | { typeDefs: ExecutableSchemaDefinition["typeDefs"]; resolvers: ExecutableSchemaDefinition["resolvers"]; })
  & OakGQLArgsBase;
