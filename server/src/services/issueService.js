import mongoose from 'mongoose';
import { Activity } from '../models/Activity.js';
import { Comment } from '../models/Comment.js';
import { ISSUE_PRIORITIES, ISSUE_STATUSES, Issue } from '../models/Issue.js';
import { Label } from '../models/Label.js';
import { Membership } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { Project } from '../models/Project.js';
import { User } from '../models/User.js';
import { AuthServiceError } from './authService.js';
import {
  activityRecord,
  issueAssignedNotification,
  issueUpdatedNotification,
  persistIssueEffects,
} from './activityNotificationService.js';

const ASSIGNMENT_MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 10000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;

async function requireAuthenticatedUser(userId) {
  if (!userId || !(await User.exists({ _id: userId }))) {
    throw new AuthServiceError('Authentication required.', 'UNAUTHENTICATED');
  }
}

function validateObjectId(id, label) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new AuthServiceError(`Invalid ${label} ID.`, 'BAD_USER_INPUT');
  }
}

async function requireProjectMembership(userId, projectId) {
  validateObjectId(projectId, 'project');

  const project = await Project.findById(projectId);
  if (!project) {
    throw new AuthServiceError('Project not found.', 'NOT_FOUND');
  }

  const organizationExists = await Organization.exists({ _id: project.organization });
  if (!organizationExists) {
    throw new AuthServiceError('Project not found.', 'NOT_FOUND');
  }

  const membership = await Membership.findOne({
    user: userId,
    organization: project.organization,
  });
  if (!membership) {
    throw new AuthServiceError('Project not found.', 'NOT_FOUND');
  }

  return { project, membership };
}

async function requireIssueMembership(userId, issueId) {
  validateObjectId(issueId, 'issue');

  const issue = await Issue.findById(issueId);
  if (!issue) {
    throw new AuthServiceError('Issue not found.', 'NOT_FOUND');
  }

  await requireProjectMembership(userId, issue.project);
  return issue;
}

function validateTitle(title) {
  if (typeof title !== 'string') {
    throw new AuthServiceError('Issue title is required.', 'BAD_USER_INPUT');
  }

  const normalizedTitle = title.trim();
  if (!normalizedTitle || normalizedTitle.length > TITLE_MAX_LENGTH) {
    throw new AuthServiceError(
      `Issue title is required and must be at most ${TITLE_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  return normalizedTitle;
}

function validateDescription(description) {
  if (description === null) {
    return null;
  }

  if (typeof description !== 'string' || description.length > DESCRIPTION_MAX_LENGTH) {
    throw new AuthServiceError(
      `Issue description must be a string of at most ${DESCRIPTION_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  return description.trim();
}

function validateEnum(value, values, label) {
  if (!values.includes(value)) {
    throw new AuthServiceError(`Invalid issue ${label}.`, 'BAD_USER_INPUT');
  }
}

async function validateAssignee(assigneeId, organizationId) {
  validateObjectId(assigneeId, 'assignee');

  const user = await User.findById(assigneeId);
  if (!user) {
    throw new AuthServiceError('Assignee not found.', 'NOT_FOUND');
  }

  const membership = await Membership.exists({
    user: assigneeId,
    organization: organizationId,
  });
  if (!membership) {
    throw new AuthServiceError('Assignee must be a member of the project organization.', 'BAD_USER_INPUT');
  }
}

function validatePagination(limit, offset) {
  const safeLimit = limit ?? DEFAULT_LIMIT;
  const safeOffset = offset ?? 0;

  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > MAX_LIMIT) {
    throw new AuthServiceError(`Limit must be an integer from 1 to ${MAX_LIMIT}.`, 'BAD_USER_INPUT');
  }

  if (!Number.isInteger(safeOffset) || safeOffset < 0 || safeOffset > MAX_OFFSET) {
    throw new AuthServiceError(`Offset must be an integer from 0 to ${MAX_OFFSET}.`, 'BAD_USER_INPUT');
  }

  return { limit: safeLimit, offset: safeOffset };
}

function buildIssueFilter(filter = {}) {
  filter ??= {};
  const conditions = {};

  if (filter.status !== undefined && filter.status !== null) {
    validateEnum(filter.status, ISSUE_STATUSES, 'status');
    conditions.status = filter.status;
  }

  if (filter.priority !== undefined && filter.priority !== null) {
    validateEnum(filter.priority, ISSUE_PRIORITIES, 'priority');
    conditions.priority = filter.priority;
  }

  if (Object.hasOwn(filter, 'assigneeId')) {
    if (filter.assigneeId === null) {
      conditions.assignee = { $exists: false };
    } else {
      validateObjectId(filter.assigneeId, 'assignee');
      conditions.assignee = filter.assigneeId;
    }
  }

  return conditions;
}
//syntax of function looks like function <function_name>(args,) { ... }
export async function createIssue(userId, { projectId, title, description, priority, assigneeId }) {
  await requireAuthenticatedUser(userId);
  const { project } = await requireProjectMembership(userId, projectId);

  if (priority !== undefined && priority !== null) {
    validateEnum(priority, ISSUE_PRIORITIES, 'priority');
  }

  if (assigneeId !== undefined && assigneeId !== null) {
    await validateAssignee(assigneeId, project.organization);
  }

  const issueData = {
    project: project._id,
    creator: userId,
    title: validateTitle(title),
    status: 'TODO',
    priority: priority ?? 'MEDIUM',
  };

  if (description !== undefined) {
    issueData.description = validateDescription(description);
  }
  if (assigneeId !== undefined && assigneeId !== null) {
    issueData.assignee = assigneeId;
  }

  const issue = await Issue.create(issueData);
  const activities = [activityRecord({
    type: 'ISSUE_CREATED',
    actorId: userId,
    issue,
    metadata: { status: issue.status, priority: issue.priority },
  })];
  const notifications = [];

  if (assigneeId !== undefined && assigneeId !== null) {
    activities.push(activityRecord({
      type: 'ISSUE_ASSIGNED',
      actorId: userId,
      issue,
      metadata: { previousAssigneeId: null, assigneeId: assigneeId.toString() },
    }));
    notifications.push(issueAssignedNotification(issue, userId, assigneeId));
  }

  await persistIssueEffects({
    activities,
    notifications: notifications.filter(Boolean),
  });
  return issue;
}

export async function listIssuesForProject(userId, { projectId, filter, limit, offset }) {
  await requireAuthenticatedUser(userId);
  await requireProjectMembership(userId, projectId);

  const pagination = validatePagination(limit, offset);
  const conditions = buildIssueFilter(filter);

  return Issue.find({ project: projectId, ...conditions })
    .sort({ createdAt: -1, _id: -1 })
    .skip(pagination.offset)
    .limit(pagination.limit)
    .exec();
}

export async function getIssueForMember(userId, issueId) {
  await requireAuthenticatedUser(userId);
  return requireIssueMembership(userId, issueId);
}

export async function updateIssue(userId, { issueId, title, description, status, priority }) {
  await requireAuthenticatedUser(userId);
  const issue = await requireIssueMembership(userId, issueId);
  const hasTitle = title !== undefined;
  const hasDescription = description !== undefined;
  const hasStatus = status !== undefined;
  const hasPriority = priority !== undefined;
  const previousStatus = issue.status;
  const previousPriority = issue.priority;

  if (!hasTitle && !hasDescription && !hasStatus && !hasPriority) {
    throw new AuthServiceError('Provide an issue field to update.', 'BAD_USER_INPUT');
  }

  const changes = {
    title: hasTitle ? validateTitle(title) : issue.title,
    description: hasDescription ? validateDescription(description) : issue.description,
    status: hasStatus ? status : issue.status,
    priority: hasPriority ? priority : issue.priority,
  };
  if (hasStatus) validateEnum(status, ISSUE_STATUSES, 'status');
  if (hasPriority) validateEnum(priority, ISSUE_PRIORITIES, 'priority');

  const titleChanged = hasTitle && changes.title !== issue.title;
  const descriptionChanged = hasDescription && changes.description !== issue.description;
  const statusChanged = hasStatus && changes.status !== issue.status;
  const priorityChanged = hasPriority && changes.priority !== issue.priority;

  if (!titleChanged && !descriptionChanged && !statusChanged && !priorityChanged) {
    return issue;
  }

  if (titleChanged) issue.title = changes.title;
  if (descriptionChanged) issue.description = changes.description;
  if (hasStatus) {
    if (statusChanged) issue.status = changes.status;
  }
  if (hasPriority) {
    if (priorityChanged) issue.priority = changes.priority;
  }

  await issue.save();
  const activities = [];

  if (statusChanged) {
    activities.push(activityRecord({
      type: 'ISSUE_STATUS_CHANGED',
      actorId: userId,
      issue,
      metadata: { from: previousStatus, to: issue.status },
    }));
  }
  if (priorityChanged) {
    activities.push(activityRecord({
      type: 'ISSUE_PRIORITY_CHANGED',
      actorId: userId,
      issue,
      metadata: { from: previousPriority, to: issue.priority },
    }));
  }

  const notifications = titleChanged || descriptionChanged || statusChanged || priorityChanged
    ? [issueUpdatedNotification(issue, userId)].filter(Boolean)
    : [];
  await persistIssueEffects({ activities, notifications });
  return issue;
}

export async function assignIssue(userId, input) {
  const { issueId, assigneeId } = input;
  await requireAuthenticatedUser(userId);
  const issue = await requireIssueMembership(userId, issueId);
  const project = await Project.findById(issue.project);
  const actorMembership = await Membership.findOne({
    user: userId,
    organization: project.organization,
  });

  if (!actorMembership || !ASSIGNMENT_MANAGER_ROLES.includes(actorMembership.role)) {
    throw new AuthServiceError('Only organization admins and project managers can assign issues.', 'FORBIDDEN');
  }

  if (!Object.hasOwn(input, 'assigneeId')) {
    throw new AuthServiceError('Provide assigneeId; use null to unassign.', 'BAD_USER_INPUT');
  }

  const previousAssigneeId = issue.assignee ?? null;
  const nextAssigneeId = assigneeId ?? null;
  if (previousAssigneeId?.toString() === nextAssigneeId?.toString()) {
    return issue;
  }

  if (assigneeId === null) {
    issue.assignee = undefined;
  } else {
    await validateAssignee(assigneeId, project.organization);
    issue.assignee = assigneeId;
  }

  await issue.save();
  const activities = [activityRecord({
    type: 'ISSUE_ASSIGNED',
    actorId: userId,
    issue,
    metadata: {
      previousAssigneeId: previousAssigneeId?.toString() ?? null,
      assigneeId: nextAssigneeId?.toString() ?? null,
    },
  })];
  const notifications = nextAssigneeId
    ? [issueAssignedNotification(issue, userId, nextAssigneeId)].filter(Boolean)
    : [];

  await persistIssueEffects({ activities, notifications });
  return issue;
}

export function getIssueProject(projectId) {
  return Project.findById(projectId).exec();
}

export function getReferencedIssue(issueId) {
  return Issue.findById(issueId).exec();
}

export function getIssueCreator(userId) {
  return User.findById(userId).exec();
}

export function getIssueAssignee(userId) {
  return userId ? User.findById(userId).exec() : null;
}

export function listIssueComments(issueId) {
  return Comment.find({ issue: issueId }).sort({ createdAt: 1 }).exec();
}

export function listIssueLabels(labelIds) {
  return Label.find({ _id: { $in: labelIds ?? [] } }).sort({ name: 1 }).exec();
}

export function listIssueActivity(issueId) {
  return Activity.find({ issue: issueId }).sort({ createdAt: -1 }).exec();
}