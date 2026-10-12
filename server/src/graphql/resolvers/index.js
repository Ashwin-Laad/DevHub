import { getUserById } from '../../services/userService.js';
import { AuthServiceError, loginUser, registerUser } from '../../services/authService.js';
import {
  addOrganizationMember,
  createOrganization,
  getOrganizationById,
  getOrganizationForMember,
  listMyOrganizations,
  listOrganizationMembers,
} from '../../services/organizationService.js';
import {
  archiveProject,
  createProject,
  getProjectForMember,
  listMyProjects,
  listProjectActivity,
  listProjectIssues,
  listProjectLabels,
  listProjectMembers,
  listProjectsForOrganization,
  reactivateProject,
  updateProject,
} from '../../services/projectService.js';
import {
  assignIssue,
  createIssue,
  getIssueAssignee,
  getIssueCreator,
  getIssueForMember,
  getIssueProject,
  getReferencedIssue,
  listIssueActivity,
  listIssueComments,
  listIssueLabels,
  listIssuesForProject,
  updateIssue,
} from '../../services/issueService.js';
import {
  attachLabelToIssue,
  createComment,
  createLabel,
  getCommentForMember,
  getLabelForMember,
  getLabelProject,
  listCommentsForIssue,
  listLabelsForProject,
  removeLabelFromIssue,
  updateComment,
} from '../../services/commentLabelService.js';
import {
  getNotificationForRecipient,
  getNotificationIssueForRecipient,
  listActivityForIssue,
  listActivityForProject,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/activityNotificationService.js';
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    hello: () => 'Hello from DevHub!',
    currentUser: (_parent, _args, { userId }) => getUserById(userId),
    myOrganizations: (_parent, _args, { userId }) =>
      guard(() => listMyOrganizations(userId)),
    organization: (_parent, { id }, { userId }) =>
      guard(() => getOrganizationForMember(userId, id)),
    projects: (_parent, { organizationId }, { userId }) =>
      guard(() => listProjectsForOrganization(userId, organizationId)),
    myProjects: (_parent, _args, { userId }) =>
      guard(() => listMyProjects(userId)),
    project: (_parent, { id }, { userId }) =>
      guard(() => getProjectForMember(userId, id)),
    issues: (_parent, args, { userId }) =>
      guard(() => listIssuesForProject(userId, args)),
    issue: (_parent, { id }, { userId }) =>
      guard(() => getIssueForMember(userId, id)),
    comments: (_parent, { issueId }, { userId }) =>
      guard(() => listCommentsForIssue(userId, issueId)),
    comment: (_parent, { id }, { userId }) =>
      guard(() => getCommentForMember(userId, id)),
    labels: (_parent, { projectId }, { userId }) =>
      guard(() => listLabelsForProject(userId, projectId)),
    label: (_parent, { id }, { userId }) =>
      guard(() => getLabelForMember(userId, id)),
    myNotifications: (_parent, { limit, offset }, { userId }) =>
      guard(() => listMyNotifications(userId, limit, offset)),
    notification: (_parent, { id }, { userId }) =>
      guard(() => getNotificationForRecipient(userId, id)),
    issueActivity: (_parent, { issueId, limit, offset }, { userId }) =>
      guard(() => listActivityForIssue(userId, issueId, limit, offset)),
    projectActivity: (_parent, { projectId, limit, offset }, { userId }) =>
      guard(() => listActivityForProject(userId, projectId, limit, offset)),
  },
  Mutation: {
    register: async (_parent, { input }) => {
      try {
        return await registerUser(input);
      } catch (error) {
        throw toGraphQLError(error);
      }
    },
    login: async (_parent, { input }) => {
      try {
        return await loginUser(input);
      } catch (error) {
        throw toGraphQLError(error);
      }
    },
    createOrganization: (_parent, { input }, { userId }) =>
      guard(() => createOrganization(userId, input)),
    addOrganizationMember: (_parent, { input }, { userId }) =>
      guard(() => addOrganizationMember(userId, input)),
    createProject: (_parent, { input }, { userId }) =>
      guard(() => createProject(userId, input)),
    updateProject: (_parent, { input }, { userId }) =>
      guard(() => updateProject(userId, input)),
    archiveProject: (_parent, { id }, { userId }) =>
      guard(() => archiveProject(userId, id)),
    reactivateProject: (_parent, { id }, { userId }) =>
      guard(() => reactivateProject(userId, id)),
    createIssue: (_parent, { input }, { userId }) =>
      guard(() => createIssue(userId, input)),
    updateIssue: (_parent, { input }, { userId }) =>
      guard(() => updateIssue(userId, input)),
    assignIssue: (_parent, { input }, { userId }) =>
      guard(() => assignIssue(userId, input)),
    createComment: (_parent, { input }, { userId }) =>
      guard(() => createComment(userId, input)),
    updateComment: (_parent, { input }, { userId }) =>
      guard(() => updateComment(userId, input)),
    createLabel: (_parent, { input }, { userId }) =>
      guard(() => createLabel(userId, input)),
    attachLabelToIssue: (_parent, args, { userId }) =>
      guard(() => attachLabelToIssue(userId, args)),
    removeLabelFromIssue: (_parent, args, { userId }) =>
      guard(() => removeLabelFromIssue(userId, args)),
    markNotificationRead: (_parent, { id }, { userId }) =>
      guard(() => markNotificationRead(userId, id)),
    markAllNotificationsRead: (_parent, _args, { userId }) =>
      guard(() => markAllNotificationsRead(userId)),
  },
  Organization: {
    members: (organization) => listOrganizationMembers(organization.id),
    projects: (organization, _args, { userId }) =>
      guard(() => listProjectsForOrganization(userId, organization.id)),
  },
  Membership: {
    user: (membership) => getUserById(membership.user),
    organization: (membership) => getOrganizationById(membership.organization),
  },
  Project: {
    organization: (project) => getOrganizationById(project.organization),
    createdBy: (project) => getUserById(project.createdBy),
    members: (project) => listProjectMembers(project.organization),
    issues: (project) => listProjectIssues(project.id),
    labels: (project) => listProjectLabels(project.id),
    activity: (project) => listProjectActivity(project.id),
  },
  Issue: {
    project: (issue) => getIssueProject(issue.project),
    creator: (issue) => getIssueCreator(issue.creator),
    assignee: (issue) => getIssueAssignee(issue.assignee),
    comments: (issue) => listIssueComments(issue.id),
    labels: (issue) => listIssueLabels(issue.labels),
    activity: (issue) => listIssueActivity(issue.id),
  },
  Label: {
    project: (label) => getLabelProject(label.project),
  },
  Comment: {
    author: (comment) => getIssueCreator(comment.author),
    issue: (comment) => getReferencedIssue(comment.issue),
  },
  Activity: {
    actor: (activity) => getIssueCreator(activity.actor),
    project: (activity) => getIssueProject(activity.project),
    issue: (activity) => activity.issue ? getReferencedIssue(activity.issue) : null,
  },
  Notification: {
    recipient: (notification) => getUserById(notification.recipient),
    relatedIssue: (notification, _args, { userId }) =>
      notification.relatedIssue
        ? guard(() => getNotificationIssueForRecipient(userId, notification.relatedIssue))
        : null,
  },
};

async function guard(operation) {
  try {
    return await operation();
  } catch (error) {
    throw toGraphQLError(error);
  }
}

function toGraphQLError(error) {
  if (error instanceof AuthServiceError) {
    return new GraphQLError(error.message, {
      extensions: { code: error.code },
    });
  }

  return new GraphQLError('An unexpected error occurred.', {
    extensions: { code: 'INTERNAL_SERVER_ERROR' },
  });
}
