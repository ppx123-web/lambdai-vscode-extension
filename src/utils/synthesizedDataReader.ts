import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

interface SynthesizedStep {
  raw: string;
  code: string;
  args_md5: string;
  complexity: string;
  explaination: string; // Note: JSON has this spelling
}

interface SynthesizedResult {
  steps: SynthesizedStep[];
}

interface SynthesizedData {
  results: Record<string, SynthesizedResult>;
}

/**
 * Find the .lambdai directory by searching in current and parent directories
 */
export function findLambdaiDir(startDir: string): string | null {
  let currentDir = startDir;
  while (currentDir !== path.dirname(currentDir)) { // Stop at root directory
    const lambdaiPath = path.join(currentDir, '.lambdai');
    if (fs.existsSync(lambdaiPath)) {
      return lambdaiPath;
    }
    currentDir = path.dirname(currentDir);
  }
  return null;
}

/**
 * From synthesized.json file read data
 */
export async function readSynthesizedData(filePath: string): Promise<SynthesizedData | null> {
  try {
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.py');
    
    // Find .lambdai directory by searching up the directory tree
    const lambdaaiDir = findLambdaiDir(fileDir);
    if (!lambdaaiDir) {
      console.log("Lambda AI directory not found in", fileDir, "or its parent directories");
      return null;
    }

    const results: Record<string, SynthesizedResult> = {};

    const files = fs.readdirSync(lambdaaiDir);
    for (const file of files) {
      if (file.startsWith(fileName + '_cache_') && file.endsWith('.py')) {
        const lineMatch = file.match(/_cache_(\d+)\.py$/);
        if (!lineMatch) continue;

        const lineNumber = parseInt(lineMatch[1]);
        const cacheFilePath = path.join(lambdaaiDir, file);

        try {
          const content = fs.readFileSync(cacheFilePath, 'utf8');
          
          // Create a synthetic step from the cache content
          const step: SynthesizedStep = {
            raw: content,
            code: Buffer.from(content).toString('base64'),
            args_md5: "cache",
            complexity: Buffer.from("From Cache").toString('base64'),
            explaination: Buffer.from("Code loaded from cache").toString('base64')
          };

          // Create result with single step (maintaining steps array for compatibility)
          const result: SynthesizedResult = {
            steps: [step]
          };

          // Use the same key format as before
          const key = `${filePath}:${lineNumber}`;
          results[key] = result;
        } catch (err) {
          console.error(`Error reading cache file ${file}:`, err);
        }
      }
    }

    // Only return null if no results were found
    if (Object.keys(results).length === 0) {
      console.log("No cache files found for", fileName);
      return null;
    }

    return { results };
  } catch (error) {
    console.error("Error reading from .lambdaai directory:", error);
    return null;
  }
}

/**
 * Find synthesized result for specific file and line number
 */
export async function findSynthesizedResult(
  filePath: string,
  line: number
): Promise<{step: SynthesizedStep, totalSteps: number} | null> {
  const data = await readSynthesizedData(filePath);
  if (!data || !data.results) {
    return null;
  }

  // Try to find the result with the format "filePath:line"
  const key = `${filePath}:${line}`;
  let result = data.results[key];

  // If not found, try with just the filename
  if (!result) {
    const fileName = filePath.split("/").pop() || "";
    // Look for keys that end with "fileName:line"
    const matchingKey = Object.keys(data.results).find(k => 
      k.endsWith(`/${fileName}:${line}`) || k.endsWith(`:${fileName}:${line}`)
    );
    
    if (matchingKey) {
      result = data.results[matchingKey];
    }
  }

  // If result found, return the last step and total steps count
  if (result && result.steps && result.steps.length > 0) {
    return {
      step: result.steps[result.steps.length - 1],
      totalSteps: result.steps.length
    };
  }

  return null;
}

/**
 * Decode Base64 string
 */
export function decodeBase64(base64: string): string {
  try {
    return Buffer.from(base64, "base64").toString();
  } catch (error) {
    console.error("Error decoding base64:", error);
    return "Error decoding content";
  }
}
