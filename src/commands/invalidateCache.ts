import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { findLambdaiDir } from "../utils/synthesizedDataReader";

export async function invalidateCache(
  uri: vscode.Uri,
  line: number
): Promise<void> {
  try {
    const filePath = uri.fsPath;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.py');
    
    // Find .lambdai directory
    const lambdaaiDir = findLambdaiDir(fileDir);
    if (!lambdaaiDir) {
      vscode.window.showErrorMessage("Could not find .lambdai directory");
      return;
    }

    // Construct cache file path
    const cacheFileName = `${fileName}_cache_${line + 1}.py`;
    const cacheFilePath = path.join(lambdaaiDir, cacheFileName);

    // Check if cache file exists
    if (!fs.existsSync(cacheFilePath)) {
      vscode.window.showErrorMessage(`Cache file not found: ${cacheFileName}`);
      return;
    }

    // Delete the cache file
    fs.unlinkSync(cacheFilePath);
    vscode.window.showInformationMessage(`Cache invalidated: ${cacheFileName}`);
    
  } catch (error) {
    console.error("Error invalidating cache:", error);
    vscode.window.showErrorMessage("Failed to invalidate cache");
  }
} 