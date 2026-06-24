'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Cpu, Database, HardDrive, MemoryStick, Network, RefreshCcw, Server, Timer
} from 'lucide-react';
import { api } from '@/lib/api';
import type { DiskUsage, ServerUsage } from '@/types';

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">Server Usage</h2>
          <p className="mt-1 text-sm text-gray-500">
            Live resource view for the production admin API container and host-visible resources.
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ResourceCard
          title="CPU"
          value={`${usage.cpu.usagePercent.toFixed(1)}%`}
          subtitle={`${usage.cpu.cores} cores - load ${usage.cpu.loadAverage[0]?.toFixed(2) || '0.00'}`}
          percent={usage.cpu.usagePercent}
          icon={Cpu}
        />
        <ResourceCard
          title="Memory"
          value={`${usage.memory.usagePercent.toFixed(1)}%`}
          subtitle={`${formatBytes(usage.memory.used)} of ${formatBytes(usage.memory.total)}`}
          percent={usage.memory.usagePercent}
          icon={MemoryStick}
        />
        <ResourceCard
          title="Container RAM"
          value={containerMemory ? formatBytes(containerMemory.current) : 'N/A'}
          subtitle={containerMemory?.max ? `limit ${formatBytes(containerMemory.max)}` : 'No container limit reported'}
          percent={containerMemoryPercent}
          icon={Activity}
        />
        <ResourceCard
          title="Storage"
          value={`${usage.disk.root.usagePercent.toFixed(1)}%`}
          subtitle={`${formatBytes(usage.disk.root.used)} of ${formatBytes(usage.disk.root.total)}`}
          percent={usage.disk.root.usagePercent}
          icon={HardDrive}
        />
      </div>

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
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Processor</p>
                  <p className="mt-2 text-lg font-black">{usage.cpu.cores} logical processors</p>
                </div>
                <Cpu className="text-blue-300" size={28} />
              </div>
              <p className="mt-4 line-clamp-2 text-sm text-slate-300">{usage.cpu.model}</p>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {usage.cpu.loadAverage.map((load, index) => (
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
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Database size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Storage</h3>
            </div>
            <div className="space-y-3">
              <DiskRow label="Root filesystem" disk={usage.disk.root} />
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
                <span className="truncate font-bold text-gray-900">{usage.host.hostname}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Platform</span>
                <span className="font-bold text-gray-900">{usage.host.platform} {usage.host.release}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Host uptime</span>
                <span className="font-bold text-gray-900">{formatDuration(usage.host.uptimeSeconds)}</span>
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
