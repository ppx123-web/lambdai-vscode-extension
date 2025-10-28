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
    const fileName = path.basename(filePath, ".py");
    const lineNumber = line + 1;

    // Find .lambdai directory
    const lambdaaiDir = findLambdaiDir(fileDir);
    if (!lambdaaiDir) {
      vscode.window.showErrorMessage("Could not find .lambdai directory");
      return;
    }

    // Create glob pattern to find all files matching *_{lineno}.* in all subdirectories
    const globPattern = new vscode.RelativePattern(
      lambdaaiDir,
      `**/${fileName}_*_${lineNumber}.*`
    );

    // Find all matching files
    const files = await vscode.workspace.findFiles(globPattern);

    if (files.length === 0) {
      vscode.window.showErrorMessage(
        `No cache files found for ${fileName} line ${lineNumber}`
      );
      return;
    }

    let deletedFiles = [];
    let failedFiles = [];

    // Delete all found files
    for (const file of files) {
      try {
        fs.unlinkSync(file.fsPath);
        deletedFiles.push(path.basename(file.fsPath));
      } catch (error) {
        console.error(`Failed to delete ${file.fsPath}:`, error);
        failedFiles.push(path.basename(file.fsPath));
      }
    }

    // Show appropriate message
    if (deletedFiles.length > 0) {
      const deletedMessage = `Deleted ${deletedFiles.length} cache file(s) for ${fileName} line ${lineNumber}: ${deletedFiles.join(", ")}`;

      if (failedFiles.length > 0) {
        vscode.window.showWarningMessage(
          `${deletedMessage} (Failed to delete: ${failedFiles.join(", ")})`
        );
      } else {
        vscode.window.showInformationMessage(deletedMessage);
      }
    } else {
      vscode.window.showErrorMessage(
        `Failed to delete any cache files for ${fileName} line ${lineNumber}`
      );
    }
  } catch (error) {
    console.error("Error invalidating cache:", error);
    vscode.window.showErrorMessage("Failed to invalidate cache");
  }
} 