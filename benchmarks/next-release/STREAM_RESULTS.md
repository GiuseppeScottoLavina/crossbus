# 0.1.5 one-way binary stream observations

Three fresh process pairs; raw MessageChannel in one event loop. Every received byte, exact frame/handler ledger and original ownership is checked. Ratios are paired-process medians and observed ranges, not confidence intervals. Base64 is the compatible default comparison; native and flow/transfer modes change encoding/delivery semantics. See [method and limits](../../docs/NEXT_RELEASE.md).

| Runtime | MiB | Candidate mode | Baseline MiB/s | Candidate MiB/s | Ratio |
|---|---:|---|---:|---:|---:|
| node | 1 | base64 | 79.6 | 76.3 | 0.96 (0.93–1.00) |
| node | 1 | native | 79.6 | 260.9 | 3.29 (3.22–3.39) |
| node | 1 | native-flow | 79.6 | 227.5 | 2.86 (2.78–3.03) |
| node | 1 | native-flow-transfer | 79.6 | 240.6 | 3.02 (2.96–3.14) |
| node | 4 | base64 | 87.3 | 83.3 | 0.95 (0.95–0.96) |
| node | 4 | native | 87.3 | 261.8 | 2.99 (2.98–3.00) |
| node | 4 | native-flow | 87.3 | 244.1 | 2.79 (2.78–2.87) |
| node | 4 | native-flow-transfer | 87.3 | 256.1 | 2.93 (2.92–2.94) |
| bun | 1 | base64 | 107.2 | 556.3 | 5.12 (5.07–6.07) |
| bun | 1 | native | 107.2 | 1087.6 | 9.90 (9.64–10.37) |
| bun | 1 | native-flow | 107.2 | 975.0 | 9.02 (8.88–9.50) |
| bun | 1 | native-flow-transfer | 107.2 | 1103.4 | 10.29 (9.07–10.47) |
| bun | 4 | base64 | 105.3 | 627.2 | 5.95 (5.76–6.15) |
| bun | 4 | native | 105.3 | 1042.8 | 9.81 (9.44–10.09) |
| bun | 4 | native-flow | 105.3 | 988.2 | 9.50 (8.93–9.56) |
| bun | 4 | native-flow-transfer | 105.3 | 1043.5 | 10.10 (9.38–10.40) |
| chrome | 1 | base64 | 96.2 | 381.0 | 3.90 (3.86–4.47) |
| chrome | 1 | native | 96.2 | 493.8 | 5.09 (5.06–5.14) |
| chrome | 1 | native-flow | 96.2 | 444.4 | 4.61 (4.58–4.62) |
| chrome | 1 | native-flow-transfer | 96.2 | 493.8 | 5.14 (4.82–5.15) |
| chrome | 4 | base64 | 60.3 | 432.4 | 7.19 (7.18–7.30) |
| chrome | 4 | native | 60.3 | 480.5 | 7.97 (7.96–8.14) |
| chrome | 4 | native-flow | 60.3 | 448.2 | 7.44 (7.23–7.49) |
| chrome | 4 | native-flow-transfer | 60.3 | 495.4 | 8.24 (8.18–8.51) |
