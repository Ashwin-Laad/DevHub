export const typeDefs = `#graphql
  

  enum IssueStatus {
    TODO
    IN_PROGRESS
    IN_REVIEW
    DONE
  }

  enum IssuePriority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  enum ProjectStatus {
    ACTIVE
    ARCHIVED
  }

  enum MembershipRole {
    ADMIN
    PROJECT_MANAGER
    DEVELOPER
  }

  enum ActivityType {
    ISSUE_CREATED
    ISSUE_ASSIGNED
    ISSUE_STATUS_CHANGED
    ISSUE_PRIORITY_CHANGED
    COMMENT_CREATED
    LABEL_ADDED
  }

  enum NotificationType {
    ISSUE_ASSIGNED
    COMMENT_CREATED
    ISSUE_UPDATED
  }

  type User {
    id: ID!
    name: String!
    email: String!
    memberships: [Membership!]!
    projectsCreated: [Project!]!
    issuesCreated: [Issue!]!
    assignedIssues: [Issue!]!
    comments: [Comment!]!
    activities: [Activity!]!
    notifications: [Notification!]!
    createdAt: String!
    updatedAt: String!
  }

  type Organization {
    id: ID!
    name: String!
    members: [Membership!]!
    projects: [Project!]!
    createdAt: String!
    updatedAt: String!
  }

  type Membership {
    id: ID!
    user: User!
    organization: Organization!
    role: MembershipRole!
    createdAt: String!
    updatedAt: String!
  }

  type Project {
    id: ID!
    name: String!
    description: String
    organization: Organization!
    createdBy: User!
    status: ProjectStatus!
    members: [Membership!]!
    issues: [Issue!]!
    labels: [Label!]!
    activity: [Activity!]!
    createdAt: String!
    updatedAt: String!
  }

  type Issue {
    id: ID!
    title: String!
    description: String
    status: IssueStatus!
    priority: IssuePriority!
    creator: User!
    assignee: User
    project: Project!
    comments: [Comment!]!
    labels: [Label!]!
    activity: [Activity!]!
    createdAt: String!
    updatedAt: String!
  }

  type Comment {
    id: ID!
    content: String!
    issue: Issue!
    author: User!
    createdAt: String!
    updatedAt: String!
  }

  type Label {
    id: ID!
    name: String!
    project: Project!
    createdAt: String!
    updatedAt: String!
  }

  type Activity {
    id: ID!
    type: ActivityType!
    actor: User!
    project: Project!
    issue: Issue
    
    createdAt: String!
    updatedAt: String!
  }

  type Notification {
    id: ID!
    recipient: User!
    type: NotificationType!
    message: String!
    relatedIssue: Issue
    read: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input CreateOrganizationInput {
    name: String!
  }

  input AddOrganizationMemberInput {
    organizationId: ID!
    email: String!
    role: MembershipRole!
  }

  type Query {
    hello: String!
    currentUser: User
    test: String!
    myOrganizations: [Organization!]!
    organization(id: ID!): Organization
  }

  type Mutation {
    register(input: RegisterInput!): User!
    login(input: LoginInput!): AuthPayload!
    createOrganization(input: CreateOrganizationInput!): Organization!
    addOrganizationMember(input: AddOrganizationMemberInput!): Membership!
  }
`;
