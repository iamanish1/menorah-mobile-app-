# Menorah Mobile QA Flows

These Maestro flows are safe scaffolds for Expo production QA. They do not hardcode real credentials.

## Prerequisites

- Install Maestro on the workstation that has an iOS simulator or Android emulator/device.
- Build or install the Menorah app with app id `com.menorah.healthmobile`.
- Use only QA accounts matching `tejasamirth+menorahqa-*@gmail.com`.

## Commands

```bash
cd /opt/menorah/menorah/mobile-app
maestro test maestro/00-launch.yaml
maestro test maestro/01-auth-navigation.yaml
QA_EMAIL='tejasamirth+menorahqa-YYYYMMDDHHMM@gmail.com' QA_PASSWORD='set-in-shell' maestro test maestro/02-login-logout.yaml
```

## Manual OTP Note

Email OTP verification still requires a human to read the Gmail OTP. Do not put OTPs in committed files.
