// Compatibility entry for the verified Chrome workload.
process.argv.push('--browser');
await import('../benchmarks/verified.js');
