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
  ): Promise<vscode.Hover | null> {
    // 检查当前位置是否在 AI.execute 上
    const lineText = document.lineAt(position.line).text;
    const aiExecuteIndex = lineText.indexOf("AI.execute");

    if (
      aiExecuteIndex === -1 ||
      position.character < aiExecuteIndex ||
      position.character > aiExecuteIndex + "AI.execute".length
    ) {
      return null;
    }

    // 查找合成结果
    const result = await findSynthesizedResult(
      document.uri.fsPath,
      position.line + 1
    );

    if (!result) {
      return new vscode.Hover("No synthesized code found for this line.");
    }

    // 解码内容
    const code = decodeBase64(result.code);
    const complexity = decodeBase64(result.complexity);
    const explanation = decodeBase64(result.explaination);

    // 创建悬停内容
    const content = new vscode.MarkdownString();
    content.isTrusted = true;
    content.supportHtml = true;

    content.appendMarkdown(`### AI Generated Code\n\n`);
    content.appendCodeblock(code, "python");
    content.appendMarkdown(`\n**Time Complexity**: ${complexity}\n\n`);
    content.appendMarkdown(`**Explanation**: ${explanation}\n\n`);
    content.appendMarkdown(
      `[View Details](command:aiHover.showDialog?${position.line})`
    );

    return new vscode.Hover(content);
  }
}
