# 0.1.6 development comparison against published 0.1.5

Three alternating fresh-process pairs; medians of process medians and paired ratios. Observed ratio ranges are not confidence intervals. Streaming includes full receiver validation. RPC semantics differ across libraries; controls are not exact substitutes.

72 datasets; 34,560,000 checked RPC calls; 4,320 checked stream transfers.

## stream / Node v24.15.0 / node / primary

Rates: MiB/s. Case keys: mode | bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| base64 / 1048576 /  | 59.7 | 185.9 | 3.163x | 3.051–3.176x |
| native / 1048576 /  | 203.0 | 205.7 | 1.022x | 0.999–1.024x |
| native-flow / 1048576 /  | 179.1 | 187.0 | 1.044x | 1.020–1.111x |
| native-flow-transfer / 1048576 /  | 188.8 | 191.3 | 1.013x | 1.012–1.082x |
| base64 / 4194304 /  | 65.0 | 185.4 | 2.854x | 2.841–2.874x |
| native / 4194304 /  | 206.4 | 200.9 | 0.973x | 0.963–0.996x |
| native-flow / 4194304 /  | 191.5 | 191.3 | 0.999x | 0.981–1.016x |
| native-flow-transfer / 4194304 /  | 200.1 | 201.6 | 1.006x | 1.001–1.008x |

## stream / Bun 1.3.14 / bun / primary

Rates: MiB/s. Case keys: mode | bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| base64 / 1048576 /  | 436.6 | 478.8 | 1.019x | 0.996–1.144x |
| native / 1048576 /  | 840.8 | 853.5 | 1.024x | 1.015–1.231x |
| native-flow / 1048576 /  | 765.0 | 756.8 | 0.989x | 0.957–1.087x |
| native-flow-transfer / 1048576 /  | 778.4 | 825.5 | 1.021x | 0.966–1.107x |
| base64 / 4194304 /  | 492.8 | 500.4 | 0.994x | 0.990–1.022x |
| native / 4194304 /  | 853.9 | 837.6 | 0.982x | 0.972–1.060x |
| native-flow / 4194304 /  | 785.9 | 771.6 | 0.974x | 0.966–1.017x |
| native-flow-transfer / 4194304 /  | 820.2 | 886.3 | 1.081x | 0.982–1.114x |

## stream / HeadlessChrome/155.0.8059.79 / chrome / primary

Rates: MiB/s. Case keys: mode | bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| base64 / 1048576 /  | 322.6 | 317.5 | 0.984x | 0.898–1.008x |
| native / 1048576 /  | 392.2 | 392.2 | 1.000x | 0.990–1.010x |
| native-flow / 1048576 /  | 357.1 | 354.0 | 0.991x | 0.991–1.000x |
| native-flow-transfer / 1048576 /  | 392.2 | 396.0 | 1.010x | 1.000–1.010x |
| base64 / 4194304 /  | 348.6 | 356.3 | 1.000x | 0.996–1.034x |
| native / 4194304 /  | 393.1 | 390.2 | 0.976x | 0.971–1.029x |
| native-flow / 4194304 /  | 362.8 | 359.6 | 1.007x | 0.978–1.018x |
| native-flow-transfer / 4194304 /  | 398.0 | 386.5 | 0.961x | 0.944–0.983x |

## rpc / Node v24.15.0 / node / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 86790.4 | 86170.3 | 1.007x | 0.992–1.012x |
| CrossBus + async hooks / 1 / 1024 | 76692.2 | 77097.0 | 0.995x | 0.987–1.015x |
| CrossBus compact wire / 1 / 1024 | 99543.5 | 97565.0 | 0.983x | 0.954–0.996x |
| CrossBus compact + hooks / 1 / 1024 | 87891.0 | 84963.8 | 0.974x | 0.965–0.996x |
| birpc cached / 1 / 1024 | 122391.7 | 122902.1 | 0.993x | 0.965–1.004x |
| Penpal cached + timeout / 1 / 1024 | 106549.9 | 106249.3 | 0.987x | 0.986–1.034x |
| CrossBus / 16 / 1024 | 113697.8 | 115501.7 | 1.013x | 0.973–1.045x |
| CrossBus + async hooks / 16 / 1024 | 99432.8 | 100185.9 | 1.008x | 0.994–1.014x |
| CrossBus compact wire / 16 / 1024 | 140075.9 | 141897.7 | 1.013x | 0.967–1.124x |
| CrossBus compact + hooks / 16 / 1024 | 118075.9 | 119206.5 | 0.989x | 0.945–1.058x |
| birpc cached / 16 / 1024 | 155080.3 | 159223.8 | 1.034x | 1.005–1.038x |
| Penpal cached + timeout / 16 / 1024 | 146221.1 | 144489.7 | 0.992x | 0.979–0.995x |
| CrossBus / 64 / 1024 | 120292.8 | 119167.1 | 1.000x | 0.989–1.012x |
| CrossBus + async hooks / 64 / 1024 | 102834.4 | 103062.2 | 0.997x | 0.982–1.029x |
| CrossBus compact wire / 64 / 1024 | 148184.5 | 150238.2 | 1.014x | 1.014–1.019x |
| CrossBus compact + hooks / 64 / 1024 | 122683.6 | 120677.9 | 0.984x | 0.968–1.004x |
| birpc cached / 64 / 1024 | 163073.3 | 163223.0 | 1.001x | 0.995–1.045x |
| Penpal cached + timeout / 64 / 1024 | 151814.1 | 152157.4 | 1.002x | 0.993–1.045x |

## rpc / Node v24.15.0 / node / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 89555.5 | 87209.2 | 0.982x | 0.973–1.051x |
| CrossBus + async hooks / 1 / 0 | 76680.8 | 75604.0 | 0.986x | 0.923–1.062x |
| CrossBus compact wire / 1 / 0 | 97159.7 | 99910.4 | 1.016x | 1.006–1.028x |
| CrossBus compact + hooks / 1 / 0 | 88018.8 | 84771.9 | 0.972x | 0.963–1.043x |
| birpc cached / 1 / 0 | 119633.7 | 116505.4 | 0.974x | 0.973–1.026x |
| Penpal cached + timeout / 1 / 0 | 102787.2 | 100443.0 | 0.982x | 0.969–1.063x |
| CrossBus / 1 / 65536 | 40541.8 | 39558.7 | 0.976x | 0.948–1.020x |
| CrossBus + async hooks / 1 / 65536 | 37927.8 | 37032.5 | 0.976x | 0.933–1.018x |
| CrossBus compact wire / 1 / 65536 | 43581.2 | 41957.0 | 0.965x | 0.960–1.025x |
| CrossBus compact + hooks / 1 / 65536 | 39850.6 | 39351.9 | 0.992x | 0.984–1.007x |
| birpc cached / 1 / 65536 | 46132.0 | 45310.8 | 0.983x | 0.973–0.988x |
| Penpal cached + timeout / 1 / 65536 | 43472.9 | 42646.8 | 0.998x | 0.950–1.014x |
| CrossBus / 64 / 0 | 127419.3 | 124384.1 | 0.976x | 0.918–1.010x |
| CrossBus + async hooks / 64 / 0 | 105008.1 | 105537.5 | 0.993x | 0.991–1.064x |
| CrossBus compact wire / 64 / 0 | 151828.8 | 146332.7 | 1.000x | 0.961–1.047x |
| CrossBus compact + hooks / 64 / 0 | 128293.0 | 122698.1 | 1.004x | 0.928–1.076x |
| birpc cached / 64 / 0 | 172904.2 | 166611.3 | 0.964x | 0.930–0.987x |
| Penpal cached + timeout / 64 / 0 | 157624.3 | 159977.6 | 1.009x | 0.999–1.015x |
| CrossBus / 64 / 65536 | 35904.7 | 36182.4 | 1.012x | 0.995–1.013x |
| CrossBus + async hooks / 64 / 65536 | 34023.0 | 34534.9 | 1.015x | 0.952–1.084x |
| CrossBus compact wire / 64 / 65536 | 37447.7 | 37327.8 | 0.997x | 0.957–1.007x |
| CrossBus compact + hooks / 64 / 65536 | 34886.9 | 34715.2 | 0.995x | 0.949–1.025x |
| birpc cached / 64 / 65536 | 39888.2 | 39880.6 | 0.998x | 0.978–1.015x |
| Penpal cached + timeout / 64 / 65536 | 39084.2 | 39385.2 | 1.008x | 0.957–1.040x |

## rpc / Bun 1.3.14 / bun / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 68633.0 | 68310.5 | 0.995x | 0.884–1.128x |
| CrossBus + async hooks / 1 / 1024 | 62997.5 | 62017.7 | 0.984x | 0.939–1.133x |
| CrossBus compact wire / 1 / 1024 | 92486.2 | 98030.7 | 1.005x | 0.955–1.092x |
| CrossBus compact + hooks / 1 / 1024 | 83286.5 | 86789.8 | 1.012x | 0.944–1.083x |
| birpc cached / 1 / 1024 | 88614.7 | 86913.7 | 0.980x | 0.941–1.089x |
| Penpal cached + timeout / 1 / 1024 | 77385.7 | 75285.4 | 0.973x | 0.907–1.116x |
| CrossBus / 16 / 1024 | 80687.1 | 80854.3 | 1.002x | 0.931–1.010x |
| CrossBus + async hooks / 16 / 1024 | 73713.7 | 73994.3 | 0.989x | 0.941–1.004x |
| CrossBus compact wire / 16 / 1024 | 144820.9 | 146553.1 | 0.995x | 0.960–1.012x |
| CrossBus compact + hooks / 16 / 1024 | 127891.6 | 124759.0 | 0.968x | 0.943–0.976x |
| birpc cached / 16 / 1024 | 106358.4 | 106782.4 | 1.004x | 1.000–1.006x |
| Penpal cached + timeout / 16 / 1024 | 93964.0 | 90909.5 | 0.970x | 0.967–0.980x |
| CrossBus / 64 / 1024 | 80965.5 | 80954.9 | 0.992x | 0.928–1.001x |
| CrossBus + async hooks / 64 / 1024 | 76242.5 | 73815.9 | 0.967x | 0.949–1.019x |
| CrossBus compact wire / 64 / 1024 | 148345.6 | 150690.3 | 0.994x | 0.983–1.016x |
| CrossBus compact + hooks / 64 / 1024 | 130298.9 | 126767.0 | 0.973x | 0.945–0.977x |
| birpc cached / 64 / 1024 | 108046.4 | 107426.7 | 0.994x | 0.966–1.007x |
| Penpal cached + timeout / 64 / 1024 | 96710.7 | 95007.4 | 0.982x | 0.966–0.994x |

## rpc / Bun 1.3.14 / bun / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 84472.3 | 81068.1 | 0.960x | 0.949–0.972x |
| CrossBus + async hooks / 1 / 0 | 75012.0 | 74016.6 | 0.961x | 0.949–1.007x |
| CrossBus compact wire / 1 / 0 | 106471.9 | 104705.0 | 0.961x | 0.953–0.983x |
| CrossBus compact + hooks / 1 / 0 | 96873.2 | 95924.1 | 0.965x | 0.954–0.993x |
| birpc cached / 1 / 0 | 119767.8 | 111793.7 | 0.963x | 0.932–1.005x |
| Penpal cached + timeout / 1 / 0 | 98062.6 | 96197.7 | 0.989x | 0.962–1.013x |
| CrossBus / 1 / 65536 | 14078.3 | 14068.8 | 0.998x | 0.996–1.006x |
| CrossBus + async hooks / 1 / 65536 | 13538.3 | 13829.9 | 1.003x | 1.002–1.024x |
| CrossBus compact wire / 1 / 65536 | 18828.7 | 18858.0 | 1.001x | 0.969–1.002x |
| CrossBus compact + hooks / 1 / 65536 | 18378.1 | 18319.9 | 0.994x | 0.987–0.997x |
| birpc cached / 1 / 65536 | 14780.3 | 14642.0 | 0.997x | 0.991–1.000x |
| Penpal cached + timeout / 1 / 65536 | 14484.5 | 14396.5 | 0.998x | 0.991–1.005x |
| CrossBus / 64 / 0 | 111593.9 | 104565.4 | 0.942x | 0.923–0.980x |
| CrossBus + async hooks / 64 / 0 | 100409.2 | 97237.1 | 0.966x | 0.937–0.969x |
| CrossBus compact wire / 64 / 0 | 157305.5 | 157952.1 | 1.000x | 0.952–1.009x |
| CrossBus compact + hooks / 64 / 0 | 138805.5 | 125174.1 | 0.902x | 0.885–0.920x |
| birpc cached / 64 / 0 | 164074.1 | 160680.5 | 0.979x | 0.960–0.984x |
| Penpal cached + timeout / 64 / 0 | 131842.0 | 135985.2 | 1.026x | 0.991–1.084x |
| CrossBus / 64 / 65536 | 9483.1 | 9565.0 | 1.008x | 1.000–1.011x |
| CrossBus + async hooks / 64 / 65536 | 9401.8 | 9408.0 | 0.999x | 0.996–1.001x |
| CrossBus compact wire / 64 / 65536 | 88145.3 | 86425.1 | 0.980x | 0.975–1.008x |
| CrossBus compact + hooks / 64 / 65536 | 79105.3 | 78982.3 | 0.978x | 0.977–1.022x |
| birpc cached / 64 / 65536 | 9710.4 | 9710.6 | 1.000x | 0.989–1.001x |
| Penpal cached + timeout / 64 / 65536 | 9743.2 | 9666.1 | 0.993x | 0.981–0.997x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 59708.5 | 60591.7 | 1.015x | 1.006–1.038x |
| CrossBus + async hooks / 1 / 1024 | 54832.7 | 55053.8 | 1.007x | 0.997–1.024x |
| CrossBus compact wire / 1 / 1024 | 60681.5 | 61873.1 | 1.000x | 0.984–1.037x |
| CrossBus compact + hooks / 1 / 1024 | 53823.9 | 53823.9 | 1.000x | 0.984–1.022x |
| birpc cached / 1 / 1024 | 76275.6 | 78317.4 | 1.004x | 1.000–1.034x |
| Penpal cached + timeout / 1 / 1024 | 68724.8 | 67257.8 | 0.979x | 0.974–1.047x |
| CrossBus / 16 / 1024 | 71358.9 | 72367.5 | 1.016x | 0.997–1.020x |
| CrossBus + async hooks / 16 / 1024 | 62630.0 | 62918.6 | 1.006x | 0.997–1.032x |
| CrossBus compact wire / 16 / 1024 | 75156.0 | 76275.6 | 1.015x | 0.982–1.049x |
| CrossBus compact + hooks / 16 / 1024 | 67037.6 | 66710.1 | 1.000x | 0.995–1.011x |
| birpc cached / 16 / 1024 | 85155.9 | 83934.4 | 0.996x | 0.984–0.998x |
| Penpal cached + timeout / 16 / 1024 | 75851.9 | 74068.7 | 0.986x | 0.941–1.047x |
| CrossBus / 64 / 1024 | 70742.7 | 70017.1 | 0.986x | 0.985–1.046x |
| CrossBus + async hooks / 64 / 1024 | 63209.9 | 63307.6 | 1.011x | 0.997–1.012x |
| CrossBus compact wire / 64 / 1024 | 75851.9 | 75018.3 | 0.991x | 0.984–1.015x |
| CrossBus compact + hooks / 64 / 1024 | 65641.0 | 67590.8 | 1.028x | 1.010–1.035x |
| birpc cached / 64 / 1024 | 83762.8 | 83934.4 | 1.002x | 0.988–1.012x |
| Penpal cached + timeout / 64 / 1024 | 77429.1 | 78467.4 | 1.010x | 1.004–1.015x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 63015.4 | 63405.6 | 1.006x | 0.994–1.006x |
| CrossBus + async hooks / 1 / 0 | 55501.4 | 56418.7 | 1.000x | 0.994–1.017x |
| CrossBus compact wire / 1 / 0 | 63209.9 | 63015.4 | 0.994x | 0.988–0.997x |
| CrossBus compact + hooks / 1 / 0 | 56109.6 | 56888.9 | 1.020x | 0.989–1.025x |
| birpc cached / 1 / 0 | 82915.0 | 83934.4 | 1.012x | 1.004–1.017x |
| Penpal cached + timeout / 1 / 0 | 75851.9 | 74744.5 | 0.996x | 0.971–1.011x |
| CrossBus / 1 / 65536 | 16176.9 | 16202.5 | 0.986x | 0.982–1.004x |
| CrossBus + async hooks / 1 / 65536 | 15693.5 | 15669.5 | 0.985x | 0.981–1.030x |
| CrossBus compact wire / 1 / 65536 | 15550.5 | 15295.0 | 0.996x | 0.963–1.004x |
| CrossBus compact + hooks / 1 / 65536 | 14938.0 | 14862.1 | 0.999x | 0.976–1.000x |
| birpc cached / 1 / 65536 | 16542.8 | 16677.5 | 1.008x | 1.002–1.018x |
| Penpal cached + timeout / 1 / 65536 | 16828.3 | 16449.8 | 0.979x | 0.978–0.993x |
| CrossBus / 64 / 0 | 80629.9 | 79688.7 | 1.000x | 0.944–1.008x |
| CrossBus + async hooks / 64 / 0 | 66064.5 | 71859.6 | 1.084x | 1.067–1.114x |
| CrossBus compact wire / 64 / 0 | 86779.7 | 86413.5 | 1.004x | 0.932–1.017x |
| CrossBus compact + hooks / 64 / 0 | 74202.9 | 77575.8 | 1.049x | 1.042–1.063x |
| birpc cached / 64 / 0 | 95255.8 | 96150.2 | 1.009x | 0.991–1.061x |
| Penpal cached + timeout / 64 / 0 | 86413.5 | 86413.5 | 1.000x | 0.925–1.030x |
| CrossBus / 64 / 65536 | 16869.9 | 16650.4 | 0.988x | 0.987–0.997x |
| CrossBus + async hooks / 64 / 65536 | 16370.9 | 16623.4 | 1.020x | 0.972–1.034x |
| CrossBus compact wire / 64 / 65536 | 16423.4 | 16423.4 | 0.990x | 0.972–1.007x |
| CrossBus compact + hooks / 64 / 65536 | 16000.0 | 15913.0 | 0.995x | 0.976–0.995x |
| birpc cached / 64 / 65536 | 17534.2 | 17504.3 | 1.006x | 0.985–1.014x |
| Penpal cached + timeout / 64 / 65536 | 17549.3 | 17152.4 | 0.976x | 0.973–0.997x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome-worker / primary

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 1024 | 35098.5 | 35648.4 | 1.009x | 0.988–1.019x |
| CrossBus + async hooks / 1 / 1024 | 32025.0 | 31172.0 | 0.957x | 0.955–0.991x |
| CrossBus compact wire / 1 / 1024 | 34770.8 | 35249.6 | 1.014x | 1.002–1.018x |
| CrossBus compact + hooks / 1 / 1024 | 32050.1 | 32226.6 | 1.012x | 0.986–1.016x |
| birpc cached / 1 / 1024 | 42800.4 | 43298.1 | 0.993x | 0.979–1.012x |
| Penpal cached + timeout / 1 / 1024 | 40394.5 | 39961.0 | 0.989x | 0.973–1.006x |
| CrossBus / 16 / 1024 | 103434.3 | 103959.4 | 0.979x | 0.961–1.013x |
| CrossBus + async hooks / 16 / 1024 | 90820.4 | 90419.4 | 0.956x | 0.932–0.996x |
| CrossBus compact wire / 16 / 1024 | 103173.8 | 102400.0 | 0.988x | 0.971–1.059x |
| CrossBus compact + hooks / 16 / 1024 | 89043.5 | 91224.9 | 1.018x | 0.940–1.050x |
| birpc cached / 16 / 1024 | 130862.6 | 118724.6 | 0.930x | 0.826–0.971x |
| Penpal cached + timeout / 16 / 1024 | 113462.6 | 113777.8 | 1.003x | 0.973–1.036x |
| CrossBus / 64 / 1024 | 121543.0 | 120826.0 | 1.000x | 0.991–1.015x |
| CrossBus + async hooks / 64 / 1024 | 99417.5 | 101890.5 | 1.025x | 0.967–1.081x |
| CrossBus compact wire / 64 / 1024 | 120470.6 | 120117.3 | 1.035x | 0.951–1.115x |
| CrossBus compact + hooks / 64 / 1024 | 112837.5 | 106389.6 | 0.971x | 0.869–0.997x |
| birpc cached / 64 / 1024 | 132987.0 | 134295.1 | 1.051x | 0.974–1.119x |
| Penpal cached + timeout / 64 / 1024 | 122634.7 | 121543.0 | 0.994x | 0.985–1.021x |

## rpc / HeadlessChrome/155.0.8059.79 / chrome-worker / guard

Rates: calls/s. Case keys: library | concurrency | text bytes.

| Case | 0.1.5 | Candidate | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 1 / 0 | 32100.3 | 34190.3 | 1.035x | 1.032–1.159x |
| CrossBus + async hooks / 1 / 0 | 30340.7 | 31950.1 | 1.055x | 1.053–1.116x |
| CrossBus compact wire / 1 / 0 | 32768.0 | 34190.3 | 1.028x | 1.010–1.120x |
| CrossBus compact + hooks / 1 / 0 | 30073.4 | 32201.3 | 1.048x | 1.014–1.099x |
| birpc cached / 1 / 0 | 41967.2 | 43760.7 | 1.070x | 0.991–1.115x |
| Penpal cached + timeout / 1 / 0 | 39536.7 | 40960.0 | 1.032x | 1.006–1.147x |
| CrossBus / 1 / 65536 | 14660.0 | 15058.8 | 1.017x | 0.993–1.055x |
| CrossBus + async hooks / 1 / 65536 | 13735.7 | 14412.4 | 1.054x | 0.997–1.063x |
| CrossBus compact wire / 1 / 65536 | 13617.0 | 14173.0 | 1.036x | 0.990–1.042x |
| CrossBus compact + hooks / 1 / 65536 | 13333.3 | 13580.9 | 1.022x | 0.991–1.044x |
| birpc cached / 1 / 65536 | 15159.1 | 15851.4 | 1.055x | 1.000–1.058x |
| Penpal cached + timeout / 1 / 65536 | 15181.6 | 15597.9 | 1.032x | 1.008–1.065x |
| CrossBus / 64 / 0 | 126419.8 | 128805.0 | 1.013x | 0.926–1.019x |
| CrossBus + async hooks / 64 / 0 | 107789.5 | 111304.3 | 1.033x | 1.011–1.071x |
| CrossBus compact wire / 64 / 0 | 135629.1 | 135629.1 | 1.000x | 0.942–1.047x |
| CrossBus compact + hooks / 64 / 0 | 109518.7 | 115706.2 | 1.011x | 1.011–1.056x |
| birpc cached / 64 / 0 | 148405.8 | 149489.1 | 0.993x | 0.985–1.022x |
| Penpal cached + timeout / 64 / 0 | 135629.1 | 137449.7 | 1.013x | 1.000–1.174x |
| CrossBus / 64 / 65536 | 25761.0 | 25441.0 | 0.988x | 0.938–1.067x |
| CrossBus + async hooks / 64 / 65536 | 24439.1 | 24122.5 | 0.984x | 0.967–1.026x |
| CrossBus compact wire / 64 / 65536 | 23621.7 | 24150.9 | 1.022x | 1.008–1.045x |
| CrossBus compact + hooks / 64 / 65536 | 22831.7 | 22959.6 | 1.006x | 0.985–1.018x |
| birpc cached / 64 / 65536 | 25664.2 | 25472.6 | 0.984x | 0.970–1.009x |
| Penpal cached + timeout / 64 / 65536 | 25924.1 | 26290.1 | 1.023x | 0.948–1.030x |

## Longer Bun empty-payload follow-up

Text bytes are zero and concurrency is 64. Warmup 8,192, nine samples of 16,384 calls, three alternating fresh-process pairs. These results do not replace the shorter guard matrix.

| Case | 0.1.5 calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---:|
| CrossBus / 64 / 0 | 107152.6 | 106939.3 | 0.991x | 0.969–0.998x |
| CrossBus + async hooks / 64 / 0 | 93969.9 | 93802.6 | 1.005x | 0.972–1.006x |
| CrossBus compact wire / 64 / 0 | 157408.9 | 158611.1 | 1.012x | 0.957–1.023x |
| CrossBus compact + hooks / 64 / 0 | 132175.5 | 132899.8 | 1.027x | 0.970–1.037x |
| birpc cached / 64 / 0 | 154638.1 | 153795.1 | 0.991x | 0.974–1.024x |
| Penpal cached + timeout / 64 / 0 | 131712.1 | 131618.0 | 0.999x | 0.979–1.000x |
