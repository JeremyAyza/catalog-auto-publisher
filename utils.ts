import fs from 'fs-extra';
import path from 'path';

export function getLatestDataset(datasetsDir: string = './datasets'): string | null {
    if (!fs.existsSync(datasetsDir)) return null;
    
    const files = fs.readdirSync(datasetsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ 
            name: f, 
            time: fs.statSync(path.join(datasetsDir, f)).mtime.getTime() 
        }))
        .sort((a, b) => b.time - a.time);
    
    return files.length > 0 ? path.join(datasetsDir, files[0].name) : null;
}

export function humanDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function normalizePath(relativePath: string): string {
    return path.join(process.cwd(), relativePath);
}

export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function resolveDatasetPath(argOverride?: string): string {
    let datasetPath: string | null = null;
    const envFile = process.env.DATASET_FILE;
    const cliArg = argOverride || process.argv[2];

    if (envFile) {
        datasetPath = path.join(process.cwd(), 'datasets', envFile);
    } else if (cliArg) {
        datasetPath = cliArg.endsWith('.json')
            ? path.join(process.cwd(), 'datasets', cliArg)
            : path.join(process.cwd(), 'datasets', `${cliArg}.json`);
    } else {
        datasetPath = getLatestDataset();
    }

    if (!datasetPath || !fs.existsSync(datasetPath)) {
        throw new Error(`❌ Dataset not found: ${datasetPath}`);
    }
    return datasetPath;
}

export function getTimestamp(): string {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
    ].join('_');
}
