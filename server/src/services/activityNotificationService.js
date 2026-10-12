import { Activity } from '../models/Activity.js';
import { Comment } from '../models/Comment.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { AuthServiceError } from './authService.js';
import { getIssueForMember } from './issueService.js';
import { getProjectForMember } from './projectService.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;

function sameId(left, right) {
  return left?.toString() === right?.toString();
}

export function activityRecord({ type, actorId, issue, metadata = {} }) {
  return {
    type,
    actor: actorId,
    project: issue.project,
    issue: issue._id,
    metadata,
  };
}

export function issueAssignedNotification(issue, actorId, assigneeId) {
  if (!assigneeId || sameId(actorId, assigneeId)) {
    return null;
  }

  return {
    recipient: assigneeId,
    type: 'ISSUE_ASSIGNED',
    message: `You were assigned to issue: ${issue.title}`,
    relatedIssue: issue._id,
  };
}

export async function commentParticipantNotifications(issue, actorId) {
  const commenters = await Comment.distinct('author', { issue: issue._id });
  const participantIds = [issue.creator, issue.assignee, ...commenters];
  const recipients = new Map();

  for (const participantId of participantIds) {
    if (participantId && !sameId(participantId, actorId)) {
      recipients.set(participantId.toString(), participantId);
    }
  }

  return [...recipients.values()].map((recipient) => ({
    recipient,
    type: 'COMMENT_CREATED',
    message: `New comment on issue: ${issue.title}`,
    relatedIssue: issue._id,
  }));
}

export function issueUpdatedNotification(issue, actorId) {
  return issueAssignedNotification(issue, actorId, issue.assignee)
    ? {
        recipient: issue.assignee,
        type: 'ISSUE_UPDATED',
        message: `Issue updated: ${issue.title}`,
        relatedIssue: issue._id,
      }
    : null;
}

// These writes are best-effort because the configured standalone MongoDB cannot transact across documents.
export async function persistIssueEffects({ activities = [], notifications = [] }) {
  const writes = [];

  if (activities.length) {
    writes.push(Activity.insertMany(activities));
  }
  if (notifications.length) {
    writes.push(Notification.insertMany(notifications));
  }

  const results = await Promise.allSettled(writes);
  if (results.some((result) => result.status === 'rejected')) {
    console.error('Failed to persist one or more issue activity or notification records.');
  }
}

export async function persistCommentCreatedEffects(issue, comment, actorId) {
  try {
    const notifications = await commentParticipantNotifications(issue, actorId);
    await persistIssueEffects({
      activities: [activityRecord({
        type: 'COMMENT_CREATED',
        actorId,
        issue,
        metadata: { commentId: comment._id.toString() },
      })],
      notifications,
    });
  } catch {
    console.error('Failed to persist comment activity or notification records.');
  }
}

function paginationValues(limit, offset) {
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

async function requireUser(userId) {
  if (!userId || !(await User.exists({ _id: userId }))) {
    throw new AuthServiceError('Authentication required.', 'UNAUTHENTICATED');
  }
}

export async function listMyNotifications(userId, limit, offset) {
  await requireUser(userId);
  const page = paginationValues(limit, offset);

  return Notification.find({ recipient: userId })
    .sort({ createdAt: -1, _id: -1 })
    .skip(page.offset)
    .limit(page.limit)
    .exec();
}

export async function getNotificationForRecipient(userId, notificationId) {
  await requireUser(userId);

  if (!/^[a-f\d]{24}$/i.test(notificationId ?? '')) {
    throw new AuthServiceError('Invalid notification ID.', 'BAD_USER_INPUT');
  }

  const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
  if (!notification) {
    throw new AuthServiceError('Notification not found.', 'NOT_FOUND');
  }

  return notification;
}

export async function markNotificationRead(userId, notificationId) {
  await requireUser(userId);

  if (!/^[a-f\d]{24}$/i.test(notificationId ?? '')) {
    throw new AuthServiceError('Invalid notification ID.', 'BAD_USER_INPUT');
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { read: true } },
    { returnDocument: 'after' },
  );

  if (!notification) {
    throw new AuthServiceError('Notification not found.', 'NOT_FOUND');
  }

  return notification;
}

export async function markAllNotificationsRead(userId) {
  await requireUser(userId);
  const result = await Notification.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } },
  );

  return result.modifiedCount;
}

export async function listActivityForIssue(userId, issueId, limit, offset) {
  const issue = await getIssueForMember(userId, issueId);
  const page = paginationValues(limit, offset);

  return Activity.find({ issue: issue._id })
    .sort({ createdAt: -1, _id: -1 })
    .skip(page.offset)
    .limit(page.limit)
    .exec();
}

export async function listActivityForProject(userId, projectId, limit, offset) {
  const project = await getProjectForMember(userId, projectId);
  const page = paginationValues(limit, offset);

  return Activity.find({ project: project._id })
    .sort({ createdAt: -1, _id: -1 })
    .skip(page.offset)
    .limit(page.limit)
    .exec();
}

export async function getNotificationIssueForRecipient(userId, issueId) {
  try {
    return await getIssueForMember(userId, issueId);
  } catch (error) {
    if (error instanceof AuthServiceError && error.code === 'NOT_FOUND') {
      return null;
    }

    throw error;
  }
}
