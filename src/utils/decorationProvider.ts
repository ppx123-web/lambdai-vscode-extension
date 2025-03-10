import * as vscode from "vscode";
import { findSynthesizedResult, decodeBase64 } from "./synthesizedDataReader";

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
 * Find all AI.execute text exact positions in document
 */
export function findAIExecuteRanges(
  document: vscode.TextDocument
): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text;
    const aiExecuteIndex = text.indexOf("AI.execute");

    if (aiExecuteIndex !== -1) {
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
 * Find lines containing AI.execute in document
 */
export function findAIExecuteLines(
  document: vscode.TextDocument
): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i);
    if (line.text.includes("AI.execute")) {
      ranges.push(line.range);
    }
  }
  return ranges;
}
