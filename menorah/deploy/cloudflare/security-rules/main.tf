terraform {
  required_version = ">= 1.8.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.22.0"
    }
  }
}

variable "zone_ids" {
  description = "Map of managed DNS zone names to Cloudflare zone IDs."
  type        = map(string)
}

resource "cloudflare_ruleset" "managed_waf" {
  for_each = var.zone_ids

  zone_id     = each.value
  name        = "Menorah managed WAF"
  description = "Cloudflare managed application security rules"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [
    {
      ref         = "execute_cloudflare_managed_ruleset"
      description = "Execute the Cloudflare managed ruleset"
      expression  = "true"
      action      = "execute"
      action_parameters = {
        id = "efb7b8c949ac4650a09736fc376e9aee"
      }
    },
  ]
}

resource "cloudflare_ruleset" "application_firewall" {
  for_each = var.zone_ids

  zone_id     = each.value
  name        = "Menorah application firewall"
  description = "Block unsafe methods and direct access to private paths"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      ref         = "block_unsafe_methods"
      description = "Block TRACE and CONNECT"
      expression  = "http.request.method in {\"TRACE\" \"CONNECT\"}"
      action      = "block"
    },
    {
      ref         = "block_private_paths"
      description = "Block metrics, environment, and repository paths"
      expression  = "starts_with(http.request.uri.path, \"/metrics\") or starts_with(http.request.uri.path, \"/.env\") or starts_with(http.request.uri.path, \"/.git\")"
      action      = "block"
    },
    {
      ref         = "webhooks_post_only"
      description = "Only accept POST for authenticated webhook routes"
      expression  = "http.request.uri.path in {\"/api/payments/razorpay-webhook\" \"/api/payouts/webhook\" \"/api/video/livekit-webhook\"} and http.request.method ne \"POST\""
      action      = "block"
    },
  ]
}

resource "cloudflare_ruleset" "rate_limits" {
  for_each = var.zone_ids

  zone_id     = each.value
  name        = "Menorah API rate limits"
  description = "Abuse controls for authentication, administration, and webhooks"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      ref         = "limit_login_and_mfa"
      description = "Limit login and administrator MFA attempts by IP"
      expression  = "http.request.method eq \"POST\" and http.request.uri.path in {\"/api/auth/login\" \"/api/auth/admin/login\" \"/api/auth/login/mfa\" \"/api/auth/admin/login/mfa\"}"
      action      = "block"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = 10
        mitigation_timeout  = 600
      }
    },
    {
      ref         = "limit_reset_and_otp"
      description = "Limit reset, verification, and OTP attempts by IP"
      expression  = "http.request.method eq \"POST\" and http.request.uri.path in {\"/api/auth/forgot-password\" \"/api/auth/reset-password\" \"/api/auth/verify-email-otp\" \"/api/auth/resend-email-otp\" \"/api/auth/verify-otp\"}"
      action      = "block"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 300
        requests_per_period = 10
        mitigation_timeout  = 900
      }
    },
    {
      ref         = "limit_admin_api"
      description = "Limit administrator API writes by IP"
      expression  = "http.request.method in {\"POST\" \"PUT\" \"PATCH\" \"DELETE\"} and starts_with(http.request.uri.path, \"/api/admin\")"
      action      = "block"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = 120
        mitigation_timeout  = 300
      }
    },
    {
      ref         = "limit_authenticated_webhooks"
      description = "Bound signed payment and video webhook traffic by source IP"
      expression  = "http.request.method eq \"POST\" and http.request.uri.path in {\"/api/payments/razorpay-webhook\" \"/api/payouts/webhook\" \"/api/video/livekit-webhook\"}"
      action      = "block"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 60
        requests_per_period = 300
        mitigation_timeout  = 300
      }
    },
  ]
}
