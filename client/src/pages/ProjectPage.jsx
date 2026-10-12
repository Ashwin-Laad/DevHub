import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Activity, ArrowLeft, Check, ChevronDown, CircleDot, Clock3, MessageSquare, Plus, Tag, X } from 'lucide-react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  ASSIGN_ISSUE,
  ATTACH_LABEL,
  CREATE_COMMENT,
  CREATE_ISSUE,
  CREATE_LABEL,
  ISSUE_DETAILS,
  PROJECT_ACTIVITY,
  PROJECT_DETAILS,
  PROJECT_ISSUES,
  PROJECT_LABELS,
  REMOVE_LABEL,
  UPDATE_ISSUE,
} from '../graphql/operations.js';
import { EmptyState, ErrorMessage, LoadingState } from '../components/Feedback.jsx';

const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export default function ProjectPage() {
  const { projectId } = useParams();
  const { user } = useOutletContext();
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [activityLimit, setActivityLimit] = useState(20);
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [issuePriority, setIssuePriority] = useState('MEDIUM');
  const [issueAssignee, setIssueAssignee] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelFormOpen, setLabelFormOpen] = useState(false);

  const projectQuery = useQuery(PROJECT_DETAILS, { variables: { id: projectId } });
  const issueFilter = useMemo(() => {
    const filter = {};
    if (filterStatus) filter.status = filterStatus;
    if (filterPriority) filter.priority = filterPriority;
    if (filterAssignee === 'unassigned') filter.assigneeId = null;
    if (filterAssignee !== 'all' && filterAssignee !== 'unassigned') filter.assigneeId = filterAssignee;
    return Object.keys(filter).length ? filter : undefined;
  }, [filterAssignee, filterPriority, filterStatus]);
  const issueVariables = { projectId, filter: issueFilter, limit: 100, offset: 0 };
  const issueQuery = useQuery(PROJECT_ISSUES, { variables: issueVariables });
  const labelsQuery = useQuery(PROJECT_LABELS, { variables: { projectId } });
  const activityQuery = useQuery(PROJECT_ACTIVITY, { variables: { projectId, limit: activityLimit, offset: 0 } });

  const [createIssue, createIssueState] = useMutation(CREATE_ISSUE);
  const [updateIssue, updateIssueState] = useMutation(UPDATE_ISSUE);
  const [assignIssue, assignIssueState] = useMutation(ASSIGN_ISSUE);
  const [createComment, createCommentState] = useMutation(CREATE_COMMENT);
  const [createLabel, createLabelState] = useMutation(CREATE_LABEL);
  const [attachLabel, attachLabelState] = useMutation(ATTACH_LABEL);
  const [removeLabel, removeLabelState] = useMutation(REMOVE_LABEL);

  const project = projectQuery.data?.project;
  const issues = issueQuery.data?.issues ?? [];
  const labels = labelsQuery.data?.labels ?? [];
  const activity = activityQuery.data?.projectActivity ?? [];
  const membership = project?.organization.members.find(({ user: memberUser }) => memberUser.id === user.id);
  const canManage = ['ADMIN', 'PROJECT_MANAGER'].includes(membership?.role);
  const issueDetailsErrors = [createIssueState.error, updateIssueState.error, assignIssueState.error, createCommentState.error, createLabelState.error, attachLabelState.error, removeLabelState.error].find(Boolean);

  async function refreshProject() {
    await Promise.all([
      issueQuery.refetch(),
      labelsQuery.refetch(),
      activityQuery.refetch(),
      projectQuery.refetch(),
    ]);
  }

  async function runAction(operation, refresh = true) {
    try {
      const result = await operation;
      if (refresh) await refreshProject();
      return result;
    } catch {
      return null;
    }
  }

  async function handleCreateIssue(event) {
    event.preventDefault();
    const input = {
      projectId,
      title: issueTitle,
      priority: issuePriority,
      ...(issueDescription.trim() ? { description: issueDescription } : {}),
      ...(issueAssignee ? { assigneeId: issueAssignee } : {}),
    };
    const result = await runAction(createIssue({ variables: { input } }));
    if (result?.data) {
      setIssueTitle('');
      setIssueDescription('');
      setIssuePriority('MEDIUM');
      setIssueAssignee('');
      setIssueFormOpen(false);
    }
  }

  async function handleCreateLabel(event) {
    event.preventDefault();
    const result = await runAction(createLabel({ variables: { input: { projectId, name: labelName } } }));
    if (result?.data) {
      setLabelName('');
      setLabelFormOpen(false);
    }
  }

  if (projectQuery.loading) return <LoadingState label="Opening project" />;
  if (projectQuery.error) return <div className="content-error"><ErrorMessage error={projectQuery.error} /><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link></div>;
  if (!project) return <EmptyState title="Project unavailable" detail="It may have been removed or you may not have access." action={<Link className="button button-outline" to="/">Back to workspace</Link>} />;

  return (
    <div className="project-page">
      <Link className="back-link" to="/"><ArrowLeft size={15} /> All organizations</Link>
      <div className="project-hero">
        <div className="project-hero-copy">
          <div className="eyebrow">{project.organization.name.toUpperCase()} <span className="eyebrow-rule" /> PROJECT</div>
          <div className="project-title-line"><h1>{project.name}</h1><span className={`status-pill status-${project.status.toLowerCase()}`}>{project.status}</span></div>
          <p className="page-subtitle">{project.description || 'A shared space for focused project work.'}</p>
          <div className="project-meta"><span>Created by {project.createdBy.name}</span><span className="meta-separator">·</span><span>{project.organization.members.length} team members</span></div>
        </div>
        <div className="project-hero-mark"><CircleDot size={34} strokeWidth={1.4} /></div>
      </div>

      <ErrorMessage error={issueQuery.error || labelsQuery.error || activityQuery.error || issueDetailsErrors} />

      <div className="project-content-grid">
        <section className="issues-section">
          <div className="section-heading issue-heading">
            <div><span className="eyebrow">PROJECT BOARD</span><h2>Issues <span className="heading-count">{issues.length}</span></h2></div>
            <button className="button button-primary" type="button" onClick={() => setIssueFormOpen((open) => !open)}><Plus size={16} /> New issue</button>
          </div>

          {issueFormOpen && (
            <form className="issue-create-form" onSubmit={handleCreateIssue}>
              <div className="form-row"><label className="grow-field">Issue title<input autoFocus required maxLength={200} value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} placeholder="Write a clear, actionable title" /></label></div>
              <label className="grow-field">Description <span>optional</span><textarea rows="3" maxLength={10000} value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} placeholder="Add context for your team" /></label>
              <div className="form-controls">
                <label>Priority<select value={issuePriority} onChange={(event) => setIssuePriority(event.target.value)}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority.replace('_', ' ')}</option>)}</select></label>
                <label>Assignee<select value={issueAssignee} onChange={(event) => setIssueAssignee(event.target.value)}><option value="">Unassigned</option>{project.organization.members.map(({ user: memberUser }) => <option key={memberUser.id} value={memberUser.id}>{memberUser.name}</option>)}</select></label>
                <div className="form-spacer" />
                <button className="button button-text" type="button" onClick={() => setIssueFormOpen(false)}>Cancel</button>
                <button className="button button-primary" type="submit" disabled={createIssueState.loading}>{createIssueState.loading ? 'Creating…' : 'Create issue'}</button>
              </div>
            </form>
          )}

          <div className="filter-bar">
            <label><span>Status</span><select aria-label="Filter by status" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
            <label><span>Priority</span><select aria-label="Filter by priority" value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}><option value="">All priorities</option>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
            <label><span>Assignee</span><select aria-label="Filter by assignee" value={filterAssignee} onChange={(event) => setFilterAssignee(event.target.value)}><option value="all">Anyone</option><option value="unassigned">Unassigned</option>{project.organization.members.map(({ user: memberUser }) => <option key={memberUser.id} value={memberUser.id}>{memberUser.name}</option>)}</select></label>
            {(filterStatus || filterPriority || filterAssignee !== 'all') && <button className="clear-filter" type="button" onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterAssignee('all'); }}>Clear</button>}
          </div>

          {issueQuery.loading ? <LoadingState label="Loading issues" /> : issues.length ? (
            <div className="issue-list">
              {issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  members={project.organization.members}
                  labels={labels}
                  canManage={canManage}
                  runAction={runAction}
                  updateIssue={updateIssue}
                  assignIssue={assignIssue}
                  createComment={createComment}
                  createCommentLoading={createCommentState.loading}
                  attachLabel={attachLabel}
                  attachLabelLoading={attachLabelState.loading}
                  removeLabel={removeLabel}
                  removeLabelLoading={removeLabelState.loading}
                />
              ))}
            </div>
          ) : (
            <EmptyState title={filterStatus || filterPriority || filterAssignee !== 'all' ? 'No issues match these filters' : 'No issues yet'} detail={filterStatus || filterPriority || filterAssignee !== 'all' ? 'Adjust the filters to see more work.' : 'Add the first issue to start tracking progress.'} action={!filterStatus && !filterPriority && filterAssignee === 'all' ? <button className="button button-outline" type="button" onClick={() => setIssueFormOpen(true)}><Plus size={15} /> Create issue</button> : null} />
          )}
        </section>

        <aside className="project-rail">
          <section className="rail-section">
            <div className="rail-heading"><div><span className="eyebrow">TAXONOMY</span><h2>Labels <span className="heading-count">{labels.length}</span></h2></div>{canManage && <button className="icon-button small-icon" type="button" title="Create label" aria-label="Create label" onClick={() => setLabelFormOpen((open) => !open)}><Plus size={16} /></button>}</div>
            {labelFormOpen && canManage && <form className="label-create-form" onSubmit={handleCreateLabel}><input autoFocus required maxLength={50} value={labelName} onChange={(event) => setLabelName(event.target.value)} placeholder="Label name" aria-label="Label name" /><button className="icon-button small-icon" disabled={createLabelState.loading} type="submit" aria-label="Save label" title="Save label"><Check size={16} /></button></form>}
            {labelsQuery.loading ? <LoadingState label="Loading labels" /> : labels.length ? <div className="label-cloud">{labels.map((label, index) => <span key={label.id} className={`label-chip label-color-${index % 4}`}><Tag size={12} />{label.name}</span>)}</div> : <p className="rail-empty">No labels have been created for this project.</p>}
          </section>

          <section className="rail-section activity-section">
            <div className="rail-heading"><div><span className="eyebrow">RECENT CHANGES</span><h2>Activity</h2></div><Activity size={17} className="muted-icon" /></div>
            {activityQuery.loading ? <LoadingState label="Loading activity" /> : activity.length ? (
              <div className="activity-list">
                {activity.map((entry) => (
                  <div className="activity-item" key={entry.id}>
                    <span className="activity-timeline-dot" />
                    <div><strong>{activityTitle(entry.type)}</strong><p>{entry.actor.name}{entry.issue ? <span> · {entry.issue.title}</span> : null}</p><time>{formatDateTime(entry.createdAt)}</time></div>
                  </div>
                ))}
              </div>
            ) : <p className="rail-empty">Project changes will appear here.</p>}
            {activity.length >= activityLimit && <button className="text-action rail-more" type="button" onClick={() => setActivityLimit((limit) => limit + 20)}>Load more activity <ChevronDown size={14} /></button>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function IssueRow({ issue, members, labels, canManage, runAction, updateIssue, assignIssue, createComment, createCommentLoading, attachLabel, attachLabelLoading, removeLabel, removeLabelLoading }) {
  const [expanded, setExpanded] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState('');
  const detailQuery = useQuery(ISSUE_DETAILS, {
    variables: { id: issue.id },
    skip: !expanded,
    fetchPolicy: 'cache-and-network',
  });
  const detail = detailQuery.data?.issue;
  const availableLabels = labels.filter((label) => !issue.labels.some((issueLabel) => issueLabel.id === label.id));

  async function submitComment(event) {
    event.preventDefault();
    if (!commentBody.trim()) return;
    const result = await runAction(createComment({ variables: { input: { issueId: issue.id, content: commentBody } } }));
    if (result?.data) {
      setCommentBody('');
      await detailQuery.refetch();
    }
  }

  async function handleAttach(event) {
    event.preventDefault();
    if (!selectedLabelId) return;
    const result = await runAction(attachLabel({ variables: { issueId: issue.id, labelId: selectedLabelId } }));
    if (result?.data) {
      setSelectedLabelId('');
      await detailQuery.refetch();
    }
  }

  async function updateIssueField(input) {
    const result = await runAction(updateIssue({ variables: { input: { issueId: issue.id, ...input } } }));
    if (result?.data && expanded) await detailQuery.refetch();
  }

  async function updateAssignee(assigneeId) {
    const result = await runAction(assignIssue({ variables: { input: { issueId: issue.id, assigneeId } } }));
    if (result?.data && expanded) await detailQuery.refetch();
  }

  return (
    <article className={`issue-card ${expanded ? 'expanded' : ''}`}>
      <div className="issue-row-main">
        <button className="issue-expand" type="button" onClick={() => setExpanded((open) => !open)} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${issue.title}`} title={expanded ? 'Collapse details' : 'Open details'}>
          <ChevronDown size={16} className={expanded ? 'chevron-open' : ''} />
        </button>
        <div className="issue-title-cell"><button type="button" className="issue-title-button" onClick={() => setExpanded((open) => !open)}>{issue.title}</button><span>Opened by {issue.creator.name} · {formatDate(issue.createdAt)}</span></div>
        <label className={`issue-status-select status-select-${issue.status.toLowerCase()}`}><span className="sr-only">Status</span><select value={issue.status} aria-label={`Status for ${issue.title}`} onChange={(event) => updateIssueField({ status: event.target.value })}>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        <label className={`priority-select priority-${issue.priority.toLowerCase()}`}><span className="sr-only">Priority</span><select value={issue.priority} aria-label={`Priority for ${issue.title}`} onChange={(event) => updateIssueField({ priority: event.target.value })}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
        {canManage ? (
          <label className="assignee-select"><span className="sr-only">Assignee</span><select value={issue.assignee?.id ?? ''} aria-label={`Assignee for ${issue.title}`} onChange={(event) => updateAssignee(event.target.value || null)}><option value="">Unassigned</option>{members.map(({ user: memberUser }) => <option value={memberUser.id} key={memberUser.id}>{memberUser.name}</option>)}</select></label>
        ) : <span className="assignee-readonly">{issue.assignee?.name ?? 'Unassigned'}</span>}
      </div>
      {issue.labels.length > 0 && <div className="issue-row-labels">{issue.labels.map((label) => <span className="label-chip label-color-0" key={label.id}>{label.name}</span>)}</div>}
      {expanded && (
        <div className="issue-detail-panel">
          {detailQuery.loading && !detail ? <LoadingState label="Loading issue details" /> : detailQuery.error ? <ErrorMessage error={detailQuery.error} /> : detail && (
            <>
              {detail.description && <p className="issue-description">{detail.description}</p>}
              <div className="detail-columns">
                <section className="detail-block">
                  <div className="detail-block-heading"><MessageSquare size={15} /><h3>Discussion <span>{detail.comments.length}</span></h3></div>
                  <div className="comment-list">
                    {detail.comments.map((comment) => <div className="comment-item" key={comment.id}><span className="comment-avatar">{comment.author.name.slice(0, 1).toUpperCase()}</span><div><div className="comment-byline"><strong>{comment.author.name}</strong><time>{formatDateTime(comment.createdAt)}</time></div><p>{comment.content}</p></div></div>)}
                    {!detail.comments.length && <p className="rail-empty">No comments yet.</p>}
                  </div>
                  <form className="comment-form" onSubmit={submitComment}><textarea required maxLength={5000} rows="2" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Write a comment…" /><button className="button button-primary button-compact" type="submit" disabled={createCommentLoading || !commentBody.trim()}>{createCommentLoading ? 'Sending…' : 'Comment'}</button></form>
                </section>
                <section className="detail-block label-detail-block">
                  <div className="detail-block-heading"><Tag size={15} /><h3>Labels <span>{detail.labels.length}</span></h3></div>
                  <div className="attached-labels">{detail.labels.map((label, index) => <span className={`label-chip label-color-${index % 4}`} key={label.id}>{label.name}{canManage && <button type="button" onClick={async () => { const result = await runAction(removeLabel({ variables: { issueId: issue.id, labelId: label.id } })); if (result?.data) await detailQuery.refetch(); }} disabled={removeLabelLoading} title={`Remove ${label.name}`} aria-label={`Remove ${label.name}`}><X size={12} /></button>}</span>)}{!detail.labels.length && <p className="rail-empty">No labels attached.</p>}</div>
                  {canManage && availableLabels.length > 0 && <form className="attach-label-form" onSubmit={handleAttach}><select aria-label="Choose project label" value={selectedLabelId} onChange={(event) => setSelectedLabelId(event.target.value)}><option value="">Choose a label</option>{availableLabels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</select><button className="icon-button small-icon" type="submit" disabled={!selectedLabelId || attachLabelLoading} title="Attach label" aria-label="Attach label"><Plus size={15} /></button></form>}
                  <div className="detail-block-heading issue-activity-heading"><Clock3 size={15} /><h3>Issue activity</h3></div>
                  <div className="issue-mini-activity">{detail.activity.slice(0, 5).map((entry) => <p key={entry.id}><strong>{entry.actor.name}</strong> · {activityTitle(entry.type).toLowerCase()} <time>{formatDateTime(entry.createdAt)}</time></p>)}{!detail.activity.length && <p className="rail-empty">No issue activity yet.</p>}</div>
                </section>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );

}

function formatDate(value) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date) : 'Unknown date';
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) : 'Unknown date';
}

function parseDate(value) {
  const normalized = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activityTitle(type) {
  return ({
    ISSUE_CREATED: 'Issue created',
    ISSUE_ASSIGNED: 'Issue assigned',
    ISSUE_STATUS_CHANGED: 'Status changed',
    ISSUE_PRIORITY_CHANGED: 'Priority changed',
    COMMENT_CREATED: 'Comment added',
    LABEL_ADDED: 'Label attached',
  })[type] ?? type.replaceAll('_', ' ');
}
