import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-p','3147'], {stdio:'ignore'});
try {
  let ready = false;
  for (let i=0;i<100;i++) { try { await fetch('http://localhost:3147'); ready=true; break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  assert.ok(ready,'server starts');
  for (const [path,status] of [['/',200],['/r/A001',307],['/r/A002',410],['/r/UNKNOWN',404],['/r/a001',404]]) {
    const response = await fetch(`http://localhost:3147${path}`,{redirect:'manual'});
    assert.equal(response.status,status,path);
    if(path.startsWith('/r/')) assert.match(response.headers.get('cache-control'),/no-store/);
    if(status===307) assert.equal(response.headers.get('location'),'https://example.com/');
    console.log(`${path}: ${status} OK`);
  }
} finally { server.kill(); }
