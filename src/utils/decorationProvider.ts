import * as vscode from "vscode";
import {
  findSynthesizedResult,
  decodeBase64,
  readSynthesizedData,
} from "./synthesizedDataReader";

/**
 * Check if AI.execute is inside a Python comment
 */
function isInPythonComment(lineText: string, aiExecuteIndex: number): boolean {
  // Find the first '#' character before the AI.execute
  const commentIndex = lineText.indexOf("#");

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
    const prevChar = i > 0 ? lineText[i - 1] : "";
    const nextChar = i < lineText.length - 1 ? lineText[i + 1] : "";

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
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
  if (document.languageId !== "python") {
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
 * Determine the status of an AI.execute line
 */
async function getAIExecuteStatus(
  filePath: string,
  lineNumber: number
): Promise<{
  status: "none" | "success" | "error";
  statusEmoji: string;
  statusColor: string;
}> {
  const result = await findSynthesizedResult(filePath, lineNumber + 1);

  if (!result) {
    return {
      status: "none",
      statusEmoji: "⚪",
      statusColor: "#888888", // Gray
    };
  }

  // Check if there are any trace steps with errors
  const data = await readSynthesizedData(filePath);
  if (data && data.results) {
    const key = `${filePath}:${lineNumber + 1}`;
    let resultKey = key;

    // Try to find by filename if direct key doesn't exist
    if (!data.results[key]) {
      const fileName = filePath.split("/").pop() || "";
      const matchingKey = Object.keys(data.results).find(
        (k) =>
          k.endsWith(`/${fileName}:${lineNumber + 1}`) ||
          k.endsWith(`:${fileName}:${lineNumber + 1}`)
      );

      if (matchingKey) {
        resultKey = matchingKey;
      }
    }

    const fullResult = data.results[resultKey];
    if (fullResult && fullResult.steps) {
      // Check if any trace steps have errors
      for (const step of fullResult.steps) {
        const isTrace = step.args_md5 === "trace";
        if (isTrace) {
          const explanation = decodeBase64(step.explaination);
          const hasError = explanation && explanation.trim() !== "";
          if (hasError) {
            return {
              status: "error",
              statusEmoji: "❌",
              statusColor: "#f14c4c", // Red
            };
          }
        }
      }
    }
  }

  // If we have a result but no errors, it's successful
  return {
    status: "success",
    statusEmoji: "✅",
    statusColor: "#73c991", // Green
  };
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

    // Get status information
    const statusInfo = await getAIExecuteStatus(filePath, lineNumber);

    // Find synthesized result for additional info
    const result = await findSynthesizedResult(filePath, lineNumber + 1);

    let contentText = `${statusInfo.statusEmoji} `;

    if (result) {
      // Decode complexity
      const complexity = decodeBase64(result.step.complexity);

      // Get code line count
      const code = decodeBase64(result.step.code);
      const lineCount = code.split("\n").length;

      contentText += `Lambdai generated ${lineCount} lines (within ${result.totalSteps} steps). (${complexity})`;
    } else {
      contentText += `No AI code generated yet`;
    }

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
          contentText,
          color: statusInfo.statusColor,
        },
      },
    };

    decorations.push(decoration);
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
