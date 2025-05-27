import * as vscode from "vscode";
import { renderMarkdownToHtml } from "../utils/markdownRenderer";
import { getPanelStyles } from "../styles/panelStyles";
import {
  findSynthesizedResult,
  decodeBase64,
  readSynthesizedData,
} from "../utils/synthesizedDataReader";

/**
 * 创建并显示AI执行预览面板
 */
export async function showExecutionPanel(
  line: number,
  context: vscode.ExtensionContext
): Promise<void> {
  // 获取当前文件路径
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const filePath = activeEditor.document.uri.fsPath;

  // 查找合成结果
  const data = await readSynthesizedData(filePath);
  if (!data || !data.results) {
    vscode.window.showErrorMessage("No synthesized data found");
    return;
  }

  // Find the result for this line
  const key = `${filePath}:${line + 1}`;
  let resultKey = key;
  
  // If not found directly, try to find by filename
  if (!data.results[key]) {
    const fileName = filePath.split("/").pop() || "";
    const matchingKey = Object.keys(data.results).find(k => 
      k.endsWith(`/${fileName}:${line + 1}`) || k.endsWith(`:${fileName}:${line + 1}`)
    );
    
    if (matchingKey) {
      resultKey = matchingKey;
    } else {
      vscode.window.showErrorMessage("No AI execution data found for this line");
      return;
    }
  }

  const result = data.results[resultKey];
  if (!result || !result.steps || result.steps.length === 0) {
    vscode.window.showErrorMessage("No steps found in AI execution data");
    return;
  }

  // 创建 Markdown 内容
  let markdownContent = `# AI Execution at Line ${line + 1}\n\n`;
  
  // Add summary information
  const finalStep = result.steps[result.steps.length - 1];
  const finalCode = decodeBase64(finalStep.code);
  const finalComplexity = decodeBase64(finalStep.complexity);
  
  markdownContent += `## Summary\n\n`;
  markdownContent += `- **Total Steps**: ${result.steps.length}\n`;
  markdownContent += `- **Final Complexity**: ${finalComplexity}\n\n`;

  // Create HTML for the panel
  let stepsHtml = '';
  
  // Add timeline visualization and steps details
  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const code = decodeBase64(step.code);
    const explanation = decodeBase64(step.explaination);
    const complexity = decodeBase64(step.complexity);
    
    const isUserEdit = complexity === "(USER EDIT)" || explanation === "(USER EDIT)";
    const stepHeaderClass = isUserEdit ? "step-header user-edit" : "step-header";
    const stepTitle = isUserEdit ? "User Edit" : `Step ${i + 1}`;

    // For trace steps, show the error (with title only if not empty)
    let explanationHtml = '';
    if (step.args_md5 === "trace") {
      if (explanation && explanation.trim() !== "") {
        explanationHtml = `<div class="step-prompt">
           <h3>Error</h3>
           <div>${explanation}</div>
         </div>`;
      } else {
        explanationHtml = '';
      }
    } else {
      explanationHtml = `<div class="step-explanation">
           <h3>Explanation</h3>
           <div>${explanation}</div>
         </div>`;
    }
    
    stepsHtml += `
      <div class="step">
        <div class="${stepHeaderClass}">
          <div class="step-number">${stepTitle}</div>
          <div class="step-complexity">${complexity}</div>
        </div>
        <div class="step-content">
          <div class="step-code">
            <h3>Code</h3>
            <pre><code class="language-python">${escapeHtml(code)}</code></pre>
          </div>
          ${explanationHtml}
        </div>
      </div>
    `;
    
    if (i < result.steps.length - 1) {
      stepsHtml += `<div class="step-connector"></div>`;
    }
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

  panel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
      <title>AI Execution</title>
      <style>
        :root {
          --background-color: ${isDarkTheme ? '#1e1e1e' : '#ffffff'};
          --text-color: ${isDarkTheme ? '#cccccc' : '#333333'};
          --border-color: ${isDarkTheme ? '#3c3c3c' : '#dddddd'};
          --highlight-color: ${isDarkTheme ? '#0e639c' : '#007acc'};
          --code-background: ${isDarkTheme ? '#2d2d2d' : '#f5f5f5'};
          --user-edit-color: ${isDarkTheme ? '#b58900' : '#e6af00'};
          --prompt-background: ${isDarkTheme ? '#2a2d2e' : '#f8f8f8'};
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          background-color: var(--background-color);
          color: var(--text-color);
          padding: 20px;
          line-height: 1.5;
        }
        
        h1, h2, h3 {
          color: var(--text-color);
          margin-top: 0;
        }
        
        pre {
          background-color: var(--code-background);
          padding: 16px;
          border-radius: 6px;
          overflow: auto;
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 14px;
          line-height: 1.45;
        }
        
        code {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        }
        
        .steps-container {
          margin-top: 30px;
        }
        
        .step {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          margin-bottom: 20px;
          background-color: var(--background-color);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .step-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background-color: var(--highlight-color);
          color: white;
          border-top-left-radius: 8px;
          border-top-right-radius: 8px;
        }
        
        .step-header.user-edit {
          background-color: var(--user-edit-color);
          color: ${isDarkTheme ? 'black' : 'black'};
          font-weight: bold;
        }
        
        .step-number {
          font-weight: bold;
          font-size: 16px;
        }
        
        .step-complexity {
          font-size: 14px;
        }
        
        .step-content {
          padding: 16px;
        }
        
        .step-code, .step-explanation, .step-prompt {
          margin-bottom: 20px;
        }

        .step-prompt {
          background-color: var(--prompt-background);
          padding: 12px;
          border-radius: 6px;
          border-left: 4px solid var(--highlight-color);
        }
        
        .step-connector {
          height: 30px;
          width: 2px;
          background-color: var(--highlight-color);
          margin: 0 auto;
          position: relative;
        }
        
        .step-connector:after {
          content: '';
          position: absolute;
          bottom: 0;
          left: -4px;
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 8px solid var(--highlight-color);
        }
        
        .summary {
          background-color: var(--code-background);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 30px;
        }
        
        .summary h2 {
          margin-top: 0;
        }
      </style>
    </head>
    <body>
      <h1>AI Execution at Line ${line + 1}</h1>
      
      <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Steps:</strong> ${result.steps.length}</p>
      </div>
      
      <div class="steps-container">
        ${stepsHtml}
      </div>
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
}

/**
 * 创建WebviewView提供程序
 */
export class AIExecutionViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
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

// Helper function to escape HTML
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
