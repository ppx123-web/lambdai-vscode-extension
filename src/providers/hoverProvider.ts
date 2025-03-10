import * as vscode from "vscode";
import { findSynthesizedResult, decodeBase64 } from "../utils/synthesizedDataReader";

interface CustomHoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover>;
}

async function getHoverContent(
  filePath: string,
  line: number
): Promise<vscode.MarkdownString> {
  const content = new vscode.MarkdownString();
  content.appendMarkdown("**Synthesized Code**\n\n");

  try {
    const result = await findSynthesizedResult(filePath, line);
    
    if (result?.step?.code) {
      const decodedCode = decodeBase64(result.step.code);
      content.appendMarkdown("```\n" + decodedCode + "\n```\n");
    } else {
      content.appendMarkdown("No synthesized code found for this line.");
    }
  } catch (error) {
    content.appendMarkdown("*Error reading synthesized data*\n");
  }

  return content;
}

export const createCustomHoverProvider = (): CustomHoverProvider => {
  const requestContext = new WeakMap<vscode.TextDocument, boolean>();

  return {
    async provideHover(
      document: vscode.TextDocument,
      position: vscode.Position,
      token: vscode.CancellationToken
    ) {
      if (requestContext.get(document)) return undefined;

      try {
        requestContext.set(document, true);
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return undefined;

        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
          "_executeHoverProvider",
          document.uri,
          position
        );

        const hasAIContext = hovers?.some((hover) => {
          const contents = Array.isArray(hover.contents)
            ? hover.contents
            : [hover.contents];
          return contents.some((content) => {
            if (content instanceof vscode.MarkdownString) {
              return content.value.includes("(constant) AI: ContextStack");
            }
            if (typeof content === "object" && content !== null) {
              return JSON.stringify(content).includes(
                "(constant) AI: ContextStack"
              );
            }
            return String(content).includes("(constant) AI: ContextStack");
          });
        });

        if (hasAIContext && hovers?.[0]) {
          const aiContent = await getHoverContent(
            document.uri.fsPath,
            position.line + 1
          );
          return new vscode.Hover([...hovers[0].contents, aiContent]);
        }
        return hovers?.[0];
      } finally {
        requestContext.delete(document);
      }
    },
  };
};
