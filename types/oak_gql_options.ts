// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

import { RouterContext, GraphQLArgs } from "../deps.ts";

export type OakGqlOptions = {
  context: RouterContext;
  graphqlArgs: GraphQLArgs;
}
