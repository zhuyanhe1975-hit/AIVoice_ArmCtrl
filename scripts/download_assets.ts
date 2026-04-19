import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { DOMParser } from '@xmldom/xmldom';

const ROBOT_ID = 'franka_emika_panda';
const BASE_URL = `https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/main/${ROBOT_ID}/`;
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'assets', ROBOT_ID);

async function downloadFile(url: string, outputPath: string) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`Downloading ${url} to ${outputPath}...`);
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer'
    });

    fs.writeFileSync(outputPath, response.data);
    return response.data.toString();
}

function scanDependencies(xmlString: string, currentFile: string) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    
    const compiler = xmlDoc.getElementsByTagName('compiler')[0];
    const meshDir = compiler?.getAttribute('meshdir') || '';
    const textureDir = compiler?.getAttribute('texturedir') || '';
    
    const currentDir = currentFile.includes('/') ? currentFile.substring(0, currentFile.lastIndexOf('/') + 1) : '';
    const dependencies: string[] = [];

    const elementsWithFile = xmlDoc.getElementsByTagName('*');
    for (let i = 0; i < elementsWithFile.length; i++) {
        const el = elementsWithFile[i];
        const fileAttr = el.getAttribute('file');
        if (!fileAttr) continue;

        let prefix = '';
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'mesh') {
            prefix = meshDir ? meshDir + '/' : '';
        } else if (['texture', 'hfield'].includes(tagName)) {
            prefix = textureDir ? textureDir + '/' : '';
        }

        let fullPath = (currentDir + prefix + fileAttr).replace(/\/\//g, '/');
        const parts = fullPath.split('/');
        const norm: string[] = [];
        for (const p of parts) { if (p === '..') norm.pop(); else if (p !== '.') norm.push(p); }
        fullPath = norm.join('/');
        
        dependencies.push(fullPath);
    }
    return dependencies;
}

async function main() {
    const queue = ['scene.xml'];
    const downloaded = new Set<string>();

    while (queue.length > 0) {
        const fname = queue.shift()!;
        if (downloaded.has(fname)) continue;
        downloaded.add(fname);

        const url = BASE_URL + fname;
        const outputPath = path.join(OUTPUT_DIR, fname);
        
        try {
            const content = await downloadFile(url, outputPath);
            if (fname.endsWith('.xml')) {
                const deps = scanDependencies(content, fname);
                for (const dep of deps) {
                    if (!downloaded.has(dep)) {
                        queue.push(dep);
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to download ${fname}:`, error);
        }
    }
    console.log('All assets downloaded successfully.');
}

main();
