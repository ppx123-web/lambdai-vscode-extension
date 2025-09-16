import * as vscode from 'vscode';
import * as path from 'path';
import { findLambdaiDir } from './synthesizedDataReader';
import { updateAIExecuteInfoDecorations } from './decorationProvider';

/**
 * Manager for refreshing AI.execute decorations when trace files change
 */
export class DecorationRefreshManager {
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private openEditors: Set<vscode.TextEditor> = new Set();

  constructor(private context: vscode.ExtensionContext) {
    this.setupFileWatcher();
    this.setupEditorTracking();
  }

  private setupFileWatcher() {
    // Watch for changes in .lambdai directories - specifically trace and cache files
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

  private setupEditorTracking() {
    // Track when editors are opened
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'python') {
        this.openEditors.add(editor);
      }
    }, null, this.context.subscriptions);

    // Track when editors are closed
    vscode.workspace.onDidCloseTextDocument((document) => {
      // Remove closed editors from our tracking
      this.openEditors.forEach(editor => {
        if (editor.document === document) {
          this.openEditors.delete(editor);
        }
      });
    }, null, this.context.subscriptions);

    // Track when visible editors change
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      // Add all visible Python editors to our tracking
      editors.forEach(editor => {
        if (editor.document.languageId === 'python') {
          this.openEditors.add(editor);
        }
      });
    }, null, this.context.subscriptions);

    // Initial setup - add currently open editors
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.languageId === 'python') {
        this.openEditors.add(editor);
      }
    });
  }

  private async handleFileChange(uri: vscode.Uri) {
    const changedFilePath = uri.fsPath;
    
    // Check if the changed file is a trace or cache file
    if (!changedFilePath.includes('.lambdai') || 
        (!changedFilePath.endsWith('.json') && !changedFilePath.endsWith('.py'))) {
      return;
    }

    const changedFileName = path.basename(changedFilePath);
    
    // Parse the file name to extract the original file name and line number
    let originalFileName: string | null = null;
    let lineNumber: number | null = null;
    
    // Check for trace files (e.g., "filename_trace_5.json")
    const traceMatch = changedFileName.match(/^(.+)_trace_(\d+)\.json$/);
    if (traceMatch) {
      originalFileName = traceMatch[1];
      lineNumber = parseInt(traceMatch[2]);
    }
    
    // Check for cache files (e.g., "filename_cache_5.py")
    const cacheMatch = changedFileName.match(/^(.+)_cache_(\d+)\.py$/);
    if (cacheMatch) {
      originalFileName = cacheMatch[1];
      lineNumber = parseInt(cacheMatch[2]);
    }
    
    if (!originalFileName || !lineNumber) {
      return;
    }

    console.log(`Detected change in ${changedFileName}, refreshing decorations for ${originalFileName}:${lineNumber}`);
    
    // Find and refresh relevant editors
    await this.refreshRelevantEditors(originalFileName, lineNumber);
  }

  private async refreshRelevantEditors(fileName: string, lineNumber: number) {
    // Convert 1-based line number from file name to 0-based for editor
    const editorLineNumber = lineNumber - 1;
    
    for (const editor of this.openEditors) {
      // Check if this editor corresponds to the file that was changed
      const editorFileName = path.basename(editor.document.uri.fsPath, '.py');
      
      if (editorFileName === fileName) {
        console.log(`Refreshing decorations for editor: ${editor.document.uri.fsPath}`);
        
        // Refresh the decorations for this editor
        await updateAIExecuteInfoDecorations(editor);
        
        // Optional: Also refresh the line-specific decorations if needed
        // This could be useful if we want to highlight that specific line was updated
        this.highlightUpdatedLine(editor, editorLineNumber);
      }
    }
  }

  private highlightUpdatedLine(editor: vscode.TextEditor, lineNumber: number) {
    // Create a temporary decoration to briefly highlight the updated line
    const highlightDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
      border: '1px solid',
      borderColor: new vscode.ThemeColor('editor.wordHighlightStrongBorder'),
    });

    const range = new vscode.Range(lineNumber, 0, lineNumber, editor.document.lineAt(lineNumber).text.length);
    editor.setDecorations(highlightDecoration, [{ range }]);

    // Remove the highlight after a short delay
    setTimeout(() => {
      editor.setDecorations(highlightDecoration, []);
      highlightDecoration.dispose();
    }, 1000);
  }

  /**
   * Manually refresh decorations for all open Python editors
   */
  public async refreshAllDecorations() {
    for (const editor of this.openEditors) {
      if (editor.document.languageId === 'python') {
        await updateAIExecuteInfoDecorations(editor);
      }
    }
  }

  /**
   * Add an editor to tracking (useful for external calls)
   */
  public addEditor(editor: vscode.TextEditor) {
    if (editor.document.languageId === 'python') {
      this.openEditors.add(editor);
    }
  }

  /**
   * Remove an editor from tracking
   */
  public removeEditor(editor: vscode.TextEditor) {
    this.openEditors.delete(editor);
  }

  public dispose() {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.openEditors.clear();
  }
}
