import Badge from '@/components/ui/Badge';
import type { SocialPostStatus } from '@/types';

const variantForStatus = (status: SocialPostStatus) => {
  if (status === 'published' || status === 'approved') return 'approved';
  if (status === 'rejected' || status === 'failed_generation' || status === 'failed_publish' || status === 'expired_token') return 'rejected';
  if (status === 'scheduled' || status === 'publishing') return 'active';
  if (status === 'needs_review' || status === 'draft') return 'pending';
  return 'default';
};

const labelForStatus = (status: SocialPostStatus) => status.replace(/_/g, ' ');

export default function StatusBadge({ status }: { status: SocialPostStatus }) {
  return <Badge variant={variantForStatus(status)}>{labelForStatus(status)}</Badge>;
}
