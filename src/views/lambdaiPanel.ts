import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findLambdaiDir, readSynthesizedData, decodeBase64 } from '../utils/synthesizedDataReader';

interface AIGeneratedCode {
  id: string;
  filePath: string;
  fileName: string;
  line: number;
  stepCount: number;
  codeLength: number;
  lastModified: Date;
  hasCache: boolean;
  hasTrace: boolean;
}

export class LambdaiPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'lambdaiPanel';
  
  private _view?: vscode.WebviewView;
  private _context: vscode.ExtensionContext;
  private _fileWatcher?: vscode.FileSystemWatcher;
  private _generatedCodes: AIGeneratedCode[] = [];
  private _selectedCodeId: string | null = null;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._context.extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        switch (message.type) {
          case 'selectCode':
            this._selectedCodeId = message.codeId;
            this._updateWebview();
            break;
          case 'openFile':
            this._openFileAtLine(message.filePath, message.line);
            break;
          case 'refresh':
            this._refreshCodeList();
            break;
        }
      },
      undefined,
      this._context.subscriptions
    );

    // Setup file watcher
    this._setupFileWatcher();
    
    // Initial load
    this._refreshCodeList();
  }

  private _setupFileWatcher() {
    // Watch for changes in .lambdai directories
    const pattern = '**/.lambdai/**/*.{py,json}';
    this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this._fileWatcher.onDidChange(() => this._refreshCodeList());
    this._fileWatcher.onDidCreate(() => this._refreshCodeList());
    this._fileWatcher.onDidDelete(() => this._refreshCodeList());

    this._context.subscriptions.push(this._fileWatcher);
  }

  private async _refreshCodeList() {
    this._generatedCodes = [];

    if (!vscode.workspace.workspaceFolders) {
      this._updateWebview();
      return;
    }

    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      await this._scanWorkspaceFolder(workspaceFolder.uri.fsPath);
    }

    // Sort by last modified date (newest first)
    this._generatedCodes.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    this._updateWebview();
  }

  private async _scanWorkspaceFolder(folderPath: string) {
    try {
      const files = this._findPythonFiles(folderPath);
      
      for (const filePath of files) {
        const fileDir = path.dirname(filePath);
        const lambdaiDir = findLambdaiDir(fileDir);
        
        if (!lambdaiDir) {
          continue;
        }

        // Read synthesized data for this file
        const data = await readSynthesizedData(filePath);
        if (!data || !data.results) {
          continue;
        }

        const fileName = path.basename(filePath, '.py');

        // Process each result
        for (const [key, result] of Object.entries(data.results)) {
          // Extract line number from key (format: "filepath:line")
          const keyParts = key.split(':');
          const lineStr = keyParts[keyParts.length - 1];
          const line = parseInt(lineStr) - 1; // Convert to 0-based

          if (isNaN(line) || !result.steps || result.steps.length === 0) {
            continue;
          }

          // Calculate code length from final step
          const finalStep = result.steps[result.steps.length - 1];
          const code = decodeBase64(finalStep.code);
          
          // Check for cache and trace files
          const cacheFile = path.join(lambdaiDir, `${fileName}_cache_${line + 1}.py`);
          const traceFile = path.join(lambdaiDir, `${fileName}_trace_${line + 1}.json`);
          
          const hasCache = fs.existsSync(cacheFile);
          const hasTrace = fs.existsSync(traceFile);
          
          // Get last modified time
          let lastModified = new Date();
          if (hasCache) {
            const stats = fs.statSync(cacheFile);
            lastModified = stats.mtime;
          }

          const generatedCode: AIGeneratedCode = {
            id: `${filePath}:${line}`,
            filePath,
            fileName: path.basename(filePath),
            line,
            stepCount: result.steps.length,
            codeLength: code.length,
            lastModified,
            hasCache,
            hasTrace
          };

          this._generatedCodes.push(generatedCode);
        }
      }
    } catch (error) {
      console.error('Error scanning workspace folder:', error);
    }
  }

  private _findPythonFiles(dir: string): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          // Skip node_modules, .git, and other common directories
          if (!item.startsWith('.') && item !== 'node_modules' && item !== '__pycache__') {
            files.push(...this._findPythonFiles(fullPath));
          }
        } else if (item.endsWith('.py')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore directories we can't read
    }
    
    return files;
  }

  private async _openFileAtLine(filePath: string, line: number) {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document);
      
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  private _updateWebview() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  private _getSelectedCodeStats(): AIGeneratedCode | null {
    if (!this._selectedCodeId) {
      return null;
    }
    return this._generatedCodes.find(code => code.id === this._selectedCodeId) || null;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const selectedCode = this._getSelectedCodeStats();
    
    // Generate code list HTML
    const codeListHtml = this._generatedCodes.map(code => {
      const isSelected = code.id === this._selectedCodeId;
      const statusIcons = [];
      if (code.hasCache) statusIcons.push('💾');
      if (code.hasTrace) statusIcons.push('🔍');
      
      return `
        <div class="code-item ${isSelected ? 'selected' : ''}" data-code-id="${code.id}">
          <div class="code-header">
            <span class="file-name">${code.fileName}</span>
            <span class="line-number">:${code.line + 1}</span>
            <span class="status-icons">${statusIcons.join(' ')}</span>
          </div>
          <div class="code-meta">
            <span class="step-count">${code.stepCount} steps</span>
            <span class="code-length">${code.codeLength} chars</span>
            <span class="last-modified">${this._formatDate(code.lastModified)}</span>
          </div>
        </div>
      `;
    }).join('');

    // Generate stats HTML
    const statsHtml = selectedCode ? `
      <div class="stats-content">
        <h3>Code Statistics</h3>
        <div class="stat-item">
          <label>File:</label>
          <span class="file-path" title="${selectedCode.filePath}">${selectedCode.fileName}</span>
          <button class="open-file-btn" data-file-path="${selectedCode.filePath}" data-line="${selectedCode.line}">📂 Open</button>
        </div>
        <div class="stat-item">
          <label>Line:</label>
          <span>${selectedCode.line + 1}</span>
        </div>
        <div class="stat-item">
          <label>Code Length:</label>
          <span>${selectedCode.codeLength} characters</span>
        </div>
        <div class="stat-item">
          <label>Attempts:</label>
          <span>${selectedCode.stepCount}</span>
        </div>
        <div class="stat-item">
          <label>Path:</label>
          <span class="full-path" title="${selectedCode.filePath}">${selectedCode.filePath}</span>
        </div>
        <div class="stat-item">
          <label>Last Modified:</label>
          <span>${selectedCode.lastModified.toLocaleString()}</span>
        </div>
        <div class="stat-item">
          <label>Files:</label>
          <span>
            ${selectedCode.hasCache ? '💾 Cache' : '❌ No Cache'} | 
            ${selectedCode.hasTrace ? '🔍 Trace' : '❌ No Trace'}
          </span>
        </div>
      </div>
    ` : `
      <div class="stats-placeholder">
        <p>Select a generated code item to view statistics</p>
      </div>
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LambdaAI Panel</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 8px;
            overflow: hidden;
        }

        .container {
            display: flex;
            height: calc(100vh - 16px);
            gap: 8px;
        }

        .left-panel {
            flex: 1;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .right-panel {
            flex: 1;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .panel-header {
            background-color: var(--vscode-tab-activeBackground);
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .refresh-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .refresh-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .panel-content {
            flex: 1;
            overflow-y: auto;
            padding: 4px;
        }

        .code-item {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            transition: background-color 0.1s;
        }

        .code-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .code-item.selected {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }

        .code-header {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-bottom: 4px;
        }

        .file-name {
            font-weight: 500;
        }

        .line-number {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }

        .status-icons {
            margin-left: auto;
            font-size: 0.8em;
        }

        .code-meta {
            display: flex;
            gap: 12px;
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
        }

        .stats-content {
            padding: 12px;
        }

        .stats-content h3 {
            margin: 0 0 16px 0;
            color: var(--vscode-foreground);
        }

        .stat-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            gap: 8px;
        }

        .stat-item label {
            font-weight: 500;
            min-width: 80px;
        }

        .stat-item span {
            flex: 1;
            text-align: right;
            word-break: break-all;
        }

        .file-path {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }

        .full-path {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.85em;
        }

        .open-file-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            margin-left: 8px;
        }

        .open-file-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .stats-placeholder {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            flex-direction: column;
            gap: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="left-panel">
            <div class="panel-header">
                <span>Generated Code (${this._generatedCodes.length})</span>
                <button class="refresh-btn" id="refresh-btn">🔄 Refresh</button>
            </div>
            <div class="panel-content">
                ${this._generatedCodes.length > 0 ? codeListHtml : `
                <div class="empty-state">
                    <div>No AI generated code found</div>
                    <div style="font-size: 0.9em;">Generate some code using AI.execute to see it here</div>
                </div>
                `}
            </div>
        </div>
        <div class="right-panel">
            <div class="panel-header">
                <span>Statistics</span>
            </div>
            <div class="panel-content">
                ${statsHtml}
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Handle code item selection
        document.addEventListener('click', (e) => {
            const codeItem = e.target.closest('.code-item');
            if (codeItem) {
                // Remove previous selection
                document.querySelectorAll('.code-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Add selection to clicked item
                codeItem.classList.add('selected');
                
                // Send selection message
                vscode.postMessage({
                    type: 'selectCode',
                    codeId: codeItem.dataset.codeId
                });
            }

            // Handle open file button
            const openFileBtn = e.target.closest('.open-file-btn');
            if (openFileBtn) {
                e.stopPropagation();
                vscode.postMessage({
                    type: 'openFile',
                    filePath: openFileBtn.dataset.filePath,
                    line: parseInt(openFileBtn.dataset.line)
                });
            }

            // Handle refresh button
            const refreshBtn = e.target.closest('#refresh-btn');
            if (refreshBtn) {
                vscode.postMessage({
                    type: 'refresh'
                });
            }
        });
    </script>
</body>
</html>`;
  }

  private _formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) {
      return 'just now';
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  public dispose() {
    if (this._fileWatcher) {
      this._fileWatcher.dispose();
    }
  }
}
