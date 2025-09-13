import * as vscode from "vscode";
import {
  findSynthesizedResult,
  decodeBase64,
} from "../utils/synthesizedDataReader";

/**
 * Check if AI.execute is inside a Python comment
 */
function isInPythonComment(lineText: string, aiExecuteIndex: number): boolean {
  // Find the first '#' character before the AI.execute
  const commentIndex = lineText.indexOf('#');
  
  // If there's no '#' or it comes after AI.execute, it's not in a comment
  if (commentIndex === -1 || commentIndex > aiExecuteIndex) {
    return false;
  }
  
  // Check if the '#' is inside a string literal
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTripleQuote = false;
  let escapeNext = false;
  
  for (let i = 0; i < commentIndex; i++) {
    const char = lineText[i];
    const prevChar = i > 0 ? lineText[i - 1] : '';
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    // Handle triple quotes
    if (char === '"' && prevChar === '"' && i > 0 && lineText[i - 2] === '"') {
      inTripleQuote = !inTripleQuote;
      continue;
    }
    
    if (char === "'" && prevChar === "'" && i > 0 && lineText[i - 2] === "'") {
      inTripleQuote = !inTripleQuote;
      continue;
    }
    
    if (inTripleQuote) {
      continue;
    }
    
    // Handle single and double quotes
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    }
  }
  
  // If we're inside any kind of string when we reach '#', it's not a comment
  if (inSingleQuote || inDoubleQuote || inTripleQuote) {
    return false;
  }
  
  // The '#' is a real comment marker, so AI.execute is in a comment
  return true;
}

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

    // Check if the hover is over AI.execute and not in a comment
    const aiExecuteIndex = lineText.indexOf("AI.execute");
    if (
      aiExecuteIndex !== -1 &&
      character >= aiExecuteIndex &&
      character <= aiExecuteIndex + "AI.execute".length &&
      !isInPythonComment(lineText, aiExecuteIndex)
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
