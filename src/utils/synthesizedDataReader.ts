import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

interface SynthesizedStep {
  raw: string;
  code: string;
  args_md5: string;
  complexity: string;
  explaination: string;
}

interface TraceStep {
  prompt: string;
  code: string;
  error?: string;
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
 * Read trace file for a specific line
 */
async function readTraceFile(lambdaaiDir: string, fileName: string, line: number): Promise<TraceStep[] | null> {
  const traceFileName = `${fileName}_trace_${line}.json`;
  const traceFilePath = path.join(lambdaaiDir, traceFileName);

  if (!fs.existsSync(traceFilePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(traceFilePath, 'utf8');
    return JSON.parse(content) as TraceStep[];
  } catch (error) {
    console.error("Error reading trace file:", error);
    return null;
  }
}

export async function readSynthesizedData(filePath: string): Promise<SynthesizedData | null> {
  try {
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.py');
    
    // Find .lambdai directory
    const lambdaaiDir = findLambdaiDir(fileDir);
    if (!lambdaaiDir) {
      console.log("Lambda AI directory not found:", fileDir);
      return null;
    }

    const results: Record<string, SynthesizedResult> = {};

    // Check for specific cache file based on line number
    const files = fs.readdirSync(lambdaaiDir);
    for (const file of files) {
      if (file.startsWith(fileName + '_cache_') && file.endsWith('.py')) {
        const lineMatch = file.match(/_cache_(\d+)\.py$/);
        if (!lineMatch) continue;

        const lineNumber = parseInt(lineMatch[1]);
        const cacheFilePath = path.join(lambdaaiDir, file);

        try {
          const content = fs.readFileSync(cacheFilePath, 'utf8');
          
          // Read trace file for this line
          const traceSteps = await readTraceFile(lambdaaiDir, fileName, lineNumber);
          
          // Create steps array from trace if available
          const steps: SynthesizedStep[] = [];
          
          if (traceSteps) {
            // Add steps from trace file
            for (const traceStep of traceSteps) {
              // Check if trace code is already Base64 encoded or plain text
              let codeToStore: string;
              try {
                // Try to decode as Base64 first - if it succeeds, it was already encoded
                const decoded = Buffer.from(traceStep.code, 'base64').toString('utf8');
                // Check if the decoded result looks like valid text (not binary)
                if (decoded.length > 0 && /^[\x20-\x7E\s]*$/.test(decoded)) {
                  codeToStore = traceStep.code; // Already Base64 encoded
                } else {
                  codeToStore = Buffer.from(traceStep.code).toString('base64'); // Plain text, need to encode
                }
              } catch {
                // If Base64 decode fails, it's plain text
                codeToStore = Buffer.from(traceStep.code).toString('base64');
              }
              
              steps.push({
                raw: decodeBase64(traceStep.prompt),
                code: codeToStore,
                args_md5: "trace",
                complexity: Buffer.from("From Trace").toString('base64'),
                explaination: Buffer.from(traceStep.error ? traceStep.error : "").toString('base64')
              });
            }
          }
          
          // Add final cache content as the last step if not already included
          const lastTraceCode = steps.length > 0 ? decodeBase64(steps[steps.length - 1].code) : null;
          if (lastTraceCode !== content) {
            steps.push({
              raw: content,
              code: Buffer.from(content).toString('base64'),
              args_md5: "cache",
              complexity: Buffer.from("Final Result").toString('base64'),
              explaination: Buffer.from("Final generated code").toString('base64')
            });
          }

          // Create result with steps
          const result: SynthesizedResult = { steps };

          // Use the same key format as before
          const key = `${filePath}:${lineNumber}`;
          results[key] = result;
        } catch (err) {
          console.error(`Error reading cache/trace files ${file}:`, err);
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
    console.error("Error reading from .lambdai directory:", error);
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
