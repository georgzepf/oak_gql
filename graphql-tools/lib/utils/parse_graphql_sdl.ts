// deno-lint-ignore-file no-explicit-any
import {
  ASTNode,
  DocumentNode,
  isTypeSystemDefinitionNode,
  Kind,
  parse,
  print,
  Source as GraphQLSource,
  StringValueNode,
  TokenKind,
  visit,
} from "../../deps.ts";
import { GraphQLParseOptions } from "./interfaces.ts";

// import { dedentBlockStringValue } from 'graphql/language/blockString';
// https://github.com/graphql/graphql-js/blob/main/src/language/blockString.js
export function dedentBlockStringValue(rawString: string): string {
  // Expand a block string's raw value into independent lines.
  const lines = rawString.split(/\r\n|[\n\r]/g);

  // Remove common indentation from all lines but first.
  const commonIndent = getBlockStringIndentation(rawString);

  if (commonIndent !== 0) {
    for (let i = 1; i < lines.length; i++) {
      lines[i] = lines[i].slice(commonIndent);
    }
  }

  // Remove leading and trailing blank lines.
  let startLine = 0;
  while (startLine < lines.length && isBlank(lines[startLine])) {
    ++startLine;
  }

  let endLine = lines.length;
  while (endLine > startLine && isBlank(lines[endLine - 1])) {
    --endLine;
  }

  // Return a string of the lines joined with U+000A.
  return lines.slice(startLine, endLine).join("\n");
}

function isBlank(str: string): boolean {
  for (let i = 0; i < str.length; ++i) {
    if (str[i] !== " " && str[i] !== "\t") {
      return false;
    }
  }

  return true;
}

export function getBlockStringIndentation(value: string): number {
  let isFirstLine = true;
  let isEmptyLine = true;
  let indent = 0;
  let commonIndent = null;

  for (let i = 0; i < value.length; ++i) {
    switch (value.charCodeAt(i)) {
      case 13: //  \r
        if (value.charCodeAt(i + 1) === 10) {
          ++i; // skip \r\n as one symbol
        }
      // falls through
      case 10: //  \n
        isFirstLine = false;
        isEmptyLine = true;
        indent = 0;
        break;
      case 9: //   \t
      case 32: //  <space>
        ++indent;
        break;
      default:
        if (
          isEmptyLine &&
          !isFirstLine &&
          (commonIndent === null || indent < commonIndent)
        ) {
          commonIndent = indent;
        }
        isEmptyLine = false;
    }
  }

  return commonIndent ?? 0;
}

export function parseGraphQLSDL(
  location: string,
  rawSDL: string,
  options: GraphQLParseOptions = {},
) {
  let document: DocumentNode;
  const sdl: string = rawSDL;
  let sdlModified = false;

  try {
    if (options.commentDescriptions && sdl.includes("#")) {
      sdlModified = true;
      document = (transformCommentsToDescriptions(rawSDL, options) as any);

      // If noLocation=true, we need to make sure to print and parse it again, to remove locations,
      // since `transformCommentsToDescriptions` must have locations set in order to transform the comments
      // into descriptions.
      if (options.noLocation) {
        document = parse(print(document), options);
      }
    } else {
      document = parse(new (GraphQLSource as any)(sdl, location), options);
    }
  } catch (e) {
    if (
      e.message.includes("EOF") && sdl.replace(/(\#[^*]*)/g, "").trim() === ""
    ) {
      document = {
        kind: Kind.DOCUMENT,
        definitions: [],
      };
    } else {
      throw e;
    }
  }

  return {
    location,
    document,
    rawSDL: sdlModified ? print(document) : sdl,
  };
}

export function getLeadingCommentBlock(node: ASTNode): void | string {
  const loc = node.loc;

  if (!loc) {
    return;
  }

  const comments = [];
  let token = loc.startToken.prev;

  while (
    token != null &&
    token.kind === TokenKind.COMMENT &&
    token.next &&
    token.prev &&
    token.line + 1 === token.next.line &&
    token.line !== token.prev.line
  ) {
    const value = String(token.value);
    comments.push(value);
    token = token.prev;
  }

  return comments.length > 0 ? comments.reverse().join("\n") : undefined;
}

export function transformCommentsToDescriptions(
  sourceSdl: string,
  options: GraphQLParseOptions = {},
): DocumentNode | null {
  const parsedDoc = parse(sourceSdl, {
    ...options,
    noLocation: false,
  });
  const modifiedDoc = visit(parsedDoc, {
    leave: (node: ASTNode) => {
      if (isDescribable(node)) {
        const rawValue = getLeadingCommentBlock(node);

        if (rawValue !== undefined) {
          const commentsBlock = dedentBlockStringValue("\n" + rawValue);
          const isBlock = commentsBlock.includes("\n");

          if (!node.description) {
            return {
              ...node,
              description: {
                kind: Kind.STRING,
                value: commentsBlock,
                block: isBlock,
              },
            };
          } else {
            return {
              ...node,
              description: {
                ...node.description,
                value: node.description.value + "\n" + commentsBlock,
                block: true,
              },
            };
          }
        }
      }
    },
  });

  return modifiedDoc;
}

type DiscriminateUnion<T, U> = T extends U ? T : never;
type DescribableASTNodes = DiscriminateUnion<
  ASTNode,
  {
    description?: StringValueNode;
  }
>;

export function isDescribable(node: ASTNode): node is DescribableASTNodes {
  return (
    isTypeSystemDefinitionNode(node) ||
    node.kind === Kind.FIELD_DEFINITION ||
    node.kind === Kind.INPUT_VALUE_DEFINITION ||
    node.kind === Kind.ENUM_VALUE_DEFINITION
  );
}
