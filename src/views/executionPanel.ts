import * as vscode from "vscode";
import { renderMarkdownToHtml } from "../utils/markdownRenderer";
import { getPanelStyles } from "../styles/panelStyles";
import {
  findSynthesizedResult,
  decodeBase64,
  readSynthesizedData,
} from "../utils/synthesizedDataReader";
// Load Prism.js for syntax highlighting
const Prism: {
  highlight: (text: string, grammar: any, language: string) => string;
  languages: { [key: string]: any };
} = require('prismjs');
require('prismjs/components/prism-python');

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
  
  // Reverse order: show final result first, then previous attempts
  for (let i = result.steps.length - 1; i >= 0; i--) {
    const step = result.steps[i];
    const code = decodeBase64(step.code);
    const explanation = decodeBase64(step.explaination);
    const complexity = decodeBase64(step.complexity);
    
    const isUserEdit = complexity === "(USER EDIT)" || explanation === "(USER EDIT)";
    const isTrace = step.args_md5 === "trace";
    const hasError = isTrace && explanation && explanation.trim() !== "";
    
    // Determine step status and styling
    let stepHeaderClass, stepTitle, statusIndicator;
    if (i === result.steps.length - 1) {
      // Final step
      stepHeaderClass = "step-header final-step";
      stepTitle = "Final Result";
      statusIndicator = '<span class="status-indicator success">✓ FINAL</span>';
    } else if (isUserEdit) {
      stepHeaderClass = "step-header user-edit";
      stepTitle = "User Edit";
      statusIndicator = '<span class="status-indicator user">✎ USER</span>';
    } else {
      // Previous attempts
      const attemptNumber = i + 1;
      stepHeaderClass = hasError ? "step-header error-step" : "step-header success-step";
      stepTitle = `Attempt ${attemptNumber}`;
      statusIndicator = hasError 
        ? '<span class="status-indicator error">✗ ERROR</span>'
        : '<span class="status-indicator success">✓ PASS</span>';
    }

    // Create explanation/error content
    let explanationHtml = '';
    if (isTrace && hasError) {
      explanationHtml = `<div class="step-error">
         <h3>Error Details</h3>
         <div class="error-message">${escapeHtml(explanation)}</div>
       </div>`;
    } else if (!isTrace) {
      explanationHtml = `<div class="step-explanation">
         <h3>Explanation</h3>
         <div>${explanation}</div>
       </div>`;
    }
    
    stepsHtml += `
      <div class="step">
        <div class="${stepHeaderClass}">
          <div class="step-info">
            <div class="step-number">${stepTitle}</div>
            ${statusIndicator}
          </div>
          <div class="step-complexity">${complexity}</div>
        </div>
        <div class="step-content">
          <div class="step-code">
            <h3>Code</h3>
            <pre><code class="language-python">${highlightPythonCode(code)}</code></pre>
          </div>
          ${explanationHtml}
        </div>
      </div>
    `;
    
    if (i > 0) {
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
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
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
          --success-color: ${isDarkTheme ? '#28a745' : '#198754'};
          --error-color: ${isDarkTheme ? '#dc3545' : '#dc3545'};
          --final-color: ${isDarkTheme ? '#6f42c1' : '#6610f2'};
          --error-background: ${isDarkTheme ? '#2d1b1b' : '#f8d7da'};
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
        
        /* Prism.js syntax highlighting styles */
        .token.keyword {
          color: ${isDarkTheme ? '#569cd6' : '#0000ff'};
          font-weight: bold;
        }
        
        .token.string {
          color: ${isDarkTheme ? '#ce9178' : '#a31515'};
        }
        
        .token.comment {
          color: ${isDarkTheme ? '#6a9955' : '#008000'};
          font-style: italic;
        }
        
        .token.number {
          color: ${isDarkTheme ? '#b5cea8' : '#098658'};
        }
        
        .token.function {
          color: ${isDarkTheme ? '#dcdcaa' : '#795e26'};
        }
        
        .token.operator {
          color: ${isDarkTheme ? '#d4d4d4' : '#000000'};
        }
        
        .token.punctuation {
          color: ${isDarkTheme ? '#d4d4d4' : '#000000'};
        }
        
        .token.builtin {
          color: ${isDarkTheme ? '#4ec9b0' : '#008080'};
        }
        
        .token.boolean {
          color: ${isDarkTheme ? '#569cd6' : '#0000ff'};
        }
        
        .token.class-name {
          color: ${isDarkTheme ? '#4ec9b0' : '#2b91af'};
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
        
        .step-header.final-step {
          background-color: var(--final-color);
          color: white;
          font-weight: bold;
        }
        
        .step-header.success-step {
          background-color: var(--success-color);
          color: white;
        }
        
        .step-header.error-step {
          background-color: var(--error-color);
          color: white;
        }
        
        .step-header.user-edit {
          background-color: var(--user-edit-color);
          color: ${isDarkTheme ? 'black' : 'black'};
          font-weight: bold;
        }
        
        .step-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .status-indicator {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        
        .status-indicator.success {
          background-color: rgba(255, 255, 255, 0.2);
          color: #90ee90;
        }
        
        .status-indicator.error {
          background-color: rgba(255, 255, 255, 0.2);
          color: #ffb6c1;
        }
        
        .status-indicator.user {
          background-color: rgba(0, 0, 0, 0.2);
          color: #333;
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
        
        .step-code, .step-explanation, .step-prompt, .step-error {
          margin-bottom: 20px;
        }

        .step-prompt {
          background-color: var(--prompt-background);
          padding: 12px;
          border-radius: 6px;
          border-left: 4px solid var(--highlight-color);
        }
        
        .step-error {
          background-color: var(--error-background);
          padding: 12px;
          border-radius: 6px;
          border-left: 4px solid var(--error-color);
        }
        
        .error-message {
          font-family: monospace;
          color: var(--error-color);
          font-weight: bold;
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
      
      <script>
        // Handle theme changes
        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'themeChange') {
            // Theme changed, but syntax highlighting is already done server-side
            console.log('Theme changed to:', message.isDarkTheme ? 'dark' : 'light');
          }
        });
      </script>
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

// Server-side Python syntax highlighting using Prism.js
function highlightPythonCode(code: string): string {
  try {
    // Use Prism.js to highlight Python code
    const highlighted = Prism.highlight(code, Prism.languages.python, 'python');
    return highlighted;
  } catch (error) {
    console.error('Error highlighting code with Prism:', error);
    // Fallback to escaped HTML if Prism fails
    return escapeHtml(code);
  }
}
