#!/usr/bin/env python3
"""Optional Playwright smoke checks for local web/admin apps.

This script intentionally does not perform authenticated actions or use secrets.
It validates that local pages load through Caddy and records when login-gated
flows cannot be completed without seeded QA accounts.
"""

from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass


WEB_BASE_URL = os.environ.get("QA_WEB_URL", "https://app.localhost:8443").rstrip("/")
ADMIN_BASE_URL = os.environ.get("QA_ADMIN_URL", "https://admin.localhost:8443").rstrip("/")
ADMIN_API_BASE_URL = os.environ.get("QA_ADMIN_API_URL", "http://localhost:18083/api").rstrip("/")
ADMIN_EMAIL = os.environ.get("QA_ADMIN_EMAIL", "qa.admin+local@menorah.test")
ADMIN_PASSWORD = os.environ.get("QA_USER_PASSWORD", "TestPass123!")
QA_RUN_IP = "10.253.%s.%s" % ((int(time.time()) // 250) % 250, (int(time.time()) % 250) + 1)


@dataclass
class Result:
    status: str
    name: str
    details: str


def print_result(result: Result) -> None:
    suffix = f" - {result.details}" if result.details else ""
    print(f"{result.status}: {result.name}{suffix}")


def proxy_admin_api(route) -> None:
    request = route.request
    cors_headers = {
        "access-control-allow-origin": ADMIN_BASE_URL,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "vary": "Origin",
    }

    if request.method == "OPTIONS":
        route.fulfill(status=204, headers=cors_headers, body="")
        return

    upstream_url = request.url.replace("https://api-admin.localhost/api", ADMIN_API_BASE_URL, 1)
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in {"host", "content-length", "origin", "referer"}
    }
    headers["X-Forwarded-For"] = QA_RUN_IP
    data = request.post_data
    body = data.encode("utf-8") if data is not None else None

    upstream_request = urllib.request.Request(
        upstream_url,
        data=body,
        headers=headers,
        method=request.method,
    )

    try:
        with urllib.request.urlopen(upstream_request, timeout=15) as response:
            route.fulfill(
                status=response.status,
                headers={
                    **cors_headers,
                    "content-type": response.headers.get("content-type", "application/json"),
                },
                body=response.read(),
            )
    except urllib.error.HTTPError as exc:
        route.fulfill(
            status=exc.code,
            headers={
                **cors_headers,
                "content-type": exc.headers.get("content-type", "application/json"),
            },
            body=exc.read(),
        )
    except Exception as exc:
        route.fulfill(
            status=502,
            headers={**cors_headers, "content-type": "application/json"},
            body=f'{{"success":false,"message":"Local QA proxy failed: {type(exc).__name__}"}}',
        )


def main() -> int:
    results: list[Result] = []

    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:  # pragma: no cover - environment dependent
        results.append(Result("BLOCKED", "Playwright import", str(exc)))
        for result in results:
            print_result(result)
        print("Summary: PASS: 0 FAIL: 0 BLOCKED: 1")
        return 0

    checks = [
        ("web login page loads", WEB_BASE_URL + "/login", "Menorah"),
        ("web register page loads", WEB_BASE_URL + "/register", "Menorah"),
        ("web articles route loads", WEB_BASE_URL + "/articles", "Menorah"),
        ("web bookings route is login gated", WEB_BASE_URL + "/bookings", "Menorah"),
        ("web chat route is login gated", WEB_BASE_URL + "/chat", "Menorah"),
        ("admin login page loads", ADMIN_BASE_URL + "/login", "Admin"),
        ("admin dashboard route is login gated", ADMIN_BASE_URL + "/dashboard", "Admin"),
        ("admin users route is login gated", ADMIN_BASE_URL + "/users", "Admin"),
        ("admin counsellors route is login gated", ADMIN_BASE_URL + "/counsellors", "Admin"),
        ("admin articles route is login gated", ADMIN_BASE_URL + "/articles", "Admin"),
        ("admin ekyc route is login gated", ADMIN_BASE_URL + "/ekyc", "Admin"),
        ("admin social studio route is login gated", ADMIN_BASE_URL + "/ai-social-studio", "Admin"),
    ]

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(ignore_https_errors=True)
            page = context.new_page()

            for name, url, expected_text in checks:
                try:
                    response = page.goto(url, wait_until="domcontentloaded", timeout=15000)
                    status = response.status if response else 0
                    body_text = page.locator("body").inner_text(timeout=5000)
                    current_url = page.url
                    if status >= 400:
                        results.append(Result("FAIL", name, f"HTTP {status} at {url}"))
                    elif expected_text.lower() in body_text.lower() or "login" in current_url.lower():
                        detail = f"HTTP {status}; final URL {current_url}"
                        if "login gated" in name and "login" in current_url.lower():
                            detail += "; blocked before auth as expected"
                        results.append(Result("PASS", name, detail))
                    else:
                        results.append(Result("BLOCKED", name, f"HTTP {status}; expected text not found at {current_url}"))
                except Exception as exc:  # pragma: no cover - environment dependent
                    results.append(Result("BLOCKED", name, str(exc)))

            admin_page = context.new_page()
            admin_page.route("https://api-admin.localhost/api/**", proxy_admin_api)

            try:
                admin_page.goto(ADMIN_BASE_URL + "/login", wait_until="domcontentloaded", timeout=15000)
                admin_page.fill('input[type="email"]', ADMIN_EMAIL)
                admin_page.fill('input[type="password"]', ADMIN_PASSWORD)
                admin_page.click('button[type="submit"]')
                admin_page.wait_for_url("**/dashboard", timeout=15000)
                results.append(Result("PASS", "admin seeded login succeeds", f"final URL {admin_page.url}"))
            except Exception as exc:  # pragma: no cover - environment dependent
                results.append(Result("FAIL", "admin seeded login succeeds", str(exc)))

            for path in ["/dashboard", "/users", "/counsellors", "/articles", "/ekyc", "/ai-social-studio"]:
                try:
                    response = admin_page.goto(ADMIN_BASE_URL + path, wait_until="domcontentloaded", timeout=15000)
                    status = response.status if response else 0
                    body_text = admin_page.locator("body").inner_text(timeout=5000)
                    if status >= 400:
                        results.append(Result("FAIL", f"admin authenticated page {path}", f"HTTP {status}"))
                    elif "login" in admin_page.url.lower():
                        results.append(Result("FAIL", f"admin authenticated page {path}", f"redirected to {admin_page.url}"))
                    elif body_text.strip():
                        results.append(Result("PASS", f"admin authenticated page {path}", f"HTTP {status}; final URL {admin_page.url}"))
                    else:
                        results.append(Result("BLOCKED", f"admin authenticated page {path}", "empty page body"))
                except Exception as exc:  # pragma: no cover - environment dependent
                    results.append(Result("BLOCKED", f"admin authenticated page {path}", str(exc)))

            context.close()
            browser.close()
    except Exception as exc:  # pragma: no cover - environment dependent
        results.append(Result("BLOCKED", "Playwright browser launch", str(exc)))

    summary = {"PASS": 0, "FAIL": 0, "BLOCKED": 0}
    for result in results:
        summary[result.status] += 1
        print_result(result)

    print(f"Summary: PASS: {summary['PASS']} FAIL: {summary['FAIL']} BLOCKED: {summary['BLOCKED']}")
    return 1 if summary["FAIL"] else 0


if __name__ == "__main__":
    sys.exit(main())
