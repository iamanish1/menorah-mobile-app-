'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, Edit3, Loader2, Play, Plus, RefreshCw, Save, Trash2, Workflow, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { SocialAspectRatio, SocialCampaignBrief, SocialGenerationRun, SocialWorkflow, SocialWorkflowSchedule } from '@/types';

type WorkflowDraft = {
  name: string;
  description: string;
  status: SocialWorkflow['status'];
  customMaxPosts: number;
  campaigns: SocialCampaignBrief[];
  schedule: SocialWorkflowSchedule;
};

const defaultSchedule = (): SocialWorkflowSchedule => ({
  enabled: false,
  type: 'none',
  timezone: 'Asia/Dubai',
  runAt: null,
  timeOfDay: '09:00',
  dayOfWeek: 1,
  dayOfMonth: 1,
  lastScheduledKey: ''
});

const emptyCampaign = (): SocialCampaignBrief => ({
  topic: '',
  campaignName: '',
  audience: 'Men looking for practical mental health support',
  objective: 'Encourage one honest next step toward support',
  tone: 'Warm, grounded, premium, and practical',
  postType: 'single_image',
  aspectRatio: '4:5',
  postCount: 1,
  textSystemPromptOverride: '',
  imageSystemPromptOverride: ''
});

const emptyDraft = (): WorkflowDraft => ({
  name: '',
  description: '',
  status: 'active',
  customMaxPosts: 20,
  campaigns: [emptyCampaign()],
  schedule: defaultSchedule()
});

const statusClass = (status: string) => cn(
  'rounded-full px-2.5 py-1 text-xs font-bold',
  ['active', 'completed'].includes(status) && 'bg-emerald-50 text-emerald-700',
  ['queued', 'running', 'partial', 'paused'].includes(status) && 'bg-amber-50 text-amber-700',
  ['failed', 'archived'].includes(status) && 'bg-red-50 text-red-700',
  !['active', 'completed', 'queued', 'running', 'partial', 'paused', 'failed', 'archived'].includes(status) && 'bg-gray-100 text-gray-600'
);

export default function SocialStudioWorkflowsPage() {
  const [workflows, setWorkflows] = useState<SocialWorkflow[]>([]);
  const [runs, setRuns] = useState<SocialGenerationRun[]>([]);
  const [draft, setDraft] = useState<WorkflowDraft>(() => emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const totalPosts = useMemo(
    () => draft.campaigns.reduce((total, campaign) => total + (Number(campaign.postCount) || 0), 0),
    [draft.campaigns]
  );

  const load = async () => {
    const [workflowResponse, runResponse] = await Promise.all([
      api.getSocialWorkflows(),
      api.getSocialRuns({ limit: 10 })
    ]);

    if (workflowResponse.success && workflowResponse.data) setWorkflows(workflowResponse.data.workflows);
    else toast.error(workflowResponse.message || 'Unable to load workflows');

    if (runResponse.success && runResponse.data) setRuns(runResponse.data.runs);
    else toast.error(runResponse.message || 'Unable to load workflow runs');

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateCampaign = <K extends keyof SocialCampaignBrief>(index: number, key: K, value: SocialCampaignBrief[K]) => {
    setDraft((current) => {
      const campaigns = [...current.campaigns];
      campaigns[index] = { ...campaigns[index], [key]: value };
      return { ...current, campaigns };
    });
  };

  const updateSchedule = <K extends keyof SocialWorkflowSchedule>(key: K, value: SocialWorkflowSchedule[K]) => {
    setDraft((current) => ({
      ...current,
      schedule: { ...current.schedule, [key]: value }
    }));
  };

  const saveWorkflow = async () => {
    if (draft.name.trim().length < 2) {
      toast.error('Add a workflow name');
      return;
    }
    if (draft.campaigns.some((campaign) => campaign.topic.trim().length < 3 || campaign.campaignName.trim().length < 2)) {
      toast.error('Each campaign needs a topic and campaign name');
      return;
    }

    setActionLoading('save');
    const response = editingId
      ? await api.updateSocialWorkflow(editingId, draft)
      : await api.createSocialWorkflow(draft);
    setActionLoading(null);

    if (response.success) {
      toast.success(editingId ? 'Workflow updated' : 'Workflow saved');
      setEditingId(null);
      setDraft(emptyDraft());
      load();
      return;
    }

    toast.error(response.message || 'Unable to save workflow');
  };

  const editWorkflow = (workflow: SocialWorkflow) => {
    setEditingId(workflow.id);
    setDraft({
      name: workflow.name,
      description: workflow.description || '',
      status: workflow.status,
      customMaxPosts: workflow.customMaxPosts || 20,
      campaigns: workflow.campaigns?.length ? workflow.campaigns : [emptyCampaign()],
      schedule: workflow.schedule || defaultSchedule()
    });
  };

  const runWorkflow = async (workflow: SocialWorkflow) => {
    setActionLoading(`run-${workflow.id}`);
    const response = await api.runSocialWorkflow(workflow.id);
    setActionLoading(null);

    if (response.success) {
      toast.success('Workflow run queued');
      load();
      return;
    }

    toast.error(response.message || 'Unable to run workflow');
  };

  const archiveWorkflow = async (workflow: SocialWorkflow) => {
    setActionLoading(`archive-${workflow.id}`);
    const response = await api.deleteSocialWorkflow(workflow.id);
    setActionLoading(null);

    if (response.success) {
      toast.success('Workflow archived');
      load();
      return;
    }

    toast.error(response.message || 'Unable to archive workflow');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Marketing Workflows</h2>
          <p className="mt-0.5 text-sm text-gray-500">Save campaign sets, schedule recurring runs, and generate multiple Instagram drafts.</p>
        </div>
        <button
          onClick={load}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      <SocialStudioTabs />

      {loading ? (
        <div className="grid gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
          <div className="h-[720px] animate-pulse rounded-xl bg-white" />
          <div className="h-[720px] animate-pulse rounded-xl bg-white" />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[520px_minmax(0,1fr)]">
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">{editingId ? 'Edit Workflow' : 'Create Workflow'}</h3>
                <p className="mt-0.5 text-xs text-gray-500">{totalPosts} posts across {draft.campaigns.length} campaigns</p>
              </div>
              {editingId && (
                <button
                  onClick={() => {
                    setEditingId(null);
                    setDraft(emptyDraft());
                  }}
                  className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                  aria-label="Cancel edit"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Workflow name">
                <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="field-input" />
              </Field>
              <Field label="Status">
                <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as SocialWorkflow['status'] }))} className="field-input">
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </Field>
              <Field label="Max posts per run">
                <input type="number" min={1} max={20} value={draft.customMaxPosts} onChange={(event) => setDraft((current) => ({ ...current, customMaxPosts: Math.max(1, Number(event.target.value) || 1) }))} className="field-input" />
              </Field>
              <Field label="Timezone">
                <input value={draft.schedule.timezone} onChange={(event) => updateSchedule('timezone', event.target.value)} className="field-input" />
              </Field>
            </div>

            <Field label="Description">
              <textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={2} className="field-input leading-5" />
            </Field>

            <div className="rounded-xl border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-gray-900">Schedule</h4>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={draft.schedule.enabled}
                    onChange={(event) => {
                      updateSchedule('enabled', event.target.checked);
                      updateSchedule('type', event.target.checked ? 'daily' : 'none');
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Enabled
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type">
                  <select value={draft.schedule.type} onChange={(event) => updateSchedule('type', event.target.value as SocialWorkflowSchedule['type'])} className="field-input">
                    <option value="none">None</option>
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
                {draft.schedule.type === 'once' ? (
                  <Field label="Run at">
                    <input type="datetime-local" value={(draft.schedule.runAt || '').slice(0, 16)} onChange={(event) => updateSchedule('runAt', event.target.value)} className="field-input" />
                  </Field>
                ) : (
                  <Field label="Time">
                    <input type="time" value={draft.schedule.timeOfDay || '09:00'} onChange={(event) => updateSchedule('timeOfDay', event.target.value)} className="field-input" />
                  </Field>
                )}
                {draft.schedule.type === 'weekly' && (
                  <Field label="Day">
                    <select value={draft.schedule.dayOfWeek || 1} onChange={(event) => updateSchedule('dayOfWeek', Number(event.target.value))} className="field-input">
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                        <option key={day} value={index}>{day}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {draft.schedule.type === 'monthly' && (
                  <Field label="Day of month">
                    <input type="number" min={1} max={31} value={draft.schedule.dayOfMonth || 1} onChange={(event) => updateSchedule('dayOfMonth', Number(event.target.value) || 1)} className="field-input" />
                  </Field>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {draft.campaigns.map((campaign, index) => (
                <div key={index} className="space-y-3 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-gray-900">Campaign {index + 1}</h4>
                    {draft.campaigns.length > 1 && (
                      <button
                        onClick={() => setDraft((current) => ({ ...current, campaigns: current.campaigns.filter((_, campaignIndex) => campaignIndex !== index) }))}
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                        aria-label="Remove campaign"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <Field label="Topic">
                    <textarea value={campaign.topic} onChange={(event) => updateCampaign(index, 'topic', event.target.value)} rows={2} className="field-input leading-5" />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Campaign name">
                      <input value={campaign.campaignName} onChange={(event) => updateCampaign(index, 'campaignName', event.target.value)} className="field-input" />
                    </Field>
                    <Field label="Posts">
                      <input type="number" min={1} max={20} value={campaign.postCount} onChange={(event) => updateCampaign(index, 'postCount', Math.max(1, Number(event.target.value) || 1))} className="field-input" />
                    </Field>
                    <Field label="Audience">
                      <input value={campaign.audience} onChange={(event) => updateCampaign(index, 'audience', event.target.value)} className="field-input" />
                    </Field>
                    <Field label="Aspect ratio">
                      <select value={campaign.aspectRatio || '4:5'} onChange={(event) => updateCampaign(index, 'aspectRatio', event.target.value as SocialAspectRatio)} className="field-input">
                        <option value="1:1">1:1 square</option>
                        <option value="4:5">4:5 portrait</option>
                        <option value="9:16">9:16 story</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Objective">
                    <input value={campaign.objective} onChange={(event) => updateCampaign(index, 'objective', event.target.value)} className="field-input" />
                  </Field>
                  <Field label="Tone">
                    <input value={campaign.tone || ''} onChange={(event) => updateCampaign(index, 'tone', event.target.value)} className="field-input" />
                  </Field>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Text prompt override">
                      <textarea value={campaign.textSystemPromptOverride || ''} onChange={(event) => updateCampaign(index, 'textSystemPromptOverride', event.target.value)} rows={3} className="field-input leading-5" />
                    </Field>
                    <Field label="Image prompt override">
                      <textarea value={campaign.imageSystemPromptOverride || ''} onChange={(event) => updateCampaign(index, 'imageSystemPromptOverride', event.target.value)} rows={3} className="field-input leading-5" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setDraft((current) => ({ ...current, campaigns: [...current.campaigns, emptyCampaign()] }))}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Plus size={16} />
                Add Campaign
              </button>
              <button
                onClick={saveWorkflow}
                disabled={actionLoading === 'save'}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {actionLoading === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editingId ? 'Update Workflow' : 'Save Workflow'}
              </button>
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
                <Workflow size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Saved Workflows</h3>
              </div>
              {workflows.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <Workflow size={36} className="text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-600">No workflows saved</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {workflows.map((workflow) => (
                    <article key={workflow.id} className="p-5">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-gray-900">{workflow.name}</h4>
                            <span className={statusClass(workflow.status)}>{workflow.status}</span>
                            {workflow.schedule?.enabled && <span className={statusClass('running')}>{workflow.schedule.type}</span>}
                          </div>
                          {workflow.description && <p className="mt-1 text-sm text-gray-500">{workflow.description}</p>}
                          <p className="mt-2 text-xs font-semibold text-gray-500">{workflow.campaigns.length} campaigns, max {workflow.customMaxPosts} posts</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => editWorkflow(workflow)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                            <Edit3 size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => runWorkflow(workflow)}
                            disabled={actionLoading === `run-${workflow.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {actionLoading === `run-${workflow.id}` ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                            Run
                          </button>
                          <button
                            onClick={() => archiveWorkflow(workflow)}
                            disabled={actionLoading === `archive-${workflow.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            Archive
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {workflow.campaigns.map((campaign, index) => (
                          <div key={campaign.id || index} className="rounded-lg bg-gray-50 p-3">
                            <p className="truncate text-sm font-semibold text-gray-900">{campaign.campaignName}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{campaign.topic}</p>
                            <p className="mt-2 text-xs font-medium text-gray-400">{campaign.postCount} posts, {campaign.aspectRatio}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
                <CalendarClock size={18} className="text-emerald-600" />
                <h3 className="text-sm font-bold text-gray-900">Recent Runs</h3>
              </div>
              {runs.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <CalendarClock size={34} className="text-gray-300" />
                  <p className="mt-3 text-sm font-medium text-gray-600">No workflow runs yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {runs.map((run) => (
                    <div key={run.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={statusClass(run.status)}>{run.status}</span>
                          <p className="text-sm font-bold text-gray-900">{run.workflowName || 'Manual run'}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">{formatDate(run.createdAt)} - {run.source}</p>
                      </div>
                      <div className="text-sm font-semibold text-gray-700">
                        {run.completedCount}/{run.requestedCount} generated
                        {(run.failedCount || 0) > 0 && <span className="ml-2 text-red-600">{run.failedCount} failed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-gray-100 px-5 py-3">
                <Link href="/ai-social-studio/posts" className="text-xs font-semibold text-blue-600 hover:underline">
                  Open generated posts
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
