// Fresh processes and alternating order; pilot data are not release evidence.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
for (const runtime of ['node','bun','chrome']) {
    for (let round=1; round<=3; round++) {
        for (const variant of round%2 ? ['baseline','candidate'] : ['candidate','baseline']) {
            const artifact=variant==='baseline'?'artifacts/optimization-016/variants/compact-stream/crossbus.min.js':'dist/crossbus.min.js';
            const output=`artifacts/optimization-016/options-pilot-${runtime}-${variant}-${round}.json`;
            if(existsSync(output))throw Error('Refusing overwrite '+output);
            const result=spawnSync(runtime==='bun'?'bun':'node',['experiments/worker-rpc/run.js','--artifact',artifact,'--output',output,'--samples','5','--iterations','2048','--warmup','4096','--latency-groups','32','--concurrency','1,64','--order',String(round-1),...(runtime==='chrome'?['--browser']:[])],{stdio:'inherit'});
            if(result.error)throw result.error;
            if(result.status!==0)process.exit(result.status??1);
        }
    }
}
