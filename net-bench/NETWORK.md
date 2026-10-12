# 网络实测报告（沙箱容器）

出口：Google Cloud us-central1 (Council Bluffs, Iowa) · 公网 IP `34.67.51.12` · ASN AS396982
拓扑：所有流量经 pod 内 MITM 代理（`/etc/mitm/ca.crt`，监听 `:15001`，uid 1337），TLS 由代理终结。
DNS: 169.254.20.10 (GKE node-local)，解析返回真实公网 IP。

## 1. 下行吞吐 vs 并发流数（CacheFly，纯 HTTP 100MB/流）

| 并发流 | 吞吐 | 折算 | CPU 消耗 | 节流 |
|---|---|---|---|---|
| 1 | 93.5–108.5 MB/s | **748–868 Mbps** | 0.09 核 | 0 |
| 2 | 112.0 MB/s | 896 Mbps | — | 0 |
| 4 | 157.0 MB/s | 1256 Mbps | — | 0 |
| **8** | **179.1 MB/s** | **1433 Mbps** | 0.07 核 | 0 |
| 16 | 146.1–153.7 MB/s | 1169–1230 Mbps | 0.06 核 | 0 |

→ 单连接约 **90–110 MB/s**；多流聚合在 **8 流时达到峰值 ~1.43 Gbps**，16 流略微回落（代理端竞争）。

## 2. 上行吞吐（Cloudflare `__up`，10MB/流）

| 并发流 | 吞吐 | 折算 |
|---|---|---|
| 1 | 11.4–27.6 MB/s | 91–221 Mbps |
| 4 | 60.8 MB/s | 487 Mbps |
| **8** | **169.9 MB/s** | **1360 Mbps** |
| 16 | 162.2 MB/s | 1297 Mbps |

→ 上行单流较弱（~20 MB/s），8 流聚合可打满与下行同一量级的 **~1.36 Gbps**。

## 3. 延迟与抖动（40 次采样，Cloudflare）

| 指标 | 值 |
|---|---|
| TCP 建连（到本地代理） | **2.1 ms** |
| TTFB min | 67.5 ms |
| TTFB p25 / **p50** / p75 | 75.9 / **81.2** / 99.8 ms |
| TTFB p90 / max | 121.2 ms / 3140 ms |
| 标准差（抖动） | 537 ms（被偶发秒级卡顿拉高） |

→ 常态 RTT ~80 ms（Iowa → Cloudflare 边缘），但存在**偶发多秒停顿**，属于代理限流/排队，不是网络本身。

## 4. 关键结论：天花板不是 CPU

传输 100MB × N 流期间实测容器自身 CPU 占用 **0.06~0.09 核**，`nr_throttled` 增量为 **0**：

- MITM 代理的 CPU 开销**不计入我们的 cgroup 配额**（代理在 pod 内的独立 cgroup）。
- 因此 **~1.4 Gbps 是出口代理/沙箱网络策略的容量上限**，与我们只有 4 核算力无关。
- 单纯做网络 IO 不受 4 核配额影响；只有在本地做 TLS/加密计算时才会撞配额。

## 5. 踩坑记录

1. **`speedtest-cli` 装不上**：PyPI 走代理时 `SSL_CERT_FILE=/etc/mitm/ca.crt` 仍失败（`--cert` 也一样），属白名单限制。改用 curl 自建测速。
2. **测速脚本虚报 27 Gbps**：早期版本对被限流失败的请求（HTTP 403、0 字节）仍按满额字节数计算，得出 `200MB / 0.058s` 的荒谬结果。修正：按 `%{size_download}` 实际字节累加 + 校验状态码（现脚本 `nettest.sh` 已修复，输出会标注 `ERR:`）。
3. **首测 20 MB/s 是对端限速**：起初用 OVH/Hetzner 测，OVH 只有 20 MB/s；换 CacheFly / Cloudflare 后达 90–180 MB/s。说明瓶颈在对端，不在本机。

## 复现

```bash
./nettest.sh 8 100000000 'http://cachefly.cachefly.net/100mb.test'   # 下行 8 流
./upltest.sh 8 /path/to/10MB.bin                                    # 上行 8 流
./netcpu.sh  8 100000000 'http://cachefly.cachefly.net/100mb.test'   # 吞吐 + CPU 归因
```
