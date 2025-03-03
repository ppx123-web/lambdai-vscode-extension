import * as vscode from "vscode";
import { findSynthesizedResult, decodeBase64 } from "./synthesizedDataReader";

// 创建装饰类型
export const aiExecuteDecoration = vscode.window.createTextEditorDecorationType(
  {
    textDecoration: "underline",
  }
);

// 创建行尾信息装饰类型
export const aiExecuteInfoDecoration =
  vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 10px",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
    },
  });

/**
 * 更新AI.execute的下划线装饰
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
 * 更新AI.execute行尾的信息装饰
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

    // 查找合成结果
    const result = await findSynthesizedResult(filePath, lineNumber + 1);

    if (result) {
      // 解码复杂度
      const complexity = decodeBase64(result.complexity);

      // 获取代码行数
      const code = decodeBase64(result.code);
      const lineCount = code.split("\n").length;

      // 创建装饰
      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(
          lineNumber,
          document.lineAt(lineNumber).text.length,
          lineNumber,
          document.lineAt(lineNumber).text.length
        ),
        renderOptions: {
          after: {
            contentText: `Lambdai generated ${lineCount} lines. (${complexity})`,
          },
        },
      };

      decorations.push(decoration);
    }
  }

  editor.setDecorations(aiExecuteInfoDecoration, decorations);
}

/**
 * 查找文档中所有 AI.execute 文本的精确位置
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
 * 在文档中查找包含 AI.execute 的行
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
