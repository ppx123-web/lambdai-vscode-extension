import * as vscode from "vscode";
import { renderMarkdownToHtml } from "../utils/markdownRenderer";
import { getPanelStyles } from "../styles/panelStyles";
import {
  findSynthesizedResult,
  decodeBase64,
  readSynthesizedData,
} from "../utils/synthesizedDataReader";
import * as fs from "fs";
import * as path from "path";
import { PanelManager } from "../utils/panelManager";
// Load Prism.js for syntax highlighting
const Prism: {
  highlight: (text: string, grammar: any, language: string) => string;
  languages: { [key: string]: any };
} = require("prismjs");
require("prismjs/components/prism-python");

/**
 * Generate empty state HTML content for the execution panel
 */
function generateEmptyPanelContent(filePath: string, line: number): string {
  const fileName = filePath.split("/").pop() || "Unknown file";

  // 检测当前主题
  const isDarkTheme =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
      <title>AI Execution - Waiting</title>
      <style>
        :root {
          --background-color: ${isDarkTheme ? "#1e1e1e" : "#ffffff"};
          --text-color: ${isDarkTheme ? "#cccccc" : "#333333"};
          --border-color: ${isDarkTheme ? "#3c3c3c" : "#dddddd"};
          --highlight-color: ${isDarkTheme ? "#0e639c" : "#007acc"};
          --muted-color: ${isDarkTheme ? "#6c6c6c" : "#999999"};
          --waiting-background: ${isDarkTheme ? "#2a2d2e" : "#f8f9fa"};
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          background-color: var(--background-color);
          color: var(--text-color);
          padding: 40px 20px;
          line-height: 1.6;
          margin: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 80vh;
          text-align: center;
        }
        
        .waiting-container {
          background-color: var(--waiting-background);
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
        }
        
        .waiting-icon {
          font-size: 48px;
          margin-bottom: 20px;
          opacity: 0.7;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        
        .waiting-title {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text-color);
        }
        
        .waiting-message {
          font-size: 16px;
          color: var(--muted-color);
          margin-bottom: 24px;
        }
        
        .file-info {
          background-color: var(--background-color);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 16px;
          font-family: monospace;
          font-size: 14px;
          word-break: break-all;
        }
        
        .file-info-label {
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .refresh-note {
          margin-top: 20px;
          font-size: 14px;
          color: var(--muted-color);
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="waiting-container">
        <div class="waiting-icon">⏳</div>
        <div class="waiting-title">Waiting for AI Generation</div>
        <div class="waiting-message">
          AI hasn't generated code for this line yet. This panel will automatically refresh once the AI creates the execution data.
        </div>
        <div class="file-info">
          <div class="file-info-label">File:</div>
          <div>${fileName}</div>
          <div class="file-info-label" style="margin-top: 8px;">Line:</div>
          <div>${line + 1}</div>
        </div>
        <div class="refresh-note">
          This panel will update automatically when AI generates code.
        </div>
      </div>
    </body>
    </html>`;
}

/**
 * Generate HTML content for the execution panel
 */
/**
 * Read messages file for a specific line
 */
async function readMessagesFile(filePath: string, line: number): Promise<any[] | null> {
  try {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath, path.extname(filePath));

    // Find .lambdai directory
    const lambdaiDir = path.join(dir, '.lambdai');
    if (!fs.existsSync(lambdaiDir)) {
      return null;
    }

    // Look for messages file with matching name pattern
    const messagesFileName = `${fileName}_messages_${line + 1}.json`;
    const messagesFilePath = path.join(lambdaiDir, messagesFileName);

    if (!fs.existsSync(messagesFilePath)) {
      return null;
    }

    const content = fs.readFileSync(messagesFilePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading messages file:', error);
    return null;
  }
}

async function generatePanelContent(
  filePath: string,
  line: number
): Promise<string | null> {
  // 查找合成结果
  const data = await readSynthesizedData(filePath);
  if (!data || !data.results) {
    return null;
  }

  // Find the result for this line
  const key = `${filePath}:${line + 1}`;
  let resultKey = key;

  // If not found directly, try to find by filename
  if (!data.results[key]) {
    const fileName = filePath.split("/").pop() || "";
    const matchingKey = Object.keys(data.results).find(
      (k) =>
        k.endsWith(`/${fileName}:${line + 1}`) ||
        k.endsWith(`:${fileName}:${line + 1}`)
    );

    if (matchingKey) {
      resultKey = matchingKey;
    } else {
      return null;
    }
  }

  const result = data.results[resultKey];
  if (!result || !result.steps || result.steps.length === 0) {
    return null;
  }

  // Check if last code block has error and matches current file content
  let shouldShowErrorAsLastPage = false;
  let lastStepError = "";

  if (result.steps.length > 0) {
    const lastStep = result.steps[0]; // First step is the most recent (loop goes backwards)
    const lastStepCode = decodeBase64(lastStep.code);
    const lastStepExplanation = decodeBase64(lastStep.explaination);
    const isLastStepTrace = lastStep.args_md5 === "trace";
    const hasLastStepError = isLastStepTrace && lastStepExplanation && lastStepExplanation.trim() !== "";

    if (hasLastStepError) {
      try {
        // Read current file content
        const currentFileContent = fs.readFileSync(filePath, 'utf8');
        const currentFileLines = currentFileContent.split('\n');
        const lineStart = line;
        const lineEnd = line + lastStepCode.split('\n').length;
        const currentCodeBlock = currentFileLines.slice(lineStart, lineEnd).join('\n').trim();

        // Compare normalized code (remove leading/trailing whitespace and normalize line endings)
        const normalizedLastStepCode = lastStepCode.trim().replace(/\r\n/g, '\n');
        const normalizedCurrentCode = currentCodeBlock.trim().replace(/\r\n/g, '\n');

        if (normalizedLastStepCode === normalizedCurrentCode) {
          shouldShowErrorAsLastPage = true;
          lastStepError = lastStepExplanation;
        }
      } catch (error) {
        // If we can't read the file, don't show error as last page
        console.error('Error reading file for comparison:', error);
      }
    }
  }

  // Read messages data
  const messagesData = await readMessagesFile(filePath, line);

  // Generate steps data for navigation
  const stepsData = [];
  for (let i = result.steps.length - 1; i >= 0; i--) {
    const step = result.steps[i];
    const code = decodeBase64(step.code);
    const explanation = decodeBase64(step.explaination);
    const complexity = decodeBase64(step.complexity);

    const isUserEdit =
      complexity === "(USER EDIT)" || explanation === "(USER EDIT)";
    const isTrace = step.args_md5 === "trace";
    const hasError = isTrace && explanation && explanation.trim() !== "";

    // Determine step status and styling
    let stepHeaderClass, stepTitle, statusIndicator;
    const isFinalStep = i === result.steps.length - 1;

    if (isFinalStep && shouldShowErrorAsLastPage) {
      // Show error as final step when code matches and has error
      stepHeaderClass = "step-header error-step";
      stepTitle = "Final Result (Error)";
      statusIndicator = '<span class="status-indicator error">✗ ERROR</span>';
    } else if (isFinalStep) {
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
      stepHeaderClass = hasError
        ? "step-header error-step"
        : "step-header success-step";
      stepTitle = `Attempt ${attemptNumber}`;
      statusIndicator = hasError
        ? '<span class="status-indicator error">✗ ERROR</span>'
        : '<span class="status-indicator success">✓ PASS</span>';
    }

    // Create explanation/error content
    let explanationHtml = "";
    if (isFinalStep && shouldShowErrorAsLastPage) {
      // Show the stored error message for the final step
      explanationHtml = `<div class="step-error">
         <h3>Error Details</h3>
         <div class="error-message">${escapeHtml(lastStepError)}</div>
       </div>`;
    } else if (isTrace && hasError) {
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

    stepsData.push({
      html: `
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
            <pre><code class="language-python">${highlightPythonCode(
              code
            )}</code></pre>
          </div>
          ${explanationHtml}
        </div>
      </div>
    `,
      title: stepTitle,
      isFinal: i === result.steps.length - 1
    });
  }

  // Create navigation controls and initial step display
  const navigationHtml = result.steps.length > 1 ? `
    <div class="navigation-controls">
      <button id="prevBtn" class="nav-btn" onclick="navigateStep(-1)">
        ← Previous
      </button>
      <span class="step-indicator">
        <span id="currentStep">1</span> / ${result.steps.length}
      </span>
      <button id="nextBtn" class="nav-btn" onclick="navigateStep(1)">
        Next →
      </button>
      ${messagesData ? `
        <button id="messagesBtn" class="nav-btn" onclick="toggleMessages()">
          Messages
        </button>
      ` : ''}
    </div>
  ` : messagesData ? `
    <div class="navigation-controls">
      <button id="messagesBtn" class="nav-btn" onclick="toggleMessages()">
        Messages
      </button>
    </div>
  ` : '';

  let stepsHtml = `<div id="steps-container">${stepsData[0]?.html || ''}</div>`;

  // Generate messages HTML content
  let messagesHtml = "";
  if (messagesData) {
    messagesHtml = `
      <div class="messages-container" id="messages-container" style="display: none;">
        <h2>Messages</h2>
        <div class="messages-content">
    `;

    for (const message of messagesData) {
      const role = message.role || 'unknown';
      const content = escapeHtml(message.content || '');
      messagesHtml += `
        <div class="message-item">
          <div class="message-role ${role}">
            ${role.toUpperCase()}
          </div>
          <div class="message-content">${content}</div>
        </div>
      `;
    }

    messagesHtml += `
        </div>
      </div>
    `;
  }

  // Store steps data for JavaScript navigation
  const stepsDataJson = JSON.stringify(stepsData);

  // 检测当前主题
  const isDarkTheme =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
      <title>AI Execution</title>
      <style>
        :root {
          --background-color: ${isDarkTheme ? "#1e1e1e" : "#ffffff"};
          --text-color: ${isDarkTheme ? "#cccccc" : "#333333"};
          --border-color: ${isDarkTheme ? "#3c3c3c" : "#dddddd"};
          --highlight-color: ${isDarkTheme ? "#0e639c" : "#007acc"};
          --code-background: ${isDarkTheme ? "#2d2d2d" : "#f5f5f5"};
          --user-edit-color: ${isDarkTheme ? "#b58900" : "#e6af00"};
          --prompt-background: ${isDarkTheme ? "#2a2d2e" : "#f8f8f8"};
          --success-color: ${isDarkTheme ? "#28a745" : "#198754"};
          --error-color: ${isDarkTheme ? "#dc3545" : "#dc3545"};
          --final-color: ${isDarkTheme ? "#6f42c1" : "#6610f2"};
          --error-background: ${isDarkTheme ? "#2d1b1b" : "#f8d7da"};
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          background-color: var(--background-color);
          color: var(--text-color);
          padding: 20px;
          line-height: 1.5;
        }

        /* Header container with navigation */
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 15px;
          border-bottom: 2px solid var(--border-color);
        }

        .header-container h1 {
          margin: 0;
          font-size: 24px;
          color: var(--text-color);
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
          color: ${isDarkTheme ? "#569cd6" : "#0000ff"};
          font-weight: bold;
        }
        
        .token.string {
          color: ${isDarkTheme ? "#ce9178" : "#a31515"};
        }
        
        .token.comment {
          color: ${isDarkTheme ? "#6a9955" : "#008000"};
          font-style: italic;
        }
        
        .token.number {
          color: ${isDarkTheme ? "#b5cea8" : "#098658"};
        }
        
        .token.function {
          color: ${isDarkTheme ? "#dcdcaa" : "#795e26"};
        }
        
        .token.operator {
          color: ${isDarkTheme ? "#d4d4d4" : "#000000"};
        }
        
        .token.punctuation {
          color: ${isDarkTheme ? "#d4d4d4" : "#000000"};
        }
        
        .token.builtin {
          color: ${isDarkTheme ? "#4ec9b0" : "#008080"};
        }
        
        .token.boolean {
          color: ${isDarkTheme ? "#569cd6" : "#0000ff"};
        }
        
        .token.class-name {
          color: ${isDarkTheme ? "#4ec9b0" : "#2b91af"};
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
          color: ${isDarkTheme ? "black" : "black"};
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
          white-space: pre-wrap;
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

        /* Navigation controls styling */
        .navigation-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 6px 12px;
          background-color: var(--code-background);
          border-radius: 6px;
          border: 1px solid var(--border-color);
        }

        .nav-btn {
          background-color: var(--highlight-color);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s ease;
          min-width: 80px;
        }

        .nav-btn:hover:not(:disabled) {
          background-color: var(--highlight-color);
          opacity: 0.8;
          transform: translateY(-1px);
        }

        .nav-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .nav-btn:disabled {
          background-color: var(--muted-color);
          opacity: 0.5;
          cursor: not-allowed;
        }

        .step-indicator {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-color);
          min-width: 50px;
          text-align: center;
        }

        /* Messages styles */
        .messages-container {
          background-color: var(--background-color);
          padding: 20px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          margin: 20px 0;
        }

        .messages-container h2 {
          color: var(--text-color);
          margin-bottom: 20px;
          border-bottom: 2px solid var(--border-color);
          padding-bottom: 10px;
        }

        .message-item {
          margin-bottom: 20px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          overflow: hidden;
        }

        .message-role {
          padding: 10px 15px;
          font-weight: 600;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .message-role.system {
          background-color: ${isDarkTheme ? "#1e3a8a" : "#dbeafe"};
          color: ${isDarkTheme ? "#93c5fd" : "#1e40af"};
        }

        .message-role.user {
          background-color: ${isDarkTheme ? "#14532d" : "#dcfce7"};
          color: ${isDarkTheme ? "#86efac" : "#166534"};
        }

        .message-role.assistant {
          background-color: ${isDarkTheme ? "#581c87" : "#f3e8ff"};
          color: ${isDarkTheme ? "#d8b4fe" : "#6b21a8"};
        }

        .message-role.unknown {
          background-color: ${isDarkTheme ? "#451a03" : "#fef3c7"};
          color: ${isDarkTheme ? "#fbbf24" : "#92400e"};
        }

        .message-content {
          padding: 15px;
          background-color: var(--code-background);
          font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: var(--text-color);
          max-height: 500px;
          overflow-y: auto;
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        <h1>AI Execution at Line ${line + 1}</h1>
        ${navigationHtml}
      </div>

      <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Steps:</strong> ${result.steps.length}</p>
      </div>

      <div class="steps-container">
        ${stepsHtml}
      </div>

      ${messagesHtml}
      
      <script>
        // Steps data for navigation
        const stepsData = ${stepsDataJson};
        let currentStepIndex = 0;

        // Navigation function
        function navigateStep(direction) {
          const newIndex = currentStepIndex + direction;

          // Check bounds
          if (newIndex < 0 || newIndex >= stepsData.length) {
            return;
          }

          currentStepIndex = newIndex;

          // Update the displayed step
          document.getElementById('steps-container').innerHTML = stepsData[currentStepIndex].html;

          // Update step indicator
          document.getElementById('currentStep').textContent = currentStepIndex + 1;

          // Update button states
          document.getElementById('prevBtn').disabled = currentStepIndex === 0;
          document.getElementById('nextBtn').disabled = currentStepIndex === stepsData.length - 1;

          // Update button styles based on disabled state
          updateButtonStyles();
        }

        // Update button styles based on disabled state
        function updateButtonStyles() {
          const prevBtn = document.getElementById('prevBtn');
          const nextBtn = document.getElementById('nextBtn');

          if (prevBtn.disabled) {
            prevBtn.style.opacity = '0.5';
            prevBtn.style.cursor = 'not-allowed';
          } else {
            prevBtn.style.opacity = '1';
            prevBtn.style.cursor = 'pointer';
          }

          if (nextBtn.disabled) {
            nextBtn.style.opacity = '0.5';
            nextBtn.style.cursor = 'not-allowed';
          } else {
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
          }
        }

        // Toggle messages display
        function toggleMessages() {
          const messagesContainer = document.getElementById('messages-container');
          const messagesBtn = document.getElementById('messagesBtn');
          const stepsContainer = document.getElementById('steps-container');
          const summaryContainer = document.querySelector('.summary');

          if (messagesContainer.style.display === 'none') {
            // Show messages
            messagesContainer.style.display = 'block';
            stepsContainer.style.display = 'none';
            summaryContainer.style.display = 'none';
            messagesBtn.textContent = 'Back to Steps';
            messagesBtn.style.backgroundColor = 'var(--error-color)';
          } else {
            // Show steps
            messagesContainer.style.display = 'none';
            stepsContainer.style.display = 'block';
            summaryContainer.style.display = 'block';
            messagesBtn.textContent = 'Messages';
            messagesBtn.style.backgroundColor = 'var(--highlight-color)';
          }
        }

        // Initialize button states
        document.addEventListener('DOMContentLoaded', function() {
          updateButtonStyles();
        });

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
}

/**
 * 创建并显示AI执行预览面板
 */
export async function showExecutionPanel(
  line: number,
  context: vscode.ExtensionContext,
  panelManager?: PanelManager
): Promise<void> {
  // 获取当前文件路径
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage("No active editor");
    return;
  }

  const filePath = activeEditor.document.uri.fsPath;

  // Generate initial content - use empty state if no data exists
  let htmlContent = await generatePanelContent(filePath, line);
  let hasData = true;

  if (!htmlContent) {
    htmlContent = generateEmptyPanelContent(filePath, line);
    hasData = false;
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

  // Set initial content
  panel.webview.html = htmlContent;

  // Create refresh function
  const refreshPanel = async () => {
    let updatedContent = await generatePanelContent(filePath, line);

    // If still no data, use empty state
    if (!updatedContent) {
      updatedContent = generateEmptyPanelContent(filePath, line);
    }

    if (panel.visible) {
      panel.webview.html = updatedContent;
    }
  };

  // Set up periodic refresh every 2 seconds
  const refreshInterval = setInterval(refreshPanel, 2000);

  // Register panel with manager if provided
  if (panelManager) {
    panelManager.registerPanel(panel, filePath, line, refreshPanel);
  }

  // Clean up interval when panel is disposed
  panel.onDidDispose(() => {
    clearInterval(refreshInterval);
  });

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
