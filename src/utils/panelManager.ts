import * as vscode from 'vscode';
import * as path from 'path';
import { findLambdaiDir } from './synthesizedDataReader';

interface PanelInfo {
  panel: vscode.WebviewPanel;
  filePath: string;
  line: number;
  lambdaiDir: string;
  refreshFunction: () => Promise<void>;
}

export class PanelManager {
  private panels: Map<string, PanelInfo> = new Map();
  private fileWatcher: vscode.FileSystemWatcher | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.setupFileWatcher();
  }

  private setupFileWatcher() {
    const pattern = '**/.lambdai/**/*.{json,py}';
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidChange((uri) => {
      this.handleFileChange(uri);
    });

    this.fileWatcher.onDidCreate((uri) => {
      this.handleFileChange(uri);
    });

    this.fileWatcher.onDidDelete((uri) => {
      this.handleFileChange(uri);
    });

    this.context.subscriptions.push(this.fileWatcher);
  }

  private async handleFileChange(uri: vscode.Uri) {
    const changedFilePath = uri.fsPath;
    
    for (const [panelId, panelInfo] of this.panels) {
      const shouldRefresh = this.shouldRefreshPanel(panelInfo, changedFilePath);
      
      if (shouldRefresh) {
        try {
          await panelInfo.refreshFunction();
          console.log(`Refreshed panel for ${panelInfo.filePath}:${panelInfo.line} due to file change: ${changedFilePath}`);
        } catch (error) {
          console.error(`Error refreshing panel ${panelId}:`, error);
        }
      }
    }
  }

  private shouldRefreshPanel(panelInfo: PanelInfo, changedFilePath: string): boolean {
    const fileName = path.basename(panelInfo.filePath, '.py');
    const fileDir = path.dirname(panelInfo.filePath);
    
    // Check if the changed file is in a .lambdai directory
    if (!changedFilePath.includes('.lambdai')) {
      return false;
    }

    // Find the .lambdai directory for this panel's file
    const lambdaiDirFromPanel = findLambdaiDir(fileDir);
    
    // Check if the changed file is in the same .lambdai directory as this panel's file
    if (lambdaiDirFromPanel && !changedFilePath.startsWith(lambdaiDirFromPanel)) {
      return false;
    }

    const changedFileName = path.basename(changedFilePath);

    // Check for cache files
    if (changedFileName.startsWith(fileName + '_cache_') && changedFileName.endsWith('.py')) {
      const lineMatch = changedFileName.match(/_cache_(\d+)\.py$/);
      if (lineMatch) {
        const changedLine = parseInt(lineMatch[1]);
        return changedLine === (panelInfo.line + 1); // line is 0-based, but file names are 1-based
      }
    }

    // Check for trace files
    if (changedFileName.startsWith(fileName + '_trace_') && changedFileName.endsWith('.json')) {
      const lineMatch = changedFileName.match(/_trace_(\d+)\.json$/);
      if (lineMatch) {
        const changedLine = parseInt(lineMatch[1]);
        return changedLine === (panelInfo.line + 1); // line is 0-based, but file names are 1-based
      }
    }

    return false;
  }

  registerPanel(
    panel: vscode.WebviewPanel,
    filePath: string,
    line: number,
    refreshFunction: () => Promise<void>
  ): string {
    const panelId = `${filePath}:${line}:${Date.now()}`;
    const lambdaiDir = findLambdaiDir(path.dirname(filePath));
    
    // Even if no .lambdai directory exists yet, we still register the panel
    // so it can be refreshed when the directory and files are created
    const panelInfo: PanelInfo = {
      panel,
      filePath,
      line,
      lambdaiDir: lambdaiDir || path.dirname(filePath), // Fallback to file directory
      refreshFunction
    };

    this.panels.set(panelId, panelInfo);

    panel.onDidDispose(() => {
      this.panels.delete(panelId);
    });

    if (!lambdaiDir) {
      console.log(`No .lambdai directory found for ${filePath}, but panel registered for future monitoring`);
    }

    return panelId;
  }

  unregisterPanel(panelId: string) {
    this.panels.delete(panelId);
  }

  dispose() {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.panels.clear();
  }
}
