// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

import { OakGQLArgs } from "../types/oak_gql_args.ts";
import { RouterMiddleware, RouterContext, makeExecutableSchema, ExecutionResult, graphql, logError, logWarning } from "../deps.ts";
import { GQLPostBody } from "../types/gql_post_body.ts";
import { GQLErrorBody } from "../types/gql_error_body.ts";

function handleOakGQLError(error: Error | string, context: RouterContext, debug: boolean = false): void {
  logError(`oak_gql: ${error}`);

  let responseErrorBody: GQLErrorBody = {
    errors: [
      { message: error instanceof Error ? error.message : error }
    ]
  };

  if (debug && error instanceof Error) Object.assign(responseErrorBody.errors[0], { extensions: { errorType: error.name, stacktrace: error.stack } });

  context.response.status = 200;
  context.response.body = responseErrorBody;
}

export function oakGQL<TContext = any>(args: OakGQLArgs): RouterMiddleware {
  if (args.debug) logWarning("oak_gql: Debug mode enabled!");

  return async (context: RouterContext): Promise<void> => {
    try {
      if (context.request.method !== "POST" && !args.debug) {
        handleOakGQLError("HTTP method not allowed.", context, args.debug);
        return;
      }

      let schema: any = "executableSchema" in args ? args.executableSchema : undefined;
      if (!schema && "typeDefs" in args && "resolvers" in args) {
        schema = makeExecutableSchema<TContext>({ typeDefs: args.typeDefs, resolvers: args.resolvers });
      }

      if (context.request.hasBody && context.request.body().type === "json") {
        const requestBodyValue: GQLPostBody = await context.request.body().value,
          contextValue: unknown = "contextValue" in args ? await args.contextValue?.(context) : undefined;

        const graphqlResult: ExecutionResult = await graphql(
          schema,
          requestBodyValue.query,
          args.rootValue,
          contextValue,
          requestBodyValue.variables,
          requestBodyValue.operationName,
          args.fieldResolver,
          args.typeResolver
        );

        context.response.status = 200;
        context.response.body = graphqlResult;
      }
    } catch (error) {
      handleOakGQLError(error, context, args.debug);
    }
  };
}
