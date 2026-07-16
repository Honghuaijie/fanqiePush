import { startLocalServer } from "./start-server";

const port = Number(process.env.PORT ?? 3456);

const handle = await startLocalServer({ port });
console.log(`Fanqie publish tool API listening on ${handle.origin}`);
