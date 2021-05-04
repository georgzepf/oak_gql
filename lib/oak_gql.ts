// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

import { OakGqlOptions } from "../types/oak_gql_options.ts";
import { RouterMiddleware, RouterContext } from "../deps.ts";

export function oakGql(options: OakGqlOptions): RouterMiddleware {
  return async (context: RouterContext, next: () => Promise<unknown>): Promise<void> => {

  };
}
