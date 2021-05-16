// Copyright 2021 the oak_gql authors. All rights reserved. MIT license.

interface GQLErrorBodyError {
  message: string;
  extensions?: {
    errorType: string;
    stacktrace: string;
  };
}

export interface GQLErrorBody {
  errors: GQLErrorBodyError[];
}
