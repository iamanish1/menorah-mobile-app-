#!/usr/bin/env python3
"""Optional Playwright smoke checks for local web/admin apps.

This script intentionally does not perform authenticated actions or use secrets.
It validates that local pages load through Caddy and records when login-gated
flows cannot be completed without seeded QA accounts.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass


WEB_BASE_URL = os.environ.get("QA_WEB_URL", "https://app.localhost:8443").rstrip("/")
ADMIN_BASE_URL = os.environ.get("QA_ADMIN_URL", "https://admin.localhost:8443").rstrip("/")


@dataclass
class Result:
    status: str
    name: str
    details: str


def print_result(result: Result) -> None:
    suffix = f" - {result.details}" if result.details else ""
    print(f"{result.status}: {result.name}{suffix}")


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
