import * as vscode from "vscode";
import { findSynthesizedResult, decodeBase64 } from "./synthesizedDataReader";

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
    const nextChar = i < lineText.length - 1 ? lineText[i + 1] : '';
    
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

// Create decoration type
export const aiExecuteDecoration = vscode.window.createTextEditorDecorationType(
  {
    textDecoration: "underline",
  }
);

// Create line end info decoration type
export const aiExecuteInfoDecoration =
  vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 10px",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
    },
  });

/**
 * Update AI.execute underline decorations
 */
export function updateAIExecuteDecorations(
  editor: vscode.TextEditor | undefined
) {
  if (!editor) {
    return;
  }

  const document = editor.document;
  
  // Only apply decorations to Python files
  if (document.languageId !== 'python') {
    return;
  }

  const aiExecuteRanges = findAIExecuteRanges(document);

  // Create decoration options with hover message
  const decorationOptions = aiExecuteRanges.map((range) => ({
    range,
    hoverMessage: new vscode.MarkdownString(
      "Click to view AI execution details"
    ),
  }));

  editor.setDecorations(aiExecuteDecoration, decorationOptions);
}

/**
 * Update AI.execute line end info decorations
 */
export async function updateAIExecuteInfoDecorations(
  editor: vscode.TextEditor | undefined
) {
  if (!editor) {
    return;
  }

  const document = editor.document;
  
  // Only apply decorations to Python files
  if (document.languageId !== 'python') {
    editor.setDecorations(aiExecuteInfoDecoration, []);
    return;
  }

  const aiExecuteLines = findAIExecuteLines(document);

  const decorations: vscode.DecorationOptions[] = [];

  for (const range of aiExecuteLines) {
    const lineNumber = range.start.line;
    const filePath = document.uri.fsPath;

    // Find synthesized result
    const result = await findSynthesizedResult(filePath, lineNumber + 1);

    if (result) {
      // Decode complexity
      const complexity = decodeBase64(result.step.complexity);

      // Get code line count
      const code = decodeBase64(result.step.code);
      const lineCount = code.split("\n").length;

      // Create decoration
      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(
          lineNumber,
          document.lineAt(lineNumber).text.length,
          lineNumber,
          document.lineAt(lineNumber).text.length
        ),
        renderOptions: {
          after: {
            contentText: `Lambdai generated ${lineCount} lines (within ${result.totalSteps} steps). (${complexity})`,
          },
        },
      };

      decorations.push(decoration);
    }
  }

  editor.setDecorations(aiExecuteInfoDecoration, decorations);
}

/**
 * Find all AI.execute text exact positions in document (excluding comments)
 */
export function findAIExecuteRanges(
  document: vscode.TextDocument
): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;
    const aiExecuteIndex = text.indexOf("AI.execute");

    if (aiExecuteIndex !== -1 && !isInPythonComment(text, aiExecuteIndex)) {
      const startPos = new vscode.Position(i, aiExecuteIndex);
      const endPos = new vscode.Position(
        i,
        aiExecuteIndex + "AI.execute".length
      );
      ranges.push(new vscode.Range(startPos, endPos));
    }
  }
  return ranges;
}

/**
 * Find lines containing AI.execute in document (excluding comments)
 */
export function findAIExecuteLines(
  document: vscode.TextDocument
): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;
    const aiExecuteIndex = text.indexOf("AI.execute");
    
    if (aiExecuteIndex !== -1 && !isInPythonComment(text, aiExecuteIndex)) {
      ranges.push(line.range);
    }
  }
  return ranges;
}
