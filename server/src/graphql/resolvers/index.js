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
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    hello: () => 'Hello from DevHub!',
    currentUser: (_parent, _args, { userId }) => getUserById(userId),
    myOrganizations: (_parent, _args, { userId }) =>
      guard(() => listMyOrganizations(userId)),
    organization: (_parent, { id }, { userId }) =>
      guard(() => getOrganizationForMember(userId, id)),
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
  },
  Organization: {
    members: (organization) => listOrganizationMembers(organization.id),
  },
  Membership: {
    user: (membership) => getUserById(membership.user),
    organization: (membership) => getOrganizationById(membership.organization),
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

  return error;
}
