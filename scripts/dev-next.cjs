// Preserve Next.js dev; translate the preview supervisor's Vite-style flags.
const {spawn}=require('node:child_process');
const args=process.argv.slice(2).filter(arg=>arg!=='--strictPort').map(arg=>arg==='--host'?'--hostname':arg);
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev',...args],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
