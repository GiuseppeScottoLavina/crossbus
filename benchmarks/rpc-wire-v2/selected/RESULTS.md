# RPC wire v2 selected development snapshot

Three fresh wire processes per runtime; within-process v2/v1 ratios. Separate three alternating process pairs compare existing formats with the previous 0.1.6 snapshot. Observed ranges are not confidence intervals.

39 datasets; 56,891,520 verified echo calls.

## node / Node v24.15.0

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 127762.1 | 133177.4 | 1.040x | 1.039–1.046x |
| 0 | 1 | true | 113738.6 | 115850.1 | 1.031x | 1.012–1.041x |
| 0 | 64 | false | 203847.0 | 217401.1 | 1.065x | 1.047–1.196x |
| 0 | 64 | true | 170775.8 | 176516.5 | 1.022x | 0.972–1.051x |
| 1024 | 1 | false | 123299.4 | 128748.9 | 1.052x | 1.001–1.081x |
| 1024 | 1 | true | 110078.1 | 112792.7 | 1.025x | 1.018–1.028x |
| 1024 | 64 | false | 182029.3 | 195753.0 | 1.084x | 0.992–1.096x |
| 1024 | 64 | true | 156819.5 | 164082.3 | 1.056x | 0.947–1.158x |
| 65536 | 1 | false | 56093.9 | 56535.7 | 1.008x | 1.007–1.009x |
| 65536 | 1 | true | 52221.2 | 53083.5 | 1.015x | 1.010–1.018x |
| 65536 | 64 | false | 44877.0 | 46025.3 | 1.018x | 1.016–1.030x |
| 65536 | 64 | true | 41946.0 | 43987.3 | 1.047x | 1.032–1.049x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 114892.1 | 117331.3 | 1.024x | 1.000–1.038x |
| CrossBus + async hooks / 1 / 0 | 102830.3 | 101408.4 | 0.986x | 0.985–1.031x |
| CrossBus compact wire / 1 / 0 | 130020.4 | 133363.9 | 1.050x | 0.995–1.084x |
| CrossBus compact + hooks / 1 / 0 | 114702.0 | 118045.7 | 1.014x | 0.975–1.057x |
| birpc cached / 1 / 0 | 164651.7 | 167758.6 | 1.017x | 1.012–1.029x |
| Penpal cached + timeout / 1 / 0 | 146011.7 | 149207.0 | 1.022x | 0.961–1.027x |
| CrossBus / 1 / 1024 | 111572.8 | 113786.2 | 1.024x | 1.006–1.036x |
| CrossBus + async hooks / 1 / 1024 | 98900.5 | 100974.6 | 1.016x | 0.997–1.021x |
| CrossBus compact wire / 1 / 1024 | 124622.8 | 130897.1 | 1.050x | 0.993–1.089x |
| CrossBus compact + hooks / 1 / 1024 | 110261.7 | 112246.7 | 0.998x | 0.993–1.025x |
| birpc cached / 1 / 1024 | 157386.9 | 161940.7 | 1.016x | 1.011–1.038x |
| Penpal cached + timeout / 1 / 1024 | 135409.4 | 142341.0 | 1.030x | 1.020–1.075x |
| CrossBus / 1 / 65536 | 52345.9 | 52408.3 | 1.001x | 0.989–1.018x |
| CrossBus + async hooks / 1 / 65536 | 48921.9 | 49160.5 | 1.005x | 0.992–1.012x |
| CrossBus compact wire / 1 / 65536 | 55462.6 | 55885.0 | 1.009x | 0.991–1.009x |
| CrossBus compact + hooks / 1 / 65536 | 52713.4 | 51478.8 | 0.977x | 0.972–1.000x |
| birpc cached / 1 / 65536 | 61209.2 | 61942.1 | 1.006x | 1.005–1.030x |
| Penpal cached + timeout / 1 / 65536 | 57789.7 | 58351.4 | 1.005x | 0.996–1.014x |
| CrossBus / 64 / 0 | 163008.4 | 168378.9 | 1.033x | 0.974–1.048x |
| CrossBus + async hooks / 64 / 0 | 140118.2 | 140625.1 | 0.999x | 0.999–1.010x |
| CrossBus compact wire / 64 / 0 | 207096.6 | 207868.2 | 0.992x | 0.987–1.020x |
| CrossBus compact + hooks / 64 / 0 | 170616.0 | 173810.6 | 1.019x | 1.010–1.024x |
| birpc cached / 64 / 0 | 224352.8 | 231564.0 | 1.046x | 0.962–1.052x |
| Penpal cached + timeout / 64 / 0 | 216312.8 | 210244.5 | 0.957x | 0.955–1.041x |
| CrossBus / 64 / 1024 | 153603.1 | 154524.7 | 1.012x | 0.993–1.024x |
| CrossBus + async hooks / 64 / 1024 | 132085.7 | 131243.1 | 1.001x | 0.977–1.033x |
| CrossBus compact wire / 64 / 1024 | 181958.5 | 187254.6 | 1.053x | 0.968–1.095x |
| CrossBus compact + hooks / 64 / 1024 | 157159.7 | 159450.3 | 1.019x | 0.987–1.051x |
| birpc cached / 64 / 1024 | 209923.0 | 206322.0 | 0.989x | 0.977–0.993x |
| Penpal cached + timeout / 64 / 1024 | 193148.3 | 200219.2 | 1.037x | 0.965–1.057x |
| CrossBus / 64 / 65536 | 43383.8 | 43344.7 | 0.995x | 0.992–1.026x |
| CrossBus + async hooks / 64 / 65536 | 40800.2 | 40983.3 | 1.008x | 1.004–1.010x |
| CrossBus compact wire / 64 / 65536 | 45459.5 | 45618.6 | 0.997x | 0.987–1.008x |
| CrossBus compact + hooks / 64 / 65536 | 41884.5 | 43455.1 | 1.030x | 1.007–1.045x |
| birpc cached / 64 / 65536 | 48463.5 | 48024.8 | 1.000x | 0.986–1.000x |
| Penpal cached + timeout / 64 / 65536 | 46875.1 | 47166.6 | 1.003x | 1.003–1.006x |

## bun / Bun 1.3.14

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 152828.7 | 163226.3 | 1.080x | 1.047–1.086x |
| 0 | 1 | true | 133937.4 | 141580.5 | 1.057x | 1.036–1.067x |
| 0 | 64 | false | 211024.8 | 229778.3 | 1.088x | 1.054–1.089x |
| 0 | 64 | true | 176440.8 | 191920.5 | 1.087x | 1.072–1.088x |
| 1024 | 1 | false | 133207.0 | 141456.0 | 1.067x | 1.062–1.092x |
| 1024 | 1 | true | 117495.5 | 124023.7 | 1.031x | 1.029–1.084x |
| 1024 | 64 | false | 199903.6 | 221296.3 | 1.101x | 1.082–1.107x |
| 1024 | 64 | true | 168525.6 | 186165.2 | 1.095x | 1.067–1.110x |
| 65536 | 1 | false | 24596.5 | 24686.9 | 1.009x | 1.004–1.049x |
| 65536 | 1 | true | 23803.1 | 23861.7 | 1.002x | 1.002–1.027x |
| 65536 | 64 | false | 103761.7 | 109151.2 | 1.034x | 1.025–1.052x |
| 65536 | 64 | true | 94864.4 | 97890.5 | 1.032x | 1.018–1.036x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 107932.2 | 109436.8 | 1.014x | 0.988–1.036x |
| CrossBus + async hooks / 1 / 0 | 96153.8 | 97706.3 | 1.016x | 1.014–1.025x |
| CrossBus compact wire / 1 / 0 | 141983.3 | 151033.8 | 1.074x | 0.991–1.078x |
| CrossBus compact + hooks / 1 / 0 | 123286.1 | 133744.8 | 1.094x | 1.008–1.105x |
| birpc cached / 1 / 0 | 153611.3 | 149605.3 | 0.968x | 0.967–1.016x |
| Penpal cached + timeout / 1 / 0 | 126598.2 | 125376.1 | 0.990x | 0.960–1.002x |
| CrossBus / 1 / 1024 | 89941.6 | 90859.3 | 1.011x | 1.010–1.011x |
| CrossBus + async hooks / 1 / 1024 | 82178.8 | 83613.4 | 1.017x | 1.015–1.018x |
| CrossBus compact wire / 1 / 1024 | 124613.1 | 132294.2 | 1.062x | 0.964–1.078x |
| CrossBus compact + hooks / 1 / 1024 | 110161.2 | 118260.7 | 1.070x | 0.988–1.074x |
| birpc cached / 1 / 1024 | 115340.8 | 116143.0 | 1.002x | 0.995–1.009x |
| Penpal cached + timeout / 1 / 1024 | 101943.9 | 102022.6 | 1.003x | 0.995–1.011x |
| CrossBus / 1 / 65536 | 17350.3 | 17749.0 | 1.005x | 1.005–1.024x |
| CrossBus + async hooks / 1 / 65536 | 17206.2 | 17243.1 | 1.007x | 1.002–1.010x |
| CrossBus compact wire / 1 / 65536 | 24162.3 | 24489.2 | 1.014x | 0.988–1.023x |
| CrossBus compact + hooks / 1 / 65536 | 23543.0 | 23846.0 | 1.013x | 1.011–1.021x |
| birpc cached / 1 / 65536 | 18374.2 | 18480.5 | 1.006x | 1.005–1.006x |
| Penpal cached + timeout / 1 / 65536 | 18137.4 | 18111.7 | 0.999x | 0.997–1.001x |
| CrossBus / 64 / 0 | 136802.6 | 140293.0 | 1.026x | 0.955–1.066x |
| CrossBus + async hooks / 64 / 0 | 120919.1 | 118311.5 | 0.979x | 0.970–0.997x |
| CrossBus compact wire / 64 / 0 | 196845.0 | 205195.4 | 1.084x | 0.939–1.125x |
| CrossBus compact + hooks / 64 / 0 | 166714.7 | 173476.6 | 1.059x | 0.952–1.076x |
| birpc cached / 64 / 0 | 195003.5 | 193137.7 | 1.020x | 0.929–1.023x |
| Penpal cached + timeout / 64 / 0 | 168965.9 | 168882.8 | 1.000x | 0.947–1.058x |
| CrossBus / 64 / 1024 | 104572.0 | 105613.3 | 0.997x | 0.986–1.010x |
| CrossBus + async hooks / 64 / 1024 | 95402.6 | 94144.4 | 0.986x | 0.984–1.001x |
| CrossBus compact wire / 64 / 1024 | 186858.5 | 195840.3 | 1.045x | 0.970–1.070x |
| CrossBus compact + hooks / 64 / 1024 | 164045.9 | 166918.0 | 1.014x | 0.967–1.080x |
| birpc cached / 64 / 1024 | 137174.6 | 138459.3 | 1.006x | 0.953–1.026x |
| Penpal cached + timeout / 64 / 1024 | 120747.2 | 122683.9 | 1.014x | 0.989–1.017x |
| CrossBus / 64 / 65536 | 11930.3 | 11932.5 | 1.000x | 0.999–1.005x |
| CrossBus + async hooks / 64 / 65536 | 11768.4 | 11756.0 | 0.994x | 0.993–1.003x |
| CrossBus compact wire / 64 / 65536 | 103386.4 | 105961.0 | 1.018x | 0.990–1.025x |
| CrossBus compact + hooks / 64 / 65536 | 91474.5 | 96990.7 | 1.023x | 0.985–1.060x |
| birpc cached / 64 / 65536 | 12255.5 | 12332.2 | 1.005x | 0.996–1.006x |
| Penpal cached + timeout / 64 / 65536 | 12139.1 | 12181.2 | 1.000x | 0.994–1.006x |

## chrome / HeadlessChrome/155.0.8059.79

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 81431.4 | 84979.3 | 1.050x | 0.976–1.066x |
| 0 | 1 | true | 75432.8 | 75851.9 | 1.006x | 1.000–1.039x |
| 0 | 64 | false | 103696.2 | 107506.6 | 1.024x | 1.003–1.051x |
| 0 | 64 | true | 91838.6 | 91838.6 | 1.011x | 0.932–1.056x |
| 1024 | 1 | false | 75572.0 | 77870.7 | 1.030x | 0.972–1.075x |
| 1024 | 1 | true | 69189.2 | 69541.6 | 1.005x | 0.953–1.218x |
| 1024 | 64 | false | 93090.9 | 96376.5 | 1.024x | 1.004–1.035x |
| 1024 | 64 | true | 83083.2 | 86231.6 | 1.027x | 1.000–1.047x |
| 65536 | 1 | false | 17239.1 | 17145.2 | 0.995x | 0.994–0.997x |
| 65536 | 1 | true | 16657.2 | 16718.4 | 1.002x | 0.992–1.004x |
| 65536 | 64 | false | 19024.6 | 19113.4 | 1.001x | 1.001–1.005x |
| 65536 | 64 | true | 18660.6 | 18618.2 | 1.000x | 0.997–1.014x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 79844.1 | 80948.6 | 1.010x | 0.994–1.028x |
| CrossBus + async hooks / 1 / 0 | 72495.6 | 73012.5 | 1.002x | 1.002–1.033x |
| CrossBus compact wire / 1 / 0 | 84453.6 | 84453.6 | 1.000x | 0.994–1.013x |
| CrossBus compact + hooks / 1 / 0 | 76133.8 | 75294.1 | 0.989x | 0.981–1.011x |
| birpc cached / 1 / 0 | 112219.2 | 110404.3 | 0.984x | 0.955–1.003x |
| Penpal cached + timeout / 1 / 0 | 100638.8 | 98937.2 | 0.986x | 0.957–0.988x |
| CrossBus / 1 / 1024 | 75432.8 | 76275.6 | 1.011x | 0.993–1.079x |
| CrossBus + async hooks / 1 / 1024 | 66601.6 | 66385.7 | 0.995x | 0.980–0.998x |
| CrossBus compact wire / 1 / 1024 | 75851.9 | 75711.6 | 0.998x | 0.994–1.002x |
| CrossBus compact + hooks / 1 / 1024 | 66171.2 | 68609.7 | 1.014x | 0.968–1.037x |
| birpc cached / 1 / 1024 | 104223.9 | 104757.0 | 1.008x | 0.995–1.024x |
| Penpal cached + timeout / 1 / 1024 | 89824.6 | 91022.2 | 1.013x | 1.004–1.076x |
| CrossBus / 1 / 65536 | 17839.7 | 17941.3 | 1.003x | 0.997–1.006x |
| CrossBus + async hooks / 1 / 65536 | 17311.9 | 17370.7 | 1.003x | 1.003–1.008x |
| CrossBus compact wire / 1 / 65536 | 16890.7 | 17052.5 | 1.002x | 1.002–1.010x |
| CrossBus compact + hooks / 1 / 65536 | 16576.3 | 16636.9 | 1.005x | 1.004–1.007x |
| birpc cached / 1 / 65536 | 18196.4 | 18253.1 | 1.008x | 0.991–1.009x |
| Penpal cached + timeout / 1 / 65536 | 18220.6 | 18212.5 | 1.001x | 0.993–1.015x |
| CrossBus / 64 / 0 | 99659.4 | 98937.2 | 0.993x | 0.993–1.019x |
| CrossBus + async hooks / 64 / 0 | 89628.0 | 89237.5 | 0.991x | 0.950–1.042x |
| CrossBus compact wire / 64 / 0 | 106114.0 | 106389.6 | 1.003x | 0.961–1.037x |
| CrossBus compact + hooks / 64 / 0 | 92044.9 | 94160.9 | 0.993x | 0.985–1.047x |
| birpc cached / 64 / 0 | 114094.7 | 116363.6 | 1.000x | 0.946–1.064x |
| Penpal cached + timeout / 64 / 0 | 111304.3 | 111607.6 | 1.008x | 0.997–1.008x |
| CrossBus / 64 / 1024 | 90022.0 | 90220.3 | 0.998x | 0.989–1.039x |
| CrossBus + async hooks / 64 / 1024 | 78167.9 | 80000.0 | 1.010x | 0.980–1.046x |
| CrossBus compact wire / 64 / 1024 | 94377.9 | 95925.1 | 1.019x | 1.002–1.026x |
| CrossBus compact + hooks / 64 / 1024 | 82747.5 | 84979.3 | 0.994x | 0.980–1.029x |
| birpc cached / 64 / 1024 | 102914.6 | 102400.0 | 0.995x | 0.938–1.023x |
| Penpal cached + timeout / 64 / 1024 | 99176.8 | 98937.2 | 1.007x | 0.981–1.038x |
| CrossBus / 64 / 65536 | 19941.6 | 19816.2 | 0.987x | 0.981–0.994x |
| CrossBus + async hooks / 64 / 65536 | 19248.1 | 19185.0 | 0.996x | 0.982–1.021x |
| CrossBus compact wire / 64 / 65536 | 18936.7 | 19033.5 | 1.008x | 0.988–1.011x |
| CrossBus compact + hooks / 64 / 65536 | 18492.1 | 18500.5 | 1.004x | 0.973–1.019x |
| birpc cached / 64 / 65536 | 20227.2 | 20227.2 | 1.000x | 0.990–1.003x |
| Penpal cached + timeout / 64 / 65536 | 20307.4 | 20147.6 | 0.994x | 0.986–1.018x |

## chrome-worker / HeadlessChrome/155.0.8059.79

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 42096.6 | 42755.7 | 1.004x | 0.966–1.016x |
| 0 | 1 | true | 38460.1 | 38678.0 | 1.006x | 0.999–1.024x |
| 0 | 64 | false | 184504.5 | 171380.8 | 0.933x | 0.905–1.052x |
| 0 | 64 | true | 163187.3 | 149489.1 | 0.906x | 0.905–1.000x |
| 1024 | 1 | false | 37647.1 | 37751.2 | 1.002x | 0.992–1.003x |
| 1024 | 1 | true | 35679.4 | 36247.8 | 1.020x | 0.994–1.027x |
| 1024 | 64 | false | 136079.7 | 152835.8 | 1.124x | 0.912–1.134x |
| 1024 | 64 | true | 124498.5 | 123373.5 | 0.988x | 0.904–1.065x |
| 65536 | 1 | false | 15894.5 | 16025.0 | 0.999x | 0.738–1.013x |
| 65536 | 1 | true | 15621.7 | 15580.1 | 1.000x | 0.991–1.109x |
| 65536 | 64 | false | 27657.0 | 27563.9 | 0.999x | 0.991–1.002x |
| 65536 | 64 | true | 26894.3 | 26528.5 | 0.986x | 0.972–0.990x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 39158.7 | 40117.5 | 1.018x | 0.965–1.064x |
| CrossBus + async hooks / 1 / 0 | 37067.9 | 36801.4 | 0.976x | 0.956–1.113x |
| CrossBus compact wire / 1 / 0 | 40634.9 | 41457.5 | 1.041x | 0.929–1.095x |
| CrossBus compact + hooks / 1 / 0 | 37961.1 | 37474.8 | 0.975x | 0.944–1.078x |
| birpc cached / 1 / 0 | 49053.9 | 50073.3 | 0.986x | 0.979–1.072x |
| Penpal cached + timeout / 1 / 0 | 46651.5 | 46811.4 | 1.003x | 0.936–1.053x |
| CrossBus / 1 / 1024 | 37820.9 | 38102.3 | 1.007x | 0.989–1.015x |
| CrossBus + async hooks / 1 / 1024 | 34919.0 | 35679.4 | 1.006x | 0.966–1.036x |
| CrossBus compact wire / 1 / 1024 | 37202.5 | 36441.3 | 1.005x | 0.952–1.015x |
| CrossBus compact + hooks / 1 / 1024 | 34889.3 | 35835.5 | 1.041x | 0.987–1.063x |
| birpc cached / 1 / 1024 | 46334.8 | 46758.0 | 0.985x | 0.913–1.014x |
| Penpal cached + timeout / 1 / 1024 | 43901.4 | 43482.0 | 0.992x | 0.914–1.031x |
| CrossBus / 1 / 65536 | 16562.9 | 16331.7 | 0.994x | 0.954–1.020x |
| CrossBus + async hooks / 1 / 65536 | 15857.5 | 15956.4 | 0.993x | 0.979–1.034x |
| CrossBus compact wire / 1 / 65536 | 15243.8 | 12057.7 | 0.988x | 0.791–0.996x |
| CrossBus compact + hooks / 1 / 65536 | 15142.3 | 12352.2 | 0.804x | 0.798–1.149x |
| birpc cached / 1 / 65536 | 12197.7 | 12378.4 | 1.010x | 0.982–1.365x |
| Penpal cached + timeout / 1 / 65536 | 12367.1 | 17181.2 | 1.338x | 1.056–1.426x |
| CrossBus / 64 / 0 | 158759.7 | 157538.5 | 0.992x | 0.984–1.164x |
| CrossBus + async hooks / 64 / 0 | 139795.2 | 146285.7 | 1.077x | 1.043–1.221x |
| CrossBus compact wire / 64 / 0 | 180440.5 | 182044.4 | 0.958x | 0.951–1.234x |
| CrossBus compact + hooks / 64 / 0 | 140274.0 | 136533.3 | 0.904x | 0.823–1.101x |
| birpc cached / 64 / 0 | 170666.7 | 165830.0 | 0.939x | 0.876–1.122x |
| Penpal cached + timeout / 64 / 0 | 158146.7 | 155741.4 | 0.933x | 0.920–1.032x |
| CrossBus / 64 / 1024 | 123373.5 | 137449.7 | 1.047x | 0.815–1.189x |
| CrossBus + async hooks / 64 / 1024 | 115056.2 | 120826.0 | 0.997x | 0.970–1.299x |
| CrossBus compact wire / 64 / 1024 | 153408.2 | 150036.6 | 1.019x | 0.967–1.041x |
| CrossBus compact + hooks / 64 / 1024 | 120470.6 | 117701.1 | 1.028x | 0.939–1.029x |
| birpc cached / 64 / 1024 | 142222.2 | 141241.4 | 0.860x | 0.828–1.247x |
| Penpal cached + timeout / 64 / 1024 | 109518.7 | 134295.1 | 1.032x | 0.882–1.322x |
| CrossBus / 64 / 65536 | 28523.7 | 28824.8 | 1.011x | 0.952–1.080x |
| CrossBus + async hooks / 64 / 65536 | 27471.5 | 28151.2 | 1.025x | 1.001–1.063x |
| CrossBus compact wire / 64 / 65536 | 26666.7 | 27545.4 | 1.002x | 0.998–1.063x |
| CrossBus compact + hooks / 64 / 65536 | 25052.0 | 26122.4 | 1.020x | 0.966–1.056x |
| birpc cached / 64 / 65536 | 27638.3 | 28683.5 | 0.999x | 0.982–1.098x |
| Penpal cached + timeout / 64 / 65536 | 29278.1 | 30139.8 | 1.029x | 1.023–1.059x |

## Directed Worker follow-up

Old and new endpoints alternate within each process; 64 KiB, concurrency 1, hooks, nine samples, three fresh processes.

| Mode | Current / previous | Observed ratios |
|---|---:|---|
| standard | 1.015x | 1.015, 0.979, 1.018 |
| compact | 0.999x | 0.998, 0.999, 1.348 |
