export const typeDefs = `#graphql
  
  # The following enums define the possible values for various fields in the schema.
  # Enums are used to restrict a field to a specific set of values.
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


  #membership role is the role of a user within an organization, defined by the MembershipRole enum. eg ADMIN, PROJECT_MANAGER, DEVELOPER

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
#to access input types, you use them as arguments in mutations. For example, the createProject mutation takes a CreateProjectInput as its input.

  input CreateProjectInput {
    organizationId: ID!
    name: String!
    description: String
  }

  input UpdateProjectInput {
    projectId: ID!
    name: String
    description: String
  }

  input IssueFilterInput {
    status: IssueStatus
    priority: IssuePriority
    assigneeId: ID
  }

  input CreateIssueInput {
    projectId: ID!
    title: String!
    description: String
    priority: IssuePriority
    assigneeId: ID
  }

  input UpdateIssueInput {
    issueId: ID!
    title: String
    description: String
    status: IssueStatus
    priority: IssuePriority
  }

  input AssignIssueInput {
    issueId: ID!
    assigneeId: ID
  }

  input CreateCommentInput {
    issueId: ID!
    content: String!
  }

  input UpdateCommentInput {
    commentId: ID!
    content: String!
  }

  input CreateLabelInput {
    projectId: ID!
    name: String!
  }

  type Query {
    hello: String!
    currentUser: User
    test: String!
    myOrganizations: [Organization!]!
    #organization() here id is for fetching a specific organization by its ID.
    organization(id: ID!): Organization
    projects(organizationId: ID!): [Project!]!
    myProjects: [Project!]!
    project(id: ID!): Project
    issues(projectId: ID!, filter: IssueFilterInput, limit: Int, offset: Int): [Issue!]!
    issue(id: ID!): Issue
    comments(issueId: ID!): [Comment!]!
    comment(id: ID!): Comment
    labels(projectId: ID!): [Label!]!
    label(id: ID!): Label
    myNotifications(limit: Int, offset: Int): [Notification!]!
    notification(id: ID!): Notification
    issueActivity(issueId: ID!, limit: Int, offset: Int): [Activity!]!
    projectActivity(projectId: ID!, limit: Int, offset: Int): [Activity!]!
  }

  type Mutation {
    register(input: RegisterInput!): User!
    login(input: LoginInput!): AuthPayload!
    createOrganization(input: CreateOrganizationInput!): Organization!
    addOrganizationMember(input: AddOrganizationMemberInput!): Membership!
    createProject(input: CreateProjectInput!): Project!
    updateProject(input: UpdateProjectInput!): Project!
    archiveProject(id: ID!): Project!
    reactivateProject(id: ID!): Project!
    createIssue(input: CreateIssueInput!): Issue!
    updateIssue(input: UpdateIssueInput!): Issue!
    assignIssue(input: AssignIssueInput!): Issue!
    createComment(input: CreateCommentInput!): Comment!
    updateComment(input: UpdateCommentInput!): Comment!
    createLabel(input: CreateLabelInput!): Label!
    attachLabelToIssue(issueId: ID!, labelId: ID!): Issue!
    removeLabelFromIssue(issueId: ID!, labelId: ID!): Issue!
    markNotificationRead(id: ID!): Notification!
    markAllNotificationsRead: Int!
  }
`;


//type basically defines the structure of the data and the relationships between different entities in the GraphQL schema.
//input is used to define the structure of the data that can be passed as arguments to mutations or queries in the GraphQL schema., could have wrote directly but using input types makes the schema more organized and reusable.