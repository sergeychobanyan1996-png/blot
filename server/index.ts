import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './hub';

const port = Number(process.env.PORT ?? 8787);
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

startServer(port, dist).then((s) => {
  console.log(`Blot server on http://localhost:${s.port} (WebSocket /ws)`);
});
