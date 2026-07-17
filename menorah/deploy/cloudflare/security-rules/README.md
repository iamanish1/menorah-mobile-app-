# Cloudflare Security Rules

This Terraform module manages the zone-level Cloudflare managed WAF, application firewall, and API rate limits for the Menorah and Mentle zones.

## Prerequisites

- Terraform 1.8 or newer.
- A scoped API token exported as `CLOUDFLARE_API_TOKEN` with `Zone WAF Write` for only the managed zones.
- A remote encrypted Terraform state backend. Never store state, plans, variables, or API tokens in Git.
- Cloudflare plan support for the configured managed WAF and rate-limit features.

Each zone supports one entry-point ruleset per phase. If a phase is already configured in the dashboard, import it before applying this module. Do not apply until `terraform plan` shows that existing production rules are retained.

## Apply

```bash
cd menorah/deploy/cloudflare/security-rules
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform fmt -check
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

Set the real zone IDs only in the ignored `terraform.tfvars` file. The API token must remain in the operator environment or a secret manager.

The rate limits cover login/MFA, reset/OTP, administrator writes, and signed payment/video webhooks. The application still verifies authentication and webhook signatures; Cloudflare controls are an additional abuse boundary, not an authorization replacement.
