import mongoose from 'mongoose';
import { Organization } from '../models/Organization.js';
import { Membership, MEMBERSHIP_ROLES } from '../models/Membership.js';
import { User } from '../models/User.js';
import { AuthServiceError, normalizeEmail } from './authService.js';

const NAME_MAX_LENGTH = 100;

async function requireUserId(userId) {
  if (!userId || !(await User.exists({ _id: userId }))) {
    throw new AuthServiceError('Authentication required.', 'UNAUTHENTICATED');
  }
}

// Non-members and missing organizations get the same error so existence is not leaked.
async function requireMembership(userId, organizationId) {
  if (!mongoose.isObjectIdOrHexString(organizationId)) {
    throw new AuthServiceError('Invalid organization ID.', 'BAD_USER_INPUT');
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

export async function createOrganization(userId, { name }) {
  await requireUserId(userId);

  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedName || normalizedName.length > NAME_MAX_LENGTH) {
    throw new AuthServiceError(
      `Organization name is required and must be at most ${NAME_MAX_LENGTH} characters.`,
      'BAD_USER_INPUT',
    );
  }

  // Standalone MongoDB has no transactions, so a failed membership write is compensated by deleting the organization.
  const organization = await Organization.create({ name: normalizedName });

  try {
    await Membership.create({
      user: userId,
      organization: organization._id,
      role: 'ADMIN',
    });
  } catch (error) {
    await Organization.deleteOne({ _id: organization._id });
    throw error;
  }

  return organization;
}

export async function listMyOrganizations(userId) {
  await requireUserId(userId);

  const memberships = await Membership.find({ user: userId }).select('organization');

  return Organization.find({
    _id: { $in: memberships.map((membership) => membership.organization) },
  }).sort({ name: 1 });
}

export async function getOrganizationForMember(userId, organizationId) {
  await requireUserId(userId);
  await requireMembership(userId, organizationId);

  const organization = await Organization.findById(organizationId);

  if (!organization) {
    throw new AuthServiceError('Organization not found.', 'NOT_FOUND');
  }

  return organization;
}

export function getOrganizationById(organizationId) {
  return Organization.findById(organizationId).exec();
}

export function listOrganizationMembers(organizationId) {
  return Membership.find({ organization: organizationId }).sort({ createdAt: 1 }).exec();
}

export async function addOrganizationMember(userId, { organizationId, email, role }) {
  await requireUserId(userId);

  const actorMembership = await requireMembership(userId, organizationId);

  if (actorMembership.role !== 'ADMIN') {
    throw new AuthServiceError('Only organization admins can add members.', 'FORBIDDEN');
  }

  if (!MEMBERSHIP_ROLES.includes(role) || role === 'ADMIN') {
    throw new AuthServiceError(
      'Members can only be added as PROJECT_MANAGER or DEVELOPER.',
      'BAD_USER_INPUT',
    );
  }

  const normalizedEmail = normalizeEmail(email);
  const user = normalizedEmail ? await User.findOne({ email: normalizedEmail }) : null;

  if (!user) {
    throw new AuthServiceError('No user found with that email.', 'NOT_FOUND');
  }

  try {
    return await Membership.create({
      user: user._id,
      organization: organizationId,
      role,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AuthServiceError('User is already a member of this organization.', 'BAD_USER_INPUT');
    }

    throw error;
  }
}
