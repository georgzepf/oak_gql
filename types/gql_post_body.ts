// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

export interface GQLPostBody {
  query: string;
  operationName?: string;
  variables?: { [key: string]: string; };
}
