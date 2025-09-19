import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findLambdaiDir } from './synthesizedDataReader';
import { findAIExecuteLines } from './decorationProvider';

interface AIExecuteLine {
  line: number;
  originalLine: number; // Track the original line number for mapping
}

interface FileLineMap {
  [filePath: string]: AIExecuteLine[];
}

/**
 * Tracks line number changes and automatically renames corresponding .lambdai files
 */
export class LineTracker {
  private fileLineMaps: FileLineMap = {};
  private context: vscode.ExtensionContext;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.setupDocumentChangeListener();
    this.setupActiveEditorListener();
    
    // Initialize tracking for currently open editors
    this.initializeOpenEditors();
  }

  private setupDocumentChangeListener() {
    vscode.workspace.onDidChangeTextDocument((event) => {
      this.handleDocumentChange(event);
    }, null, this.context.subscriptions);
  }

  private setupActiveEditorListener() {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'python') {
        this.updateFileLineMap(editor.document);
      }
    }, null, this.context.subscriptions);
  }

  private initializeOpenEditors() {
    vscode.window.visibleTextEditors.forEach(editor => {
      if (editor.document.languageId === 'python') {
        this.updateFileLineMap(editor.document);
      }
    });
  }

  private async updateFileLineMap(document: vscode.TextDocument) {
    const filePath = document.uri.fsPath;
    const aiExecuteLines = findAIExecuteLines(document);
    
    // Convert ranges to line numbers (0-based)
    const currentLines: AIExecuteLine[] = aiExecuteLines.map(range => ({
      line: range.start.line,
      originalLine: range.start.line
    }));

    // If this file was already tracked, we need to map old lines to new lines
    if (this.fileLineMaps[filePath]) {
      const oldLines = this.fileLineMaps[filePath];
      this.mapOldLinesToNew(oldLines, currentLines);
    }

    this.fileLineMaps[filePath] = currentLines;
    console.log(`Updated line map for ${path.basename(filePath)}:`, currentLines);
  }

  private mapOldLinesToNew(oldLines: AIExecuteLine[], newLines: AIExecuteLine[]) {
    // Try to match old lines with new lines based on content proximity
    // This is a simple heuristic - in practice, you might want more sophisticated matching
    for (const newLine of newLines) {
      // Find the closest old line that hasn't been mapped yet
      let closestOldLine: AIExecuteLine | null = null;
      let minDistance = Infinity;
      
      for (const oldLine of oldLines) {
        const distance = Math.abs(newLine.line - oldLine.line);
        if (distance < minDistance) {
          minDistance = distance;
          closestOldLine = oldLine;
        }
      }
      
      if (closestOldLine) {
        newLine.originalLine = closestOldLine.originalLine;
        // Remove the matched old line to avoid duplicate matching
        const index = oldLines.indexOf(closestOldLine);
        if (index > -1) {
          oldLines.splice(index, 1);
        }
      }
    }
  }

  private async handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const document = event.document;
    
    // Only process Python files
    if (document.languageId !== 'python') {
      return;
    }

    const filePath = document.uri.fsPath;
    const oldLineMap = this.fileLineMaps[filePath];
    
    if (!oldLineMap || oldLineMap.length === 0) {
      // No AI.execute lines to track, just update the map
      await this.updateFileLineMap(document);
      return;
    }

    // Analyze the changes to determine line shifts
    const lineShifts = this.calculateLineShifts(event.contentChanges);
    
    if (lineShifts.length === 0) {
      // No line number changes, just update the map
      await this.updateFileLineMap(document);
      return;
    }

    console.log(`Detected line shifts in ${path.basename(filePath)}:`, lineShifts);

    // Apply line shifts to our tracked lines and rename files accordingly
    await this.applyLineShiftsAndRenameFiles(filePath, lineShifts);
    
    // Update the line map with current state
    await this.updateFileLineMap(document);
  }

  private calculateLineShifts(changes: readonly vscode.TextDocumentContentChangeEvent[]): Array<{startLine: number, shift: number}> {
    const lineShifts: Array<{startLine: number, shift: number}> = [];
    
    for (const change of changes) {
      const startLine = change.range.start.line;
      const endLine = change.range.end.line;
      const newText = change.text;
      
      // Calculate how many lines were added or removed
      const oldLineCount = endLine - startLine + 1;
      const newLineCount = newText.split('\n').length;
      const shift = newLineCount - oldLineCount;
      
      if (shift !== 0) {
        lineShifts.push({ startLine, shift });
      }
    }
    
    // Sort by start line (descending) to process from bottom to top
    lineShifts.sort((a, b) => b.startLine - a.startLine);
    
    return lineShifts;
  }

  private async applyLineShiftsAndRenameFiles(filePath: string, lineShifts: Array<{startLine: number, shift: number}>) {
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.py');
    const lambdaiDir = findLambdaiDir(fileDir);
    
    if (!lambdaiDir) {
      console.log(`No .lambdai directory found for ${filePath}`);
      return;
    }

    const oldLineMap = this.fileLineMaps[filePath];
    if (!oldLineMap) return;

    // Create a map of line changes for efficient lookup
    const lineChanges = new Map<number, number>(); // oldLine -> newLine
    
    for (const aiLine of oldLineMap) {
      let newLine = aiLine.line;
      
      // Apply each line shift
      for (const shift of lineShifts) {
        if (aiLine.line > shift.startLine) {
          newLine += shift.shift;
        }
      }
      
      // Only track if the line actually moved
      if (newLine !== aiLine.line && newLine >= 0) {
        lineChanges.set(aiLine.line, newLine);
      } else if (newLine < 0) {
        // Line was deleted, we'll handle this separately
        lineChanges.set(aiLine.line, -1);
      }
    }

    // Perform the actual file renaming
    await this.renameFilesForLineChanges(lambdaiDir, fileName, lineChanges);
  }

  private async renameFilesForLineChanges(lambdaiDir: string, fileName: string, lineChanges: Map<number, number>) {
    const renamedFiles: Array<{from: string, to: string}> = [];
    
    try {
      const files = fs.readdirSync(lambdaiDir);
      
      for (const [oldLine, newLine] of lineChanges) {
        const oldLineNumber = oldLine + 1; // Convert to 1-based
        const newLineNumber = newLine + 1; // Convert to 1-based
        
        // Find cache and trace files for this line
        const cacheFile = `${fileName}_cache_${oldLineNumber}.py`;
        const traceFile = `${fileName}_trace_${oldLineNumber}.json`;
        
        const cacheFilePath = path.join(lambdaiDir, cacheFile);
        const traceFilePath = path.join(lambdaiDir, traceFile);
        
        if (newLine === -1) {
          // Line was deleted, remove the files
          if (fs.existsSync(cacheFilePath)) {
            fs.unlinkSync(cacheFilePath);
            console.log(`Deleted cache file: ${cacheFile}`);
          }
          if (fs.existsSync(traceFilePath)) {
            fs.unlinkSync(traceFilePath);
            console.log(`Deleted trace file: ${traceFile}`);
          }
        } else {
          // Line moved, rename the files
          const newCacheFile = `${fileName}_cache_${newLineNumber}.py`;
          const newTraceFile = `${fileName}_trace_${newLineNumber}.json`;
          
          const newCacheFilePath = path.join(lambdaiDir, newCacheFile);
          const newTraceFilePath = path.join(lambdaiDir, newTraceFile);
          
          // Rename cache file
          if (fs.existsSync(cacheFilePath) && !fs.existsSync(newCacheFilePath)) {
            fs.renameSync(cacheFilePath, newCacheFilePath);
            renamedFiles.push({from: cacheFile, to: newCacheFile});
            console.log(`Renamed cache file: ${cacheFile} -> ${newCacheFile}`);
          }
          
          // Rename trace file
          if (fs.existsSync(traceFilePath) && !fs.existsSync(newTraceFilePath)) {
            fs.renameSync(traceFilePath, newTraceFilePath);
            renamedFiles.push({from: traceFile, to: newTraceFile});
            console.log(`Renamed trace file: ${traceFile} -> ${newTraceFile}`);
          }
        }
      }
      
      if (renamedFiles.length > 0) {
        // vscode.window.showInformationMessage(
        //   `Updated ${renamedFiles.length} LambdaAI files due to line changes`
        // );
      }
      
    } catch (error) {
      console.error('Error renaming LambdaAI files:', error);
      vscode.window.showErrorMessage('Failed to update LambdaAI files after line changes');
    }
  }

  /**
   * Manually refresh line tracking for a specific file
   */
  public async refreshFileTracking(filePath: string) {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      await this.updateFileLineMap(document);
    } catch (error) {
      console.error(`Error refreshing line tracking for ${filePath}:`, error);
    }
  }

  /**
   * Get current line mapping for a file
   */
  public getFileLineMap(filePath: string): AIExecuteLine[] {
    return this.fileLineMaps[filePath] || [];
  }

  /**
   * Clear tracking for a specific file
   */
  public clearFileTracking(filePath: string) {
    delete this.fileLineMaps[filePath];
  }

  public dispose() {
    this.fileLineMaps = {};
  }
}
