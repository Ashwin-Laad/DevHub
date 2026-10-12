import mongoose from 'mongoose';
import { Activity } from '../models/Activity.js';
import { Issue } from '../models/Issue.js';
import { Label } from '../models/Label.js';
import { Membership } from '../models/Membership.js';
import { Organization } from '../models/Organization.js';
import { Project, PROJECT_STATUSES } from '../models/Project.js';
import { User } from '../models/User.js';
import { AuthServiceError } from './authService.js';

const PROJECT_MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];
const PROJECT_NAME_MAX_LENGTH = 120;
const PROJECT_DESCRIPTION_MAX_LENGTH = 5000;

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

async function requireOrganizationMembership(userId, organizationId) {
  validateObjectId(organizationId, 'organization');

  const organizationExists = await Organization.exists({ _id: organizationId });

  if (!organizationExists) {
    throw new AuthServiceError('Organization not found.', 'NOT_FOUND');
  }

  const membership = await Membership.findOne({
    user: userId,
    organization: organizationId,
  });

  if (!membership) {
    throw new AuthServiceError('Organization not found.', 'NOT_FOUND');
  }

  return membership;
}

async function requireManagePermission(userId, organizationId) {
  const membership = await requireOrganizationMembership(userId, organizationId);

  if (!PROJECT_MANAGER_ROLES.includes(membership.role)) {
    throw new AuthServiceError(
      'Only organization admins and project managers can manage projects.',
      'FORBIDDEN',
    );
  }
}

async function findProjectForMember(userId, projectId) {
  validateObjectId(projectId, 'project');

  const project = await Project.findById(projectId);

  if (!project) {
    throw new AuthServiceError('Project not found.', 'NOT_FOUND');
  }

  await requireOrganizationMembership(userId, project.organization);
  return project;
}

async function findProjectForManager(userId, projectId) {
  await requireAuthenticatedUser(userId);
  const project = await findProjectForMember(userId, projectId);
  await requireManagePermission(userId, project.organization);
  return project;
}

function validateName(name) {
  if (typeof name !== 'string') {
    throw new AuthServiceError('Project name is required.', 'BAD_USER_INPUT');
  }

  const normalizedName = name.trim();

  if (!normalizedName || normalizedName.length > PROJECT_NAME_MAX_LENGTH) {
    throw new AuthServiceError(
      `Project name is required and must be at most ${PROJECT_NAME_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  return normalizedName;
}

function validateDescription(description) {
  if (description === null) {
    return null;
  }

  if (typeof description !== 'string' || description.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    throw new AuthServiceError(
      `Project description must be a string of at most ${PROJECT_DESCRIPTION_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  return description.trim();
}

export async function createProject(userId, { organizationId, name, description }) {
  await requireAuthenticatedUser(userId);
  await requireManagePermission(userId, organizationId);

  const projectData = {
    name: validateName(name),
    organization: organizationId,
    createdBy: userId,
    status: 'ACTIVE',
  };

  if (description !== undefined) {
    projectData.description = validateDescription(description);
  }

  return Project.create(projectData);
}

export async function listProjectsForOrganization(userId, organizationId) {
  await requireAuthenticatedUser(userId);
  await requireOrganizationMembership(userId, organizationId);

  return Project.find({ organization: organizationId }).sort({ name: 1 }).exec();
}

export async function listMyProjects(userId) {
  await requireAuthenticatedUser(userId);

  const organizationIds = await Membership.distinct('organization', { user: userId });

  return Project.find({ organization: { $in: organizationIds } }).sort({ name: 1 }).exec();
}

export async function getProjectForMember(userId, projectId) {
  await requireAuthenticatedUser(userId);
  return findProjectForMember(userId, projectId);
}

export async function updateProject(userId, { projectId, name, description }) {
  const project = await findProjectForManager(userId, projectId);
  const hasName = name !== undefined;
  const hasDescription = description !== undefined;

  if (!hasName && !hasDescription) {
    throw new AuthServiceError('Provide a project name or description to update.', 'BAD_USER_INPUT');
  }

  if (hasName) {
    project.name = validateName(name);
  }

  if (hasDescription) {
    project.description = validateDescription(description);
  }

  return project.save();
}

async function setProjectStatus(userId, projectId, status) {
  const project = await findProjectForManager(userId, projectId);

  if (!PROJECT_STATUSES.includes(status)) {
    throw new AuthServiceError('Invalid project status.', 'BAD_USER_INPUT');
  }

  project.status = status;
  return project.save();
}

export function archiveProject(userId, projectId) {
  return setProjectStatus(userId, projectId, 'ARCHIVED');
}

export function reactivateProject(userId, projectId) {
  return setProjectStatus(userId, projectId, 'ACTIVE');
}

export function listProjectMembers(organizationId) {
  return Membership.find({ organization: organizationId }).sort({ createdAt: 1 }).exec();
}

export function listProjectIssues(projectId) {
  return Issue.find({ project: projectId }).sort({ createdAt: 1 }).exec();
}

export function listProjectLabels(projectId) {
  return Label.find({ project: projectId }).sort({ name: 1 }).exec();
}

export function listProjectActivity(projectId) {
  return Activity.find({ project: projectId }).sort({ createdAt: -1 }).exec();
}