# RPC wire v2 initial prototype

Three fresh wire processes per runtime; within-process v2/v1 ratios. Separate three alternating process pairs compare existing formats with the previous 0.1.6 snapshot. Observed ranges are not confidence intervals.

36 datasets; 56,079,360 verified echo calls.

## node / Node v24.15.0

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 124379.7 | 132605.6 | 1.070x | 1.052–1.084x |
| 0 | 1 | true | 112980.1 | 113049.4 | 1.000x | 0.998–1.021x |
| 0 | 64 | false | 194630.2 | 203041.6 | 1.062x | 1.039–1.093x |
| 0 | 64 | true | 164628.0 | 175119.1 | 1.068x | 0.997–1.085x |
| 1024 | 1 | false | 122191.9 | 122769.0 | 1.016x | 0.999–1.027x |
| 1024 | 1 | true | 107063.9 | 108722.7 | 1.015x | 0.988–1.073x |
| 1024 | 64 | false | 173278.2 | 189488.2 | 1.116x | 1.020–1.132x |
| 1024 | 64 | true | 147931.0 | 160013.8 | 1.066x | 1.050–1.100x |
| 65536 | 1 | false | 54448.7 | 54688.0 | 1.003x | 1.002–1.023x |
| 65536 | 1 | true | 50308.5 | 51254.3 | 1.013x | 1.006–1.022x |
| 65536 | 64 | false | 44401.5 | 44829.8 | 1.014x | 0.993–1.033x |
| 65536 | 64 | true | 40954.2 | 42528.3 | 1.038x | 1.036–1.039x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 115045.0 | 109180.8 | 0.949x | 0.926–0.968x |
| CrossBus + async hooks / 1 / 0 | 99478.4 | 96186.5 | 0.952x | 0.949–1.006x |
| CrossBus compact wire / 1 / 0 | 132365.1 | 127817.1 | 0.955x | 0.948–1.027x |
| CrossBus compact + hooks / 1 / 0 | 113527.2 | 112723.2 | 0.990x | 0.977–1.013x |
| birpc cached / 1 / 0 | 162103.9 | 159691.5 | 0.985x | 0.971–0.998x |
| Penpal cached + timeout / 1 / 0 | 143601.9 | 141295.6 | 0.982x | 0.942–0.984x |
| CrossBus / 1 / 1024 | 110046.4 | 107360.0 | 0.978x | 0.973–1.000x |
| CrossBus + async hooks / 1 / 1024 | 96990.1 | 95919.6 | 0.984x | 0.961–1.015x |
| CrossBus compact wire / 1 / 1024 | 127067.7 | 122432.1 | 0.960x | 0.956–0.975x |
| CrossBus compact + hooks / 1 / 1024 | 109870.1 | 107843.6 | 0.987x | 0.964–0.992x |
| birpc cached / 1 / 1024 | 151730.2 | 151396.5 | 0.998x | 0.945–1.004x |
| Penpal cached + timeout / 1 / 1024 | 136844.7 | 134228.5 | 1.007x | 0.934–1.029x |
| CrossBus / 1 / 65536 | 50705.3 | 49984.3 | 0.986x | 0.960–0.993x |
| CrossBus + async hooks / 1 / 65536 | 47569.5 | 47720.9 | 1.003x | 0.993–1.011x |
| CrossBus compact wire / 1 / 65536 | 54296.8 | 53510.8 | 0.986x | 0.930–0.997x |
| CrossBus compact + hooks / 1 / 65536 | 50469.4 | 50635.7 | 1.003x | 0.942–1.011x |
| birpc cached / 1 / 65536 | 59918.6 | 59784.1 | 0.991x | 0.946–1.009x |
| Penpal cached + timeout / 1 / 65536 | 55643.6 | 56758.8 | 1.019x | 0.969–1.025x |
| CrossBus / 64 / 0 | 159958.6 | 158232.5 | 0.992x | 0.969–1.006x |
| CrossBus + async hooks / 64 / 0 | 138290.2 | 136281.0 | 0.985x | 0.940–0.999x |
| CrossBus compact wire / 64 / 0 | 205333.4 | 203711.0 | 0.962x | 0.961–0.992x |
| CrossBus compact + hooks / 64 / 0 | 171365.8 | 167139.6 | 0.975x | 0.945–0.981x |
| birpc cached / 64 / 0 | 216930.5 | 214620.2 | 0.977x | 0.957–0.996x |
| Penpal cached + timeout / 64 / 0 | 213078.5 | 207024.2 | 0.990x | 0.877–0.998x |
| CrossBus / 64 / 1024 | 153618.0 | 151435.7 | 0.978x | 0.920–1.009x |
| CrossBus + async hooks / 64 / 1024 | 130623.7 | 128902.0 | 0.994x | 0.949–1.004x |
| CrossBus compact wire / 64 / 1024 | 183135.1 | 180039.7 | 0.983x | 0.937–1.034x |
| CrossBus compact + hooks / 64 / 1024 | 155660.8 | 151662.3 | 0.974x | 0.942–1.002x |
| birpc cached / 64 / 1024 | 207388.0 | 205083.7 | 0.990x | 0.944–1.022x |
| Penpal cached + timeout / 64 / 1024 | 191266.3 | 188553.7 | 0.999x | 0.919–1.002x |
| CrossBus / 64 / 65536 | 42620.7 | 42080.6 | 0.984x | 0.960–0.992x |
| CrossBus + async hooks / 64 / 65536 | 40013.1 | 39381.1 | 0.974x | 0.969–0.984x |
| CrossBus compact wire / 64 / 65536 | 44910.6 | 43842.6 | 0.973x | 0.951–0.983x |
| CrossBus compact + hooks / 64 / 65536 | 41450.6 | 40721.7 | 0.982x | 0.951–0.994x |
| birpc cached / 64 / 65536 | 47593.1 | 46705.5 | 0.996x | 0.939–1.002x |
| Penpal cached + timeout / 64 / 65536 | 46055.7 | 45943.5 | 1.002x | 0.959–1.015x |

## bun / Bun 1.3.14

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 124438.7 | 145883.7 | 1.139x | 1.076–1.231x |
| 0 | 1 | true | 112369.4 | 126805.7 | 1.136x | 1.065–1.169x |
| 0 | 64 | false | 177264.5 | 217441.0 | 1.227x | 1.087–1.242x |
| 0 | 64 | true | 154183.2 | 172644.3 | 1.120x | 1.051–1.164x |
| 1024 | 1 | false | 110349.0 | 123085.4 | 1.091x | 1.062–1.150x |
| 1024 | 1 | true | 99090.9 | 108353.0 | 1.075x | 0.975–1.093x |
| 1024 | 64 | false | 172603.7 | 190239.2 | 1.097x | 1.087–1.197x |
| 1024 | 64 | true | 150898.4 | 159267.4 | 1.055x | 1.037–1.221x |
| 65536 | 1 | false | 22966.3 | 23240.5 | 1.012x | 1.012–1.026x |
| 65536 | 1 | true | 22190.1 | 22706.1 | 1.020x | 1.006–1.024x |
| 65536 | 64 | false | 94830.5 | 96377.5 | 1.054x | 1.016–1.058x |
| 65536 | 64 | true | 83217.6 | 90429.6 | 1.061x | 1.060–1.087x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 106724.2 | 104510.9 | 0.966x | 0.951–1.090x |
| CrossBus + async hooks / 1 / 0 | 93775.0 | 93008.8 | 0.978x | 0.963–1.085x |
| CrossBus compact wire / 1 / 0 | 133148.8 | 135007.4 | 0.988x | 0.986–1.066x |
| CrossBus compact + hooks / 1 / 0 | 114010.7 | 121963.6 | 1.054x | 0.953–1.074x |
| birpc cached / 1 / 0 | 146353.0 | 148087.2 | 1.012x | 0.969–1.078x |
| Penpal cached + timeout / 1 / 0 | 121885.4 | 125309.6 | 1.028x | 0.974–1.056x |
| CrossBus / 1 / 1024 | 86148.7 | 88716.3 | 1.001x | 0.976–1.112x |
| CrossBus + async hooks / 1 / 1024 | 77600.4 | 80384.2 | 1.009x | 0.973–1.147x |
| CrossBus compact wire / 1 / 1024 | 116379.1 | 121231.4 | 0.994x | 0.994–1.128x |
| CrossBus compact + hooks / 1 / 1024 | 107655.6 | 108894.9 | 0.992x | 0.972–1.130x |
| birpc cached / 1 / 1024 | 109860.3 | 114709.4 | 1.007x | 1.000–1.097x |
| Penpal cached + timeout / 1 / 1024 | 97205.6 | 101718.0 | 0.995x | 0.986–1.097x |
| CrossBus / 1 / 65536 | 16765.2 | 17479.2 | 1.010x | 0.993–1.043x |
| CrossBus + async hooks / 1 / 65536 | 16592.7 | 17152.6 | 1.004x | 0.994–1.042x |
| CrossBus compact wire / 1 / 65536 | 24098.3 | 24084.8 | 1.010x | 0.998–1.052x |
| CrossBus compact + hooks / 1 / 65536 | 23201.7 | 23338.9 | 1.017x | 1.006–1.040x |
| birpc cached / 1 / 65536 | 17901.6 | 18583.7 | 1.005x | 1.003–1.045x |
| Penpal cached + timeout / 1 / 65536 | 17471.0 | 18172.5 | 1.012x | 1.004–1.040x |
| CrossBus / 64 / 0 | 134510.8 | 135223.2 | 0.996x | 0.942–1.021x |
| CrossBus + async hooks / 64 / 0 | 118285.9 | 121031.2 | 1.023x | 1.016–1.026x |
| CrossBus compact wire / 64 / 0 | 201469.5 | 201843.8 | 1.003x | 1.002–1.012x |
| CrossBus compact + hooks / 64 / 0 | 165891.8 | 164884.0 | 0.994x | 0.988–1.016x |
| birpc cached / 64 / 0 | 192219.6 | 195166.9 | 1.028x | 0.993–1.039x |
| Penpal cached + timeout / 64 / 0 | 169992.6 | 169710.9 | 0.999x | 0.972–1.014x |
| CrossBus / 64 / 1024 | 102974.0 | 102163.9 | 0.983x | 0.968–1.073x |
| CrossBus + async hooks / 64 / 1024 | 93608.0 | 93641.4 | 1.008x | 0.987–1.017x |
| CrossBus compact wire / 64 / 1024 | 178642.9 | 181472.1 | 1.016x | 0.981–1.049x |
| CrossBus compact + hooks / 64 / 1024 | 153882.5 | 161416.9 | 1.010x | 0.992–1.064x |
| birpc cached / 64 / 1024 | 133911.3 | 137114.2 | 1.024x | 1.002–1.050x |
| Penpal cached + timeout / 64 / 1024 | 117084.0 | 117012.7 | 0.999x | 0.953–1.065x |
| CrossBus / 64 / 65536 | 11882.7 | 11858.9 | 0.997x | 0.994–1.007x |
| CrossBus + async hooks / 64 / 65536 | 11721.0 | 11719.4 | 1.002x | 0.998–1.008x |
| CrossBus compact wire / 64 / 65536 | 99783.4 | 100896.8 | 0.998x | 0.990–1.011x |
| CrossBus compact + hooks / 64 / 65536 | 90352.4 | 91831.8 | 1.004x | 0.997–1.028x |
| birpc cached / 64 / 65536 | 12193.8 | 12237.3 | 1.003x | 0.994–1.004x |
| Penpal cached + timeout / 64 / 65536 | 12121.5 | 12097.7 | 0.996x | 0.994–1.006x |

## chrome / HeadlessChrome/155.0.8059.79

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 83083.2 | 85333.3 | 1.025x | 1.021–1.027x |
| 0 | 1 | true | 75851.9 | 75851.9 | 1.000x | 0.985–1.053x |
| 0 | 64 | false | 105295.6 | 108647.2 | 1.032x | 1.021–1.073x |
| 0 | 64 | true | 92252.3 | 90419.4 | 0.991x | 0.961–1.002x |
| 1024 | 1 | false | 72367.5 | 79534.0 | 1.027x | 0.998–1.241x |
| 1024 | 1 | true | 67814.6 | 69659.9 | 1.027x | 0.990–1.052x |
| 1024 | 64 | false | 94377.9 | 94377.9 | 1.016x | 0.998–1.046x |
| 1024 | 64 | true | 83591.8 | 84453.6 | 0.998x | 0.996–1.070x |
| 65536 | 1 | false | 17002.9 | 16932.6 | 0.996x | 0.987–1.008x |
| 65536 | 1 | true | 16562.9 | 16556.2 | 1.002x | 0.989–1.017x |
| 65536 | 64 | false | 18669.1 | 19113.4 | 1.024x | 1.000–1.034x |
| 65536 | 64 | true | 18293.9 | 18425.6 | 0.994x | 0.993–1.007x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 81593.6 | 82084.2 | 1.004x | 0.994–1.046x |
| CrossBus + async hooks / 1 / 0 | 73405.0 | 72882.6 | 0.991x | 0.989–1.002x |
| CrossBus compact wire / 1 / 0 | 83934.4 | 82747.5 | 0.986x | 0.976–1.008x |
| CrossBus compact + hooks / 1 / 0 | 75294.1 | 75851.9 | 1.009x | 1.007–1.021x |
| birpc cached / 1 / 0 | 112219.2 | 110404.3 | 1.008x | 0.981–1.017x |
| Penpal cached + timeout / 1 / 0 | 100392.2 | 96376.5 | 0.979x | 0.960–0.995x |
| CrossBus / 1 / 1024 | 74608.4 | 71985.9 | 0.965x | 0.922–1.007x |
| CrossBus + async hooks / 1 / 1024 | 67037.6 | 68840.3 | 1.015x | 1.014–1.027x |
| CrossBus compact wire / 1 / 1024 | 78167.9 | 76417.9 | 0.970x | 0.921–1.039x |
| CrossBus compact + hooks / 1 / 1024 | 66493.5 | 68609.7 | 1.018x | 0.986–1.032x |
| birpc cached / 1 / 1024 | 103959.4 | 99659.4 | 1.003x | 0.940–1.127x |
| Penpal cached + timeout / 1 / 1024 | 89432.3 | 89432.3 | 0.989x | 0.935–1.034x |
| CrossBus / 1 / 65536 | 17801.0 | 17808.7 | 1.001x | 0.997–1.002x |
| CrossBus + async hooks / 1 / 65536 | 17231.8 | 17400.2 | 1.007x | 1.006–1.011x |
| CrossBus compact wire / 1 / 65536 | 16988.8 | 16828.3 | 0.992x | 0.990–1.001x |
| CrossBus compact + hooks / 1 / 65536 | 16536.1 | 16469.6 | 1.002x | 0.989–1.003x |
| birpc cached / 1 / 65536 | 18172.1 | 18318.4 | 1.001x | 0.994–1.011x |
| Penpal cached + timeout / 1 / 65536 | 18204.4 | 18220.6 | 1.000x | 0.995–1.004x |
| CrossBus / 64 / 0 | 98698.8 | 100146.7 | 1.010x | 1.002–1.015x |
| CrossBus + async hooks / 64 / 0 | 88086.0 | 85690.4 | 0.982x | 0.955–0.987x |
| CrossBus compact wire / 64 / 0 | 105295.6 | 105839.8 | 1.021x | 0.969–1.039x |
| CrossBus compact + hooks / 64 / 0 | 93730.0 | 94160.9 | 0.982x | 0.958–1.021x |
| birpc cached / 64 / 0 | 114413.4 | 112837.5 | 1.000x | 0.961–1.016x |
| Penpal cached + timeout / 64 / 0 | 111607.6 | 111002.7 | 0.994x | 0.992–1.041x |
| CrossBus / 64 / 1024 | 89824.6 | 90619.5 | 1.009x | 0.970–1.041x |
| CrossBus + async hooks / 64 / 1024 | 79379.8 | 79073.4 | 0.996x | 0.990–1.018x |
| CrossBus compact wire / 64 / 1024 | 95925.1 | 94160.9 | 0.982x | 0.960–0.993x |
| CrossBus compact + hooks / 64 / 1024 | 81920.0 | 83421.6 | 1.018x | 0.982–1.031x |
| birpc cached / 64 / 1024 | 105839.8 | 104757.0 | 0.990x | 0.934–1.013x |
| Penpal cached + timeout / 64 / 1024 | 97292.2 | 98937.2 | 1.024x | 0.970–1.027x |
| CrossBus / 64 / 65536 | 19663.9 | 19635.7 | 1.010x | 0.990–1.010x |
| CrossBus + async hooks / 64 / 65536 | 18989.3 | 19194.0 | 1.011x | 0.994–1.025x |
| CrossBus compact wire / 64 / 65536 | 18703.2 | 18823.5 | 1.012x | 0.984–1.020x |
| CrossBus compact + hooks / 64 / 65536 | 18277.6 | 18293.9 | 1.000x | 0.998–1.010x |
| birpc cached / 64 / 65536 | 20167.4 | 20307.4 | 1.007x | 0.993–1.008x |
| Penpal cached + timeout / 64 / 65536 | 20227.2 | 20137.7 | 0.998x | 0.985–1.003x |

## chrome-worker / HeadlessChrome/155.0.8059.79

### V2 against v1 within the candidate

| Text bytes | In flight | Hooks | V1 calls/s | V2 calls/s | Median ratio | Observed range |
|---|---:|---|---:|---:|---:|---|
| 0 | 1 | false | 41001.0 | 40474.3 | 0.971x | 0.970–1.103x |
| 0 | 1 | true | 37820.9 | 37372.3 | 1.007x | 0.959–1.030x |
| 0 | 64 | false | 179649.1 | 167183.7 | 0.931x | 0.841–1.004x |
| 0 | 64 | true | 149489.1 | 152835.8 | 0.962x | 0.868–1.022x |
| 1024 | 1 | false | 37474.8 | 38244.6 | 1.021x | 1.009–1.038x |
| 1024 | 1 | true | 35371.3 | 34889.3 | 0.986x | 0.974–1.033x |
| 1024 | 64 | false | 137449.7 | 144225.4 | 1.049x | 0.961–1.154x |
| 1024 | 64 | true | 121183.4 | 118381.5 | 0.977x | 0.971–1.011x |
| 65536 | 1 | false | 15808.6 | 15031.2 | 0.961x | 0.728–0.993x |
| 65536 | 1 | true | 15346.6 | 15221.1 | 1.001x | 0.985–1.007x |
| 65536 | 64 | false | 27398.0 | 27270.3 | 0.995x | 0.995–1.009x |
| 65536 | 64 | true | 26614.7 | 26876.6 | 1.010x | 1.008–1.016x |

### Existing-codec and unchanged competitor controls

| Case / concurrency / text bytes | Previous calls/s | Candidate calls/s | Paired ratio | Observed range |
|---|---:|---:|---:|---|
| CrossBus / 1 / 0 | 39805.6 | 39961.0 | 1.004x | 0.922–1.031x |
| CrossBus + async hooks / 1 / 0 | 37612.5 | 37304.2 | 0.992x | 0.953–1.020x |
| CrossBus compact wire / 1 / 0 | 42489.6 | 41415.6 | 0.966x | 0.947–0.999x |
| CrossBus compact + hooks / 1 / 0 | 38568.7 | 38066.9 | 0.970x | 0.970–1.003x |
| birpc cached / 1 / 0 | 51328.3 | 50257.7 | 0.979x | 0.952–1.009x |
| Penpal cached + timeout / 1 / 0 | 47026.4 | 46598.4 | 0.991x | 0.948–1.001x |
| CrossBus / 1 / 1024 | 39384.6 | 36934.2 | 0.938x | 0.911–1.007x |
| CrossBus + async hooks / 1 / 1024 | 36441.3 | 35772.9 | 0.983x | 0.977–0.989x |
| CrossBus compact wire / 1 / 1024 | 38173.3 | 37890.8 | 0.984x | 0.982–1.019x |
| CrossBus compact + hooks / 1 / 1024 | 35371.3 | 36183.7 | 1.011x | 0.997–1.023x |
| birpc cached / 1 / 1024 | 47627.9 | 46178.1 | 0.976x | 0.970–0.991x |
| Penpal cached + timeout / 1 / 1024 | 44473.4 | 43714.0 | 0.990x | 0.980–1.020x |
| CrossBus / 1 / 65536 | 16862.9 | 16911.6 | 1.003x | 0.975–1.013x |
| CrossBus + async hooks / 1 / 65536 | 16443.2 | 16215.4 | 0.988x | 0.986–0.996x |
| CrossBus compact wire / 1 / 65536 | 15943.9 | 15950.2 | 1.000x | 0.754–1.027x |
| CrossBus compact + hooks / 1 / 65536 | 12129.1 | 15615.7 | 1.290x | 0.969–1.297x |
| birpc cached / 1 / 65536 | 17123.7 | 12393.3 | 0.715x | 0.696–1.387x |
| Penpal cached + timeout / 1 / 65536 | 17467.0 | 12322.5 | 0.705x | 0.691–0.976x |
| CrossBus / 64 / 0 | 144225.4 | 141241.4 | 0.979x | 0.833–1.215x |
| CrossBus + async hooks / 64 / 0 | 155741.4 | 137912.5 | 0.862x | 0.705–1.080x |
| CrossBus compact wire / 64 / 0 | 187889.9 | 183677.1 | 0.940x | 0.751–0.978x |
| CrossBus compact + hooks / 64 / 0 | 151143.9 | 155741.4 | 0.962x | 0.903–1.061x |
| birpc cached / 64 / 0 | 173559.3 | 167183.7 | 1.009x | 0.779–1.057x |
| Penpal cached + timeout / 64 / 0 | 144735.0 | 156335.9 | 1.150x | 0.747–1.195x |
| CrossBus / 64 / 1024 | 156335.9 | 136533.3 | 0.853x | 0.773–0.949x |
| CrossBus + async hooks / 64 / 1024 | 129620.3 | 126419.8 | 0.981x | 0.975–0.994x |
| CrossBus compact wire / 64 / 1024 | 159377.4 | 141730.1 | 0.889x | 0.828–1.020x |
| CrossBus compact + hooks / 64 / 1024 | 134736.8 | 120470.6 | 0.915x | 0.894–0.951x |
| birpc cached / 64 / 1024 | 159377.4 | 169256.2 | 0.996x | 0.877–1.204x |
| Penpal cached + timeout / 64 / 1024 | 146285.7 | 153408.2 | 1.049x | 0.729–1.158x |
| CrossBus / 64 / 65536 | 29789.1 | 29215.4 | 0.981x | 0.878–1.002x |
| CrossBus + async hooks / 64 / 65536 | 28523.7 | 27920.9 | 0.977x | 0.912–0.984x |
| CrossBus compact wire / 64 / 65536 | 28170.6 | 27234.0 | 0.966x | 0.891–0.975x |
| CrossBus compact + hooks / 64 / 65536 | 26632.0 | 26172.5 | 0.983x | 0.907–0.991x |
| birpc cached / 64 / 65536 | 28683.5 | 28683.5 | 1.000x | 0.898–1.031x |
| Penpal cached + timeout / 64 / 65536 | 30521.6 | 30139.8 | 0.978x | 0.923–0.987x |
