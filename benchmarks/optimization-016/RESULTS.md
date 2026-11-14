# Rejected 0.1.6 literal-inlining trial against published 0.1.5

Rejected literal-inlining trial; these are not the selected runtime measurements. Three alternating fresh-process pairs; medians of process medians and paired ratios. Observed ratio ranges are not confidence intervals. Streaming includes full receiver validation. RPC semantics differ across libraries; controls are not exact substitutes.

84 datasets (66 main and 18 follow-up); 46,356,480 checked RPC calls; 4,320 checked stream transfers.

## stream / Node v24.15.0 / node / primary

Rates: MiB/s. Case keys: mode | bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| base64 / 1048576 /  | 77.9 | 243.7 | 3.085x | 3.081–3.178x |
| native / 1048576 /  | 267.1 | 268.9 | 1.007x | 1.007–1.008x |
| native-flow / 1048576 /  | 233.8 | 235.2 | 1.006x | 0.997–1.034x |
| native-flow-transfer / 1048576 /  | 247.1 | 251.6 | 1.019x | 1.015–1.065x |
| base64 / 4194304 /  | 85.4 | 236.8 | 2.773x | 2.770–2.784x |
| native / 4194304 /  | 267.2 | 265.2 | 0.989x | 0.985–0.994x |
| native-flow / 4194304 /  | 249.1 | 247.7 | 0.996x | 0.975–1.024x |
| native-flow-transfer / 4194304 /  | 260.8 | 263.2 | 1.018x | 1.009–1.040x |

## stream / Bun 1.3.14 / bun / primary

Rates: MiB/s. Case keys: mode | bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| base64 / 1048576 /  | 554.3 | 618.6 | 1.011x | 1.009–1.296x |
| native / 1048576 /  | 1111.0 | 1125.8 | 0.989x | 0.988–1.211x |
| native-flow / 1048576 /  | 991.6 | 992.8 | 1.005x | 1.001–1.142x |
| native-flow-transfer / 1048576 /  | 963.7 | 1023.6 | 1.062x | 1.013–1.074x |
| base64 / 4194304 /  | 647.2 | 646.5 | 0.994x | 0.990–1.004x |
| native / 4194304 /  | 1026.2 | 1057.8 | 1.006x | 0.955–1.042x |
| native-flow / 4194304 /  | 1013.1 | 1018.6 | 1.006x | 0.984–1.043x |
| native-flow-transfer / 4194304 /  | 1070.5 | 1057.2 | 0.984x | 0.966–1.052x |

## stream / HeadlessChrome/155.0.8059.79 / chrome / primary

Rates: MiB/s. Case keys: mode | bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| base64 / 1048576 /  | 400.0 | 392.2 | 0.971x | 0.902–1.031x |
| native / 1048576 /  | 506.3 | 493.8 | 0.988x | 0.975–1.012x |
| native-flow / 1048576 /  | 454.5 | 459.8 | 1.000x | 0.989–1.011x |
| native-flow-transfer / 1048576 /  | 506.3 | 493.8 | 0.988x | 0.939–1.000x |
| base64 / 4194304 /  | 448.2 | 446.9 | 0.994x | 0.992–1.028x |
| native / 4194304 /  | 501.6 | 503.1 | 1.000x | 0.979–1.013x |
| native-flow / 4194304 /  | 450.7 | 454.5 | 1.009x | 0.997–1.049x |
| native-flow-transfer / 4194304 /  | 514.5 | 503.1 | 0.975x | 0.948–1.006x |

## rpc / Node v24.15.0 / node / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 107809.2 | 107022.5 | 0.994x | 0.941–1.016x |
| CrossBus + async hooks / 1 / 1024 | 93895.4 | 94027.2 | 1.001x | 0.943–1.046x |
| CrossBus compact wire / 1 / 1024 | 123856.5 | 120626.8 | 1.004x | 0.943–1.017x |
| CrossBus compact + hooks / 1 / 1024 | 107441.0 | 106279.1 | 1.003x | 0.939–1.006x |
| birpc cached / 1 / 1024 | 150851.4 | 150283.0 | 0.998x | 0.933–1.016x |
| Penpal cached + timeout / 1 / 1024 | 130102.1 | 128960.1 | 0.975x | 0.921–1.024x |
| CrossBus / 16 / 1024 | 144687.3 | 142918.2 | 0.999x | 0.964–1.001x |
| CrossBus + async hooks / 16 / 1024 | 125287.9 | 122668.7 | 0.993x | 0.956–0.995x |
| CrossBus compact wire / 16 / 1024 | 173638.1 | 174423.1 | 1.012x | 0.924–1.037x |
| CrossBus compact + hooks / 16 / 1024 | 147138.1 | 143772.7 | 0.999x | 0.959–1.009x |
| birpc cached / 16 / 1024 | 193118.0 | 193229.6 | 1.009x | 0.962–1.019x |
| Penpal cached + timeout / 16 / 1024 | 181259.3 | 178901.1 | 1.001x | 0.987–1.035x |
| CrossBus / 64 / 1024 | 151302.8 | 149185.7 | 0.979x | 0.974–1.030x |
| CrossBus + async hooks / 64 / 1024 | 127343.6 | 128814.8 | 1.018x | 0.976–1.031x |
| CrossBus compact wire / 64 / 1024 | 179038.3 | 170141.2 | 0.950x | 0.883–1.072x |
| CrossBus compact + hooks / 64 / 1024 | 151362.9 | 144178.6 | 0.958x | 0.911–1.067x |
| birpc cached / 64 / 1024 | 201340.3 | 202126.0 | 1.024x | 0.963–1.041x |
| Penpal cached + timeout / 64 / 1024 | 184638.6 | 190848.6 | 1.023x | 0.981–1.036x |

## rpc / Node v24.15.0 / node / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 110745.4 | 111467.7 | 1.033x | 0.973–1.041x |
| CrossBus + async hooks / 1 / 0 | 96780.1 | 96384.6 | 0.996x | 0.937–1.059x |
| CrossBus compact wire / 1 / 0 | 122704.5 | 126684.7 | 1.007x | 0.945–1.039x |
| CrossBus compact + hooks / 1 / 0 | 110233.2 | 108413.1 | 0.983x | 0.971–1.000x |
| birpc cached / 1 / 0 | 149939.6 | 152043.0 | 1.018x | 0.995–1.021x |
| Penpal cached + timeout / 1 / 0 | 130451.1 | 130127.1 | 0.993x | 0.961–1.035x |
| CrossBus / 1 / 65536 | 50087.1 | 49956.9 | 0.994x | 0.983–1.009x |
| CrossBus + async hooks / 1 / 65536 | 46206.9 | 46561.6 | 1.011x | 0.966–1.022x |
| CrossBus compact wire / 1 / 65536 | 52845.2 | 53563.3 | 1.015x | 1.009–1.021x |
| CrossBus compact + hooks / 1 / 65536 | 50096.3 | 50153.3 | 1.001x | 0.994–1.032x |
| birpc cached / 1 / 65536 | 57528.8 | 57347.4 | 0.997x | 0.979–1.005x |
| Penpal cached + timeout / 1 / 65536 | 54773.9 | 53949.0 | 0.974x | 0.961–1.035x |
| CrossBus / 64 / 0 | 154415.0 | 154644.8 | 1.001x | 0.932–1.070x |
| CrossBus + async hooks / 64 / 0 | 134393.1 | 135619.4 | 1.009x | 0.989–1.013x |
| CrossBus compact wire / 64 / 0 | 196829.2 | 199737.5 | 1.015x | 1.003–1.128x |
| CrossBus compact + hooks / 64 / 0 | 160725.1 | 161566.2 | 1.014x | 0.990–1.077x |
| birpc cached / 64 / 0 | 214070.1 | 210780.9 | 0.964x | 0.901–1.011x |
| Penpal cached + timeout / 64 / 0 | 200206.9 | 207437.9 | 1.036x | 0.938–1.074x |
| CrossBus / 64 / 65536 | 42323.4 | 42607.3 | 1.011x | 1.002–1.028x |
| CrossBus + async hooks / 64 / 65536 | 39988.2 | 39797.3 | 1.016x | 0.937–1.025x |
| CrossBus compact wire / 64 / 65536 | 43950.3 | 43148.9 | 1.010x | 0.982–1.029x |
| CrossBus compact + hooks / 64 / 65536 | 40871.8 | 41449.0 | 1.019x | 1.010–1.025x |
| birpc cached / 64 / 65536 | 46949.2 | 46627.3 | 0.993x | 0.980–1.048x |
| Penpal cached + timeout / 64 / 65536 | 45511.8 | 45261.2 | 0.994x | 0.955–1.023x |

## rpc / Bun 1.3.14 / bun / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 88139.0 | 86234.9 | 1.005x | 0.978–1.020x |
| CrossBus + async hooks / 1 / 1024 | 79765.8 | 79699.6 | 0.999x | 0.995–1.020x |
| CrossBus compact wire / 1 / 1024 | 119005.3 | 122545.1 | 1.019x | 0.977–1.030x |
| CrossBus compact + hooks / 1 / 1024 | 104244.7 | 108236.5 | 0.995x | 0.976–1.038x |
| birpc cached / 1 / 1024 | 110960.2 | 111068.8 | 1.012x | 1.001–1.016x |
| Penpal cached + timeout / 1 / 1024 | 97795.1 | 96392.7 | 1.004x | 0.986–1.008x |
| CrossBus / 16 / 1024 | 101721.4 | 101794.6 | 1.001x | 0.997–1.077x |
| CrossBus + async hooks / 16 / 1024 | 91528.0 | 91743.2 | 1.023x | 1.002–1.107x |
| CrossBus compact wire / 16 / 1024 | 177040.7 | 180227.8 | 1.018x | 0.971–1.092x |
| CrossBus compact + hooks / 16 / 1024 | 155714.3 | 161490.1 | 1.037x | 0.983–1.044x |
| birpc cached / 16 / 1024 | 131471.8 | 131399.4 | 0.999x | 0.974–1.037x |
| Penpal cached + timeout / 16 / 1024 | 115956.7 | 118040.2 | 1.021x | 1.009–1.056x |
| CrossBus / 64 / 1024 | 105314.1 | 102819.8 | 1.004x | 0.969–1.060x |
| CrossBus + async hooks / 64 / 1024 | 94052.2 | 94730.0 | 1.019x | 0.967–1.107x |
| CrossBus compact wire / 64 / 1024 | 185938.5 | 187236.4 | 1.007x | 0.947–1.086x |
| CrossBus compact + hooks / 64 / 1024 | 159625.6 | 159569.9 | 1.000x | 0.990–1.085x |
| birpc cached / 64 / 1024 | 136980.6 | 137745.1 | 1.006x | 1.002–1.093x |
| Penpal cached + timeout / 64 / 1024 | 118381.5 | 118433.6 | 1.024x | 0.995–1.047x |

## rpc / Bun 1.3.14 / bun / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 103402.8 | 105617.4 | 1.016x | 1.015–1.021x |
| CrossBus + async hooks / 1 / 0 | 96531.1 | 94764.9 | 0.988x | 0.954–1.033x |
| CrossBus compact wire / 1 / 0 | 140225.6 | 141408.8 | 0.993x | 0.981–1.053x |
| CrossBus compact + hooks / 1 / 0 | 123637.0 | 121818.0 | 0.960x | 0.947–0.985x |
| birpc cached / 1 / 0 | 143708.0 | 146337.1 | 1.018x | 0.995–1.070x |
| Penpal cached + timeout / 1 / 0 | 123568.9 | 126087.0 | 1.020x | 0.972–1.033x |
| CrossBus / 1 / 65536 | 17733.6 | 17445.4 | 0.997x | 0.983–1.010x |
| CrossBus + async hooks / 1 / 65536 | 17157.1 | 16881.5 | 0.991x | 0.972–0.993x |
| CrossBus compact wire / 1 / 65536 | 24108.7 | 24079.4 | 1.005x | 0.999–1.042x |
| CrossBus compact + hooks / 1 / 65536 | 23439.2 | 23513.0 | 1.003x | 1.003–1.011x |
| birpc cached / 1 / 65536 | 18339.6 | 18360.8 | 1.015x | 0.990–1.028x |
| Penpal cached + timeout / 1 / 65536 | 18361.6 | 18218.1 | 0.996x | 0.988–1.000x |
| CrossBus / 64 / 0 | 139223.8 | 136018.7 | 0.989x | 0.922–1.007x |
| CrossBus + async hooks / 64 / 0 | 119100.1 | 119029.1 | 0.975x | 0.972–1.010x |
| CrossBus compact wire / 64 / 0 | 211793.6 | 193032.3 | 0.948x | 0.904–1.036x |
| CrossBus compact + hooks / 64 / 0 | 172701.3 | 165118.0 | 0.999x | 0.943–1.035x |
| birpc cached / 64 / 0 | 199039.5 | 197538.0 | 0.980x | 0.946–1.039x |
| Penpal cached + timeout / 64 / 0 | 175938.1 | 171043.2 | 0.973x | 0.959–0.983x |
| CrossBus / 64 / 65536 | 12001.6 | 12002.2 | 0.998x | 0.994–1.000x |
| CrossBus + async hooks / 64 / 65536 | 11819.1 | 11761.8 | 0.995x | 0.983–0.997x |
| CrossBus compact wire / 64 / 65536 | 103122.3 | 112316.6 | 0.986x | 0.950–1.105x |
| CrossBus compact + hooks / 64 / 65536 | 95553.8 | 103668.2 | 1.085x | 1.017–1.111x |
| birpc cached / 64 / 65536 | 12247.0 | 12261.2 | 1.001x | 0.998–1.010x |
| Penpal cached + timeout / 64 / 65536 | 12171.8 | 12184.5 | 1.003x | 0.995–1.009x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 76133.8 | 74744.5 | 0.971x | 0.954–1.025x |
| CrossBus + async hooks / 1 / 1024 | 68609.7 | 68609.7 | 0.990x | 0.969–1.010x |
| CrossBus compact wire / 1 / 1024 | 79226.3 | 80156.6 | 0.994x | 0.985–1.027x |
| CrossBus compact + hooks / 1 / 1024 | 70257.3 | 68956.2 | 0.993x | 0.953–1.022x |
| birpc cached / 1 / 1024 | 105295.6 | 100392.2 | 0.992x | 0.917–1.037x |
| Penpal cached + timeout / 1 / 1024 | 89432.3 | 90619.5 | 1.022x | 0.978–1.130x |
| CrossBus / 16 / 1024 | 91838.6 | 91838.6 | 1.000x | 0.998–1.009x |
| CrossBus + async hooks / 16 / 1024 | 80313.7 | 80313.7 | 0.998x | 0.996–1.012x |
| CrossBus compact wire / 16 / 1024 | 97061.6 | 96832.2 | 0.998x | 0.991–1.014x |
| CrossBus compact + hooks / 16 / 1024 | 85511.5 | 84979.3 | 0.990x | 0.972–1.004x |
| birpc cached / 16 / 1024 | 109226.7 | 110107.5 | 1.008x | 1.005–1.013x |
| Penpal cached + timeout / 16 / 1024 | 99659.4 | 99417.5 | 0.998x | 0.993–1.005x |
| CrossBus / 64 / 1024 | 89628.0 | 88850.3 | 0.974x | 0.961–1.045x |
| CrossBus + async hooks / 64 / 1024 | 80629.9 | 79073.4 | 0.994x | 0.979–1.004x |
| CrossBus compact wire / 64 / 1024 | 94377.9 | 94814.8 | 1.005x | 0.998–1.021x |
| CrossBus compact + hooks / 64 / 1024 | 83083.2 | 83934.4 | 0.998x | 0.985–1.010x |
| birpc cached / 64 / 1024 | 106389.6 | 105839.8 | 1.029x | 0.925–1.034x |
| Penpal cached + timeout / 64 / 1024 | 99176.8 | 98937.2 | 0.991x | 0.983–1.020x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 80629.9 | 80313.7 | 0.996x | 0.996–0.996x |
| CrossBus + async hooks / 1 / 0 | 73142.9 | 72882.6 | 1.014x | 0.968–1.110x |
| CrossBus compact wire / 1 / 0 | 79688.7 | 80629.9 | 0.996x | 0.988–1.016x |
| CrossBus compact + hooks / 1 / 0 | 70378.0 | 70620.7 | 1.004x | 0.990–1.024x |
| birpc cached / 1 / 0 | 107225.1 | 105567.0 | 0.974x | 0.965–0.990x |
| Penpal cached + timeout / 1 / 0 | 97523.8 | 96603.8 | 0.991x | 0.991–0.995x |
| CrossBus / 1 / 65536 | 18858.2 | 19140.2 | 1.015x | 1.005–1.027x |
| CrossBus + async hooks / 1 / 65536 | 18467.1 | 18500.5 | 1.005x | 0.989–1.005x |
| CrossBus compact wire / 1 / 65536 | 18483.8 | 18302.1 | 0.986x | 0.985–0.996x |
| CrossBus compact + hooks / 1 / 65536 | 17355.9 | 17808.7 | 1.033x | 1.019–1.035x |
| birpc cached / 1 / 65536 | 19523.4 | 19412.3 | 0.991x | 0.970–1.019x |
| Penpal cached + timeout / 1 / 65536 | 19749.3 | 19393.9 | 0.977x | 0.976–1.005x |
| CrossBus / 64 / 0 | 94814.8 | 105025.6 | 1.108x | 0.980–1.108x |
| CrossBus + async hooks / 64 / 0 | 89043.5 | 91428.6 | 1.014x | 0.979–1.067x |
| CrossBus compact wire / 64 / 0 | 113777.8 | 109518.7 | 0.973x | 0.909–1.011x |
| CrossBus compact + hooks / 64 / 0 | 93945.0 | 98937.2 | 1.028x | 0.995–1.088x |
| birpc cached / 64 / 0 | 119069.8 | 121183.4 | 1.018x | 0.898–1.107x |
| Penpal cached + timeout / 64 / 0 | 110702.7 | 109518.7 | 0.984x | 0.954–1.005x |
| CrossBus / 64 / 65536 | 19711.3 | 19749.3 | 1.006x | 0.971–1.016x |
| CrossBus + async hooks / 64 / 65536 | 19266.2 | 19284.4 | 0.998x | 0.998–1.014x |
| CrossBus compact wire / 64 / 65536 | 18963.0 | 19194.0 | 1.010x | 1.000–1.012x |
| CrossBus compact + hooks / 64 / 65536 | 18618.2 | 18351.3 | 0.986x | 0.961–1.004x |
| birpc cached / 64 / 65536 | 20157.5 | 20197.2 | 0.992x | 0.983–1.004x |
| Penpal cached + timeout / 64 / 65536 | 20217.2 | 20157.5 | 1.001x | 0.994–1.025x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome-worker / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 37406.4 | 37996.3 | 1.019x | 0.980–1.070x |
| CrossBus + async hooks / 1 / 1024 | 34247.5 | 35371.3 | 1.033x | 1.024–1.085x |
| CrossBus compact wire / 1 / 1024 | 37034.4 | 37612.5 | 1.012x | 1.003–1.033x |
| CrossBus compact + hooks / 1 / 1024 | 34104.9 | 35189.0 | 1.032x | 0.996–1.059x |
| birpc cached / 1 / 1024 | 47627.9 | 47407.4 | 0.995x | 0.976–1.089x |
| Penpal cached + timeout / 1 / 1024 | 41001.0 | 43298.1 | 1.042x | 1.009–1.111x |
| CrossBus / 16 / 1024 | 119416.9 | 115380.3 | 0.966x | 0.816–1.017x |
| CrossBus + async hooks / 16 / 1024 | 97990.4 | 99417.5 | 1.002x | 1.000–1.015x |
| CrossBus compact wire / 16 / 1024 | 114094.7 | 110702.7 | 0.930x | 0.916–1.046x |
| CrossBus compact + hooks / 16 / 1024 | 105025.6 | 101637.7 | 0.995x | 0.940–1.057x |
| birpc cached / 16 / 1024 | 138378.4 | 147338.1 | 1.032x | 0.934–1.065x |
| Penpal cached + timeout / 16 / 1024 | 138847.5 | 132129.0 | 0.952x | 0.875–1.023x |
| CrossBus / 64 / 1024 | 139319.7 | 128000.0 | 0.900x | 0.870–1.042x |
| CrossBus + async hooks / 64 / 1024 | 126030.8 | 128000.0 | 1.039x | 0.939–1.097x |
| CrossBus compact wire / 64 / 1024 | 136990.0 | 141241.4 | 0.957x | 0.920–1.055x |
| CrossBus compact + hooks / 64 / 1024 | 116695.2 | 115056.2 | 1.028x | 0.986–1.042x |
| birpc cached / 64 / 1024 | 156934.9 | 162539.7 | 0.967x | 0.964–1.040x |
| Penpal cached + timeout / 64 / 1024 | 150036.6 | 138847.5 | 0.925x | 0.919–0.961x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome-worker / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 37236.4 | 37647.1 | 1.018x | 0.993–1.020x |
| CrossBus + async hooks / 1 / 0 | 35493.9 | 35617.4 | 1.009x | 0.993–1.053x |
| CrossBus compact wire / 1 / 0 | 37372.3 | 37716.4 | 1.024x | 0.982–1.066x |
| CrossBus compact + hooks / 1 / 0 | 35493.9 | 35804.2 | 1.009x | 0.988–1.067x |
| birpc cached / 1 / 0 | 48301.9 | 49588.4 | 1.027x | 1.007–1.075x |
| Penpal cached + timeout / 1 / 0 | 45011.0 | 45209.7 | 1.027x | 0.980–1.066x |
| CrossBus / 1 / 65536 | 16609.9 | 16502.8 | 0.998x | 0.978–1.000x |
| CrossBus + async hooks / 1 / 65536 | 16228.2 | 16012.5 | 0.982x | 0.971–1.047x |
| CrossBus compact wire / 1 / 65536 | 11907.0 | 15657.5 | 0.995x | 0.985–1.353x |
| CrossBus compact + hooks / 1 / 65536 | 15375.4 | 15272.2 | 0.993x | 0.746–1.005x |
| birpc cached / 1 / 65536 | 16202.5 | 17210.1 | 1.028x | 0.995–1.445x |
| Penpal cached + timeout / 1 / 65536 | 16967.7 | 16842.1 | 0.998x | 0.720–1.002x |
| CrossBus / 64 / 0 | 145248.2 | 153985.0 | 1.061x | 1.060–1.067x |
| CrossBus + async hooks / 64 / 0 | 129620.3 | 133856.2 | 1.039x | 1.013–1.072x |
| CrossBus compact wire / 64 / 0 | 163840.0 | 165161.3 | 0.992x | 0.940–1.008x |
| CrossBus compact + hooks / 64 / 0 | 136533.3 | 141241.4 | 1.034x | 0.974–1.084x |
| birpc cached / 64 / 0 | 186181.8 | 175042.7 | 0.940x | 0.932–0.966x |
| Penpal cached + timeout / 64 / 0 | 166504.1 | 162539.7 | 0.976x | 0.883–1.190x |
| CrossBus / 64 / 65536 | 28967.5 | 28603.4 | 0.994x | 0.983–1.020x |
| CrossBus + async hooks / 64 / 65536 | 27234.0 | 27978.1 | 1.027x | 0.978–1.053x |
| CrossBus compact wire / 64 / 65536 | 27197.9 | 27453.1 | 1.009x | 0.965–1.010x |
| CrossBus compact + hooks / 64 / 65536 | 26056.0 | 26290.1 | 1.009x | 0.951–1.030x |
| birpc cached / 64 / 65536 | 28444.4 | 29215.4 | 1.043x | 1.027–1.045x |
| Penpal cached + timeout / 64 / 65536 | 30521.6 | 29008.5 | 0.946x | 0.946–1.019x |

## Longer RPC follow-up / Node v24.15.0 / node

1 KiB, concurrency 64, warmup 8,192, nine samples of 16,384 calls, three fresh-process triples. All ratios are medians of paired process ratios.

| Case | Candidate / 0.1.5 | Stream-only / 0.1.5 | Candidate / stream-only | Candidate ratios |
|---|---:|---:|---:|---|
| CrossBus / 64 / 1024 | 0.997x | 1.012x | 0.990x | 0.997, 0.990, 1.002 |
| CrossBus + async hooks / 64 / 1024 | 0.995x | 1.006x | 0.989x | 1.005, 0.972, 0.995 |
| CrossBus compact wire / 64 / 1024 | 1.028x | 1.035x | 0.994x | 1.052, 1.028, 0.996 |
| CrossBus compact + hooks / 64 / 1024 | 1.007x | 1.015x | 0.995x | 1.059, 0.962, 1.007 |
| birpc cached / 64 / 1024 | 0.998x | 1.015x | 0.989x | 0.998, 0.968, 1.004 |
| Penpal cached + timeout / 64 / 1024 | 1.005x | 0.991x | 0.990x | 1.005, 1.011, 0.981 |

## Longer RPC follow-up / HeadlessChrome/155.0.8059.79 / chrome-worker

1 KiB, concurrency 64, warmup 8,192, nine samples of 16,384 calls, three fresh-process triples. All ratios are medians of paired process ratios.

| Case | Candidate / 0.1.5 | Stream-only / 0.1.5 | Candidate / stream-only | Candidate ratios |
|---|---:|---:|---:|---|
| CrossBus / 64 / 1024 | 1.004x | 0.997x | 1.005x | 0.991, 1.004, 1.040 |
| CrossBus + async hooks / 64 / 1024 | 0.955x | 0.993x | 0.957x | 0.961, 0.955, 0.945 |
| CrossBus compact wire / 64 / 1024 | 1.066x | 1.096x | 0.984x | 1.065, 1.079, 1.066 |
| CrossBus compact + hooks / 64 / 1024 | 1.025x | 0.977x | 1.060x | 1.057, 1.025, 0.955 |
| birpc cached / 64 / 1024 | 0.963x | 0.983x | 0.980x | 0.995, 0.955, 0.963 |
| Penpal cached + timeout / 64 / 1024 | 1.024x | 1.018x | 1.000x | 1.018, 1.024, 1.039 |
