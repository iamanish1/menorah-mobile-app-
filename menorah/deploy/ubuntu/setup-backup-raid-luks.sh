#!/usr/bin/env bash
set -euo pipefail

MOUNT_POINT="${BACKUP_MOUNT_POINT:-/mnt/menorah-backups}"
RAID_DEVICE="${BACKUP_RAID_DEVICE:-/dev/md/menorah-backups}"
RAID_NAME="${BACKUP_RAID_NAME:-menorah-backups}"
LUKS_NAME="${BACKUP_LUKS_NAME:-menorah-backups-crypt}"
LUKS_KEY_FILE="${BACKUP_LUKS_KEY_FILE:-/opt/menorah/secrets/backup-luks.key}"
FS_LABEL="${BACKUP_FS_LABEL:-MENORAH_BACKUPS}"
BACKUP_OWNER="${BACKUP_OWNER:-tejasmenorah}"
BACKUP_STATUS_GROUP="${BACKUP_STATUS_GROUP:-}"
CONFIRMATION="${BACKUP_DISK_CONFIRM:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo BACKUP_DISK_CONFIRM=WIPE_THESE_DISKS $0 <disk1> <disk2>" >&2
  exit 1
fi

if [[ "$#" -eq 2 ]]; then
  DISKS=("$1" "$2")
elif [[ -n "${BACKUP_DISKS:-}" ]]; then
  # shellcheck disable=SC2206
  DISKS=(${BACKUP_DISKS})
else
  cat >&2 <<EOF
Usage:
  sudo BACKUP_DISK_CONFIRM=WIPE_THESE_DISKS $0 /dev/disk/by-id/<disk-1> /dev/disk/by-id/<disk-2>

This script creates a RAID1 + LUKS + ext4 backup volume at ${MOUNT_POINT}.
It intentionally refuses to run without exactly two explicit disk paths.
EOF
  exit 2
fi

if [[ "${#DISKS[@]}" -ne 2 ]]; then
  echo "Exactly two backup disks are required." >&2
  exit 2
fi

need_command() {
  local command_name="$1"
  local package_name="$2"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Installing required package: ${package_name}"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y "${package_name}"
  fi
}

need_command mdadm mdadm
need_command cryptsetup cryptsetup
need_command sgdisk gdisk
need_command partprobe parted
need_command mkfs.ext4 e2fsprogs

echo "Current block devices:"
lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINTS,MODEL,SERIAL,UUID
echo

root_source="$(findmnt -n -o SOURCE /)"

resolve_disk() {
  readlink -f "$1"
}

partition_path() {
  local disk="$1"
  if [[ "${disk}" =~ [0-9]$ ]]; then
    printf '%sp1' "${disk}"
  else
    printf '%s1' "${disk}"
  fi
}

for disk in "${DISKS[@]}"; do
  resolved="$(resolve_disk "${disk}")"
  if [[ ! -b "${resolved}" ]]; then
    echo "Not a block device: ${disk} (${resolved})" >&2
    exit 1
  fi

  if [[ "${root_source}" == "${resolved}"* ]]; then
    echo "Refusing to use root/system disk: ${disk}" >&2
    exit 1
  fi

  if lsblk -nrpo MOUNTPOINTS "${resolved}" | grep -q '[^[:space:]]'; then
    echo "Refusing to use mounted disk: ${disk}" >&2
    lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINTS,MODEL,SERIAL "${resolved}" >&2
    exit 1
  fi
done

if [[ "${CONFIRMATION}" != "WIPE_THESE_DISKS" ]]; then
  cat >&2 <<EOF
Safety stop. This script will destroy all data on:
  ${DISKS[0]}
  ${DISKS[1]}

Re-run only after confirming these are the two intended backup HDDs:
  sudo BACKUP_DISK_CONFIRM=WIPE_THESE_DISKS $0 ${DISKS[0]} ${DISKS[1]}
EOF
  exit 3
fi

install -d -m 0700 "$(dirname "${LUKS_KEY_FILE}")"
if [[ ! -f "${LUKS_KEY_FILE}" ]]; then
  openssl rand -base64 64 > "${LUKS_KEY_FILE}"
  chmod 0400 "${LUKS_KEY_FILE}"
fi

PARTITIONS=()
for disk in "${DISKS[@]}"; do
  resolved="$(resolve_disk "${disk}")"
  echo "Wiping and partitioning ${disk} (${resolved})"
  wipefs -a "${resolved}"
  sgdisk --zap-all "${resolved}"
  sgdisk -n 1:1MiB:0 -t 1:fd00 -c 1:"${RAID_NAME}" "${resolved}"
  partprobe "${resolved}" || true
  PARTITIONS+=("$(partition_path "${resolved}")")
done

udevadm settle || true

echo "Creating RAID1 array: ${RAID_DEVICE}"
mkdir -p "$(dirname "${RAID_DEVICE}")"
mdadm --create "${RAID_DEVICE}" \
  --level=1 \
  --raid-devices=2 \
  --metadata=1.2 \
  --name="${RAID_NAME}" \
  "${PARTITIONS[0]}" "${PARTITIONS[1]}"

udevadm settle || true

if [[ -f /etc/mdadm/mdadm.conf ]]; then
  cp /etc/mdadm/mdadm.conf "/etc/mdadm/mdadm.conf.$(date -u +%Y%m%dT%H%M%SZ).bak"
fi
mdadm --detail --scan | grep "${RAID_NAME}" >> /etc/mdadm/mdadm.conf

echo "Creating LUKS container on ${RAID_DEVICE}"
cryptsetup luksFormat --batch-mode --type luks2 --key-file "${LUKS_KEY_FILE}" "${RAID_DEVICE}"
cryptsetup open --key-file "${LUKS_KEY_FILE}" "${RAID_DEVICE}" "${LUKS_NAME}"

echo "Formatting /dev/mapper/${LUKS_NAME} as ext4"
mkfs.ext4 -F -L "${FS_LABEL}" "/dev/mapper/${LUKS_NAME}"

install -d -m 0750 -o "${BACKUP_OWNER}" -g "${BACKUP_OWNER}" "${MOUNT_POINT}"

raid_uuid="$(blkid -s UUID -o value "${RAID_DEVICE}")"
fs_uuid="$(blkid -s UUID -o value "/dev/mapper/${LUKS_NAME}")"

cp /etc/crypttab "/etc/crypttab.$(date -u +%Y%m%dT%H%M%SZ).bak" 2>/dev/null || true
grep -v "^${LUKS_NAME}[[:space:]]" /etc/crypttab 2>/dev/null > /tmp/menorah-crypttab || true
printf '%s UUID=%s %s luks,nofail\n' "${LUKS_NAME}" "${raid_uuid}" "${LUKS_KEY_FILE}" >> /tmp/menorah-crypttab
install -m 0644 /tmp/menorah-crypttab /etc/crypttab

cp /etc/fstab "/etc/fstab.$(date -u +%Y%m%dT%H%M%SZ).bak"
grep -v "[[:space:]]${MOUNT_POINT}[[:space:]]" /etc/fstab > /tmp/menorah-fstab || true
printf 'UUID=%s %s ext4 defaults,nofail,nodev,nosuid 0 2\n' "${fs_uuid}" "${MOUNT_POINT}" >> /tmp/menorah-fstab
install -m 0644 /tmp/menorah-fstab /etc/fstab

mount "${MOUNT_POINT}"
chown "${BACKUP_OWNER}:${BACKUP_OWNER}" "${MOUNT_POINT}"
chmod 0750 "${MOUNT_POINT}"
install -d -m 0750 -o "${BACKUP_OWNER}" -g "${BACKUP_OWNER}" \
  "${MOUNT_POINT}/six-hourly" \
  "${MOUNT_POINT}/daily" \
  "${MOUNT_POINT}/weekly" \
  "${MOUNT_POINT}/monthly" \
  "${MOUNT_POINT}/restore-tests" \
  "${MOUNT_POINT}/metadata"

if [[ -n "${BACKUP_STATUS_GROUP}" ]]; then
  if ! getent group "${BACKUP_STATUS_GROUP}" >/dev/null 2>&1; then
    echo "Backup status group does not exist: ${BACKUP_STATUS_GROUP}" >&2
    exit 1
  fi

  chgrp "${BACKUP_STATUS_GROUP}" \
    "${MOUNT_POINT}" \
    "${MOUNT_POINT}/six-hourly" \
    "${MOUNT_POINT}/daily" \
    "${MOUNT_POINT}/weekly" \
    "${MOUNT_POINT}/monthly" \
    "${MOUNT_POINT}/restore-tests" \
    "${MOUNT_POINT}/metadata"
  chmod 2750 \
    "${MOUNT_POINT}" \
    "${MOUNT_POINT}/six-hourly" \
    "${MOUNT_POINT}/daily" \
    "${MOUNT_POINT}/weekly" \
    "${MOUNT_POINT}/monthly" \
    "${MOUNT_POINT}/restore-tests" \
    "${MOUNT_POINT}/metadata"
fi

if command -v update-initramfs >/dev/null 2>&1; then
  update-initramfs -u
fi

systemctl daemon-reload || true

echo "Backup RAID/LUKS volume ready at ${MOUNT_POINT}"
echo "Set MENORAH_BACKUP_ROOT=${MOUNT_POINT} and BACKUP_REQUIRE_MOUNT=true in deploy/env/production.env."
