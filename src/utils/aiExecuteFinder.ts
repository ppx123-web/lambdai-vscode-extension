import * as vscode from "vscode";

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
