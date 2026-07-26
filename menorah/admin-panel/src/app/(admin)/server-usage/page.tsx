'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Archive, CalendarClock, CheckCircle2, Cpu, Database, HardDrive, MemoryStick,
  Network, RefreshCcw, Server, ShieldAlert, ShieldCheck, Timer, UploadCloud
} from 'lucide-react';
import { api } from '@/lib/api';
import type { BackupUsage, DiskUsage, HostUsage, ServerUsage } from '@/types';

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDuration = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const clampPercent = (value: number | null | undefined) =>
  Math.max(0, Math.min(100, Number.isFinite(value || 0) ? Number(value) : 0));

const usageTone = (percent: number) => {
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 75) return 'bg-amber-500';
  return 'bg-blue-600';
};

const formatAge = (ageHours: number | null | undefined) => {
  if (!Number.isFinite(ageHours ?? NaN)) return 'Not recorded';
  const hours = Number(ageHours);
  if (hours < 1) return 'Less than 1 hour ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);
  return remainder > 0 ? `${days}d ${remainder}h ago` : `${days}d ago`;
};

const formatBackupType = (type?: string | null) => {
  if (!type) return 'Backup';
  return type.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};

const backupStatusTone = (status: BackupUsage['status']) => {
  if (status === 'ok') return {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    icon: 'text-emerald-600',
    pill: 'bg-emerald-100 text-emerald-800',
  };
  if (status === 'warning') return {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    icon: 'text-amber-600',
    pill: 'bg-amber-100 text-amber-800',
  };
  return {
    border: 'border-red-200',
    bg: 'bg-red-50',
    text: 'text-red-800',
    icon: 'text-red-600',
    pill: 'bg-red-100 text-red-800',
  };
};

function ResourceCard({
  title,
  value,
  subtitle,
  percent,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  percent: number;
  icon: typeof Cpu;
}) {
  const safePercent = clampPercent(percent);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-gray-950">{value}</p>
          <p className="mt-1 truncate text-xs font-medium text-gray-500">{subtitle}</p>
        </div>
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon size={22} />
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-500">
          <span>Usage</span>
          <span>{safePercent.toFixed(1)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${usageTone(safePercent)}`} style={{ width: `${safePercent}%` }} />
        </div>
      </div>
    </div>
  );
}

function BackupMiniCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'blue',
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Cpu;
  tone?: 'blue' | 'green' | 'amber' | 'red';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-gray-500">{title}</p>
          <p className="mt-2 text-lg font-black text-gray-950">{value}</p>
          <p className="mt-1 text-xs font-medium leading-5 text-gray-500">{subtitle}</p>
        </div>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function BackupProtectionPanel({ backup }: { backup: BackupUsage }) {
  const tone = backupStatusTone(backup.status);
  const latest = backup.latest;
  const daily = backup.byType.daily;
  const weekly = backup.byType.weekly;
  const monthly = backup.byType.monthly;
  const raidTone = backup.raid.ok ? 'green' : backup.raid.resyncPercent !== null ? 'amber' : 'red';
  const latestTone = latest?.encrypted && latest.checksumPresent ? 'green' : 'amber';
  const restoreTone = backup.restoreTest.ok ? 'green' : 'amber';

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${tone.border} ${tone.bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white ${tone.icon}`}>
            {backup.status === 'ok' ? <ShieldCheck size={26} /> : <ShieldAlert size={26} />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-gray-950">Backup Protection</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${tone.pill}`}>{backup.headline}</span>
            </div>
            <p className={`mt-1 max-w-3xl text-sm font-semibold leading-6 ${tone.text}`}>{backup.message}</p>
          </div>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs font-bold uppercase text-gray-500">Backup storage</p>
          <p className="mt-1 text-lg font-black text-gray-950">
            {backup.volume.usagePercent.toFixed(1)}% used
          </p>
          <p className="text-xs font-medium text-gray-500">{formatBytes(backup.volume.free)} free</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <BackupMiniCard
          title="Automatic backups"
          value={backup.automationEnabled ? 'On' : 'Check setup'}
          subtitle={`${backup.schedule.daily}; restore check ${backup.schedule.restoreTest.toLowerCase()}.`}
          icon={CalendarClock}
          tone={backup.automationEnabled ? 'green' : 'amber'}
        />
        <BackupMiniCard
          title="Latest backup"
          value={formatAge(latest?.ageHours)}
          subtitle={latest
            ? `${formatBackupType(latest.type)} backup, ${latest.encrypted ? 'encrypted' : 'not encrypted'}, ${latest.checksumPresent ? 'verified file' : 'checksum missing'}.`
            : 'No successful backup has been recorded yet.'}
          icon={Archive}
          tone={latest ? latestTone : 'red'}
        />
        <BackupMiniCard
          title="Restore test"
          value={backup.restoreTest.ok ? 'Passed' : 'Needs check'}
          subtitle={backup.restoreTest.timestamp
            ? `Last restore test completed ${formatAge(backup.restoreTest.ageHours)}.`
            : backup.restoreTest.message}
          icon={CheckCircle2}
          tone={restoreTone}
        />
        <BackupMiniCard
          title="Drive mirror"
          value={backup.raid.ok ? 'Healthy' : backup.raid.resyncPercent !== null ? `${backup.raid.resyncPercent.toFixed(1)}% syncing` : 'Attention'}
          subtitle={backup.raid.ok
            ? `${backup.raid.activeDevices || 2} of ${backup.raid.totalDevices || 2} backup drives are active.`
            : backup.raid.message}
          icon={HardDrive}
          tone={raidTone}
        />
        <BackupMiniCard
          title="Cold storage"
          value="Weekly manual"
          subtitle={`${backup.coldStorage.label}: copy encrypted backups, then disconnect it.`}
          icon={UploadCloud}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-4">
          <p className="text-xs font-bold uppercase text-gray-500">Retention</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
            6-hourly for {backup.retention.sixHourlyDays} days, daily for {backup.retention.dailyDays} days,
            weekly for {Math.round(backup.retention.weeklyDays / 7)} weeks, monthly for about {Math.round(backup.retention.monthlyDays / 30)} months.
          </p>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="text-xs font-bold uppercase text-gray-500">Recent archives</p>
          <div className="mt-2 space-y-1 text-sm font-semibold text-gray-700">
            <p>Daily: {daily ? formatAge(daily.ageHours) : 'not recorded yet'}</p>
            <p>Weekly: {weekly ? formatAge(weekly.ageHours) : 'waiting for Sunday run'}</p>
            <p>Monthly: {monthly ? formatAge(monthly.ageHours) : 'waiting for monthly run'}</p>
          </div>
        </div>
        <div className="rounded-xl bg-white p-4">
          <p className="text-xs font-bold uppercase text-gray-500">Plain-English meaning</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
            If production data is lost, the team can restore from the encrypted backup set. The daily restore test proves the latest recovery artifact is usable.
          </p>
        </div>
      </div>

      {backup.issues.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
          <p className="text-xs font-bold uppercase text-amber-700">Needs attention</p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-amber-900">
            {backup.issues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function DiskRow({ label, disk }: { label: string; disk: DiskUsage }) {
  const percent = clampPercent(disk.usagePercent);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{disk.path}</p>
        </div>
        <p className="text-sm font-bold text-gray-900">
          {formatBytes(disk.used)} / {formatBytes(disk.total)}
        </p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${usageTone(percent)}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-medium text-gray-500">
        <span>{percent.toFixed(1)}% used</span>
        <span>{formatBytes(disk.free)} free</span>
      </div>
    </div>
  );
}

function UsageBar({ label, detail, percent }: { label: string; detail: string; percent: number }) {
  const safePercent = clampPercent(percent);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-gray-900">{label}</span>
        <span className="text-xs font-semibold text-gray-500">{detail}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${usageTone(safePercent)}`} style={{ width: `${safePercent}%` }} />
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-gray-500">{safePercent.toFixed(1)}% used</p>
    </div>
  );
}

function HostUsagePanel({ title, host }: { title: string; host: HostUsage }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-blue-600" />
          <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        </div>
        <span className="truncate text-xs font-semibold text-gray-500">{host.hostname}</span>
      </div>
      <div className="space-y-4">
        <UsageBar
          label="CPU"
          detail={`load ${host.cpu.loadAverage[0]?.toFixed(2) || '0.00'}`}
          percent={host.cpu.usagePercent}
        />
        <UsageBar
          label="RAM"
          detail={`${formatBytes(host.memory.used)} / ${formatBytes(host.memory.total)}`}
          percent={host.memory.usagePercent}
        />
        <UsageBar
          label="Data disk"
          detail={`${formatBytes(host.disk.data.used)} / ${formatBytes(host.disk.data.total)}`}
          percent={host.disk.data.usagePercent}
        />
      </div>
    </div>
  );
}

export default function ServerUsagePage() {
  const [usage, setUsage] = useState<ServerUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadUsage = async () => {
    const response = await api.getServerUsage();
    if (response.success && response.data) {
      setUsage(response.data);
      setError('');
      setLastRefresh(new Date());
    } else {
      setError(response.message || 'Could not load server usage.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsage();
    const interval = window.setInterval(loadUsage, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const processMemoryPercent = useMemo(() => {
    if (!usage?.container.memory?.max) return null;
    return (usage.process.memory.rss / usage.container.memory.max) * 100;
  }, [usage]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-44 animate-pulse rounded-2xl border border-gray-200 bg-white" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl border border-gray-200 bg-white" />
      </div>
    );
  }

  if (!usage) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-bold">Server usage unavailable</p>
        <p className="mt-1 text-sm">{error || 'Try again in a moment.'}</p>
      </div>
    );
  }

  const containerMemory = usage.container.memory;
  const containerMemoryPercent = containerMemory?.usagePercent ?? usage.memory.usagePercent;
  const server = usage.server ?? {
    label: 'Server',
    hostname: usage.host.hostname,
    platform: usage.host.platform,
    release: usage.host.release,
    uptimeSeconds: usage.host.uptimeSeconds,
    cpu: usage.cpu,
    memory: usage.memory,
    disk: {
      root: usage.disk.root,
      data: usage.disk.uploads,
    },
    network: usage.network,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">Server Usage</h2>
          <p className="mt-1 text-sm text-gray-500">
            Live resource view for the production server, admin API container, and backup protection.
          </p>
        </div>
        <button
          type="button"
          onClick={loadUsage}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ResourceCard
          title={`${server.label} CPU`}
          value={`${server.cpu.usagePercent.toFixed(1)}%`}
          subtitle={`Load ${server.cpu.loadAverage[0]?.toFixed(2) || '0.00'}`}
          percent={server.cpu.usagePercent}
          icon={Cpu}
        />
        <ResourceCard
          title={`${server.label} RAM`}
          value={`${server.memory.usagePercent.toFixed(1)}%`}
          subtitle={`${formatBytes(server.memory.used)} of ${formatBytes(server.memory.total)}`}
          percent={server.memory.usagePercent}
          icon={MemoryStick}
        />
        <ResourceCard
          title={`${server.label} Disk`}
          value={`${server.disk.data.usagePercent.toFixed(1)}%`}
          subtitle={`${formatBytes(server.disk.data.used)} of ${formatBytes(server.disk.data.total)}`}
          percent={server.disk.data.usagePercent}
          icon={HardDrive}
        />
      </div>

      {usage.backup && <BackupProtectionPanel backup={usage.backup} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Performance</h3>
              <p className="text-xs text-gray-500">Auto-refreshes every 5 seconds</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">CPU load</p>
                  <p className="mt-2 text-lg font-black">{server.cpu.usagePercent.toFixed(1)}% usage</p>
                </div>
                <Cpu className="text-blue-300" size={28} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {server.cpu.loadAverage.map((load, index) => (
                  <div key={index} className="rounded-lg bg-white/10 p-3">
                    <p className="text-[10px] font-bold uppercase text-slate-400">{[1, 5, 15][index]} min</p>
                    <p className="mt-1 text-lg font-black">{load.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Node process</p>
                  <p className="mt-2 text-lg font-black text-gray-950">PID {usage.process.pid}</p>
                </div>
                <Server className="text-blue-600" size={28} />
              </div>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">RSS memory</span>
                  <span className="font-bold text-gray-900">{formatBytes(usage.process.memory.rss)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Heap used</span>
                  <span className="font-bold text-gray-900">{formatBytes(usage.process.memory.heapUsed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Process uptime</span>
                  <span className="font-bold text-gray-900">{formatDuration(usage.process.uptimeSeconds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Container RAM</span>
                  <span className="font-bold text-gray-900">
                    {containerMemory ? formatBytes(containerMemory.current) : 'N/A'}
                  </span>
                </div>
                {processMemoryPercent !== null && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs font-semibold text-gray-500">
                      <span>Process of container limit</span>
                      <span>{clampPercent(processMemoryPercent).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${clampPercent(processMemoryPercent)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <HostUsagePanel title={`${server.label} usage`} host={server} />

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Database size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Storage</h3>
            </div>
            <div className="space-y-3">
              <DiskRow label={`${server.label} data volume`} disk={server.disk.data} />
              <DiskRow label="Container root" disk={usage.disk.root} />
              <DiskRow label="Uploads path" disk={usage.disk.uploads} />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Network size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Network totals</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-bold uppercase text-blue-500">Received</p>
                <p className="mt-2 text-xl font-black text-blue-950">{formatBytes(usage.network.rxBytes)}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase text-emerald-600">Sent</p>
                <p className="mt-2 text-xl font-black text-emerald-950">{formatBytes(usage.network.txBytes)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Timer size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">System</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Host</span>
                <span className="truncate font-bold text-gray-900">{server.hostname}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Platform</span>
                <span className="font-bold text-gray-900">{server.platform} {server.release}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Host uptime</span>
                <span className="font-bold text-gray-900">{formatDuration(server.uptimeSeconds)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Last refresh</span>
                <span className="font-bold text-gray-900">{lastRefresh?.toLocaleTimeString() || 'Now'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
