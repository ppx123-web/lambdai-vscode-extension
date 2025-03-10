import * as vscode from "vscode";
import {
  findSynthesizedResult,
  decodeBase64,
} from "../utils/synthesizedDataReader";

/**
 * 为 AI.execute 提供悬停信息
 */
export class AIExecuteHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null | undefined> {
    const line = position.line;
    const character = position.character;
    const lineText = document.lineAt(line).text;

    // Check if the hover is over AI.execute
    const aiExecuteIndex = lineText.indexOf("AI.execute");
    if (
      aiExecuteIndex !== -1 &&
      character >= aiExecuteIndex &&
      character <= aiExecuteIndex + "AI.execute".length
    ) {
      // Find synthesized result
      const result = await findSynthesizedResult(
        document.uri.fsPath,
        line + 1
      );

      if (result) {
        // Create hover content
        const content = new vscode.MarkdownString();
        content.isTrusted = true;
        content.supportHtml = true;

        // Decode code, complexity and explanation
        const code = decodeBase64(result.step.code);
        const complexity = decodeBase64(result.step.complexity);
        const explanation = decodeBase64(result.step.explaination);

        // Add code preview
        content.appendMarkdown("### AI Generated Code\n\n");
        content.appendCodeblock(code, "python");

        // Add explanation
        content.appendMarkdown("\n### Explanation\n\n");
        content.appendMarkdown(explanation);

        // Add complexity
        content.appendMarkdown("\n\n**Complexity:** " + complexity);
        
        // Add steps information
        content.appendMarkdown(`\n\n**Steps:** ${result.totalSteps}`);

        return new vscode.Hover(content);
      }
    }

    return null;
  }
}
