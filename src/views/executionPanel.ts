import * as vscode from "vscode";
import { renderMarkdownToHtml } from "../utils/markdownRenderer";
import { getPanelStyles } from "../styles/panelStyles";
import {
  findSynthesizedResult,
  decodeBase64,
} from "../utils/synthesizedDataReader";

/**
 * 创建并显示AI执行预览面板
 */
export async function showExecutionPanel(
  line: number,
  context: vscode.ExtensionContext
): Promise<vscode.WebviewPanel> {
  // 获取当前文件路径
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    throw new Error("No active editor");
  }

  const filePath = activeEditor.document.uri.fsPath;

  // 查找合成结果
  const result = await findSynthesizedResult(filePath, line + 1);

  // 创建 Markdown 内容
  let markdownContent = `# AI Execution at Line ${line + 1}\n\n`;

  if (result) {
    // 解码 Base64 内容
    const code = decodeBase64(result.code);
    const explanation = decodeBase64(result.explaination);
    const complexity = decodeBase64(result.complexity);

    markdownContent += `## Code\n\n\`\`\`python\n${code}\n\`\`\`\n\n`;
    markdownContent += `## Complexity\n\n${complexity}\n\n`;
    markdownContent += `## Explanation\n\n${explanation}\n\n`;
  } else {
    markdownContent += `No synthesized data found for this line in \`synthesized.json\`.\n\n`;
    markdownContent += `## Example Code\n\n\`\`\`python\ndef hello_world():\n    print("Hello, World!")\n    return 42\n\`\`\`\n\n`;
    markdownContent += `## Additional Information\n\n- **Created**: ${new Date().toLocaleDateString()}\n- **Purpose**: Demonstration\n`;
  }

  // 创建并显示 Markdown 预览
  const panel = vscode.window.createWebviewPanel(
    "aiExecutionPreview",
    `AI Execution - Line ${line + 1}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [],
    }
  );

  // 检测当前主题
  const isDarkTheme =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

  // 渲染HTML内容
  const htmlContent = renderMarkdownToHtml(markdownContent);

  panel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
      <title>AI Execution</title>
      <style>
        ${getPanelStyles(isDarkTheme)}
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>`;

  // 监听主题变化并更新 webview
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme((theme) => {
      if (panel.visible) {
        const isDarkTheme =
          theme.kind === vscode.ColorThemeKind.Dark ||
          theme.kind === vscode.ColorThemeKind.HighContrast;
        panel.webview.postMessage({ type: "themeChange", isDarkTheme });
      }
    })
  );

  return panel;
}

/**
 * 创建WebviewView提供程序
 */
export class AIExecutionViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    this.updateContent("Welcome to AI Execution View");
  }

  updateContent(content: string) {
    if (this._view) {
      this._view.webview.html = this.getHtmlForWebview(content);
      this._view.show(true);
    }
  }

  private getHtmlForWebview(content: string): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Execution</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 10px; }
          pre { background-color: #f0f0f0; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div id="content">${this.markdownToHtml(content)}</div>
      </body>
      </html>`;
  }

  private markdownToHtml(markdown: string): string {
    // 简单的 Markdown 转 HTML 处理
    return markdown
      .replace(/\n\n/g, "<br><br>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/```([\s\S]*?)```/g, "<pre>$1</pre>");
  }
}
