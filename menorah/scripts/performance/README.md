# Menorah JMeter Baseline

`menorah-public-baseline.jmx` is a conservative production baseline: five virtual users, a ten-second ramp, a sixty-second duration, and two seconds between samples. It requests only public, read-only pages and APIs.

It does not exercise registration, OTP, login submission, payments, calls, uploads, chat, or any data-changing endpoint.

Run from the repository root:

```bash
bash scripts/performance/run-jmeter-baseline.sh
```

Optional overrides:

```bash
JMETER_THREADS=10 JMETER_DURATION_SECONDS=120 JMETER_DELAY_MS=2000 \
  bash scripts/performance/run-jmeter-baseline.sh
```

Each run saves `baseline.jtl` and an HTML dashboard to `scripts/performance/results/<UTC timestamp>/`.
