// deno-lint-ignore-file no-explicit-any
import { DocumentNode, Kind } from "../../deps.ts";

export function isDocumentNode(object: any): object is DocumentNode {
  return object && typeof object === "object" && "kind" in object &&
    object.kind === Kind.DOCUMENT;
}
