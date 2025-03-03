import * as vscode from "vscode";
import { findAIExecuteLines } from "../utils/decorationProvider";

/**
 * 为包含AI.execute的行提供CodeLens
 */
export class AIExecuteCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const aiExecuteRanges = findAIExecuteLines(document);

    for (const range of aiExecuteRanges) {
      // 添加查看执行详情的 CodeLens
      const viewLens = new vscode.CodeLens(range, {
        title: "🔍 View AI Execution",
        command: "aiHover.showDialog",
        arguments: [range.start.line],
      });
      codeLenses.push(viewLens);

      // 添加替换为 AI 代码的 CodeLens
      const replaceLens = new vscode.CodeLens(range, {
        title: "⚡ Replace with AI Code",
        command: "aiHover.replaceWithAICode",
        arguments: [document.uri, range],
      });
      codeLenses.push(replaceLens);
    }

    return codeLenses;
  }
}
