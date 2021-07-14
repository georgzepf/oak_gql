// deno-lint-ignore-file no-explicit-any
import {
  defaultFieldResolver,
  GraphQLFieldResolver,
  GraphQLSchema,
} from "../../deps.ts";

import { MapperKind, mapSchema } from "../utils/mod.ts";

// import { ValueOrPromise } from 'value-or-promise';
// https://github.com/yaacovCR/value-or-promise/blob/main/src/ValueOrPromise.ts
function isPromiseLike<T>(object: unknown): object is PromiseLike<T> {
  return (
    object != null && typeof (object as PromiseLike<T>).then === "function"
  );
}

interface FulfilledState<T> {
  status: "fulfilled";
  value: T | undefined | null;
}

interface RejectedState {
  status: "rejected";
  value: unknown;
}

interface PendingState<T> {
  status: "pending";
  value: PromiseLike<T>;
}

type State<T> = FulfilledState<T> | RejectedState | PendingState<T>;

const defaultOnRejectedFn = (reason: unknown) => {
  throw reason;
};

export class ValueOrPromise<T> {
  private readonly state: State<T>;

  constructor(executor: () => T | PromiseLike<T> | undefined | null) {
    let value: T | PromiseLike<T> | undefined | null;

    try {
      value = executor();
    } catch (reason) {
      this.state = { status: "rejected", value: reason };
      return;
    }

    if (isPromiseLike(value)) {
      this.state = { status: "pending", value };
      return;
    }

    this.state = { status: "fulfilled", value };
  }

  public then<TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onRejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): ValueOrPromise<TResult1 | TResult2> {
    const state = this.state;

    if (state.status === "pending") {
      return new ValueOrPromise(() =>
        state.value.then(onFulfilled, onRejected)
      );
    }

    const onRejectedFn = typeof onRejected === "function"
      ? onRejected
      : defaultOnRejectedFn;

    if (state.status === "rejected") {
      return new ValueOrPromise(() => onRejectedFn(state.value));
    }

    try {
      const onFulfilledFn = typeof onFulfilled === "function"
        ? onFulfilled
        : undefined;

      return onFulfilledFn === undefined
        ? new ValueOrPromise(() => (state.value as unknown) as TResult1)
        : new ValueOrPromise(() => onFulfilledFn(state.value as T));
    } catch (e) {
      return new ValueOrPromise(() => onRejectedFn(e));
    }
  }

  public catch<TResult = never>(
    onRejected:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | undefined
      | null,
  ): ValueOrPromise<TResult> {
    return this.then(undefined, onRejected);
  }

  public resolve(): T | Promise<T> | undefined | null {
    const state = this.state;

    if (state.status === "pending") {
      return Promise.resolve(state.value);
    }

    if (state.status === "rejected") {
      throw state.value;
    }

    return state.value;
  }

  public static all<T>(
    valueOrPromises: ReadonlyArray<ValueOrPromise<T>>,
  ): ValueOrPromise<Array<T | null | undefined>> {
    const values: Array<T | null | undefined> = [];

    for (let i = 0; i < valueOrPromises.length; i++) {
      const valueOrPromise = valueOrPromises[i];

      const state = valueOrPromise.state;

      if (state.status === "rejected") {
        return new ValueOrPromise(() => {
          throw state.value;
        });
      }

      if (state.status === "pending") {
        return new ValueOrPromise(() =>
          Promise.all(valueOrPromises.slice(i)).then((resolvedPromises) =>
            values.concat(resolvedPromises)
          )
        );
      }

      values.push(state.value);
    }

    return new ValueOrPromise(() => values);
  }
}

// wraps all resolvers of query, mutation or subscription fields
// with the provided function to simulate a root schema level resolver
export function addSchemaLevelResolver(
  schema: typeof GraphQLSchema,
  fn: GraphQLFieldResolver<any, any>,
): typeof GraphQLSchema {
  const fnToRunOnlyOnce = runAtMostOncePerRequest(fn);
  return mapSchema(schema, {
    [MapperKind.ROOT_FIELD]: (fieldConfig, _fieldName, typeName, schema) => {
      // XXX this should run at most once per request to simulate a true root resolver
      // for graphql-js this is an approximation that works with queries but not mutations
      // XXX if the type is a subscription, a same query AST will be ran multiple times so we
      // deactivate here the runOnce if it's a subscription. This may not be optimal though...
      const subscription = (schema as any).getSubscriptionType();
      if (subscription != null && subscription.name === typeName) {
        return {
          ...fieldConfig,
          resolve: wrapResolver(fieldConfig.resolve, fn),
        };
      }

      return {
        ...fieldConfig,
        resolve: wrapResolver(fieldConfig.resolve, fnToRunOnlyOnce),
      };
    },
  });
}

// XXX badly named function. this doesn't really wrap, it just chains resolvers...
function wrapResolver(
  innerResolver: GraphQLFieldResolver<any, any> | undefined,
  outerResolver: GraphQLFieldResolver<any, any>,
): GraphQLFieldResolver<any, any> {
  return (obj: any, args: any, ctx: any, info: any) => {
    return new ValueOrPromise(() => outerResolver(obj, args, ctx, info))
      .then((root) => {
        if (innerResolver != null) {
          return innerResolver(root, args, ctx, info);
        }
        return defaultFieldResolver(root, args, ctx, info);
      })
      .resolve();
  };
}

// XXX this function only works for resolvers
// XXX very hacky way to remember if the function
// already ran for this request. This will only work
// if people don't actually cache the operation.
// if they do cache the operation, they will have to
// manually remove the __runAtMostOnce before every request.
function runAtMostOncePerRequest(
  fn: GraphQLFieldResolver<any, any>,
): GraphQLFieldResolver<any, any> {
  let value: any;
  const randomNumber = Math.random();
  return (root: any, args: any, ctx: any, info: any) => {
    if (!info.operation["__runAtMostOnce"]) {
      info.operation["__runAtMostOnce"] = {};
    }
    if (!info.operation["__runAtMostOnce"][randomNumber]) {
      info.operation["__runAtMostOnce"][randomNumber] = true;
      value = fn(root, args, ctx, info);
    }
    return value;
  };
}
