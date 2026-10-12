import mongoose from 'mongoose';
import { Comment } from '../models/Comment.js';
import { Issue } from '../models/Issue.js';
import { Label } from '../models/Label.js';
import { Membership } from '../models/Membership.js';
import { Project } from '../models/Project.js';
import { AuthServiceError } from './authService.js';
import {
  activityRecord,
  persistCommentCreatedEffects,
  persistIssueEffects,
} from './activityNotificationService.js';
import { getIssueForMember } from './issueService.js';
import { getProjectForMember } from './projectService.js';

const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const COMMENT_MAX_LENGTH = 5000;
const LABEL_MAX_LENGTH = 50;

function validateObjectId(id, label) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new AuthServiceError(`Invalid ${label} ID.`, 'BAD_USER_INPUT');
  }
}

function validateCommentContent(content) {
  if (typeof content !== 'string') {
    throw new AuthServiceError('Comment content is required.', 'BAD_USER_INPUT');
  }

  const normalizedContent = content.trim();
  if (!normalizedContent || normalizedContent.length > COMMENT_MAX_LENGTH) {
    throw new AuthServiceError(
      `Comment content is required and must be at most ${COMMENT_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  return normalizedContent;
}

function validateLabelName(name) {
  if (typeof name !== 'string') {
    throw new AuthServiceError('Label name is required.', 'BAD_USER_INPUT');
  }

  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > LABEL_MAX_LENGTH) {
    throw new AuthServiceError(
      `Label name is required and must be at most ${LABEL_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  return normalizedName;
}

async function requireProjectManager(userId, projectId) {
  const project = await getProjectForMember(userId, projectId);
  const membership = await Membership.findOne({
    user: userId,
    organization: project.organization,
  });

  if (!membership || !MANAGER_ROLES.includes(membership.role)) {
    throw new AuthServiceError(
      'Only organization admins and project managers can manage labels.',
      'FORBIDDEN',
    );
  }

  return project;
}

async function findCommentForMember(userId, commentId) {
  validateObjectId(commentId, 'comment');
  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new AuthServiceError('Comment not found.', 'NOT_FOUND');
  }

  const issue = await getIssueForMember(userId, comment.issue);
  return { comment, issue };
}

export async function createComment(userId, { issueId, content }) {
  const issue = await getIssueForMember(userId, issueId);
  const commentContent = validateCommentContent(content);
  const comment = await Comment.create({
    content: commentContent,
    issue: issue._id,
    author: userId,
  });

  await persistCommentCreatedEffects(issue, comment, userId);

  return comment;
}

export async function listCommentsForIssue(userId, issueId) {
  const issue = await getIssueForMember(userId, issueId);
  return Comment.find({ issue: issue._id }).sort({ createdAt: 1 }).exec();
}

export async function getCommentForMember(userId, commentId) {
  const { comment } = await findCommentForMember(userId, commentId);
  return comment;
}

export async function updateComment(userId, { commentId, content }) {
  const { comment, issue } = await findCommentForMember(userId, commentId);
  const isAuthor = comment.author.toString() === userId.toString();

  if (!isAuthor) {
    const project = await getProjectForMember(userId, issue.project);
    const membership = await Membership.findOne({
      user: userId,
      organization: project.organization,
    });

    if (!membership || !MANAGER_ROLES.includes(membership.role)) {
      throw new AuthServiceError('Only the comment author or an organization manager can edit comments.', 'FORBIDDEN');
    }
  }

  comment.content = validateCommentContent(content);
  return comment.save();
}

export async function createLabel(userId, { projectId, name }) {
  const project = await requireProjectManager(userId, projectId);
  const normalizedName = validateLabelName(name);

  try {
    return await Label.create({ name: normalizedName, project: project._id });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AuthServiceError('A label with this name already exists in the project.', 'BAD_USER_INPUT');
    }

    throw error;
  }
}

export async function listLabelsForProject(userId, projectId) {
  const project = await getProjectForMember(userId, projectId);
  return Label.find({ project: project._id }).sort({ name: 1 }).exec();
}

export async function getLabelForMember(userId, labelId) {
  validateObjectId(labelId, 'label');
  const label = await Label.findById(labelId);

  if (!label) {
    throw new AuthServiceError('Label not found.', 'NOT_FOUND');
  }

  await getProjectForMember(userId, label.project);
  return label;
}

export async function attachLabelToIssue(userId, { issueId, labelId }) {
  const issue = await getIssueForMember(userId, issueId);
  const project = await requireProjectManager(userId, issue.project);

  validateObjectId(labelId, 'label');
  const label = await Label.findById(labelId);

  if (!label) {
    throw new AuthServiceError('Label not found.', 'NOT_FOUND');
  }

  if (label.project.toString() !== project._id.toString()) {
    throw new AuthServiceError('Label must belong to the issue project.', 'BAD_USER_INPUT');
  }

  const alreadyAttached = issue.labels.some((attachedLabelId) =>
    attachedLabelId.toString() === label._id.toString());
  if (alreadyAttached) {
    return issue;
  }

  const updateResult = await Issue.updateOne({ _id: issue._id }, { $addToSet: { labels: label._id } });
  issue.labels.push(label._id);

  if (updateResult.modifiedCount > 0) {
    await persistIssueEffects({
      activities: [activityRecord({
        type: 'LABEL_ADDED',
        actorId: userId,
        issue,
        metadata: { labelId: label._id.toString(), labelName: label.name },
      })],
    });
  }

  return issue;
}

export async function removeLabelFromIssue(userId, { issueId, labelId }) {
  const issue = await getIssueForMember(userId, issueId);
  const project = await requireProjectManager(userId, issue.project);

  validateObjectId(labelId, 'label');
  const label = await Label.findById(labelId);

  if (!label) {
    throw new AuthServiceError('Label not found.', 'NOT_FOUND');
  }

  if (label.project.toString() !== project._id.toString()) {
    throw new AuthServiceError('Label must belong to the issue project.', 'BAD_USER_INPUT');
  }

  if (!issue.labels.some((attachedLabelId) => attachedLabelId.toString() === label._id.toString())) {
    throw new AuthServiceError('Label is not attached to this issue.', 'BAD_USER_INPUT');
  }

  await Issue.updateOne({ _id: issue._id }, { $pull: { labels: label._id } });
  issue.labels = issue.labels.filter((attachedLabelId) =>
    attachedLabelId.toString() !== label._id.toString());
  return issue;
}

export function getLabelProject(projectId) {
  return Project.findById(projectId).exec();
}